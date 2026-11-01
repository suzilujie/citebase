/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0B0F14',
          800: '#121821',
          700: '#1A2230',
          600: '#232D3D',
        },
        accent: {
          DEFAULT: '#6366F1',
          deep: '#4F46E5',
          soft: '#818CF8',
          cyan: '#22D3EE',
        },
        paper: '#E6EDF3',
        muted: '#94A3B8',
        faint: '#64748B',
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'Segoe UI', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Courier New', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '0.35' },
          '50%': { opacity: '0.8' },
        },
      },
      animation: {
        'fade-up': 'fade-up 220ms ease-out both',
        'pulse-soft': 'pulse-soft 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
