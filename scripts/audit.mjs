/**
 * The nightly self-audit.
 *
 *   npm run audit            # read, grade, propose. Writes nothing to src/.
 *   npm run audit -- --dry   # graders only. Zero calls, no key needed.
 *   npm run audit -- --apply # merge accepted proposals into learned.ts
 *
 * THE LOOP, AND WHERE THE BRAKE IS
 *
 * "Scans the last 50 conversations, finds where it sounded generic, writes new
 * rules to itself, updates its own prompt." Every word of that is right except
 * the last four.
 *
 * A prompt that rewrites itself unsupervised has no floor, and the failure is
 * not dramatic — each night's rule is individually reasonable, the tenth
 * contradicts the third, nobody can say when the voice changed, and there is
 * no version to go back to because there was never a diff. This repository's
 * own history is the argument: the expensive bugs were all *plausible* when
 * they were written, and every one of them was caught by something that could
 * fail a build.
 *
 * So: this proposes, `src/lib/vent/learned.ts` holds, and `npm run gate`
 * decides. `--apply` edits a version-controlled file, which means every rule
 * the room gave itself is a diff somebody can read, blame and revert — and it
 * cannot reach anybody until the gate passes on it.
 *
 * WHAT IT COSTS
 *
 * On a good night, nothing. `gradeReply` is deterministic and free, and it
 * already knows about advice, promises, reciting context, banned phrases,
 * coverage, length and language mixing. Only replies that broke *no* stated
 * rule and are still flat reach a model, in ONE call, capped at ten samples.
 * A night with no flat replies makes no call at all.
 */

import fs from "node:fs";
import path from "node:path";
import { app, ROOT } from "./app-imports.mjs";

const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 50);

const { knownProblems, flatReplies, parseProposals, auditPrompt } =
  await app("src/lib/vent/audit.ts");
const { prune, MAX_LEARNED, LEARNED_RULES } = await app("src/lib/vent/learned.ts");
const { MODEL } = await app("src/lib/vent/providers.ts");

const OUT = path.join(ROOT, "data", "audit");
const today = new Date().toISOString().slice(0, 10);

/**
 * Rows, from wherever this deployment keeps them.
 *
 * The file store is read directly rather than through `getStore()`: this is a
 * script, `getStore()` is `server-only`, and the shape on disk is the same
 * shape the store returns. With Supabase configured, `VENT_AUDIT_ROWS` points
 * at a JSON export instead — the export endpoint already produces it, and a
 * nightly job with a service-role key is a credential this script should not
 * need to hold.
 */
function readRows() {
  const explicit = process.env.VENT_AUDIT_ROWS;
  if (explicit) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(explicit), "utf8"));
    return raw.vents ?? raw.rows ?? raw;
  }
  const file = path.join(ROOT, process.env.VENT_DATA_DIR || ".data", "vent.json");
  if (!fs.existsSync(file)) return [];
  const db = JSON.parse(fs.readFileSync(file, "utf8"));
  return db.vents ?? [];
}

const all = readRows();
const rows = [...all]
  .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  .slice(0, LIMIT);

console.log(`\nMIND WEAVE — nightly audit  ${today}`);
console.log("─".repeat(72));
console.log(`read       ${rows.length} of ${all.length} stored turns`);

if (rows.length === 0) {
  console.log("\nnothing stored yet — nothing to audit, and no call made.\n");
  process.exit(0);
}

// ── free, and usually the whole answer ──────────────────────────────────────
const known = knownProblems(rows);
console.log(`broke a rule  ${known.length}`);
for (const f of known.slice(0, 8)) {
  console.log(`  [${f.severity}] ${f.problems.slice(0, 2).join(" · ")}`);
  console.log(`         ${f.reply.replace(/\s+/g, " ").slice(0, 88)}`);
}

/*
  A finding here is a code change, never a new rule. The grader that fired
  already names the rule the product states — adding an instruction telling
  the model to obey a rule it was already given is how a prompt doubles in
  size while nothing improves.
*/
const flat = flatReplies(rows, 10);
console.log(`flat, unbroken ${flat.length}  (the only ones worth a call)`);

fs.mkdirSync(OUT, { recursive: true });
const report = { date: today, read: rows.length, known, flat: flat.map((r) => r.id) };

if (flat.length === 0) {
  fs.writeFileSync(path.join(OUT, `${today}.json`), JSON.stringify({ ...report, proposals: [] }, null, 2));
  console.log("\nnothing flat tonight — no call made, no proposals.\n");
  process.exit(0);
}

if (DRY || !process.env.ANTHROPIC_API_KEY) {
  fs.writeFileSync(path.join(OUT, `${today}.json`), JSON.stringify({ ...report, proposals: [] }, null, 2));
  console.log(`\n${DRY ? "dry run" : "no ANTHROPIC_API_KEY"} — graders only, 0 tokens.\n`);
  process.exit(0);
}

// ── the one call ────────────────────────────────────────────────────────────
const { default: Anthropic } = await import("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const res = await client.messages.create({
  model: MODEL.anthropic,
  max_tokens: 2048,
  messages: [
    {
      role: "user",
      content: auditPrompt(
        flat.map((r) => ({ said: r.user_message, reply: r.ai_reply ?? "" })),
      ),
    },
  ],
});

const text = res.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("")
  .trim();

const { accepted, rejected } = parseProposals(text, today);

console.log(`\nproposed   ${accepted.length + rejected.length}`);
for (const a of accepted) console.log(`  ACCEPT  ${a.rule}`);
for (const r of rejected) console.log(`  REJECT  ${r.why} — ${r.rule.slice(0, 60)}`);
console.log(`tokens     in ${res.usage.input_tokens} · out ${res.usage.output_tokens}`);

fs.writeFileSync(
  path.join(OUT, `${today}.json`),
  JSON.stringify({ ...report, proposals: accepted, rejected }, null, 2),
);

if (!APPLY) {
  console.log(`\nwritten to data/audit/${today}.json — nothing in src/ was touched.`);
  console.log("run with --apply to merge, then `npm run gate` before it ships.\n");
  process.exit(0);
}

// ── the merge, which is a diff somebody can revert ──────────────────────────
const merged = prune([...accepted, ...LEARNED_RULES]);
const file = path.join(ROOT, "src/lib/vent/learned.ts");
const src = fs.readFileSync(file, "utf8");
const body = `export const LEARNED_RULES: readonly LearnedRule[] = ${JSON.stringify(merged, null, 2)};`;

const start = src.indexOf("export const LEARNED_RULES");
const end = src.indexOf("];", start) + 2;
if (start < 0) {
  console.error("could not find LEARNED_RULES to merge into — refusing to guess.");
  process.exit(1);
}
fs.writeFileSync(file, src.slice(0, start) + body + src.slice(end));
console.log(
  `\nmerged ${accepted.length} into learned.ts (${merged.length}/${MAX_LEARNED} kept).` +
    "\nrun `npm run gate` — it decides, not this script.\n",
);
