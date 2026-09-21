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
 *
 * THE THIRD THING, AND THE CLAIM IT WAS QUIETLY FALSIFYING
 *
 * CLAUDE.md opens by saying the gate "has zero dependencies, so a fresh `git
 * worktree` runs the whole suite with no `npm install`", and the heartbeat
 * prints that instruction to whoever it hands a finding to. It was not true.
 * `research.ts` imports `@anthropic-ai/sdk` statically and `eval.mjs` loads it
 * at the top, so a worktree with no `node_modules` died on
 * `ERR_MODULE_NOT_FOUND` before a single check ran. Verified across four
 * commits, two of them older than the change that found it: the property has
 * been false for as long as that import has existed, and it looked fine from
 * inside the repository because `node_modules` was simply there.
 *
 * Exactly one package is missing — measured by resolving every bare specifier
 * the suite reaches and printing the ones that fail. So the fix is the same
 * shape as `server-only` above: resolve it for real when it is installed, and
 * hand back a stub when it is not.
 *
 * **The stub throws on use, and that is the whole of the care in it.** A
 * silent one would let a check that accidentally calls a model see a no-op and
 * report green — a check passing by not looking, in the file that decides what
 * every other check can see. Importing is free; using is an error with a name.
 *
 * `research.ts` could have been made to import lazily instead, which is the
 * lesson check 141 enforces on `audit.mjs`. It is not done there because
 * `research()` is awaited on the path a person is waiting on, so a dynamic
 * import buys a first-call cost on the vent route to fix a property of the
 * test harness — and because this covers the next static importer too, rather
 * than the one that exists today.
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

/**
 * Packages that were not installed and were stubbed instead.
 *
 * Exported so a run can *say* it, rather than differing from an installed run
 * in silence. A skip is only honest if it is legible where somebody looks.
 */
export const stubbed = new Set();

/**
 * The stub itself: importable, and an error the moment it is used.
 *
 * Every access throws, so a check that reached for a model gets a named
 * failure instead of a no-op that reads as a pass.
 */
const MISSING =
  "data:text/javascript," +
  encodeURIComponent(
    "const no=()=>{throw new Error('this package is not installed; the suite must not call it')};" +
      "export default new Proxy(function(){},{get:no,apply:no,construct:no});",
  );

registerHooks({
  resolve(specifier, context, next) {
    // `server-only` is a build-time guard with no runtime meaning. Without
    // this the suite cannot import the modules that carry it, which is most
    // of the ones worth asserting.
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }
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
    /*
      A bare package the product needs at runtime and the suite never calls.

      Tried for real first, so a repository with `node_modules` behaves exactly
      as it always did and nothing here is a second opinion about a package
      that is present. Only `ERR_MODULE_NOT_FOUND` is caught: every other
      resolve failure is a real one and is left to throw.
    */
    if (!/^[.@]?\/|^(node|file|data):/.test(specifier) && !specifier.startsWith("@/")) {
      try {
        return next(specifier, context);
      } catch (e) {
        if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
        stubbed.add(specifier);
        return { url: MISSING, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
});

/** Import an app module by repo-relative path, e.g. `src/lib/vent/intent.ts`. */
export const app = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

export { ROOT };
