/**
 * ESLint 9 flat config.
 *
 * Next 16 removed `next lint`, so the linter is invoked directly and the
 * config moved from `.eslintrc.json` to this file. The rule sets are the same
 * two as before — Next's core-web-vitals and its TypeScript rules — plus two
 * deliberate adjustments, both written down rather than disabled inline.
 */
import next from "eslint-config-next";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "data/**", ".data/**", "public/sw.js"],
  },
  ...next,
  ...typescript,
  {
    rules: {
      /**
       * React 19's compiler rules flag "set state in a mount effect", and it
       * is right about most of them — the theme toggle became a
       * `useSyncExternalStore`, and the circles countdown stopped reading
       * `Date.now()` during render, because those were real defects.
       *
       * Two sites remain and both are the SSR-correct pattern rather than a
       * mistake:
       *
       *   - `circles-list.tsx` fetches on mount. That is what fetching is.
       *   - `vent-chat.tsx` reads `localStorage` on mount to decide whether to
       *     show onboarding. It cannot be read during render — the server has
       *     no storage — and a lazy initialiser would hydrate into a mismatch.
       *
       * A warning keeps them visible. An error would push somebody to write
       * something worse to make the build pass.
       */
      "react-hooks/set-state-in-effect": "warn",

      /** `const { sig, ...rest } = row` is how a key is dropped. */
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
];

export default config;
