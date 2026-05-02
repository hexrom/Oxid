import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg0: "#08080a",
        bg1: "#0e0e11",
        bg2: "#14141a",
        bg3: "#181820",
        bg4: "#1f1f29",
        background: "#08080a",
        surface: "#0e0e11",
        surfaceAlt: "#14141a",
        border: "#1f1f29",
        borderStrong: "#2a2a36",
        muted: "#4a4a58",
        text: "#e8e8ee",
        textDim: "#b3b3c0",
        textTertiary: "#6e6e7e",
        oxide: {
          DEFAULT: "#e85d26",
          dim: "#b8451b",
          glow: "rgba(232, 93, 38, 0.16)",
        },
        sev: {
          critical: "#ff5c5c",
          high: "#ff9248",
          medium: "#f0c243",
          low: "#5fa3ff",
          info: "#7c8590",
        },
        ok: "#4ade80",
        warn: "#f0c243",
        err: "#ff5c5c",
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "Geist",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "var(--font-jetbrains-mono)",
          "JetBrains Mono",
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
