/**
 * Print every migration in order, as one paste for the Supabase SQL editor.
 *
 *   npm run migrations            # to the screen
 *   npm run migrations > all.sql  # to a file, if you prefer
 *
 * Supabase has no "apply this folder" button, and applying five files by hand
 * has one failure mode that costs an afternoon: getting the order wrong, or
 * missing the last one. 0004 adds each seat's own chair and 0005 adds
 * presence — skip them and circles create fine and then break at join.
 *
 * This concatenates, it does not duplicate. The files under
 * supabase/migrations are still the only copy; delete this script and nothing
 * about the schema changes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "supabase", "migrations");

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // 0001..0005 — zero-padded, so lexical order is apply order.

if (!files.length) {
  console.error(`no .sql files in ${DIR}`);
  process.exit(1);
}

const rule = "-".repeat(72);
const out = [
  `-- Mind Weave VENT — ${files.length} migrations, in order.`,
  "-- Paste the whole thing into the Supabase SQL editor and run once.",
  "-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE.",
  "",
];

for (const file of files) {
  out.push(`-- ${rule}`, `-- ${file}`, `-- ${rule}`, "");
  out.push(fs.readFileSync(path.join(DIR, file), "utf8").trim(), "");
}

console.log(out.join("\n"));
