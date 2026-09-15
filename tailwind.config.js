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
        dark: {
          950: '#06060A',
          900: '#0D0D12',
          800: '#13131A',
          700: '#1A1A24',
          600: '#2A2A38',
        },
        brand: {
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
        },
      },
      boxShadow: {
        'glass-sm': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'glass-md': '0 4px 20px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        'glass-lg': '0 20px 60px rgba(0,0,0,0.6), 0 8px 20px rgba(0,0,0,0.4)',
        'glow-blue': '0 0 24px rgba(59, 130, 246, 0.2)',
        'glow-green': '0 0 20px rgba(52, 211, 153, 0.15)',
        'glow-red': '0 0 20px rgba(248, 113, 113, 0.15)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'SF Pro Text', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
