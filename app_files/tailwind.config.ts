import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#eef7f1",
          100: "#d6ecdc",
          500: "#2f7a4f",
          600: "#276943",
          700: "#1f5336",
          900: "#133321"
        },
        lake: {
          50: "#eaf6fb",
          100: "#d3ecf7",
          500: "#247fa7",
          600: "#1d6d90",
          700: "#174f69"
        },
        bark: "#624c3a",
        paper: "#f6f1e7",
        ink: "#22302a"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(31, 83, 54, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
