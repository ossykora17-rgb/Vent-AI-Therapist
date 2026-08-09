/**
 * The only thing in this repo that costs money, and the only one that reads a
 * reply.
 *
 *   npm run quality              # the whole golden set, against :3001
 *   npm run quality -- --limit 6 # a cheaper slice while iterating
 *   npm run quality -- --dry     # graders only, zero calls, no key needed
 *
 * Deliberately NOT part of `npm run gate`. The gate makes zero model calls by
 * construction and that property is load-bearing — it is what lets a fresh
 * worktree run the whole suite for free, and what keeps CI from having a
 * balance. This is the opposite kind of tool: it is run on purpose, it has a
 * bill, and it is the only way to know whether a prompt change helped.
 *
 * Every grader is deterministic and lives in `src/lib/vent/quality.ts`, so
 * grading itself costs nothing and the checks cannot drift from the rules the
 * product enforces — they import them.
 */
import fs from "node:fs";
import path from "node:path";
import { app, ROOT } from "./app-imports.mjs";

const { gradeReply, worstOf } = await app("src/lib/vent/quality.ts");

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1] ?? true;
};
const DRY = args.includes("--dry");
const BASE = flag("url", "http://localhost:3001");
const LIMIT = Number(flag("limit", 0)) || 0;

/**
 * A ceiling on the bill, not a suggestion.
 *
 * The golden set is 24 cases and only the vents reach a model, so a full run
 * is roughly 17 calls. This refuses to start if the set has grown past what
 * somebody expected to pay for — the failure mode of every eval harness is
 * that it quietly becomes expensive and then stops being run.
 */
const MAX_CALLS = 40;

const cases = fs
  .readFileSync(path.join(ROOT, "src/lib/vent/goldenSet.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const set = LIMIT ? cases.slice(0, LIMIT) : cases;
const billable = set.filter((c) => c.intent === "vent").length;

const bar = "─".repeat(72);
console.log(`\nMIND WEAVE — reply quality\n${bar}`);
console.log(`cases      ${set.length} (${billable} reach a model)`);

if (billable > MAX_CALLS) {
  console.error(`\nrefusing: ${billable} billable cases exceeds MAX_CALLS ${MAX_CALLS}.`);
  console.error(`raise it on purpose, or use --limit.`);
  process.exit(2);
}

// ── dry mode: prove the graders work without spending anything ─────────────
//
// The graders are validated against the authored corpus, whose replies were
// written by hand to the constitution. If they flag those, the graders are
// wrong — which is a thing to find out before paying to learn it.
if (DRY) {
  const authored = fs
    .readFileSync(path.join(ROOT, "src/lib/vent/holisticExamples.jsonl"), "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));

  let flagged = 0;
  for (const ex of authored) {
    const findings = gradeReply(
      { id: "authored", message: ex.input, intent: "vent", language: "en", probes: "" },
      ex.full_integration,
      {},
    );
    const bad = findings.filter((f) => f.severity !== "minor");
    if (bad.length) {
      flagged++;
      console.log(`  FLAG ${ex.input.slice(0, 44)}`);
      for (const f of bad) console.log(`       ${f.severity} ${f.grader}: ${f.detail}`);
    }
  }
  console.log(`\n${authored.length} authored replies graded · ${flagged} flagged · 0 tokens`);
  console.log(`${bar}\n`);
  process.exit(flagged === 0 ? 0 : 1);
}

// ── live: the real pipeline, the real prompt, the real model ───────────────
const anon = `quality-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const rows = [];
let calls = 0;

for (const c of set) {
  let data;
  try {
    const res = await fetch(`${BASE}/api/vent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A fresh id per case: no memory, no carve, no pattern. This measures
      // the reply to *this* message, not the state a previous case left.
      body: JSON.stringify({ anonId: `${anon}-${c.id}`.slice(0, 64), message: c.message, pressure: 70 }),
    });
    data = await res.json();
  } catch (e) {
    console.error(`  ${c.id}: request failed — ${e.message}`);
    rows.push({ c, findings: [{ grader: "transport", severity: "fatal", detail: e.message }] });
    continue;
  }

  if (data.tokensSpent) calls++;
  const findings = gradeReply(c, data.reply ?? "", {
    intent: data.intent,
    tokensSpent: Boolean(data.tokensSpent),
  });
  rows.push({ c, findings, reply: data.reply ?? "" });
}

const fatal = rows.filter((r) => worstOf(r.findings) === "fatal");
const major = rows.filter((r) => worstOf(r.findings) === "major");
const minor = rows.filter((r) => worstOf(r.findings) === "minor");
const skipped = rows.filter((r) => worstOf(r.findings) === "skipped");
const clean = rows.length - fatal.length - major.length - minor.length - skipped.length;

console.log("");
for (const r of rows) {
  const w = worstOf(r.findings);
  if (!w || w === "skipped") continue;
  console.log(`  ${w.toUpperCase().padEnd(5)} ${r.c.id}  — ${r.c.probes}`);
  for (const f of r.findings) console.log(`        ${f.grader}: ${f.detail}`);
  if (r.reply) console.log(`        reply: ${JSON.stringify(r.reply.slice(0, 110))}`);
}

console.log(`\n${bar}`);
console.log(`clean ${clean} · minor ${minor.length} · major ${major.length} · fatal ${fatal.length}`);
if (skipped.length) {
  console.log(`skipped ${skipped.length} — no model key, so these were never graded.`);
  console.log(`         this run says nothing about reply quality.`);
}
console.log(`model calls ${calls} (budget ${MAX_CALLS})`);
console.log(bar + "\n");

// Fatals block. Majors are a regression worth a person looking. Minors are
// drift and do not fail a run on their own.
process.exit(fatal.length > 0 ? 1 : 0);
