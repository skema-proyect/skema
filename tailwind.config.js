/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        inter: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        skema: {
          bg:            "#0F1117",
          surface:       "#1A1D27",
          border:        "#2A2D3A",
          accent:        "#4F7FFF",
          "accent-dark": "#3A6AE8",
          text:          "#E8EAF0",
          muted:         "#7A7F96",
          success:       "#2ECC71",
          warning:       "#F39C12",
          danger:        "#E74C3C",
        },
      },
    },
  },
  plugins: [],
};

