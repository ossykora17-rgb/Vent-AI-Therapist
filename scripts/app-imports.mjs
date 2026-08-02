/**
 * Lets a plain Node script import the app's own TypeScript modules.
 *
 * The whole point of these pipelines is that they read the *real* library —
 * a script that re-implements `selectTactic` or the intent rules is measuring
 * a copy, and a copy drifts. Node 22 strips types on its own; what it will
 * not do is resolve `@/lib/...` or a missing `.ts` extension, so this teaches
 * it those two things and nothing else.
 *
 * Systems work is what makes the data work feasible. No dependency, ~30 lines.
 */
import { registerHooks } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");

/** `./x` → `./x.ts` → `./x.tsx` → `./x/index.ts`. First hit wins. */
function land(base) {
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * `module-typescript` is what tells Node to strip types *and* skip the
 * parse-as-CommonJS-then-retry round trip. Plain `module` skips the stripping
 * with it, and the first `type` import blows up.
 */
const found = (file) => ({
  url: pathToFileURL(file).href,
  format: /\.tsx?$/.test(file) ? "module-typescript" : undefined,
  shortCircuit: true,
});

registerHooks({
  resolve(specifier, context, next) {
    // An already-absolute `file:…/x.ts` still needs the format hint, or Node
    // parses it as CommonJS first and warns about the retry.
    if (specifier.startsWith("file:") && /\.tsx?$/.test(specifier)) {
      return found(new URL(specifier).pathname);
    }
    if (specifier.startsWith("@/")) {
      const hit = land(path.join(ROOT, "src", specifier.slice(2)));
      if (hit) return found(hit);
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const from = path.dirname(new URL(context.parentURL).pathname);
      const hit = land(path.resolve(from, specifier));
      if (hit) return found(hit);
    }
    return next(specifier, context);
  },
});

/** Import an app module by repo-relative path, e.g. `src/lib/vent/intent.ts`. */
export const app = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

export { ROOT };
