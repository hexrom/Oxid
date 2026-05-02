import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        surface: "#141414",
        surfaceAlt: "#181818",
        border: "#1f1f1f",
        borderStrong: "#262626",
        muted: "#737373",
        text: "#e5e5e5",
        textDim: "#a3a3a3",
        oxide: {
          DEFAULT: "#e85d26",
          dim: "#b8451b",
          glow: "rgba(232, 93, 38, 0.16)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "var(--font-jetbrains-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(2px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 150ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
