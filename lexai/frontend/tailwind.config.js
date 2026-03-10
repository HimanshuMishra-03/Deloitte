/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#09090f',
          50: '#f4ede0',
          100: '#e8dbc1',
          200: '#d4b88a',
          800: '#1a1828',
          900: '#09090f',
        },
        parchment: '#f4ede0',
        gold: {
          light: '#e8c96a',
          DEFAULT: '#c9a84c',
          dark: '#a07830',
        },
        outcome: {
          acquitted: '#22c55e',
          convicted: '#ef4444',
          remanded: '#3b82f6',
          modified: '#f59e0b',
          dismissed: '#6b7280',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-amber': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
