/**
 * The heartbeat. One automation, one state file, one objective gate.
 *
 *   node scripts/heartbeat-data.mjs          # find work, or sleep
 *   node scripts/heartbeat-data.mjs --gate   # find work, then run the gate
 *   node scripts/heartbeat-data.mjs --commit # gate passed: record it
 *
 * A loop is worth building when the work repeats, the verification is
 * objective, and waking up for nothing is cheap. This wakes up, compares the
 * store against `.data/loop-state.json`, and either hands an agent a specific
 * task or goes back to sleep having spent nothing. Sleeping is the common
 * case and it must stay free — an automation that always finds work is not an
 * automation, it is a cron job burning budget.
 *
 * What it does NOT do is call a model. It finds the work, names the skill
 * that knows how to do it, and states the gate that decides whether the
 * result may be merged. The agent is the thing in the middle, and it is
 * driven by a person or a scheduler, not by this file pretending to be one.
 *
 * Zero dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { app, ROOT } from "./app-imports.mjs";

const { classify } = await app("src/lib/vent/intent.ts");
const { checkMessage } = await app("src/lib/circles/rules.ts");

const DATA_DIR = path.resolve(ROOT, process.env.VENT_DATA_DIR || ".data");
const STATE_FILE = path.join(DATA_DIR, "loop-state.json");
const GATE = process.argv.includes("--gate");
const COMMIT = process.argv.includes("--commit");

const PLACEHOLDER = /running without my model key|network dipped on my side/i;

/**
 * The 4-condition test, applied per finding rather than per project. A thing
 * only goes to an agent when all four hold; anything else is named and left
 * for a person, which is the part most loops get wrong.
 */
const LOOPABLE = {
  advice_in_reply: {
    repeats: true, verifiable: true, bounded: true, reproducible: true,
    skill: "data-quality",
    why: "the prompt let a reply give advice — checkMessage catches it every time",
  },
  no_tactic: {
    repeats: true, verifiable: true, bounded: true, reproducible: true,
    skill: "data-quality",
    why: "a vent answered with no tactic selected — the selector should always return one",
  },
  keeper_losing: {
    repeats: true, verifiable: true, bounded: true, reproducible: true,
    skill: "circles-quality",
    why: "a tag's room is not coming down — the opening line is in the tactic library, so it is fixable",
  },
  external_stale: {
    repeats: true, verifiable: true, bounded: true, reproducible: true,
    skill: "data-quality",
    why: "a cached upstream reading has aged out — refetch, or the room says nothing at all",
  },
  tone: {
    repeats: true, verifiable: false, bounded: false, reproducible: true,
    skill: null,
    why: "warmth is taste, and a gate cannot measure it — this is the thing you read yourself",
  },
};

/** How long each external reading stays true. Mirrors `sources.ts`. */
const EXTERNAL_TTL = { economy: 60 * 60 * 1000, jobs: 86_400_000, quote: 86_400_000 };

const nowIso = () => new Date().toISOString();

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, STATE_FILE);
}

function readSignals() {
  const out = [];
  try {
    for (const line of fs.readFileSync(path.join(DATA_DIR, "rlhf.jsonl"), "utf8").split("\n")) {
      if (line.trim()) out.push(JSON.parse(line));
    }
  } catch { /* no log yet */ }
  return out;
}

// ── find the work ──────────────────────────────────────────────────────────
const db = readJson(path.join(DATA_DIR, "vent.json"), null);
if (!db) {
  console.log(`heartbeat: no store at ${path.relative(ROOT, DATA_DIR)}/vent.json — nothing to watch.`);
  process.exit(0);
}

const state = readJson(STATE_FILE, {
  last_processed: "1970-01-01T00:00:00.000Z",
  last_vent_id: null,
  counts: {},
  last_gate: null,
  dirty_vents: [],
  keeper_low_rating: [],
});

const since = state.last_processed;
const vents = db.vents ?? [];
const newVents = vents.filter((v) => v.created_at > since);
const signals = readSignals();
const newSignals = signals.filter((s) => s.created_at > since);
const newCircles = (db.circles ?? []).filter((c) => c.created_at > since);

/** Findings, not errors. Each carries what a person would need to reproduce it. */
const findings = [];

for (const v of newVents) {
  if ((v.intent_type ?? classify(v.user_message).intent) !== "vent") continue;
  if (!v.ai_reply || PLACEHOLDER.test(v.ai_reply)) continue;

  const verdict = checkMessage(v.ai_reply, "share");
  if (!verdict.ok) {
    findings.push({
      kind: "advice_in_reply", vent: v.id, tag: v.real_world_tag ?? "none",
      tactic: v.tactic_used, detail: verdict.reason, at: v.created_at,
    });
  }
  if (!v.tactic_used) {
    findings.push({
      kind: "no_tactic", vent: v.id, tag: v.real_world_tag ?? "none",
      detail: "a vent reached a model with no tactic selected", at: v.created_at,
    });
  }
}

/** Keeper verdicts, from the same drop the Closing shows a person. */
const FULL_DROP = 40;
const closes = signals.filter((s) => s.kind === "circle_close");
const byTag = new Map();
for (const c of closes) {
  const tag = c.tag ?? "none";
  if (!byTag.has(tag)) byTag.set(tag, []);
  byTag.get(tag).push(c.drop_points ?? 0);
}
for (const [tag, drops] of byTag) {
  if (drops.length < 2) continue;
  const score = drops.reduce((a, d) => a + 1 + Math.min(1, Math.max(0, d) / FULL_DROP) * 4, 0) / drops.length;
  if (score < 4) {
    findings.push({
      kind: "keeper_losing", tag, detail: `mean drop ${(drops.reduce((a, b) => a + b, 0) / drops.length).toFixed(1)} points over ${drops.length} circles (score ${score.toFixed(2)})`,
      at: nowIso(),
    });
  }
}

/**
 * The outside world, and whether what we hold of it is still true. Nothing is
 * ever served past its TTL, so a stale entry is not a wrong number on a
 * screen — it is a sentence the room is about to stop saying.
 */
const external = readJson(path.join(DATA_DIR, "external.json"), {});
for (const [key, entry] of Object.entries(external)) {
  const ttl = EXTERNAL_TTL[key];
  if (!ttl) continue;
  const age = Date.now() - new Date(entry.fetched_at).getTime();
  if (age >= ttl) {
    findings.push({
      kind: "external_stale", tag: key,
      detail: `${key} from ${entry.source} is ${Math.round(age / 60000)} min old (ttl ${Math.round(ttl / 60000)} min)`,
      at: nowIso(),
    });
  }
}

// ── decide ─────────────────────────────────────────────────────────────────
const bar = "─".repeat(66);
console.log(`\nMIND WEAVE — heartbeat  ${nowIso()}\n${bar}`);
console.log(`since         ${since}`);
console.log(`new           ${newVents.length} vents · ${newCircles.length} circles · ${newSignals.length} signals`);

if (findings.length === 0 && newVents.length === 0 && newSignals.length === 0) {
  console.log(`\nNothing to do. Sleeping — this cost one file read and no tokens.`);
  console.log(`${bar}\n`);
  writeState({ ...state, last_checked: nowIso() });
  process.exit(0);
}

const actionable = findings.filter((f) => {
  const t = LOOPABLE[f.kind];
  return t && t.verifiable && t.bounded && t.skill;
});
const forHumans = findings.filter((f) => !actionable.includes(f));

console.log(`findings      ${findings.length} (${actionable.length} for an agent, ${forHumans.length} for a person)`);

if (findings.length) console.log("");
for (const f of findings) {
  const t = LOOPABLE[f.kind] ?? {};
  const route = t.skill ? `→ skill: ${t.skill}` : "→ a person reads this one";
  console.log(`  [${f.kind}] ${f.tag ?? ""} ${route}`);
  console.log(`      ${f.detail}`);
  console.log(`      ${t.why ?? ""}`);
}

if (actionable.length) {
  const skills = [...new Set(actionable.map((f) => LOOPABLE[f.kind].skill))];
  console.log(`\nhand off      worktree, so a failed attempt never touches the branch you ship from`);
  console.log(`  git worktree add -b loop/${skills[0]} ../mindweave-${skills[0]}-loop`);
  console.log(`  # the gate has zero dependencies, so the worktree needs no npm install`);
  console.log(`  read .claude/skills/${skills[0]}/SKILL.md — it is the context, not a prompt`);
}

console.log(`\ngate          node scripts/heartbeat-data.mjs --gate`);

// ── the objective gate ─────────────────────────────────────────────────────
let gate = null;

if (GATE) {
  const run = (label, cmd, args) => {
    try {
      const out = execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { label, passed: true, out };
    } catch (error) {
      return { label, passed: false, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  };

  console.log(`\n${bar}\nobjective gate`);
  const steps = [
    run("selector", process.execPath, ["--experimental-strip-types", "scripts/tactics.test.mts"]),
    run("eval", process.execPath, ["scripts/eval.mjs"]),
    run("pipeline", process.execPath, ["scripts/data-pipeline.mjs"]),
  ];

  // Live checks only when something is actually serving. A gate that fails
  // because nobody started a server is a gate people learn to ignore.
  let live = null;
  try {
    const r = await fetch("http://localhost:3001/api/health", { signal: AbortSignal.timeout(1500) });
    if (r.ok) live = run("live-verify", process.execPath, ["scripts/live-verify.mjs", "http://localhost:3001"]);
  } catch { /* nothing serving; say so rather than failing */ }
  if (live) steps.push(live);

  const summarise = (s) => {
    const m = /(\d+)\s*(?:passed|\/\d+ PASS)/.exec(s.out) ?? /(\d+ passed, \d+ failed)/.exec(s.out);
    const line = (s.out.split("\n").reverse().find((l) => /PASS|passed|kept/.test(l)) ?? "")
      .replace(/\s+/g, " ").trim();
    return line.slice(0, 62) || (m?.[0] ?? "");
  };

  for (const s of steps) {
    console.log(`  ${s.passed ? "PASS" : "FAIL"}  ${s.label.padEnd(12)} ${summarise(s)}`);
    if (!s.passed) console.log(s.out.split("\n").slice(-12).map((l) => `        ${l}`).join("\n"));
  }
  if (!live) console.log(`  SKIP  live-verify   nothing serving on :3001`);

  gate = {
    at: nowIso(),
    passed: steps.every((s) => s.passed),
    steps: Object.fromEntries(steps.map((s) => [s.label, s.passed ? summarise(s) : "FAIL"])),
    live: Boolean(live),
  };

  console.log(`\n  gate ${gate.passed ? "PASSES — the diff may be merged" : "FAILS — do not merge; read the diff above"}`);
}

// ── record ─────────────────────────────────────────────────────────────────
// The state only advances when the gate says it may. A loop that marks work
// done on a failing gate is a loop that quietly stops finding it.
const advance = COMMIT || (gate?.passed ?? false);

writeState({
  last_processed: advance ? nowIso() : state.last_processed,
  last_checked: nowIso(),
  last_vent_id: vents.at(-1)?.id ?? state.last_vent_id,
  counts: {
    vents: vents.length,
    circles: (db.circles ?? []).length,
    feedback: (db.feedback ?? []).length,
    signals: signals.length,
  },
  last_gate: gate ?? state.last_gate,
  dirty_vents: findings.filter((f) => f.vent).map((f) => ({ id: f.vent, kind: f.kind })),
  keeper_low_rating: findings.filter((f) => f.kind === "keeper_losing").map((f) => f.tag),
});

console.log(`\nstate         ${path.relative(ROOT, STATE_FILE)}` +
  ` — ${advance ? "advanced" : "held (gate not passed)"}`);
console.log(`${bar}\n`);

process.exit(gate && !gate.passed ? 1 : 0);
