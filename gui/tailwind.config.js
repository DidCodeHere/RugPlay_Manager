/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom colors for the trading UI
        buy: {
          DEFAULT: '#10b981', // Emerald
          hover: '#059669',
          light: '#d1fae5',
        },
        sell: {
          DEFAULT: '#f43f5e', // Rose
          hover: '#e11d48',
          light: '#ffe4e6',
        },
        // Dark theme palette
        background: {
          DEFAULT: '#0f172a', // Slate 900
          secondary: '#1e293b', // Slate 800
          tertiary: '#334155', // Slate 700
        },
        foreground: {
          DEFAULT: '#f8fafc', // Slate 50
          muted: '#94a3b8', // Slate 400
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-in-right': 'slide-in-right 0.2s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
        'shake': 'shake 0.4s ease-in-out',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-4px)' },
          '40%, 80%': { transform: 'translateX(4px)' },
        },
      },
    },
  },
  plugins: [],
}
