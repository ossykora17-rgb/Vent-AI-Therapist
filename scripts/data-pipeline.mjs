/**
 * Stage 1 — the data pipeline.
 *
 *   node scripts/data-pipeline.mjs
 *
 * Common Crawl is not a dataset, it is a landfill; what makes a model is the
 * filtering. Same here. This walks the local store the way a pretraining
 * pipeline walks a crawl — extract, dedup, filter for quality, reweight the
 * domains — and writes `data/sft.jsonl` and `data/eval.jsonl`.
 *
 * Two rules it will not break:
 *
 *   1. **Circle transcripts are never training data.** Confidentiality is a
 *      deletion policy; a training set is the opposite of deletion. Circles
 *      are counted here and never quoted.
 *   2. **A fallback is not a completion.** "I'm running without my model key"
 *      is the app apologising, not the product speaking. Trained on, it would
 *      teach the model to apologise.
 *
 * Zero dependencies: node:fs, node:path, node:crypto, and the app's own
 * library — never a second copy of the classifier.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { app, ROOT } from "./app-imports.mjs";

const { classify } = await app("src/lib/vent/intent.ts");
const { buildFlavour } = await app("src/lib/flavour/profile.ts");
const { CONFIDENCE_FLOOR } = await app("src/lib/flavour/types.ts");
const { gradeReply } = await app("src/lib/vent/quality.ts");
const { endsMidSentence, modelFailureReply, MODEL_STATUSES } = await app("src/lib/vent/model.ts");

const DATA_DIR = path.resolve(ROOT, process.env.VENT_DATA_DIR || ".data");
const OUT_DIR = path.resolve(ROOT, process.env.VENT_OUT_DIR || "data");
const MEMORY_TURNS = 6; // Matches the vent route's window exactly.

/**
 * The mix we want to train on, not the mix we happen to have. Lagos money
 * pressure is the load-bearing domain, so it is weighted like one — the same
 * move as upweighting Wikipedia over scraped forum spam.
 */
const TARGET_MIX = {
  economy: 0.40,
  japa: 0.30,
  family: 0.20,
  ai_job: 0.025,
  social: 0.025,
  lonely: 0.0125,
  traffic: 0.0125,
  climate: 0.0125,
  health: 0.0125,
  none: 0.0,
};

const sha1 = (s) => createHash("sha1").update(s).digest("hex");
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => new Set(norm(s).split(" ").filter(Boolean));

/** Jaccard over token sets — near-dup without a dependency or a model. */
function jaccard(a, b) {
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / (a.size + b.size - hit || 1);
}

function readDb() {
  const file = path.join(DATA_DIR, "vent.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    console.error(`No store at ${file}. Run \`npm run local\` and use the app first.`);
    process.exit(2);
  }
}

/** Write-then-rename: a half-written training file is worse than none. */
function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  fs.renameSync(tmp, file);
}

// ── extraction ─────────────────────────────────────────────────────────────
/**
 * The chair, the body, the pressure and the tag go in as tokens rather than
 * as prose. The model gets the reasoning as structure — the same reason a
 * tokenizer beats raw bytes — and the prose stays the person's own words.
 */
function extract(db) {
  const byUser = new Map();
  for (const v of db.vents ?? []) {
    if (!byUser.has(v.user_id)) byUser.set(v.user_id, []);
    byUser.get(v.user_id).push(v);
  }

  const out = [];
  for (const [userId, rows] of byUser) {
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));

    /** Prior *vents* only — the same filter the route applies to memory. */
    const priorVents = [];

    for (const v of rows) {
      const c = classify(v.user_message);
      const memory = priorVents.slice(-MEMORY_TURNS);
      const flavour = buildFlavour([...memory.map((m) => m.user_message), v.user_message]);

      const named =
        flavour.occupation.value !== "unknown" &&
        flavour.occupation.confidence >= CONFIDENCE_FLOOR;

      const tokensIn = [
        v.chair_picked && `[CHAIR:${v.chair_picked}]`,
        (v.body_tapped ?? c.body) && `[BODY:${v.body_tapped ?? c.body}]`,
        v.pressure_value != null && `[PRESSURE:${Math.round(v.pressure_value)}]`,
        v.duality_value != null && `[DUALITY:${Math.round(v.duality_value)}]`,
        v.real_world_tag && `[TAG:${v.real_world_tag}]`,
        `[LANG:${v.language ?? c.language}]`,
        // Silence beats a guess. Below the floor the engine keeps listening,
        // so the record keeps listening too rather than shipping "The Unnamed
        // Air" into a training set as if it were an observation.
        named &&
          `[FLAVOUR:${flavour.temperament.value}×${flavour.occupation.value}×${flavour.hobby.value}]`,
        `[MEM:${memory.length}]`,
      ].filter(Boolean);

      out.push({
        id: v.id,
        user: userId,
        prompt: `${tokensIn.join(" ")}\n${v.user_message}`,
        completion: v.ai_reply ?? "",
        tactic: v.tactic_used,
        intent: v.intent_type ?? c.intent,
        domain: v.real_world_tag ?? "none",
        flavour_named: Boolean(named),
        memory_used: memory.length,
        created_at: v.created_at,
        raw: v.user_message,
        language: v.language === "pidgin" ? "pidgin" : "en",
        /*
          Everything this person has actually written, so the graders that
          need evidence get it.

          `invented` and `diagnosis` both skip themselves without it — and a
          grader that skips itself in the one place a bad reply becomes
          permanent is the worst place for it to be silent. Same construction
          the live route uses: their whole side of the conversation, not just
          this turn.
        */
        said: [...memory.map((m) => m.user_message), v.user_message].join("\n"),
      });

      if ((v.intent_type ?? c.intent) === "vent") priorVents.push(v);
    }
  }
  return out;
}

// ── quality heuristics ─────────────────────────────────────────────────────
/*
  Every sentence the product says when the model did not answer.

  This was `/running without my model key|network dipped on my side/i` — two
  phrases, hand-typed, against a `modelFailureReply` that produces seven. It
  caught the network one and missed the one that actually happens: "Too many
  at once on my side", the upstream 429, which is stored seven times in
  production with a real tactic and `intent_type: vent` and would have been
  trained on as if a person had been answered.

  Derived now, by asking the function what it can say for every status it
  knows. Exact match rather than a regex, because these are authored constants
  and the route stores them verbatim — a substring rule over somebody's real
  words is how a filter starts eating replies it should keep.
*/
const FAILURE_REPLIES = new Set(MODEL_STATUSES.map((s) => modelFailureReply(s)));

/** The no-key fallback is built from the person's own turn, so it stays a phrase. */
const PLACEHOLDER = /running without my model key/i;

/*
  THE GRADERS RUN HERE TOO, AND THIS IS WHERE THEY MATTER MOST

  This filter list had six entries and none of them was `gradeReply` — the
  product's own fifteen-grader reply module, which is deterministic, free, and
  already imported by the failsafe, the eval suite and the nightly audit.
  Every surface that reads a reply asked it except the one that turns replies
  into training targets.

  A bad reply reaches one person on one night. A bad *training example*
  teaches the model to produce that reply for everybody, permanently, and the
  fix cannot be a prompt change afterwards. Of 178 real replies: 16 end
  mid-sentence, 5 name a condition the person never used, 9 are in the wrong
  language, 42 break the sentence cap. Every one of them was eligible for the
  training set.

  `gives_advice` used to be `checkMessage(completion, "share")` — the
  *circles* governance rule applied to private-session replies. `quality.ts`
  records making exactly this mistake and undoing it: "it used to import the
  circles cross-talk rule too, and 'that one no be your fault' — correct in a
  private session, blaming in a room of six — was being graded by a rule from
  the wrong room." The lesson reached `quality.ts` and not the pipeline, which
  is this repository's most-recorded shape. `gradeReply` covers advice
  properly, through the same `containsAdvice`, without the crosstalk rules and
  the one-line share cap that belong to a room of six.

  Fatal and major drop; minor does not. That is what the severities already
  mean — fatal blocks a release, major is a regression, minor is drift — and
  `length` is the only minor here. A four-sentence reply is worth keeping and
  worth counting.
*/

/**
 * Each returns a reason to drop, `true` to drop under its own name, or a
 * falsy value to keep. Order is cheapest-first, and the graders come last
 * because they are the only entry that does real work.
 */
const FILTERS = [
  ["not_a_vent", (r) => r.intent !== "vent"],
  ["too_short", (r) => norm(r.raw).length < 5],
  ["no_completion", (r) => r.completion.trim().length === 0],
  ["fallback_text", (r) => PLACEHOLDER.test(r.completion)],
  ["model_failed", (r) => FAILURE_REPLIES.has(r.completion.trim())],
  ["no_tactic", (r) => !r.tactic],
  /*
    A fragment is never a training target, whatever cut it off.

    The stored row has no provider left to ask, so this asks the half of
    `wasCutOff` that reads the text — imported, not copied.
  */
  ["truncated", (r) => endsMidSentence(r.completion)],
  [
    "graded",
    (r) => {
      const bad = gradeReply(
        { id: r.id, message: r.raw, intent: "vent", language: r.language, probes: "pipeline" },
        r.completion,
        { tokensSpent: true, said: r.said },
      ).filter((f) => f.severity === "fatal" || f.severity === "major");
      // Named by the grader that caught it. "graded: 9" would say the filter
      // works; "diagnosis: 5 · language: 9" says what the product is doing.
      return bad.length ? bad[0].grader : false;
    },
  ],
];

function filter(records) {
  const dropped = {};
  const kept = [];
  for (const r of records) {
    let reason = null;
    for (const [name, f] of FILTERS) {
      const hit = f(r);
      if (hit) {
        reason = typeof hit === "string" ? hit : name;
        break;
      }
    }
    if (reason) dropped[reason] = (dropped[reason] ?? 0) + 1;
    else kept.push(r);
  }
  return { kept, dropped };
}

// ── dedup ──────────────────────────────────────────────────────────────────
/**
 * Exact first, then near. "It's the same thing every week" is a person naming
 * their own pattern — the most valuable sentence in the corpus — so near-dup
 * compares the *pair*, not the vent alone. Two identical vents that drew
 * different replies are two data points, not one.
 */
const NEAR = 0.92;

function dedup(records) {
  const seen = new Map();
  const kept = [];
  let exact = 0;
  let near = 0;

  for (const r of records) {
    // NUL as the field separator, written as an escape rather than pasted in
    // as itself. Same byte, same key, and a reader can see it — check 91
    // exists because an invisible character in a source file is unreviewable
    // by construction, and that argument does not stop applying just because
    // this one is deliberate.
    const key = sha1(`${norm(r.raw)}\u0000${norm(r.completion)}`);
    if (seen.has(key)) { exact++; continue; }
    seen.set(key, true);

    const sig = tokens(`${r.raw} ${r.completion}`);
    if (kept.some((k) => jaccard(sig, k.sig) >= NEAR)) { near++; continue; }

    kept.push({ ...r, sig });
  }

  return { kept: kept.map(({ sig, ...r }) => r), exact, near };
}

// ── domain reweighting ─────────────────────────────────────────────────────
/**
 * Observed share vs target share, expressed as a per-record weight rather
 * than by duplicating lines. Duplicating is how a corpus quietly memorises;
 * a weight says the same thing to a sampler and stays honest about n.
 */
function reweight(records) {
  const n = records.length || 1;
  const observed = {};
  for (const r of records) observed[r.domain] = (observed[r.domain] ?? 0) + 1;

  const table = [];
  for (const [domain, count] of Object.entries(observed)) {
    const share = count / n;
    const target = TARGET_MIX[domain] ?? 0;
    // No target means "keep it, do not amplify it" — never zero, never loud.
    const weight = target === 0 ? 0.25 : Math.min(8, Math.max(0.1, target / share));
    table.push({ domain, count, share, target, weight });
    for (const r of records) if (r.domain === domain) r.weight = Number(weight.toFixed(3));
  }
  return table.sort((a, b) => b.count - a.count);
}

// ── run ────────────────────────────────────────────────────────────────────
const db = readDb();
const raw = extract(db);
const { kept: quality, dropped } = filter(raw);
const { kept: unique, exact, near } = dedup(quality);
const mix = reweight(unique);

/** Deterministic split, so a re-run never leaks eval rows into training. */
const evalRows = [];
const sftRows = [];
for (const r of unique) {
  const bucket = parseInt(sha1(r.id).slice(0, 4), 16) % 5;
  const row = {
    prompt: r.prompt,
    completion: r.completion,
    tactic: r.tactic,
    domain: r.domain,
    weight: r.weight,
    memory_used: r.memory_used,
    flavour_named: r.flavour_named,
  };
  (bucket === 0 ? evalRows : sftRows).push(row);
}

writeJsonl(path.join(OUT_DIR, "sft.jsonl"), sftRows);
writeJsonl(path.join(OUT_DIR, "eval.jsonl"), evalRows);

const circles = db.circles?.length ?? 0;
const shares = (db.circleMessages ?? []).filter((m) => m.kind === "share").length;
const keeperLines = (db.circleMessages ?? []).filter((m) => m.kind === "keeper_prompt").length;

const pct = (x) => `${(x * 100).toFixed(1)}%`;

console.log(`\nMIND WEAVE — data pipeline\n${"─".repeat(58)}`);
console.log(`source        ${path.relative(ROOT, DATA_DIR)}/vent.json`);
console.log(`extracted     ${raw.length} rows from ${new Set(raw.map((r) => r.user)).size} people`);

/*
  Every reason that fired, not every reason that was declared.

  This printed one line per entry in FILTERS, which was complete while every
  filter dropped under its own name. The graders drop under the *grader's*
  name — `diagnosis`, `language`, `advice` — so six rows went missing from a
  tally that still added up to a number, in the report whose whole job is
  saying what the training set is made of. Found by check 10's row count,
  which is the assertion that reconciles the two.

  Declared-and-never-fired still prints, because a filter silently doing
  nothing is the thing worth seeing.
*/
console.log(`\nquality filters`);
const declared = FILTERS.map(([name]) => name);
for (const name of [...declared, ...Object.keys(dropped).filter((k) => !declared.includes(k))]) {
  console.log(`  ${String(dropped[name] ?? 0).padStart(4)}  dropped: ${name}`);
}
console.log(`  ${String(exact).padStart(4)}  dropped: exact duplicate`);
console.log(`  ${String(near).padStart(4)}  dropped: near duplicate (jaccard ≥ ${NEAR})`);
console.log(`  ${String(unique.length).padStart(4)}  kept`);

console.log(`\ndomain reweighting`);
console.log(`  domain      n   observed    target   weight`);
for (const m of mix) {
  console.log(
    `  ${m.domain.padEnd(9)} ${String(m.count).padStart(3)}   ${pct(m.share).padStart(7)}` +
      `   ${pct(m.target).padStart(7)}   ×${m.weight.toFixed(2)}`,
  );
}

console.log(`\ncircles       ${circles} rooms, ${shares} shares, ${keeperLines} keeper lines` +
  ` — counted, never quoted`);
const out = OUT_DIR.startsWith(ROOT) ? path.relative(ROOT, OUT_DIR) : OUT_DIR;
console.log(`\nwrote         ${out}/sft.jsonl  (${sftRows.length} rows)`);
console.log(`              ${out}/eval.jsonl (${evalRows.length} rows)`);
console.log(`${"─".repeat(58)}\n`);

if (unique.length === 0) {
  console.log("Nothing survived the filters. That is the pipeline working, not failing —");
  console.log("a store full of greetings and key-less fallbacks contains no training data.\n");
}
