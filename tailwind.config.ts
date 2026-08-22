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
      // Theme-invariant, like the gold it sits on.
      "on-gold": rgb("on-gold"),
      line: rgb("line"),
      // Preflight hardcodes theme('colors.gray.400') for ::placeholder.
      gray: { 400: rgb("ash") },
    },
    ringColor: ({ theme }) => ({ ...theme("colors"), DEFAULT: rgb("gold") }),
    ringOffsetColor: ({ theme }) => theme("colors"),
    /*
      Five steps, and the other ten cannot be typed.

      The scale itself was decided a commit ago — 11 the label, 13 fine print,
      15 the voice, 22 a heading, 56 the drop — after counting fifteen distinct
      sizes across the components and understanding that two blocks four pixels
      apart read as different without reading as ranked, which is what makes a
      screen restless.

      Deciding it fixed the fifteen instances. It did not fix the class, because
      `text-sm`, `text-lg`, `text-2xl` and the rest of Tailwind's default ramp
      still resolved — so the scale lived in a commit message and in the head of
      whoever last read it, and the next component written in a hurry would
      reach for `text-sm` and be right back at fourteen-versus-fifteen. Fifty-
      seven of them already had.

      This is `fontSize` on `theme`, not on `extend`: it *replaces* the default
      ramp rather than adding to it. Same move, and the same reason, as the
      `borderWidth: 3` and `shadow-brut` deletions below — a design system is
      singular only when the old one cannot be typed.

      Named, not numbered, because the name is the argument. `text-body` says
      what the size is for; `text-sm` says only that it is smaller than
      something. A step you have to justify by name is a step nobody adds by
      accident.

      One deliberate absence: there is no fluid step here. The landing logotype
      and the 404 numeral are set with arbitrary `clamp()` values, because they
      are lettering rather than text — sized against the viewport, not against
      the paragraph. Check 82 knows about exactly those two and fails any third.
    */
    fontSize: {
      /** Signposts. Mono, uppercase, tracked — see `.label-mono`. */
      label: ["11px", { lineHeight: "1.45" }],
      /** Fine print: conditions, timestamps, the disclaimer's second line. */
      fine: ["13px", { lineHeight: "1.5" }],
      /** The voice. Everything a person reads or presses. */
      body: ["15px", { lineHeight: "1.6" }],
      /** A heading. The one step that is a real jump, which is the point. */
      heading: ["22px", { lineHeight: "1.25" }],
      /** The drop: one number, one word, once per screen at most. */
      drop: ["56px", { lineHeight: "0.9" }],
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      /*
        `borderWidth: 3` and the three `brut` shadows are gone, not unused.

        A design system is singular only when the old one cannot be typed. As
        long as `border-3` and `shadow-brut` resolved, the next component
        written in a hurry would have reached for them — that is exactly how
        this repo ended up with two languages meeting at the signup redirect,
        where a person crossing that line saw a different product.

        `ring-3` goes with them: the frosted system rings in gold at 2px
        through `.focusable`, in one place, rather than per-component.
      */
      borderRadius: { card: "18px" },
      backdropBlur: { glass: "20px" },
      boxShadow: {
        glass: "0 20px 60px var(--shadow)",
        "glass-sm": "0 8px 24px var(--shadow)",
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
