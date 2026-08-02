import type { Config } from "tailwindcss";

/**
 * MIND WEAVE — Truth Anchor.
 *
 * Every colour is a CSS variable holding raw RGB channels, so `bg-ink/60`
 * style opacity modifiers keep working AND light/dark swap with one class on
 * <html> — no component needs to know which mode it is in.
 */
const rgb = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      ink: rgb("ink"),
      paper: rgb("paper"),
      card: rgb("card"),
      ash: rgb("ash"),
      gold: rgb("gold"),
      "gold-deep": rgb("gold-deep"),
      line: rgb("line"),
      // Preflight hardcodes theme('colors.gray.400') for ::placeholder.
      gray: { 400: rgb("ash") },
    },
    ringColor: ({ theme }) => ({ ...theme("colors"), DEFAULT: rgb("gold") }),
    ringOffsetColor: ({ theme }) => theme("colors"),
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-playfair)", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderWidth: { 3: "3px" },
      ringWidth: { 3: "3px" },
      borderRadius: { card: "18px" },
      backdropBlur: { glass: "20px" },
      boxShadow: {
        glass: "0 20px 60px var(--shadow)",
        "glass-sm": "0 8px 24px var(--shadow)",
        brut: "4px 4px 0 0 rgb(var(--ink))",
        "brut-sm": "2px 2px 0 0 rgb(var(--ink))",
        "brut-lg": "8px 8px 0 0 rgb(var(--ink))",
        none: "none",
      },
      keyframes: {
        "slide-up": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        blink: {
          "0%, 92%, 100%": { transform: "scaleY(1)" },
          "94%, 97%": { transform: "scaleY(0.12)" },
        },
        // The canvas breathes: 4s in, 6s out — the same pace we ask of them.
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.01)" },
        },
      },
      animation: {
        "slide-up": "slide-up 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        "fade-in": "fade-in 200ms ease-out",
        blink: "blink 7s steps(1, end) infinite",
        breathe: "breathe 10s ease-in-out infinite",
      },
      transitionDuration: { 300: "300ms" },
    },
  },
  plugins: [],
};

export default config;
