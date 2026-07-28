import type { Config } from "tailwindcss";

/**
 * BRUTALIST TRUST
 * Four colors. Nothing else. No gradients, no glow, no blur.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    // Wiping the default palette guarantees no stray color can ever be used.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      ink: "#000000",
      paper: "#FFFFFF",
      ash: "#AAAAAA",
      gold: "#FFD700",
      // Preflight hardcodes `theme('colors.gray.400', '#9ca3af')` for
      // ::placeholder. Aliasing it to ash keeps #9ca3af out of the bundle.
      gray: { 400: "#AAAAAA" },
    },
    // Tailwind's ring defaults are blue-500 / black-5%. Re-point them so no
    // off-palette color can reach the stylesheet.
    ringColor: ({ theme }) => ({ ...theme("colors"), DEFAULT: "#FFD700" }),
    ringOffsetColor: ({ theme }) => theme("colors"),
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-playfair)", "Georgia", "serif"],
      },
      borderWidth: {
        3: "3px",
      },
      ringWidth: {
        3: "3px",
      },
      boxShadow: {
        // Hard offset shadows only — solid, zero blur.
        brut: "4px 4px 0 0 #000000",
        "brut-sm": "2px 2px 0 0 #000000",
        "brut-lg": "8px 8px 0 0 #000000",
        none: "none",
      },
      keyframes: {
        "slide-up": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // The totem's eye. A hard cut, not a fade.
        blink: {
          "0%, 92%, 100%": { transform: "scaleY(1)" },
          "94%, 97%": { transform: "scaleY(0.12)" },
        },
      },
      animation: {
        "slide-up": "slide-up 140ms ease-out",
        "fade-in": "fade-in 120ms ease-out",
        blink: "blink 7s steps(1, end) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
