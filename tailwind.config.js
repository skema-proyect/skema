/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        inter: ["Inter", "sans-serif"],
      },
      colors: {
        s: {
          // Sidebar
          sidebar:        "#171717",
          "sidebar-hover":"#2a2a2a",
          "sidebar-text": "#ececec",
          "sidebar-muted":"#8e8e8e",
          "sidebar-border":"#2f2f2f",
          // Main area
          bg:             "#ffffff",
          surface:        "#f4f4f4",
          border:         "#e5e5e5",
          text:           "#0d0d0d",
          muted:          "#6b6b6b",
          // Accents
          accent:         "#000000",
          "accent-text":  "#ffffff",
          danger:         "#dc2626",
          success:        "#16a34a",
        },
      },
    },
  },
  plugins: [],
};

