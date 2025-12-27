/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        whatsapp: {
          teal: '#008069',
          light: '#25D366',
          bg: '#efeae2',
          header: '#f0f2f5',
          incoming: '#ffffff',
          outgoing: '#d9fdd3'
        }
      }
    },
  },
  plugins: [],
}