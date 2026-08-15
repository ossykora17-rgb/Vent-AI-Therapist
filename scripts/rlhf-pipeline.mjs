/**
 * Stage 4b — the preference pipeline. SFT gives it the format; this is where
 * it learns which of two acceptable answers a person actually wanted.
 *
 *   node scripts/rlhf-pipeline.mjs            # weekly, over the local store
 *
 * A rating on its own is a number in a table. It becomes a preference when
 * it is put back next to the reply it was given for, and next to a different
 * reply the same kind of person rated worse. That join is this file's whole
 * job: `.data/rlhf.jsonl` + the vents that were on screen → `data/dpo.jsonl`.
 *
 * What it will not do is invent a pair. Where only one side exists the record
 * is emitted as unpaired and counted as unpaired — a fabricated rejection
 * teaches a model something nobody said.
 *
 * Zero dependencies. Zero model calls. Runs in milliseconds.
 */
import fs from "node:fs";
import path from "node:path";
import { app, ROOT } from "./app-imports.mjs";

const { REAL_WORLD_TACTIC } = await app("src/lib/vent/tactics.ts");
const { keeperIntention } = await app("src/lib/circles/rules.ts");

const DATA_DIR = path.resolve(ROOT, process.env.VENT_DATA_DIR || ".data");
const OUT_DIR = path.resolve(ROOT, process.env.VENT_OUT_DIR || "data");

/** Below this, a tactic is not winning. It is the whole point of the file. */
const LOSING = 4.0;
/** One rating is an opinion; two is the beginning of a signal. */
const MIN_SAMPLES = 2;

const PLACEHOLDER = /running without my model key|network dipped on my side/i;

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "vent.json"), "utf8"));
  } catch {
    console.error(`No store at ${DATA_DIR}/vent.json.`);
    process.exit(2);
  }
}

/** The log, plus the feedback table for anything rated before the log existed. */
function readSignals(db) {
  const out = [];
  try {
    for (const line of fs.readFileSync(path.join(DATA_DIR, "rlhf.jsonl"), "utf8").split("\n")) {
      if (line.trim()) out.push(JSON.parse(line));
    }
  } catch {
    /* No log yet — the table below still has ratings. */
  }

  const seen = new Set(out.map((s) => `${s.anon_id}|${s.created_at}|${s.rating}`));
  for (const f of db.feedback ?? []) {
    const key = `${f.anon_id}|${f.created_at}|${f.rating}`;
    if (seen.has(key)) continue;
    out.push({
      kind: "vent_rating", anon_id: f.anon_id, rating: f.rating,
      note: f.message, created_at: f.created_at,
    });
  }

  return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * A rating arrives with no pointer to what was rated, because asking someone
 * to tag their own feedback is asking them to do our work. What they rated is
 * the last real reply they saw — so pair it with that, and refuse to guess
 * when there isn't one.
 */
function joinRatings(db, signals) {
  const userOf = new Map((db.users ?? []).map((u) => [u.anon_id, u.id]));
  const byUser = new Map();
  for (const v of db.vents ?? []) {
    if (v.intent_type !== "vent" || !v.ai_reply || PLACEHOLDER.test(v.ai_reply)) continue;
    if (!byUser.has(v.user_id)) byUser.set(v.user_id, []);
    byUser.get(v.user_id).push(v);
  }
  for (const rows of byUser.values()) rows.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const joined = [];
  let orphaned = 0;

  for (const s of signals) {
    if (s.kind !== "vent_rating") continue;
    const rows = byUser.get(userOf.get(s.anon_id)) ?? [];
    const target = [...rows].reverse().find((v) => v.created_at <= s.created_at);
    if (!target) { orphaned++; continue; }
    joined.push({
      rating: s.rating,
      note: s.note ?? null,
      prompt: target.user_message,
      reply: target.ai_reply,
      tactic: target.tactic_used,
      domain: target.real_world_tag ?? "none",
      anon: s.anon_id,
      at: s.created_at,
    });
  }

  return { joined, orphaned };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function aggregate(joined, key) {
  const groups = new Map();
  for (const j of joined) {
    const k = j[key] ?? "none";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(j);
  }
  return [...groups.entries()]
    .map(([name, rows]) => ({
      name,
      n: rows.length,
      mean: mean(rows.map((r) => r.rating)),
      rows,
    }))
    .sort((a, b) => b.mean - a.mean || b.n - a.n);
}

/**
 * DPO pairs, built inside a domain: the same pressure, two replies, one of
 * them preferred. Comparing across domains would teach it that money advice
 * beats family advice, which is not a preference — it is a topic.
 */
function pairs(joined) {
  const out = [];
  for (const group of aggregate(joined, "domain")) {
    const chosen = group.rows.filter((r) => r.rating >= LOSING).sort((a, b) => b.rating - a.rating);
    const rejected = group.rows.filter((r) => r.rating < LOSING).sort((a, b) => a.rating - b.rating);
    const depth = Math.min(chosen.length, rejected.length);
    for (let i = 0; i < depth; i++) {
      out.push({
        domain: group.name,
        prompt: chosen[i].prompt,
        chosen: chosen[i].reply,
        rejected: rejected[i].reply,
        chosen_tactic: chosen[i].tactic,
        rejected_tactic: rejected[i].tactic,
        margin: chosen[i].rating - rejected[i].rating,
        note: rejected[i].note ?? chosen[i].note ?? null,
      });
    }
  }
  return out;
}

/**
 * The Keeper is judged on one number: did the room come down. Not on how the
 * person feels in absolute terms — somebody can leave a family circle at 7/10
 * and that is a good night's work if they arrived at 78 points of pressure.
 * The drop is the signal, so the drop is what gets scored.
 *
 * A circle whose people leave no lighter than they arrived is a negative
 * sample against that tag's opening line — the same line the tactic library
 * hands the room, so a losing verdict points at something fixable.
 */
const FULL_DROP = 40;
const dropScore = (drop) => 1 + Math.min(1, Math.max(0, drop) / FULL_DROP) * 4;

function keeperVerdicts(signals) {
  const byTag = new Map();
  for (const s of signals) {
    if (s.kind !== "circle_close") continue;
    const tag = s.tag ?? "none";
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(s);
  }

  return [...byTag.entries()].map(([tag, rows]) => {
    const drops = rows.map((r) => r.drop_points ?? 0);
    // Scored on the same 1–5 scale as a vent rating, so one threshold means
    // one thing everywhere: forty points off is a five, nothing off is a one.
    const score = mean(drops.map(dropScore));
    return {
      tag,
      n: rows.length,
      drop: mean(drops),
      score,
      losing: rows.length >= MIN_SAMPLES && score < LOSING,
      line: keeperIntention(tag === "none" ? null : tag),
      carried: rows.map((r) => r.word_carried).filter(Boolean),
      dropped: rows.map((r) => r.word_dropped).filter(Boolean),
    };
  }).sort((a, b) => b.drop - a.drop);
}

/**
 * The outcome signal — what happened to them, not what they said about it.
 *
 * Everything above this line trains on a rating. A rating is an opinion about
 * a reply, collected seconds after it, from somebody who is being polite to a
 * machine. It is real signal and it stays. But this file already knows a
 * better one and says so forty lines up, about circles: "the Keeper is judged
 * on one number: did the room come down."
 *
 * That principle could never reach a vent, because until the anchor route
 * existed no vent could carry an outcome — every insert wrote
 * `tension_after: null`. Now one can. So the rule the circles half has always
 * followed now applies to the surface that finally has the data.
 *
 * Three decisions this makes, each of which could reasonably have gone the
 * other way, so each is written down rather than left in the arithmetic.
 *
 * ── Relief, not points ────────────────────────────────────────────────────
 * A drop of 50 from 90 and a drop of 50 from 55 are not the same event. The
 * first left them at 40, the second at 5. Scoring absolute points rewards
 * replies that happen to catch people on their worst days, which is a
 * property of the arrival, not the reply. So the score is the fraction of
 * what they walked in carrying that they put down.
 *
 * ── Their own baseline before the cohort's ────────────────────────────────
 * A self-report scale is not a ruler; it is a habit. Somebody who never rates
 * above 6 is not lukewarm — 6 may be the top of their range, and "I dey
 * manage" is a full sentence. Scoring that person against a cohort mean reads
 * their restraint as failure and would teach the model to chase the loudest
 * reporters. So once a person has enough sittings to have a baseline, they
 * are scored against themselves.
 *
 * Three, because two points make a line through anything. Below that there is
 * no baseline and the honest fallback is the cohort — stated, not hidden.
 *
 * ── A separate file ───────────────────────────────────────────────────────
 * These pairs do not go in `dpo.jsonl`. An outcome and an opinion are
 * different evidence and a trainer is entitled to weight them differently;
 * blending them silently would make that impossible and would quietly let
 * ratings outnumber outcomes forever, since ratings are cheap and outcomes
 * are earned.
 */
const MIN_BASELINE = 3;
/** Two sittings a hair apart are not a preference. Ten points of relief is. */
const MIN_RELIEF_MARGIN = 0.1;

/**
 * Every sitting that carries both readings, scored.
 *
 * Same exclusions as the ratings join, for the same reasons: a vent only, a
 * real reply only. `intent_type !== "vent"` is what keeps a crisis exchange
 * out of the training set — that conversation hands somebody a phone number
 * and must never become a preference about phrasing.
 */
function anchoredSittings(db) {
  const rows = [];
  for (const v of db.vents ?? []) {
    if (v.intent_type !== "vent" || !v.ai_reply || PLACEHOLDER.test(v.ai_reply)) continue;
    if (v.tension_before == null || v.tension_after == null) continue;
    // Nothing to put down means nothing to measure. Not a failure — an
    // absence, and an absence is not a zero.
    if (v.tension_before <= 0) continue;
    rows.push({
      user: v.user_id,
      prompt: v.user_message,
      reply: v.ai_reply,
      tactic: v.tactic_used,
      domain: v.real_world_tag ?? "none",
      before: v.tension_before,
      after: v.tension_after,
      drop: v.tension_before - v.tension_after,
      relief: (v.tension_before - v.tension_after) / v.tension_before,
      at: v.created_at,
    });
  }

  // Their own baseline where there is one, the cohort's where there is not.
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user)) byUser.set(r.user, []);
    byUser.get(r.user).push(r);
  }
  const cohort = mean(rows.map((r) => r.relief));
  for (const r of rows) {
    const own = byUser.get(r.user);
    r.baseline = own.length >= MIN_BASELINE ? mean(own.map((x) => x.relief)) : cohort;
    r.scaled = r.relief - r.baseline;
    r.against = own.length >= MIN_BASELINE ? "self" : "cohort";
  }
  return rows;
}

/**
 * Pairs, inside a domain, on the outcome.
 *
 * Domain-scoped for the reason the ratings pairs already are: comparing a
 * money sitting to a family sitting teaches the model that one subject beats
 * another, which is a topic and not a preference.
 *
 * A pair is only emitted when the two sittings are far enough apart to mean
 * something. Where they are not, nothing is written — the same refusal the
 * rest of this file makes about inventing a rejection.
 */
function outcomePairs(sittings) {
  const out = [];
  const groups = new Map();
  for (const s of sittings) {
    if (!groups.has(s.domain)) groups.set(s.domain, []);
    groups.get(s.domain).push(s);
  }

  for (const [domain, rows] of groups) {
    if (rows.length < MIN_SAMPLES * 2) continue;
    const ranked = [...rows].sort((a, b) => b.scaled - a.scaled);
    const half = Math.floor(ranked.length / 2);
    const top = ranked.slice(0, half);
    const bottom = ranked.slice(-half).reverse();

    for (let i = 0; i < half; i++) {
      const margin = top[i].scaled - bottom[i].scaled;
      if (margin < MIN_RELIEF_MARGIN) continue;
      out.push({
        domain,
        prompt: top[i].prompt,
        chosen: top[i].reply,
        rejected: bottom[i].reply,
        chosen_tactic: top[i].tactic,
        rejected_tactic: bottom[i].tactic,
        chosen_relief: Number(top[i].relief.toFixed(3)),
        rejected_relief: Number(bottom[i].relief.toFixed(3)),
        chosen_drop: `${top[i].before}→${top[i].after}`,
        rejected_drop: `${bottom[i].before}→${bottom[i].after}`,
        margin: Number(margin.toFixed(3)),
        scored_against: top[i].against,
      });
    }
  }
  return out.sort((a, b) => b.margin - a.margin);
}

function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  fs.renameSync(tmp, file);
}

// ── run ────────────────────────────────────────────────────────────────────
const db = readStore();
const signals = readSignals(db);
const { joined, orphaned } = joinRatings(db, signals);
const byTactic = aggregate(joined, "tactic");
const byDomain = aggregate(joined, "domain");
const dpo = pairs(joined);
const keeper = keeperVerdicts(signals);
const sittings = anchoredSittings(db);
const outcome = outcomePairs(sittings);

const unpaired = joined.length - dpo.length * 2;
const losingTactics = byTactic.filter((t) => t.n >= MIN_SAMPLES && t.mean < LOSING);

writeJsonl(path.join(OUT_DIR, "dpo.jsonl"), [
  ...dpo.map((p) => ({ kind: "pair", ...p })),
  ...losingTactics.flatMap((t) =>
    t.rows.map((r) => ({
      kind: "negative", reason: `tactic mean ${t.mean.toFixed(2)} < ${LOSING.toFixed(1)}`,
      domain: r.domain, prompt: r.prompt, rejected: r.reply, tactic: r.tactic, rating: r.rating,
    })),
  ),
  ...keeper.filter((k) => k.losing).map((k) => ({
    kind: "negative", reason: `keeper mean ${k.score.toFixed(2)} < ${LOSING.toFixed(1)}`,
    domain: k.tag, prompt: `[CIRCLE:${k.tag}]`, rejected: k.line, tactic: REAL_WORLD_TACTIC[k.tag]?.id ?? null,
  })),
]);

writeJsonl(path.join(OUT_DIR, "dpo-outcome.jsonl"),
  outcome.map((p) => ({ kind: "outcome_pair", ...p })));

const bar = (x, max = 5) => "█".repeat(Math.round((x / max) * 12)).padEnd(12, "·");

console.log(`\nMIND WEAVE — preference pipeline\n${"─".repeat(66)}`);
console.log(`signals       ${signals.length} (${signals.filter((s) => s.kind === "circle_close").length} from circles)`);
console.log(`joined        ${joined.length} ratings sat next to the reply they were for` +
  (orphaned ? `, ${orphaned} had no reply to join to` : ""));

console.log(`\nby tactic     mean   n`);
for (const t of byTactic) {
  console.log(`  ${String(t.name).padEnd(20)} ${t.mean.toFixed(2)}  ${String(t.n).padStart(2)}  ` +
    `${bar(t.mean)}${t.n >= MIN_SAMPLES && t.mean < LOSING ? "  ← losing" : ""}`);
}

console.log(`\nby domain     mean   n`);
for (const d of byDomain) {
  console.log(`  ${String(d.name).padEnd(20)} ${d.mean.toFixed(2)}  ${String(d.n).padStart(2)}  ${bar(d.mean)}`);
}

if (keeper.length) {
  console.log(`\nkeeper        drop   score  n`);
  for (const k of keeper) {
    console.log(`  ${k.tag.padEnd(20)} ${k.drop.toFixed(1).padStart(4)}   ${k.score.toFixed(2)}   ` +
      `${String(k.n).padStart(2)}${k.losing ? "  ← losing, negative sample written" : ""}`);
  }
  const carried = keeper.flatMap((k) => k.carried);
  const dropped = keeper.flatMap((k) => k.dropped);
  if (carried.length) console.log(`  carried out:  ${carried.join(", ")}`);
  if (dropped.length) console.log(`  left behind:  ${dropped.join(", ")}`);
}

console.log(`\npairs         ${dpo.length} chosen/rejected inside a domain`);
for (const p of dpo) {
  console.log(`  ${p.domain.padEnd(10)} +${p.margin}  ${p.chosen_tactic} over ${p.rejected_tactic}` +
    (p.note ? `\n             "${p.note}"` : ""));
}
console.log(`unpaired      ${Math.max(0, unpaired)} ratings with nothing to compare against — kept as-is, never invented`);

/*
  The outcome half. Reported separately from the ratings above on purpose —
  they are different evidence, and a run where the two disagree is the most
  interesting thing this file can show a person.
*/
console.log(`\nanchored      ${sittings.length} sittings carry both readings` +
  (sittings.length
    ? `, mean relief ${(mean(sittings.map((s) => s.relief)) * 100).toFixed(0)}% ` +
      `(${sittings.filter((s) => s.against === "self").length} scored against their own baseline)`
    : " — nothing to learn from yet, and nothing invented"));

if (outcome.length) {
  console.log(`\noutcome pairs ${outcome.length} — what happened to them, not what they said`);
  for (const p of outcome) {
    console.log(`  ${p.domain.padEnd(10)} +${(p.margin * 100).toFixed(0)}%  ` +
      `${p.chosen_tactic} (${p.chosen_drop}) over ${p.rejected_tactic} (${p.rejected_drop})` +
      `  vs ${p.scored_against}`);
  }
} else if (sittings.length) {
  console.log(`outcome pairs 0 — too few sittings in any one domain, or too close to call`);
}

const outLabel = OUT_DIR.startsWith(ROOT) ? path.relative(ROOT, OUT_DIR) : OUT_DIR;
console.log(`\nwrote         ${outLabel}/dpo.jsonl`);
console.log(`              ${outLabel}/dpo-outcome.jsonl`);
console.log(`${"─".repeat(66)}\n`);

if (losingTactics.length === 0 && !keeper.some((k) => k.losing)) {
  console.log("Nothing is losing this week. Either it is working, or nobody rated it.\n");
}
