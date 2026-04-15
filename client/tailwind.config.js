/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0a0a0a',
          card: '#111111',
          raised: '#1a1a1a',
          border: '#2a2a2a',
        },
        profit: '#c6f135',
        loss:   '#7c3aed',
        accent: '#c6f135',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
