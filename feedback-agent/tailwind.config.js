/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        aura: {
          bg: "#051424",
          surface: "#122131",
          "surface-high": "#1c2b3c",
          tertiary: "#47d6ff",
          secondary: "#c0c1ff",
          "on-surface": "#d4e4fa",
          "on-variant": "#c7c6cc",
          outline: "#919096",
          "secondary-container": "#3131c0",
          "on-secondary": "#1000a9"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
