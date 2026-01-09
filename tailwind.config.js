export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { 
    extend: {
      screens: {
        'xs': '475px',
      },
      animation: {
        'slide-in-left': 'slide-in-left 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.2s ease-out',
      },
      keyframes: {
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    } 
  },
  plugins: [],
}
