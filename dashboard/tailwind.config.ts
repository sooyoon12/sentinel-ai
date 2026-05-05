import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        sentinel: {
          bg: "#09090b",
          panel: "#18181b",
          "panel-hi": "#27272a",
          border: "#3f3f46",
          accent: "#10b981",
          "accent-soft": "#064e3b",
          warn: "#f59e0b",
          danger: "#ef4444",
          info: "#38bdf8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
