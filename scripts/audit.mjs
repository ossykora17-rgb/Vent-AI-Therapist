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
 *
 * "The export endpoint already produces it" was true of the rows and false of
 * the shape, and the sentence covered both. See `readRows`.
 */
function readRows() {
  const explicit = process.env.VENT_AUDIT_ROWS;
  if (explicit) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(explicit), "utf8"));
    /*
      `raw.data.vents` first, because that is what the export endpoint
      actually returns and it was the one shape this line could not read.

      It was `raw.vents ?? raw.rows ?? raw`. The export envelope is
      `{complete, takenAt, commit, tables, excluded, truncated, errors, data}`
      with the rows under `data.vents`, so the first two both missed, the
      fallback returned the envelope object, and `[...all]` two lines down
      threw `TypeError: all is not iterable`.

      The nightly audit would have crashed the first time it ever ran against
      production. It has run fifteen times, every one of them taking the
      "no token configured" branch, so nobody found out — and the comment
      above still said "the export endpoint already produces it".

      A path written for a shape and never fed one. The other branches stay:
      a bare array and a `{vents}` object are both things somebody will hand
      this by hand, and refusing them buys nothing.
    */
    const rows = raw?.data?.vents ?? raw?.vents ?? raw?.rows ?? raw;
    if (!Array.isArray(rows)) {
      console.error(
        `${explicit} has no vents. Expected an export envelope with data.vents, ` +
          `a {vents:[...]} object, or a bare array.`,
      );
      process.exit(2);
    }
    return rows;
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
/*
  Graded against every stored row, not only the fifty being read.

  The invention grader needs what this person had already written, and the
  slice above is the fifty most recent turns across everybody. Handing it
  `rows` would make an invention on turn 51 invisible and one on turn 3
  forgivable — the evidence for a reply is the conversation behind it.
*/
const known = knownProblems(rows, undefined, all);
console.log(`broke a rule  ${known.length}`);
/*
  Names and an id. Never the reply, and never a grader's detail.

  This printed the severity, two grader *details* and 88 characters of the
  reply. On a public repository that is a public CI log with 90-day retention,
  and the report written below carried the whole object into a public
  artifact. The first run that ever read production did both, minutes after
  the module-load fix made this code reachable at all.

  What is left is what CLAUDE.md already allows everywhere else: a count, a
  severity, the graders that fired, and the row id — which is how somebody
  with database access reads the actual reply, through the authenticated path
  rather than off a log nobody can delete.
*/
for (const f of known.slice(0, 8)) {
  console.log(`  [${f.severity}] ${f.id} — ${f.problems.join(" · ")}`);
}

/*
  A finding here is a code change, never a new rule. The grader that fired
  already names the rule the product states — adding an instruction telling
  the model to obey a rule it was already given is how a prompt doubles in
  size while nothing improves.
*/
const flat = flatReplies(rows, known, 10);
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
/*
  BOTH PAID IMPORTS LIVE BELOW THE EXIT, AND THE SECOND ONE DID NOT

  The SDK import was already lazy and correctly placed. `MODEL` was not: it sat
  at the top of this file, and `providers.ts` imports `@anthropic-ai/sdk`
  statically — so reading one model id at the bottom pulled a paid dependency
  at module load.

  The first real run of this job died on it. Both secrets had just been set,
  `skip=0`, the rows were fetched from production for the first time in
  twenty-eight scheduled runs — and the process threw ERR_MODULE_NOT_FOUND
  before a single free grader ran. The branch above exists precisely so a night
  with no key still reports what the deterministic graders found, and it was
  unreachable from the one environment that needs it.

  The free half of this job must never depend on the paid half being installed.
*/
const { MODEL } = await app("src/lib/vent/providers.ts");
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

/*
  The accepted rules print in full, because they are the diff: `--apply`
  writes them into `src/lib/vent/learned.ts` and the prompt carries them to
  everybody. A rule nobody can read before it ships is the unsupervised loop
  this whole file exists to refuse.

  The refusals print their reason and not their text. `REJECT` used to carry
  sixty characters of the model's sentence, which is ordinarily its own words
  — but `acceptable` now refuses a rule for *quoting*, and that refusal would
  have printed the quote, into a public log and a public artifact, for the one
  proposal guaranteed to contain somebody's words. The same shape as
  `Verdict.reject` printing the reply it convicted.
*/
console.log(`\nproposed   ${accepted.length + rejected.length}`);
for (const a of accepted) console.log(`  ACCEPT  ${a.rule}`);
for (const why of rejected) console.log(`  REJECT  ${why}`);
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

// ── the fitness gate: measured, or not merged ───────────────────────────────
/*
  `acceptable()` is a spelling check standing where a fitness function belongs.
  It can say a rule is short, concrete and does not reopen a house rule. It
  cannot say whether the rule makes one reply better, and until this block
  existed nothing could — a rule reached everybody on the strength of a model's
  opinion of its own output.

  So every candidate is answered twice on twelve held-out cases: once with the
  rule in the prompt, once without, same model, same minute, same cases. The
  graders are free and deterministic, and `isImprovement` refuses anything that
  is not a Pareto improvement across all of them.

  THE HELD-OUT SET IS THE POINT. These candidates were proposed from flat
  production replies, so measuring them on those same replies is fitting the
  rule to its own sample — `earned_worth` on a sample of three, which this
  repository has already paid for. The authored corpus is the set the rule has
  never seen.

  ARMS DIFFER BY EXACTLY ONE BLOCK. One `groundNow()` for the whole run, one
  classification and one tactic per case, shared by both arms — grounding
  carries a millisecond ISO, so calling it twice would make the two prompts
  differ by more than the thing being measured. `technique` is deliberately
  absent: `research()` is a paid web search, and a fitness run that quietly
  bought one per case would be the eval suite's typed `0 model calls` again.
  What a lighter prompt cannot tell you is whether the rule still bites inside
  a fuller one, and that is stated rather than assumed away.
*/
const { fitnessOf, sampleCases } = await app("src/lib/vent/fitness.ts");
const { isImprovement } = await app("src/lib/vent/learned.ts");
const { classify } = await app("src/lib/vent/intent.ts");
const { selectTactic } = await app("src/lib/vent/tactics.ts");
const { groundNow } = await app("src/lib/vent/grounding.ts");
const { buildSystemPrompt } = await app("src/lib/vent/prompt.ts");
const { MAX_TOKENS } = await app("src/lib/vent/model.ts");

/**
 * A ceiling on the bill, not a suggestion — `quality.mjs`'s precedent.
 *
 * Four candidates at twelve cases and two arms. A night that proposes more
 * than the budget can measure refuses the remainder rather than merging them:
 * an unmeasured rule is the exact thing this block exists to stop, so running
 * out of budget must fail closed and not fall back to the old behaviour.
 */
const FITNESS_MAX_CALLS = 96;

const ground = groundNow();
const examples = sampleCases(
  fs
    .readFileSync(path.join(ROOT, "src/lib/vent/holisticExamples.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l)),
);

/*
  Built in a loop rather than a `.map`, because each case's `recentTactics`
  reads the tactics the previous ones chose — and `.map` hands the callback the
  *source* array, so a self-referencing map reads the raw JSON rows and quietly
  gets nothing.

  It is not tidiness. With `recentTactics` empty the three-turn block never
  fires, one high-weighted entry wins repeatedly, and twelve cases came back
  carrying **two** distinct tactics out of forty-five — the same shape as
  pinning `mood: 3` and reporting `behavioral_activation` at forty per cent.
  Both arms share the tactic either way, so this does not change what a delta
  means; it changes how much of the library the rule is measured against.
*/
const corpus = [];
for (const [i, ex] of examples.entries()) {
  const classification = classify(ex.input);
  const ctx = {
    ...classification,
    message: ex.input,
    pressure: null,
    duality: null,
    mood: null,
    ventCount: i,
    recentTactics: corpus.slice(-3).map((r) => r.tactic.id),
  };
  corpus.push({
    // The language is asked for, never typed. Four detectors have disagreed
    // about this question in this repository and every one cost a false
    // finding; `classify` is the one that decided every production row.
    case: {
      id: `fit-${i}`,
      message: ex.input,
      intent: "vent",
      language: classification.language === "pidgin" ? "pidgin" : "en",
      probes: "",
    },
    said: ex.input,
    tactic: selectTactic(ctx),
    classification,
    ctx,
  });
}

let fitnessCalls = 0;
async function replyTo(row, learned) {
  const system = buildSystemPrompt({
    grounding: ground,
    classification: row.classification,
    tactic: row.tactic,
    ctx: row.ctx,
    memory: [],
    message: row.ctx.message,
    learned,
  });
  fitnessCalls++;
  const r = await client.messages.create({
    model: MODEL.anthropic,
    max_tokens: MAX_TOKENS,
    thinking: { type: "disabled" },
    system,
    messages: [{ role: "user", content: row.ctx.message }],
  });
  return r.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

console.log(`\nfitness    ${corpus.length} held-out cases, two arms, budget ${FITNESS_MAX_CALLS} calls`);

const kept = [];
for (const candidate of accepted) {
  if (fitnessCalls + corpus.length * 2 > FITNESS_MAX_CALLS) {
    console.log(`  REFUSE  ${candidate.id} — no call budget left to measure it`);
    continue;
  }
  const pairs = [];
  for (const row of corpus) {
    try {
      // Both arms inside one try: half a pair is not a pair, and keeping the
      // survivor would compare a reply against nothing.
      const without = await replyTo(row, []);
      const withIt = await replyTo(row, [candidate]);
      pairs.push({ case: row.case, said: row.said, without, with: withIt });
    } catch (e) {
      // A kind, never a message — an SDK throw carries the provider's
      // response body on `.message`, and this prints to a public log.
      console.log(`  (dropped a pair: ${e?.status ?? e?.name ?? "error"})`);
    }
  }
  const fitness = fitnessOf(pairs);
  const moved = Object.entries(fitness.delta)
    .sort((a, b) => a[1] - b[1])
    .map(([g, d]) => `${g} ${d > 0 ? "+" : ""}${d}`)
    .join(" · ");
  if (isImprovement(fitness)) {
    kept.push({ ...candidate, fitness });
    console.log(`  KEEP    ${candidate.id} — ${fitness.cases} cases · ${moved}`);
  } else {
    console.log(`  REFUSE  ${candidate.id} — ${fitness.cases} cases · ${moved || "nothing moved"}`);
  }
}
console.log(`fitness calls ${fitnessCalls} (budget ${FITNESS_MAX_CALLS})`);

if (kept.length === 0) {
  console.log("\nnothing measured better than the prompt without it — nothing merged.\n");
  process.exit(0);
}

// ── the merge, which is a diff somebody can revert ──────────────────────────
const merged = prune([...kept, ...LEARNED_RULES]);
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
  `\nmerged ${kept.length} measured into learned.ts (${merged.length}/${MAX_LEARNED} kept).` +
    "\nrun `npm run gate` — it decides, not this script.\n",
);
