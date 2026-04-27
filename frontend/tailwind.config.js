/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#0f0f13',
        electric: '#6366f1'
      },
      boxShadow: {
        glow: '0 20px 60px rgba(99, 102, 241, 0.22)'
      }
    }
  },
  plugins: []
};
