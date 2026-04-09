/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          card: '#161b27',
          raised: '#1e2436',
          border: '#2a3047',
        },
        profit: '#38bdf8',   // sky-400
        loss: '#fb923c',     // orange-400
        accent: '#818cf8',   // indigo-400
      },
    },
  },
  plugins: [],
};
