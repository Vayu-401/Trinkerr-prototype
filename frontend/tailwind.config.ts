import type { Config } from "tailwindcss";

// Design tokens: banknote-paper background, slate ink, marigold for results.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F3F6F5",
        surface: "#FFFFFF",
        ink: "#1B2A3A",
        muted: "#5F6F7C",
        line: "#D7DFE2",
        marigold: { DEFAULT: "#E3A72F", soft: "#F6E3B8", deep: "#9A6A0C" },
        sage: { DEFAULT: "#2F6B5A", soft: "#DCEBE5" },
        brick: { DEFAULT: "#B4442E", soft: "#F5DFD8" },
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk"', "system-ui", "sans-serif"],
      },
      borderRadius: { DEFAULT: "6px" },
    },
  },
  plugins: [],
} satisfies Config;
