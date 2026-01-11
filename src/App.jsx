import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Type, 
  Image as ImageIcon, 
  Crop, 
  Maximize, 
  Settings, 
  Download, 
  Upload, 
  Trash2, 
  Copy,
  Layers,
  Check,
  X,
  Droplets,
  PlusSquare,
  ZoomIn,
  ZoomOut,
  Edit3,
  Move,
  ArrowRightLeft,
  ArrowUpDown,
  PenTool,
  Square,
  Circle,
  Minus,
  FileText,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Menu,
  Eraser
} from 'lucide-react';

// --- 外部函式庫 CDN ---
const FABRIC_URL = "https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js";
const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

const App = () => {
  const [canvas, setCanvas] = useState(null);
  const [activeObject, setActiveObject] = useState(null);
  const [isCropMode, setIsCropMode] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [hasImage, setHasImage] = useState(false);
  
  // 手機版屬性面板控制
  const [showMobileProps, setShowMobileProps] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);

  // 手機版文字編輯專用狀態
  const [showMobileTextEditor, setShowMobileTextEditor] = useState(false);
  const [mobileEditingText, setMobileEditingText] = useState("");
  const mobileInputRef = useRef(null);

  // 縮放相關狀態
  const [zoomRatio, setZoomRatio] = useState(1);
  const zoomRatioRef = useRef(1);
  const baseDimensions = useRef({ width: 800, height: 600 }); 
  const scrollContainerRef = useRef(null);
  
  // PDF 相關狀態
  const [pdfDoc, setPdfDoc] = useState(null); 
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const pageAnnotations = useRef({}); 
  
  // 繪圖模式
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawSettings, setDrawSettings] = useState({
    tool: 'pencil',
    color: '#000000',
    width: 5
  });

  // Undo/Redo 歷史紀錄
  const canvasHistory = useRef([]);
  const historyIndex = useRef(-1);
  const isUndoing = useRef(false);

  // 內部更新旗標
  const isInternalUpdate = useRef(false);

  // 浮水印設定
  const [watermarkConfig, setWatermarkConfig] = useState({
    text: "",
    gapX: 150,
    gapY: 150,
    isGapXManual: false 
  });

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('png'); 
  const [isExporting, setIsExporting] = useState(false); 
  
  const fileInputRef = useRef(null);
  const overlayInputRef = useRef(null);
  const watermarkInputRef = useRef(null);
  
  // 裁切相關
  const cropUI = useRef({ cropZone: null, dimmingRects: [], gridLines: [] });
  const cropTargetRef = useRef(null); 
  const cropLimitsRef = useRef({ left: 0, top: 0, width: 0, height: 0 });

  const drawRef = useRef({ isMouseDown: false, startPos: { x: 0, y: 0 }, activeShape: null, isDrawingMode: false }); 

  const [exportMultiplier, setExportMultiplier] = useState(1);

  // 監聽視窗大小以設定手機版狀態
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // --- 關鍵 Helper: 取得畫面可視中心點 ---
  const getVisibleCenter = useCallback(() => {
    if (!scrollContainerRef.current || !canvas) {
      return { 
        x: canvas ? (canvas.width / zoomRatioRef.current) / 2 : 0, 
        y: canvas ? (canvas.height / zoomRatioRef.current) / 2 : 0 
      };
    }

    const container = scrollContainerRef.current;
    const zoom = zoomRatioRef.current;
    
    let domX, domY;

    if (canvas.width <= container.clientWidth) {
      domX = canvas.width / 2;
    } else {
      domX = container.scrollLeft + container.clientWidth / 2;
    }

    if (canvas.height <= container.clientHeight) {
      domY = canvas.height / 2;
    } else {
      domY = container.scrollTop + container.clientHeight / 2;
    }

    return {
        x: domX / zoom,
        y: domY / zoom
    };
  }, [canvas]);

  // --- Undo/Redo 邏輯 ---
  const saveHistory = useCallback(() => {
    if (!canvas || isUndoing.current) return;
    if (historyIndex.current < canvasHistory.current.length - 1) {
      canvasHistory.current = canvasHistory.current.slice(0, historyIndex.current + 1);
    }
    const json = canvas.toJSON(['isWatermark', 'watermarkText', 'watermarkGapX', 'watermarkGapY', 'watermarkIsGapXManual']); 
    canvasHistory.current.push(json);
    historyIndex.current = canvasHistory.current.length - 1;
  }, [canvas]);

  const undo = useCallback(() => {
    if (!canvas || historyIndex.current <= 0) return;
    
    isUndoing.current = true;
    historyIndex.current -= 1;
    const prevState = canvasHistory.current[historyIndex.current];
    
    const currentVpt = canvas.viewportTransform;
    const currentZoom = canvas.getZoom();
    
    canvas.loadFromJSON(prevState, () => {
      canvas.setViewportTransform(currentVpt);
      canvas.setZoom(currentZoom);
      canvas.requestRenderAll();
      if (drawRef.current.isDrawingMode && drawSettings.tool === 'pencil') {
         canvas.isDrawingMode = true;
      }
      isUndoing.current = false;
    });
  }, [canvas, drawSettings.tool]);

  // --- 物件操作邏輯 ---
  const deleteSelected = useCallback(() => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (active) {
      if (active.excludeFromExport) return;
      if (active.type === 'activeSelection') {
        active.forEachObject(obj => canvas.remove(obj));
        canvas.discardActiveObject();
      } else {
        canvas.remove(active);
      }
      canvas.requestRenderAll();
      saveHistory();
    }
  }, [canvas, saveHistory]);

  const duplicateSelected = useCallback(() => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (active) {
      active.clone((cloned) => {
        canvas.discardActiveObject();
        const offset = 20 / zoomRatioRef.current;
        cloned.set({
          left: cloned.left + offset,
          top: cloned.top + offset,
          evented: true
        });
        if (active.type === 'activeSelection') {
          cloned.canvas = canvas;
          cloned.forEachObject((obj) => { canvas.add(obj); });
          cloned.setCoords();
        } else {
          canvas.add(cloned);
        }
        canvas.setActiveObject(cloned);
        canvas.requestRenderAll();
      }, ['isWatermark', 'watermarkText', 'watermarkGapX', 'watermarkGapY', 'watermarkIsGapXManual']);
    }
  }, [canvas]);

  // --- 手機版文字編輯確認與取消 ---
  const confirmMobileTextEdit = () => {
    if (!canvas || !activeObject) return;
    activeObject.set('text', mobileEditingText);
    canvas.renderAll();
    saveHistory();
    setShowMobileTextEditor(false);
    canvas.setActiveObject(activeObject);
  };

  const cancelMobileTextEdit = () => {
    setShowMobileTextEditor(false);
  };

  // --- 鍵盤監聽 ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.key === 'Backspace') e.preventDefault(); 
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, deleteSelected, duplicateSelected]);

  // 初始化 Fabric
  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    loadScript(FABRIC_URL)
      .then(() => loadScript(PDF_JS_URL))
      .then(() => {
        if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        return loadScript(JSPDF_URL);
      })
      .then(() => {
        const fabricCanvas = new window.fabric.Canvas('main-canvas', {
          width: 800,
          height: 600,
          backgroundColor: '#f3f4f6', 
          preserveObjectStacking: true,
          selection: true,
        });

        fabricCanvas.on('mouse:wheel', function(opt) {
          if (opt.e.ctrlKey) {
            opt.e.preventDefault();
            opt.e.stopPropagation();
          }
        });

        fabricCanvas.on('text:editing:entered', (e) => {
          if (window.innerWidth < 768) {
            e.target.exitEditing();
            setMobileEditingText(e.target.text);
            setShowMobileTextEditor(true);
            setShowMobileProps(false);
          }
        });

        const updateSelection = (e) => {
          if (drawRef.current.isDrawingMode) return;
          const obj = e.selected ? e.selected[0] : null;
          setActiveObject(obj);
          
          if (!obj) {
             if (!isInternalUpdate.current) {
               setShowMobileProps(false);
             }
          }

          if (obj && obj.isWatermark) {
            setWatermarkConfig({
              text: (obj.watermarkText !== undefined) ? obj.watermarkText : "WATERMARK",
              gapX: obj.watermarkGapX || 150,
              gapY: obj.watermarkGapY || 150,
              isGapXManual: (obj.watermarkIsGapXManual !== undefined) ? obj.watermarkIsGapXManual : true 
            });
          } else {
            setWatermarkConfig(prev => ({ ...prev, text: "" }));
          }
        };

        fabricCanvas.on('selection:created', updateSelection);
        fabricCanvas.on('selection:updated', updateSelection);
        
        fabricCanvas.on('selection:cleared', () => {
          if (isInternalUpdate.current) return;
          setActiveObject(null);
          setShowMobileProps(false);
          setWatermarkConfig(prev => ({ ...prev, text: "" }));
        });

        setCanvas(fabricCanvas);
      })
      .catch(err => console.error("Library load failed:", err));

    return () => {
      if (canvas) canvas.dispose();
    };
  }, []);

  // 當手機版編輯器開啟時，自動聚焦
  useEffect(() => {
    if (showMobileTextEditor && mobileInputRef.current) {
      setTimeout(() => {
        mobileInputRef.current.focus();
        mobileInputRef.current.select(); 
      }, 100);
    }
  }, [showMobileTextEditor]);

  useEffect(() => {
    if (!canvas) return;
    const handleModified = (e) => {
        if (e.target && !cropUI.current.cropZone) { 
            setOpacity(e.target.opacity || 1);
            saveHistory(); 
        }
    };
    const handleAdded = (e) => {
        if (e.target && !e.target.excludeFromExport && !isUndoing.current && !isInternalUpdate.current) {
            saveHistory();
        }
    };
    canvas.on('object:modified', handleModified);
    canvas.on('object:added', handleAdded); 
    return () => {
        canvas.off('object:modified', handleModified);
        canvas.off('object:added', handleAdded);
    };
  }, [canvas, saveHistory]);

  useEffect(() => {
    if (activeObject && !isCropMode && !isDrawingMode) {
      setOpacity(activeObject.opacity || 1);
    }
  }, [activeObject, isCropMode, isDrawingMode]);

  // --- 繪圖模式 ---
  useEffect(() => {
    if (!canvas) return;
    if (isDrawingMode && drawSettings.tool === 'pencil') {
      if (!canvas.freeDrawingBrush || canvas.freeDrawingBrush.type !== 'pencil') {
         canvas.freeDrawingBrush = new window.fabric.PencilBrush(canvas);
      }
      canvas.freeDrawingBrush.color = drawSettings.color;
      canvas.freeDrawingBrush.width = parseInt(drawSettings.width) / zoomRatio; 
      canvas.isDrawingMode = true;
    } else {
      canvas.isDrawingMode = false;
    }
  }, [isDrawingMode, drawSettings, canvas, zoomRatio]);

  useEffect(() => {
    if (!canvas) return;
    drawRef.current.isDrawingMode = isDrawingMode; 
    
    if (!isDrawingMode || drawSettings.tool === 'pencil') {
      canvas.off('mouse:down', onShapeDown);
      canvas.off('mouse:move', onShapeMove);
      canvas.off('mouse:up', onShapeUp);
      if (!isDrawingMode) {
        canvas.selection = true;
        canvas.getObjects().forEach(obj => {
          if (!obj.excludeFromExport) obj.selectable = true;
        });
      }
      return;
    }

    canvas.selection = false;
    canvas.discardActiveObject();
    canvas.getObjects().forEach(obj => obj.selectable = false);
    canvas.requestRenderAll();

    canvas.on('mouse:down', onShapeDown);
    canvas.on('mouse:move', onShapeMove);
    canvas.on('mouse:up', onShapeUp);

    return () => {
      canvas.off('mouse:down', onShapeDown);
      canvas.off('mouse:move', onShapeMove);
      canvas.off('mouse:up', onShapeUp);
    };
  }, [isDrawingMode, drawSettings.tool, drawSettings.color, drawSettings.width, canvas]);

  // --- 橡皮擦邏輯 ---
  const isErasable = (obj) => {
    if (!obj) return false;
    if (obj.backgroundImage) return false;
    if (obj.excludeFromExport) return false;
    if (obj.type === 'image') return false;
    if (obj.type === 'i-text' || obj.type === 'text') return false;
    if (obj.isWatermark || obj.type === 'group') return false;
    return ['path', 'rect', 'circle', 'ellipse', 'line'].includes(obj.type);
  };

  const onShapeDown = (o) => {
    if (!canvas) return;
    const pointer = canvas.getPointer(o.e);
    drawRef.current.isMouseDown = true;
    drawRef.current.startPos = { x: pointer.x, y: pointer.y };

    if (drawSettings.tool === 'eraser') {
      const target = canvas.findTarget(o.e); 
      if (target && isErasable(target)) {
        canvas.remove(target);
        saveHistory();
      } else {
        const objects = canvas.getObjects().reverse(); 
        for (let obj of objects) {
          if (obj.containsPoint(pointer) && isErasable(obj)) {
            canvas.remove(obj);
            saveHistory();
            break; 
          }
        }
      }
      return;
    }

    if (drawRef.current.activeShape) return;

    let shape = null;
    const currentZoom = zoomRatioRef.current || 1;
    const strokeWidth = parseInt(drawSettings.width) / currentZoom; 

    const commonProps = {
      left: pointer.x,
      top: pointer.y,
      stroke: drawSettings.color,
      strokeWidth: strokeWidth,
      fill: 'transparent',
      selectable: false,
      evented: false,
      originX: 'left', 
      originY: 'top'
    };

    if (drawSettings.tool === 'rect') {
      shape = new window.fabric.Rect({ ...commonProps, width: 0, height: 0 });
    } else if (drawSettings.tool === 'circle') {
      shape = new window.fabric.Ellipse({ ...commonProps, rx: 0, ry: 0 });
    } else if (drawSettings.tool === 'line') {
      shape = new window.fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], { ...commonProps, strokeLineCap: 'round' });
    }

    if (shape) {
      canvas.add(shape);
      drawRef.current.activeShape = shape;
    }
  };

  const onShapeMove = (o) => {
    if (!drawRef.current.isMouseDown) return;
    
    if (drawSettings.tool === 'eraser') {
      const pointer = canvas.getPointer(o.e);
      const objects = canvas.getObjects();
      let removed = false;
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (obj.containsPoint(pointer) && isErasable(obj)) {
          canvas.remove(obj);
          removed = true;
        }
      }
      if (removed) canvas.requestRenderAll();
      return;
    }

    if (!drawRef.current.activeShape) return;
    const pointer = canvas.getPointer(o.e);
    const startX = drawRef.current.startPos.x;
    const startY = drawRef.current.startPos.y;
    const shape = drawRef.current.activeShape;

    if (drawSettings.tool === 'rect') {
      const width = Math.abs(pointer.x - startX);
      const height = Math.abs(pointer.y - startY);
      const left = pointer.x > startX ? startX : pointer.x;
      const top = pointer.y > startY ? startY : pointer.y;
      shape.set({ width, height, left, top });
    } else if (drawSettings.tool === 'circle') {
      const rx = Math.abs(pointer.x - startX) / 2;
      const ry = Math.abs(pointer.y - startY) / 2;
      const left = pointer.x > startX ? startX : pointer.x;
      const top = pointer.y > startY ? startY : pointer.y;
      shape.set({ rx, ry, left, top, width: rx * 2, height: ry * 2 });
    } else if (drawSettings.tool === 'line') {
      shape.set({ x2: pointer.x, y2: pointer.y });
    }
    canvas.requestRenderAll();
  };

  const onShapeUp = () => {
    if (!drawRef.current.isMouseDown) return;
    drawRef.current.isMouseDown = false;

    if (drawSettings.tool === 'eraser') {
      saveHistory(); 
      return;
    }

    const shape = drawRef.current.activeShape;
    if (shape) {
      shape.setCoords();
      shape.set({ selectable: true, evented: true }); 
      // saveHistory is handled by object:added
    }
    drawRef.current.activeShape = null;
  };

  const switchToMode = (modeType, subTool = null) => {
    if (!hasImage && modeType !== 'open') return;

    if (isCropMode) {
      const { cropZone, dimmingRects, gridLines } = cropUI.current;
      if (cropZone) canvas.remove(cropZone);
      dimmingRects.forEach(r => canvas.remove(r));
      gridLines.forEach(l => canvas.remove(l));
      cropUI.current = { cropZone: null, dimmingRects: [], gridLines: [] };
      setIsCropMode(false);
    }
    
    if (modeType !== 'draw') {
      if (isDrawingMode) {
        setIsDrawingMode(false);
        drawRef.current.isDrawingMode = false;
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.getObjects().forEach(obj => {
          if (!obj.excludeFromExport) obj.selectable = true;
        });
      }
    }

    switch (modeType) {
      case 'open':
        fileInputRef.current.click();
        break;
      case 'crop':
        startCrop();
        break;
      case 'text':
        addText();
        break;
      case 'image':
        overlayInputRef.current.click();
        break;
      case 'draw':
        updateDrawSettings('tool', subTool || 'pencil');
        setIsDrawingMode(true);
        // 手機版：切換到繪圖模式時，自動打開屬性面板供選色
        setShowMobileProps(true);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        break;
      case 'watermark':
        addTextWatermark();
        break;
      default:
        break;
    }
  };

  const updateDrawSettings = (key, value) => {
    setDrawSettings(prev => ({ ...prev, [key]: value }));
  };

  // --- Zoom Logic ---
  const changeZoom = useCallback((delta) => {
    if (!canvas || !hasImage) return;
    const currentZoom = zoomRatioRef.current;
    let newZoom = currentZoom + delta;
    if (newZoom < 0.1) newZoom = 0.1;
    if (newZoom > 5) newZoom = 5;
    newZoom = parseFloat(newZoom.toFixed(2));
    setZoomRatio(newZoom);
    zoomRatioRef.current = newZoom; 
    canvas.setZoom(newZoom);
    canvas.setDimensions({
      width: baseDimensions.current.width * newZoom,
      height: baseDimensions.current.height * newZoom
    });
  }, [canvas, hasImage]);

  const resetZoom = () => {
    if (!canvas || !hasImage) return;
    setZoomRatio(1);
    zoomRatioRef.current = 1;
    canvas.setZoom(1);
    canvas.setDimensions(baseDimensions.current);
  };

  useEffect(() => {
    if (!canvas) return;
    const onWheel = (opt) => {
      if (opt.e.ctrlKey) {
        opt.e.preventDefault();
        opt.e.stopPropagation();
        const delta = opt.e.deltaY;
        const zoomStep = delta > 0 ? -0.05 : 0.05;
        changeZoom(zoomStep);
      }
    };
    canvas.on('mouse:wheel', onWheel);
    return () => canvas.off('mouse:wheel', onWheel);
  }, [canvas, changeZoom]);

  const fitImageToScreen = useCallback((fabCanvas, imgObj, maintainZoom = false) => {
    if (!fabCanvas || !imgObj) return;
    const container = scrollContainerRef.current;
    let availableWidth, availableHeight;

    if (container) {
       availableWidth = container.clientWidth - 40; 
       availableHeight = container.clientHeight - 40;
    } else {
       availableWidth = window.innerWidth - 40;
       availableHeight = window.innerHeight - 200;
    }

    let scale = 1;
    if (imgObj.width > availableWidth || imgObj.height > availableHeight) {
      const scaleW = availableWidth / imgObj.width;
      const scaleH = availableHeight / imgObj.height;
      scale = Math.min(scaleW, scaleH);
    }
    if (scale > 1) scale = 1;

    const displayWidth = imgObj.width * scale;
    const displayHeight = imgObj.height * scale;

    baseDimensions.current = { width: displayWidth, height: displayHeight };
    
    const targetZoom = maintainZoom ? zoomRatioRef.current : 1;
    if (!maintainZoom) {
      setZoomRatio(1);
      zoomRatioRef.current = 1;
    }

    if (!maintainZoom) {
       fabCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    }

    fabCanvas.setDimensions({ width: displayWidth * targetZoom, height: displayHeight * targetZoom });
    fabCanvas.setZoom(targetZoom);

    imgObj.set({
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      scaleX: displayWidth / imgObj.width,
      scaleY: displayHeight / imgObj.height,
      strokeWidth: 0
    });

    fabCanvas.setBackgroundImage(imgObj, () => {
        fabCanvas.renderAll();
        if (!maintainZoom) {
            canvasHistory.current = [fabCanvas.toJSON()];
            historyIndex.current = 0;
        }
    });

    setExportMultiplier(1 / scale);
  }, []);

  // --- PDF & File Logic ---
  const renderPdfPageToImage = async (pdf, pageNum) => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const tempCanvas = document.createElement('canvas');
    const context = tempCanvas.getContext('2d');
    tempCanvas.height = viewport.height;
    tempCanvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return tempCanvas.toDataURL('image/png');
  };

  const handleMainFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        pageAnnotations.current = {}; 
        loadPage(pdf, 1, false); 
      } catch (error) {
        alert("PDF 讀取失敗");
        console.error(error);
        return;
      }
    } else {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      const imgDataUrl = await new Promise(resolve => { reader.onload = (e) => resolve(e.target.result); });
      setPdfDoc(null);
      setTotalPages(0);
      pageAnnotations.current = {};
      window.fabric.Image.fromURL(imgDataUrl, (img) => {
        canvas.clear();
        fitImageToScreen(canvas, img, false);
        setHasImage(true);
        setIsCropMode(false);
        setIsDrawingMode(false);
      });
    }
    e.target.value = null;
  };

  const saveCurrentPageState = () => {
    if (!canvas) return;
    pageAnnotations.current[currentPage] = canvas.toJSON();
  };

  const loadPage = async (pdf, pageNum, maintainZoom = true) => {
    if (!pdf || !canvas) return;
    const imgDataUrl = await renderPdfPageToImage(pdf, pageNum);
    window.fabric.Image.fromURL(imgDataUrl, (img) => {
      canvas.clear();
      fitImageToScreen(canvas, img, maintainZoom); 
      const savedJSON = pageAnnotations.current[pageNum];
      if (savedJSON) {
        canvas.loadFromJSON(savedJSON, () => {
          const displayWidth = baseDimensions.current.width;
          const displayHeight = baseDimensions.current.height;
          img.set({
             originX: 'left',
             originY: 'top',
             left: 0,
             top: 0,
             scaleX: displayWidth / img.width,
             scaleY: displayHeight / img.height
          });
          canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
          canvas.getObjects().forEach(obj => { obj.setCoords(); });
          canvasHistory.current = [canvas.toJSON()];
          historyIndex.current = 0;
        });
      } else {
          canvasHistory.current = [canvas.toJSON()];
          historyIndex.current = 0;
      }
      setHasImage(true);
      setIsCropMode(false);
      setIsDrawingMode(false);
    });
  };

  const changePage = (offset) => {
    if (!pdfDoc) return;
    const newPage = currentPage + offset;
    if (newPage < 1 || newPage > totalPages) return;
    saveCurrentPageState();
    setCurrentPage(newPage);
    loadPage(pdfDoc, newPage, true);
  };

  // --- Add Object with Zoom Adjustment ---
  const addOverlayImage = (e) => {
    if (isDrawingMode || isCropMode) switchToMode('image');
    if (!hasImage) return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (f) => {
      window.fabric.Image.fromURL(f.target.result, (img) => {
        const currentZoom = zoomRatioRef.current;
        const baseWidth = baseDimensions.current.width;
        
        const targetDisplayWidth = (baseWidth * 0.3) / currentZoom;
        const scale = targetDisplayWidth / img.width;
        img.scale(scale);
        
        const center = getVisibleCenter();
        img.set({
          left: center.x,
          top: center.y,
          originX: 'center',
          originY: 'center'
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        // saveHistory via object:added
      });
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const addText = () => {
    const center = getVisibleCenter();
    const currentZoom = zoomRatioRef.current;
    const baseWidth = baseDimensions.current.width;
    
    const isMobile = window.innerWidth < 768;
    const fontSize = Math.max(isMobile ? 24 : 12, (baseWidth / (isMobile ? 15 : 25)) / currentZoom);

    const text = new window.fabric.IText('Click to edit', {
      left: center.x,
      top: center.y,
      originX: 'center',
      originY: 'center',
      fontFamily: 'sans-serif',
      fontSize: fontSize,
      fill: '#000000',
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    
    if (!isMobile) {
      text.enterEditing();
      text.selectAll();
    } else {
      text.enterEditing();
    }
  };

  const addImageWatermark = (e) => {
    if (!hasImage) return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (f) => {
      window.fabric.Image.fromURL(f.target.result, (img) => {
        const targetW = canvas.width * 0.15 / zoomRatioRef.current; 
        img.scaleToWidth(targetW);
        const viewW = canvas.width / zoomRatioRef.current;
        const viewH = canvas.height / zoomRatioRef.current;
        img.set({
          opacity: 0.5,
          left: viewW - targetW - 20,
          top: viewH - (img.height * img.scaleY) - 20,
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        saveHistory();
      });
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const handleOpacityChange = (val) => {
    setOpacity(val);
    if (activeObject) {
      activeObject.set('opacity', parseFloat(val));
      canvas.renderAll();
      saveHistory();
    }
  };

  // --- Watermark Logic ---
  const generateWatermarkGroup = (text, gapX, gapY, currentOpacity = 1, currentFill = 'rgba(0,0,0,0.15)', isGapXManual = false) => {
    const rawWidth = canvas.width / zoomRatio;
    const rawHeight = canvas.height / zoomRatio;
    const fontSize = Math.max(20, rawWidth / 20); 
    const diagonal = Math.sqrt(Math.pow(rawWidth, 2) + Math.pow(rawHeight, 2));
    const dim = diagonal; 
    const texts = [];
    for (let y = -dim/2; y < dim/2; y += gapY) {
      for (let x = -dim/2; x < dim/2; x += gapX) {
        const offsetX = (Math.floor((y + dim/2) / gapY) % 2 === 0) ? 0 : gapX / 2;
        const t = new window.fabric.Text(text, {
          left: x + offsetX,
          top: y,
          fontSize: fontSize,
          fontFamily: 'sans-serif',
          fontWeight: 'bold',
          fill: currentFill, 
          originX: 'center',
          originY: 'center'
        });
        texts.push(t);
      }
    }
    const group = new window.fabric.Group(texts, {
      left: rawWidth / 2,
      top: rawHeight / 2,
      originX: 'center',
      originY: 'center',
      angle: -45,
      selectable: true,
      evented: true,
      opacity: currentOpacity,
      subTargetCheck: false,
      isWatermark: true,
      watermarkText: text,
      watermarkGapX: gapX,
      watermarkGapY: gapY,
      watermarkIsGapXManual: isGapXManual 
    });
    return group;
  };

  const updateWatermarkSettings = (key, value) => {
    if (!activeObject || !activeObject.isWatermark) return;
    
    let newConfig = { ...watermarkConfig, [key]: value };
    let isGapXManual = watermarkConfig.isGapXManual;

    if (key === 'text') {
      if (!isGapXManual) {
        const fontSize = Math.max(20, (canvas.width / zoomRatioRef.current) / 20);
        const safeText = value || " "; 
        const tempText = new window.fabric.Text(safeText, {
             fontSize: fontSize,
             fontFamily: 'sans-serif',
             fontWeight: 'bold'
        });
        const newGapX = tempText.width + (fontSize * 3);
        newConfig.gapX = Math.max(50, newGapX);
      }
    }

    if (key === 'gapX') {
       newConfig.isGapXManual = true;
       isGapXManual = true;
    }

    setWatermarkConfig(newConfig);

    const currentOpacity = activeObject.opacity;
    const firstObj = activeObject.getObjects()[0];
    const currentFill = firstObj ? firstObj.fill : 'rgba(0,0,0,0.15)';
    
    isInternalUpdate.current = true;
    canvas.remove(activeObject);
    const newGroup = generateWatermarkGroup(
      newConfig.text, 
      parseInt(newConfig.gapX), 
      parseInt(newConfig.gapY), 
      currentOpacity, 
      currentFill,
      isGapXManual
    );
    canvas.add(newGroup);
    canvas.setActiveObject(newGroup);
    isInternalUpdate.current = false; 

    canvas.requestRenderAll();
    saveHistory();
  };

  const addTextWatermark = () => {
    const text = "WATERMARK";
    const rawWidth = canvas.width / zoomRatio;
    const rawHeight = canvas.height / zoomRatio;
    
    const fontSize = Math.max(20, rawWidth / 20); 
    const tempText = new window.fabric.Text(text, { fontSize, fontFamily: 'sans-serif', fontWeight: 'bold' });
    const defaultGapX = tempText.width + (fontSize * 3);
    const defaultGapY = Math.max(150, rawHeight / 4);

    const group = generateWatermarkGroup(text, defaultGapX, defaultGapY, 1, 'rgba(0,0,0,0.15)', false);
    canvas.add(group);
    canvas.setActiveObject(group);
    
    setWatermarkConfig({ 
      text: text, 
      gapX: defaultGapX, 
      gapY: defaultGapY,
      isGapXManual: false 
    });
    setOpacity(1);
    
    setShowMobileProps(true);

    canvas.requestRenderAll();
    saveHistory();
  };

  const updateCropUI = (cropRect) => {
    const { dimmingRects, gridLines } = cropUI.current;
    const left = cropRect.left;
    const top = cropRect.top;
    const width = cropRect.width * cropRect.scaleX;
    const height = cropRect.height * cropRect.scaleY;
    const cw = baseDimensions.current.width; 
    const ch = baseDimensions.current.height;
    dimmingRects[0].set({ left: 0, top: 0, width: cw, height: Math.max(0, top) }); 
    dimmingRects[1].set({ left: 0, top: top + height, width: cw, height: Math.max(0, ch - (top + height)) }); 
    dimmingRects[2].set({ left: 0, top: top, width: Math.max(0, left), height: height }); 
    dimmingRects[3].set({ left: left + width, top: top, width: Math.max(0, cw - (left + width)), height: height }); 
    const thirdW = width / 3;
    const thirdH = height / 3;
    gridLines[0].set({ x1: left + thirdW, y1: top, x2: left + thirdW, y2: top + height });
    gridLines[1].set({ x1: left + thirdW * 2, y1: top, x2: left + thirdW * 2, y2: top + height });
    gridLines[2].set({ x1: left, y1: top + thirdH, x2: left + width, y2: top + thirdH });
    gridLines[3].set({ x1: left, y1: top + thirdH * 2, x2: left + width, y2: top + thirdH * 2 });
    gridLines.forEach(line => line.setCoords());
  };
  const constrainMovement = (obj) => {
    const limits = cropLimitsRef.current;
    const objWidth = obj.getScaledWidth();
    const objHeight = obj.getScaledHeight();
    if (obj.left < limits.left) obj.left = limits.left;
    if (obj.top < limits.top) obj.top = limits.top;
    if (obj.left + objWidth > limits.left + limits.width) {
       obj.left = limits.left + limits.width - objWidth;
    }
    if (obj.top + objHeight > limits.top + limits.height) {
       obj.top = limits.top + limits.height - objHeight;
    }
  };
  const constrainScaling = (obj) => {
    const limits = cropLimitsRef.current;
    if (obj.left < limits.left) { 
        obj.scaleX = (obj.left + obj.getScaledWidth() - limits.left) / obj.width; 
        obj.left = limits.left; 
    }
    if (obj.top < limits.top) { 
        obj.scaleY = (obj.top + obj.getScaledHeight() - limits.top) / obj.height; 
        obj.top = limits.top; 
    }
    if (obj.left + obj.getScaledWidth() > limits.left + limits.width) { 
        obj.scaleX = (limits.left + limits.width - obj.left) / obj.width; 
    }
    if (obj.top + obj.getScaledHeight() > limits.top + limits.height) { 
        obj.scaleY = (limits.top + limits.height - obj.top) / obj.height; 
    }
  };
  const startCrop = () => {
    if (!canvas || !hasImage) return;
    resetZoom(); 
    if (isDrawingMode) {
      setIsDrawingMode(false);
      canvas.isDrawingMode = false;
    }

    const active = canvas.getActiveObject();
    let initialCrop = {};
    let limits = {};

    if (active && active.type === 'image') {
        cropTargetRef.current = active;
        const boundingRect = active.getBoundingRect();
        initialCrop = {
            left: boundingRect.left,
            top: boundingRect.top,
            width: boundingRect.width,
            height: boundingRect.height
        };
        limits = {
            left: boundingRect.left,
            top: boundingRect.top,
            width: boundingRect.width,
            height: boundingRect.height
        };
    } else {
        cropTargetRef.current = null;
        const cw = baseDimensions.current.width;
        const ch = baseDimensions.current.height;
        const margin = 30;
        initialCrop = { left: margin, top: margin, width: cw - (margin * 2), height: ch - (margin * 2) };
        limits = { left: 0, top: 0, width: cw, height: ch };
    }
    
    cropLimitsRef.current = limits;

    setIsCropMode(true);
    canvas.discardActiveObject();
    canvas.getObjects().forEach(obj => { obj.selectable = false; obj.evented = false; });
    
    const dimmingProps = { fill: 'rgba(0, 0, 0, 0.6)', selectable: false, evented: false, excludeFromExport: true };
    const dimmingRects = Array(4).fill(null).map(() => new window.fabric.Rect(dimmingProps));
    dimmingRects.forEach(r => canvas.add(r));
    const gridProps = { stroke: 'rgba(255, 255, 255, 0.5)', strokeWidth: 1, selectable: false, evented: false, excludeFromExport: true };
    const gridLines = Array(4).fill(null).map(() => new window.fabric.Line([0,0,0,0], gridProps));
    gridLines.forEach(l => canvas.add(l));

    const cropZone = new window.fabric.Rect({ 
        ...initialCrop,
        fill: 'transparent', 
        stroke: '#ffffff', 
        strokeWidth: 2, 
        strokeUniform: true, 
        cornerColor: '#ffffff', 
        cornerStrokeColor: '#000000', 
        cornerSize: 14, 
        cornerStyle: 'circle', 
        transparentCorners: false, 
        lockRotation: true, 
        hasRotatingPoint: false, 
        lockScalingFlip: true 
    });

    canvas.add(cropZone);
    canvas.setActiveObject(cropZone);
    cropUI.current = { cropZone, dimmingRects, gridLines };
    cropZone.on('moving', () => { constrainMovement(cropZone); updateCropUI(cropZone); canvas.requestRenderAll(); });
    cropZone.on('scaling', () => { constrainScaling(cropZone); updateCropUI(cropZone); canvas.requestRenderAll(); });
    updateCropUI(cropZone);
    canvas.requestRenderAll();
  };
  const cancelCrop = () => {
    const { cropZone, dimmingRects, gridLines } = cropUI.current;
    if (cropZone) canvas.remove(cropZone);
    dimmingRects.forEach(r => canvas.remove(r));
    gridLines.forEach(l => canvas.remove(l));
    cropUI.current = { cropZone: null, dimmingRects: [], gridLines: [] };
    canvas.getObjects().forEach(obj => { obj.selectable = true; obj.evented = true; });
    setIsCropMode(false);
    canvas.requestRenderAll();
  };
  const applyCrop = () => {
    const { cropZone } = cropUI.current;
    if (!cropZone) return;
    const left = cropZone.left;
    const top = cropZone.top;
    const width = cropZone.width * cropZone.scaleX;
    const height = cropZone.height * cropZone.scaleY;
    
    const targetObj = cropTargetRef.current;
    
    cancelCrop(); 

    if (targetObj) {
        const allObjects = canvas.getObjects();
        const originalVisibility = allObjects.map(o => o.visible);
        const originalBg = canvas.backgroundImage;
        allObjects.forEach(o => o.visible = false);
        canvas.backgroundImage = null; 
        targetObj.visible = true;
        canvas.backgroundColor = 'transparent'; 

        const croppedData = canvas.toDataURL({
            left: left,
            top: top,
            width: width,
            height: height,
            format: 'png',
            multiplier: exportMultiplier
        });

        allObjects.forEach((o, i) => o.visible = originalVisibility[i]);
        canvas.backgroundImage = originalBg;
        
        window.fabric.Image.fromURL(croppedData, (img) => {
            img.set({
                left: left, 
                top: top,
                originX: 'left',
                originY: 'top',
                scaleX: 1 / exportMultiplier, 
                scaleY: 1 / exportMultiplier
            });
            canvas.remove(targetObj);
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
            saveHistory();
        });
        setIsCropMode(false);
    } else {
        const croppedData = canvas.toDataURL({ left, top, width, height, format: 'png', multiplier: exportMultiplier });
        window.fabric.Image.fromURL(croppedData, (img) => {
          canvas.clear();
          fitImageToScreen(canvas, img, false); 
          setIsCropMode(false);
          saveHistory(); 
        });
    }
  };

  // --- Export ---
  const handleExport = async () => {
    if (!hasImage) return;
    setIsExporting(true);
    
    if (exportFormat !== 'pdf' || !pdfDoc) {
      const dataURL = canvas.toDataURL({
        format: exportFormat === 'jpg' ? 'jpeg' : 'png',
        quality: 1,
        multiplier: exportMultiplier / zoomRatio 
      });
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = `pixelcraft-export.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsExporting(false);
      setShowExportModal(false);
      return;
    }

    saveCurrentPageState(); 
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    
    try {
      for (let i = 1; i <= totalPages; i++) {
        const imgDataUrl = await renderPdfPageToImage(pdfDoc, i);
        const tempCanvasEl = document.createElement('canvas');
        const tempFabric = new window.fabric.StaticCanvas(tempCanvasEl);
        
        await new Promise(resolve => {
          window.fabric.Image.fromURL(imgDataUrl, (img) => {
            tempFabric.setDimensions({ width: img.width, height: img.height });
            tempFabric.setBackgroundImage(img, resolve);
          });
        });

        if (pageAnnotations.current[i]) {
          await new Promise(resolve => {
            const objects = pageAnnotations.current[i].objects;
            if (objects && objects.length > 0) {
              window.fabric.util.enlivenObjects(objects, (enlivenedObjects) => {
                enlivenedObjects.forEach((obj) => {
                  obj.left *= exportMultiplier;
                  obj.top *= exportMultiplier;
                  obj.scaleX *= exportMultiplier;
                  obj.scaleY *= exportMultiplier;
                  tempFabric.add(obj);
                });
                resolve();
              });
            } else {
              resolve();
            }
          });
        }
        
        const pageImgData = tempFabric.toDataURL({ format: 'png', multiplier: 1 });
        const imgProps = pdf.getImageProperties(pageImgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        if (i > 1) pdf.addPage();
        pdf.addImage(pageImgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        tempFabric.dispose();
      }
      
      pdf.save('pixelcraft-multipage.pdf');
    } catch (e) {
      console.error(e);
      alert("Failed to export");
    } finally {
      setIsExporting(false);
      setShowExportModal(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans text-gray-800">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm z-[60]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <ImageIcon className="text-white w-5 h-5" />
            </div>
            <h1 className="font-bold text-xl tracking-tight">OpenEditor <span className="text-blue-600 font-medium text-sm ml-1">Beta</span></h1>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center bg-gray-100 rounded-lg p-1 ml-4 border border-gray-200">
              <button onClick={() => changePage(-1)} disabled={currentPage === 1} className="p-1 hover:bg-white rounded-md disabled:opacity-30"><ChevronLeft size={18} /></button>
              <span className="px-3 text-xs font-bold text-gray-600 font-mono">{currentPage} / {totalPages}</span>
              <button onClick={() => changePage(1)} disabled={currentPage === totalPages} className="p-1 hover:bg-white rounded-md disabled:opacity-30"><ChevronRight size={18} /></button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isCropMode ? (
            <div className="relative">
              <button onClick={() => hasImage && setShowExportModal(!showExportModal)} disabled={!hasImage || isExporting} className={`flex items-center gap-2 px-5 py-2 rounded-full transition-all font-semibold shadow-lg ${hasImage ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                {isExporting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Download size={18} />}
                {isExporting ? 'Processing...' : 'Save file'}
              </button>
              {showExportModal && (
                <div className="absolute right-0 top-14 bg-white rounded-xl shadow-xl border border-gray-100 p-4 w-64 z-50 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-2">
                    {['png', 'jpg', 'pdf'].map(fmt => (
                      <button key={fmt} onClick={() => setExportFormat(fmt)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${exportFormat === fmt ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'hover:bg-gray-50 text-gray-600 border border-transparent'}`}><span className="uppercase">{fmt}</span>{exportFormat === fmt && <Check size={14} />}</button>
                    ))}
                  </div>
                  <div className="h-px bg-gray-100 my-3"></div>
                  <button onClick={handleExport} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-bold shadow-md transition-all">Download</button>
                </div>
              )}
              {showExportModal && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowExportModal(false)}></div>}
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={applyCrop} className="bg-green-600 text-white px-5 py-2 rounded-full flex items-center gap-2 font-medium shadow-md"><Check size={18} /> Crop</button>
              <button onClick={cancelCrop} className="bg-gray-200 text-gray-700 px-5 py-2 rounded-full flex items-center gap-2 font-medium hover:bg-gray-300 transition-colors"><X size={18} /> Cancel</button>
            </div>
          )}
        </div>
      </header>

      {/* Main Layout Area - Responsive */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left Sidebar (Desktop) / Bottom Navigation (Mobile) */}
        <aside className="
          z-30 bg-white border-t md:border-t-0 md:border-r 
          flex flex-row md:flex-col items-center justify-around md:justify-start 
          py-2 md:py-6 gap-2 md:gap-4 shadow-lg md:shadow-sm 
          order-2 md:order-1 
          w-full md:w-20 h-16 md:h-full 
          overflow-x-auto md:overflow-y-auto overflow-y-hidden
          fixed bottom-0 md:relative
        ">
          {/* 修正：在手機版顯示屬性按鈕，桌面版顯示開啟按鈕 */}
          {activeObject && isMobileView ? (
             <ToolButton icon={<Settings size={22} />} label="Attrs" onClick={() => setShowMobileProps(true)} />
          ) : (
             <ToolButton icon={<Upload size={22} />} label="Open" onClick={() => switchToMode('open')} disabled={isCropMode || isDrawingMode} />
          )}

          <ToolButton icon={<Crop size={22} />} label="Crop" onClick={() => switchToMode('crop')} active={isCropMode} disabled={!hasImage} />
          <ToolButton icon={<Type size={22} />} label="Text" onClick={() => switchToMode('text')} disabled={!hasImage} />
          <ToolButton icon={<ImageIcon size={22} />} label="Image" onClick={() => switchToMode('image')} disabled={!hasImage} />
          <ToolButton icon={<PenTool size={22} />} label="Draw" onClick={() => switchToMode('draw', 'pencil')} active={isDrawingMode && drawSettings.tool === 'pencil'} disabled={!hasImage} />
          
          <div className="md:mt-auto md:w-full flex justify-center md:pb-2">
             <ToolButton icon={<Layers size={22} />} label="Watermark" onClick={() => switchToMode('watermark')} disabled={!hasImage} />
          </div>
        </aside>

        {/* Middle Content Wrapper */}
        <div className="flex-1 relative h-full overflow-hidden bg-gray-200/50 order-1 md:order-2 pb-16 md:pb-0">
          
          <main ref={scrollContainerRef} className={`w-full h-full overflow-auto flex ${isCropMode ? 'bg-gray-900' : ''}`}>
            
            <div className="m-auto p-8 relative"> 
              <div className={`transition-all duration-300 ${hasImage ? 'opacity-100 scale-100' : 'opacity-0 scale-95'} ${isCropMode ? 'shadow-none' : 'bg-white shadow-2xl rounded-sm border border-gray-300'} ${isDrawingMode ? 'cursor-crosshair' : ''}`}>
                <canvas id="main-canvas"></canvas>
              </div>
            </div>

            {!hasImage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                <div className="bg-white/90 backdrop-blur-md p-10 rounded-3xl border-2 border-dashed border-blue-200 flex flex-col items-center shadow-xl animate-in fade-in zoom-in duration-300">
                  <div className="bg-blue-50 p-4 rounded-full mb-4"><Upload size={48} className="text-blue-500" /></div>
                  <h2 className="text-xl font-bold text-gray-700 mb-2">Start Editing</h2>
                  <p className="text-gray-500 text-sm mb-6 text-center">Supports JPG, PNG, PDF </p>
                  <button onClick={() => fileInputRef.current.click()} className="pointer-events-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all transform hover:scale-105 shadow-lg shadow-blue-200">Choose file</button>
                </div>
              </div>
            )}
          </main>

          {/* Floating Controls (Zoom) */}
          {hasImage && !isCropMode && (
            <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 flex items-center bg-white shadow-lg rounded-full px-2 py-1 border border-gray-200 animate-in slide-in-from-bottom-4 z-20">
              <button onClick={() => changeZoom(-0.1)} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"><Minus size={16} /></button>
              <span className="w-12 text-center text-xs font-mono font-bold text-gray-700">{Math.round(zoomRatio * 100)}%</span>
              <button onClick={() => changeZoom(0.1)} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"><PlusSquare size={16} /></button>
              <div className="w-px h-4 bg-gray-200 mx-1"></div>
              <button onClick={resetZoom} className="p-2 hover:bg-gray-100 rounded-full text-blue-600 transition-colors" title="適應螢幕"><Maximize size={16} /></button>
            </div>
          )}
        </div>

        {/* 手機版文字編輯器 Overlay */}
        {showMobileTextEditor && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-16 md:pt-32 animate-in fade-in duration-200">
            <div className="bg-white w-11/12 max-w-md p-5 rounded-2xl shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-10 duration-300">
               <h3 className="font-bold text-gray-700 flex items-center gap-2"><Edit3 size={18} className="text-blue-500"/> Edit Text</h3>
               <textarea 
                 ref={mobileInputRef}
                 value={mobileEditingText}
                 onChange={(e) => setMobileEditingText(e.target.value)}
                 className="w-full h-32 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-lg"
                 placeholder="Type something..."
               />
               <div className="flex gap-3">
                 <button onClick={cancelMobileTextEdit} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                 <button onClick={confirmMobileTextEdit} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Done</button>
               </div>
            </div>
          </div>
        )}

        {/* Right Sidebar (Attributes) - Responsive with Drawer/Slide-over */}
        <div className={`
          fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity duration-300 md:hidden
          ${(isDrawingMode || activeObject) && showMobileProps && !showMobileTextEditor ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `} onClick={() => setShowMobileProps(false)}></div>

        <aside className={`
          bg-white shadow-2xl z-50
          fixed bottom-0 left-0 right-0 rounded-t-2xl border-t
          md:relative md:border-l md:border-t-0 md:rounded-none md:shadow-inner md:w-72
          flex flex-col overflow-y-auto transition-transform duration-300 ease-out
          overscroll-contain
          order-3
          ${(isDrawingMode || activeObject) && showMobileProps && !showMobileTextEditor ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
          max-h-[60vh] md:max-h-full
        `}>
          {/* Mobile Handle (Visual only) */}
          <div className="w-full flex justify-center pt-2 pb-1 md:hidden">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
          </div>

          <div className="p-4 border-b bg-white flex items-center justify-between font-bold text-gray-700 sticky top-0 z-10">
            <div className="flex items-center gap-2">
               <Settings size={18} className="text-blue-500" /> 
               {isDrawingMode ? "Drawing tools" : "Object attributes"}
            </div>
            {/* Mobile Close Button */}
            <button onClick={() => setShowMobileProps(false)} className="md:hidden p-1 rounded-full hover:bg-gray-200">
               <ChevronDown size={20} />
            </button>
          </div>
          
          <div className="p-6 flex flex-col gap-8 pb-20 md:pb-6">
            {isCropMode ? (
              <div className="text-center py-12 flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center animate-pulse"><Crop size={28} className="text-blue-500" /></div>
                <p className="text-blue-600 font-bold text-base mb-1">Crop mode</p>
                <button onClick={applyCrop} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-bold mt-2 shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors">Confim crop</button>
              </div>
            ) : isDrawingMode ? (
              <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <section>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] block mb-4">Choose tools</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[{ id: 'pencil', icon: <PenTool size={18} />, label: 'Pen' }, { id: 'rect', icon: <Square size={18} />, label: 'Rectangle' }, { id: 'circle', icon: <Circle size={18} />, label: 'Circle' }, { id: 'line', icon: <Minus size={18} />, label: 'line' }, { id: 'eraser', icon: <Trash2 size={18} />, label: 'eraser' }].map(t => (
                      <button key={t.id} onClick={() => updateDrawSettings('tool', t.id)} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all border ${drawSettings.tool === t.id ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm' : 'border-transparent text-gray-400 hover:bg-gray-50'}`}>{t.icon}<span className="text-[9px] font-bold">{t.label}</span></button>
                    ))}
                  </div>
                </section>
                {drawSettings.tool !== 'eraser' && (
                  <>
                    <section>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] block mb-4">Color</label>
                      <div className="flex gap-2 items-center bg-gray-50 p-2 rounded-xl border border-gray-100"><input type="color" className="w-full h-10 rounded-lg cursor-pointer border-none p-0 overflow-hidden" value={drawSettings.color} onChange={(e) => updateDrawSettings('color', e.target.value)} /></div>
                    </section>
                    <section>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] block mb-4 flex justify-between"><span>width</span><span className="text-blue-600">{drawSettings.width}px</span></label>
                      <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-xl border border-gray-100"><div className="w-2 h-2 rounded-full bg-gray-400"></div><input type="range" min="1" max="50" step="1" value={drawSettings.width} onChange={(e) => updateDrawSettings('width', e.target.value)} className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" /><div className="w-4 h-4 rounded-full bg-gray-400"></div></div>
                    </section>
                  </>
                )}
                <button onClick={() => setIsDrawingMode(false)} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-bold mt-4 shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors">Complete</button>
              </div>
            ) : activeObject ? (
              <>
                <section>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] block mb-4 flex justify-between"><span>Opacity</span><span className="text-blue-600">{Math.round(opacity * 100)}%</span></label>
                  <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-xl border border-gray-100"><Droplets size={16} className="text-blue-400" /><input type="range" min="0" max="1" step="0.01" value={opacity} onChange={(e) => handleOpacityChange(e.target.value)} className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div>
                </section>
                {activeObject.isWatermark && (
                  <div className="space-y-6 border-t border-b py-6 my-2">
                    <section className="animate-in slide-in-from-right duration-300">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] block mb-4 flex gap-2 items-center"><Edit3 size={12} /> content</label>
                      <input type="text" value={watermarkConfig.text} onChange={(e) => updateWatermarkSettings('text', e.target.value)} placeholder="WATERMARK" className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm font-medium transition-all" />
                    </section>
                    <section>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] block mb-4 flex gap-2 items-center"><ArrowRightLeft size={12} /> Horizontal offset (X)</label>
                      <input type="range" min="50" max="500" step="10" value={watermarkConfig.gapX} onChange={(e) => updateWatermarkSettings('gapX', e.target.value)} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </section>
                    <section>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] block mb-4 flex gap-2 items-center"><ArrowUpDown size={12} /> Vertical offset (Y)</label>
                      <input type="range" min="50" max="500" step="10" value={watermarkConfig.gapY} onChange={(e) => updateWatermarkSettings('gapY', e.target.value)} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </section>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <button onClick={duplicateSelected} className="flex items-center justify-center gap-2 py-3 px-3 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm font-bold text-gray-600 transition-all"><Copy size={16} /> Copy</button>
                    <button onClick={deleteSelected} className="flex items-center justify-center gap-2 py-3 px-3 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 text-sm font-bold transition-all"><Trash2 size={16} /> Delete</button>
                </div>
                {activeObject.type === 'i-text' && (
                  <section className="mt-4">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] block mb-4">Text color</label>
                    <div className="flex gap-2 items-center bg-gray-50 p-2 rounded-xl border border-gray-100"><input type="color" className="w-10 h-10 rounded-lg cursor-pointer border-none p-0 overflow-hidden" value={activeObject.fill} onChange={(e) => { activeObject.set('fill', e.target.value); canvas.renderAll(); }} /></div>
                  </section>
                )}
              </>
            ) : hasImage ? (
              <div className="text-center py-12 flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center"><Settings size={20} className="text-gray-300" /></div>
                <p className="text-gray-400 text-sm px-4 leading-relaxed">Click object to edit attributes</p>
              </div>
            ) : (
                <div className="text-center py-12 text-gray-300 text-sm">Waiting...</div>
            )}
          </div>
        </aside>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleMainFileUpload} className="hidden" accept="image/*,application/pdf" />
      <input type="file" ref={overlayInputRef} onChange={addOverlayImage} className="hidden" accept="image/*" />
      <input type="file" ref={watermarkInputRef} onChange={addImageWatermark} className="hidden" accept="image/*" />
    </div>
  );
};

const ToolButton = ({ icon, label, onClick, active, disabled }) => (
  <button onClick={onClick} disabled={disabled} className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all w-16 group relative ${disabled ? 'opacity-30 cursor-not-allowed grayscale' : ''} ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-600'}`}><div className={`transition-transform duration-200 ${active ? '' : !disabled && 'group-hover:scale-110'}`}>{icon}</div><span className={`text-[9px] font-bold uppercase tracking-wider ${active ? 'text-white' : 'text-gray-400'}`}>{label}</span></button>
);

export default App;