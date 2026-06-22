/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#37889b',
          50: '#eef6f8',
          100: '#e6f1f4',
          200: '#c5dee5',
          300: '#9cc6d2',
          400: '#63a6b8',
          500: '#37889b',
          600: '#2f7889',
          700: '#2a6978',
          800: '#255561',
          900: '#214752',
        },
        paper: '#f5f9ff',
        coral: {
          DEFAULT: '#ff5c5c',
          50: '#fff1f1',
          100: '#ffe0e0',
          500: '#ff5c5c',
          600: '#ef4444',
          700: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(33, 71, 82, 0.08)',
        card: '0 1px 2px rgba(33, 71, 82, 0.06), 0 8px 24px rgba(33, 71, 82, 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in .25s ease-out both',
        'slide-up': 'slide-up .3s ease-out both',
      },
    },
  },
  plugins: [],
};
