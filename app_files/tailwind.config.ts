import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#ecf7ef",
          100: "#d7ecd9",
          500: "#18824f",
          600: "#0d6b42",
          700: "#075234",
          800: "#063f2b",
          900: "#052f22"
        },
        lake: {
          50: "#eef7ff",
          100: "#dbeafe",
          500: "#1567d3",
          600: "#075fca",
          700: "#034a9f"
        },
        bark: "#624c3a",
        paper: "#f6f1e7",
        ink: "#22302a"
      },
      boxShadow: {
        soft: "0 10px 28px rgba(13, 44, 30, 0.08)",
        panel: "0 18px 45px rgba(15, 33, 25, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
