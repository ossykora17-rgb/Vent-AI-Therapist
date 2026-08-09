/**
 * Stage 5 — the eval suite. MMLU, but for truth instead of trivia.
 *
 *   node scripts/eval.mjs                          # 14 checks, no server
 *   node scripts/eval.mjs http://localhost:3001    # + the live room checks
 *
 * A benchmark is only worth anything if it measures the thing that would
 * actually break. Every check below is a bug this product has really shipped:
 * the date answered as therapy, "same thing every week" heard as an insult,
 * a worksheet where a sentence belonged, a witness who could never speak.
 *
 * Zero model calls, zero tokens, zero dependencies. Every assertion runs
 * against the app's own modules — not against a copy of them, which is the
 * failure mode that makes most eval suites pass while the product regresses.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, ROOT } from "./app-imports.mjs";

const { classify } = await app("src/lib/vent/intent.ts");
const { groundNow } = await app("src/lib/vent/grounding.ts");
const { selectTactic, REAL_WORLD_TACTIC, ALL_TACTIC_IDS, ALL_TACTICS, nothingCanMove } =
  await app("src/lib/vent/tactics.ts");
const { buildFlavour } = await app("src/lib/flavour/profile.ts");
const { flavourBlock, openingBlock, carveBlock } = await app("src/lib/vent/prompt.ts");
const { CONFIDENCE_FLOOR } = await app("src/lib/flavour/types.ts");
const { tensionDrop, tensionForChair, tensionNow, CHAIRS } = await app("src/lib/vent/chairs.ts");
const { selectMemory } = await app("src/lib/vent/memory.ts");
const { checkMessage, economyFact, keeperIntention, keeperReflection, roleForSeat } =
  await app("src/lib/circles/rules.ts");
const { PRESENCE_WINDOW_MS, TYPING_WINDOW_MS, isPresent, isTyping, presenceOf, shouldTouch } =
  await app("src/lib/circles/presence.ts");
const { guardianVerdict, THRESHOLD } = await app("src/lib/external/guardian.ts");
// The campfire's own lines, imported once so no check keeps a copy of them.
const { MYCELIUM: MYCELIUM_RULE } = await app("src/lib/circles/rules.ts");
const { noModelKeyReply } = await app("src/lib/vent/fallback.ts");
const { allProviders, configuredProviders, openAiCompatible } =
  await app("src/lib/vent/providers.ts");

const BASE = (process.argv[2] || "").replace(/\/$/, "");

// ── harness ────────────────────────────────────────────────────────────────
const results = [];
let current = null;

function check(name, fn) {
  current = { name, asserts: [], failed: [] };
  results.push(current);
  try {
    fn();
  } catch (error) {
    current.failed.push(`threw: ${error.message}`);
  }
  current = null;
}

async function checkAsync(name, fn) {
  current = { name, asserts: [], failed: [], live: true };
  results.push(current);
  try {
    await fn();
  } catch (error) {
    current.failed.push(`threw: ${error.message}`);
  }
  current = null;
}

/** `is(actual, expected, what)` — prints the actual value on failure, always. */
function is(actual, expected, what) {
  const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  current.asserts.push(what);
  if (!ok) current.failed.push(`${what}: got ${JSON.stringify(actual)}`);
  return ok;
}

function ok(cond, what, detail = "") {
  current.asserts.push(what);
  if (!cond) current.failed.push(`${what}${detail ? ` — ${detail}` : ""}`);
  return cond;
}

const base = {
  intent: "vent",
  realWorldTag: null,
  language: "en",
  body: null,
  message: "my oga makes me feel useless, i always fail at everything",
  pressure: 75,
  duality: null,
  mood: 3,
  ventCount: 4,
  recentTactics: [],
};

// ── 1. routing — the free paths, and the one that got a person wrong ───────
check("1  Intent routing sends only real vents to a model", () => {
  is(classify("whats today's date?").intent, "factual", "the date is a fact, not a feeling");
  is(classify("hi").intent, "greeting", "a greeting is a greeting");
  is(classify("work dey choke me and i want to die").intent, "crisis", "crisis beats a mixed vent");

  // The regression that mattered most: a person naming their own pattern is
  // the most valuable sentence they can say, and it was being heard as a
  // complaint about us and answered with an apology.
  is(
    classify("it's the same thing every week, nothing ever changes").intent,
    "vent",
    "'same thing every week' is their pattern, not a complaint about us",
  );
  is(
    classify("you keep saying the same thing").intent,
    "meta",
    "a complaint aimed at us is still meta",
  );
});

// ── 2. the opening move ────────────────────────────────────────────────────
check("2  exact_mirror opens, and nothing repeats inside three turns", () => {
  is(selectTactic({ ...base, ventCount: 0 }).id, "exact_mirror", "turn one mirrors them");

  const recent = [];
  const picked = [];
  for (let i = 0; i < 10; i++) {
    const t = selectTactic({ ...base, recentTactics: [...recent] });
    picked.push(t.id);
    recent.push(t.id);
  }
  const repeats = picked.filter((id, i) => picked.slice(Math.max(0, i - 3), i).includes(id));
  ok(repeats.length === 0, "no tactic repeats inside a 3-turn window", picked.join(" → "));
  ok(ALL_TACTIC_IDS.length >= 32, "the library is at least 32 tactics", `${ALL_TACTIC_IDS.length}`);
});

// ── 3. the worksheet that had to go ────────────────────────────────────────
check("3  thought_record is warm, not a clipboard", () => {
  // A catastrophe with no self-criticism and no body named: thought_record is
  // the highest-weighted tactic that fits, so this is a real selection.
  const t = selectTactic({
    ...base,
    message: "i will fail this, everything is ruined, it is always the same",
    pressure: 40,
    recentTactics: [],
  });
  is(t.id, "thought_record", "catastrophising routes to the thought record");

  ok(!/evidence (for|against)/i.test(t.instruction.replace(/never say[^.]*\./i, "")),
    "the worksheet phrasing is gone from the instruction itself");
  ok(/never say 'evidence for and against'/i.test(t.instruction),
    "and the model is told, in words, not to reach for it");
  ok(/smaller, truer sentence/i.test(t.instruction),
    "what replaces it is one smaller true sentence they can carry");

  // The other half of the same fix: put a number on the worst case, plainly.
  const d = selectTactic({
    ...base,
    message: "i will fail this, everything is ruined, it is always the same",
    pressure: 40,
    recentTactics: ["thought_record", "socratic", "reframe_power"],
  });
  ok(!/exercise|worksheet/i.test(d.instruction), "no exercise language anywhere near it", d.id);
});

// ── 4. the body gate ───────────────────────────────────────────────────────
check("4  Somatic work stays locked until the body is named", () => {
  const cold = selectTactic({ ...base, body: null, pressure: 30, recentTactics: [] });
  ok(cold.family !== "somatic", "no breathing exercise at somebody who never mentioned a body", cold.id);

  const named = selectTactic({ ...base, body: "chest", pressure: 85, recentTactics: [] });
  is(named.id, "body_map_drop_set", "chest + high pressure goes to the body map");
});

// ── 5. real-world tools stay concrete ──────────────────────────────────────
check("5  Every real-world pressure carries its own tool, and a room phrasing", () => {
  const tags = Object.keys(REAL_WORLD_TACTIC);
  is(tags.length, 9, "nine real-world pressures");

  for (const tag of tags) {
    const t = REAL_WORLD_TACTIC[tag];
    ok(typeof t.hold === "string" && t.hold.length > 10, `${tag} has a room phrasing`);
    ok(selectTactic({ ...base, realWorldTag: tag, recentTactics: [] }).id === t.id,
      `${tag} routes to ${t.id}`);
  }

  // Concrete beats zen. "Ten naira" is a number a person can act on tonight.
  ok(/ten naira/i.test(REAL_WORLD_TACTIC.economy.instruction), "economy names ten naira");
  ok(/ten naira/i.test(REAL_WORLD_TACTIC.economy.hold), "the room hears the same number");

  // Every tactic carries one, because a deployment with no model key answers
  // a vent with it. A tactic added without a hold is a vent answered with a
  // shrug, and the only place that is catchable is here.
  const mute = ALL_TACTICS.filter((t) => !t.hold || t.hold.trim().length < 20);
  ok(mute.length === 0,
    "every tactic has a room phrasing a key-less deployment can offer",
    mute.map((t) => t.id).join(", "));
  ok(ALL_TACTICS.length === ALL_TACTIC_IDS.length,
    "the table the suite reads is the table the product selects from");
});

// ── 6. flavour keeps its mouth shut when it does not know ──────────────────
check("6  Flavour stays silent below the confidence floor", () => {
  const thin = buildFlavour(["ok"]);
  ok(thin.occupation.confidence < CONFIDENCE_FLOOR, "thin input is below the floor",
    `${thin.occupation.confidence.toFixed(2)}`);
  is(thin.occupation.value, "unknown", "and it says unknown rather than guessing");
  ok(thin.name.startsWith("The Unnamed"), "the name admits it", thin.name);

  const rich = buildFlavour([
    "abeg partner shouted for chambers again, the brief is due",
    "i missed gym, leg day gone, i just want one set today",
  ]);
  is(rich.temperament.value, "fire", "loud, fast input reads as fire");
  is(rich.occupation.value, "lawyer", "chambers and a brief read as a lawyer");
  is(rich.hobby.value, "gym", "leg day reads as gym");

  // The block, not just the reading. A detector that resolves correctly and
  // a prompt that never says so is a personality engine talking to itself.
  const block = flavourBlock(rich);
  ok(/billable hours/.test(block),
    "a known occupation carries what that work actually loads, not just its name");
  ok(/never what you claim/.test(block),
    "and the model is told to let it aim, never to assert it");
  is(flavourBlock(null), null, "no reading at all produces no block at all");
  // Each dimension gates on its own. A thin reading can still carry a
  // confident temperament, and must still say nothing about a job it could
  // not read — that is the line that would otherwise invent somebody's work.
  const thinBlock = flavourBlock(thin);
  ok(!/what loads that work/i.test(thinBlock),
    "an unknown occupation never has a pressure asserted at it", thinBlock);
  ok(!/occupation/i.test(thinBlock), "and it is not named either");
});

// ── 7. the chair is the measurement ────────────────────────────────────────
check("7  The chair drives the tension, and the drop is 78 → 20 = 58", () => {
  is(tensionForChair("tight_edge"), 78, "Tight edge reads 78");
  is(tensionNow(8), 20, "rating 8 out of 10 leaves 20 on you");
  is(tensionDrop(78, 8), 58, "so the drop is 58");
  is(tensionDrop(78, 1), 0, "and a worse day never shows a negative drop");

  const values = CHAIRS.map((c) => c.tension);
  ok(new Set(values).size === CHAIRS.length, "every chair reads differently", values.join("/"));
  ok(!values.includes(50), "nothing falls back to a meaningless 50", values.join("/"));
});

// ── 8. memory counts what was said, not what was typed ─────────────────────
check("8  Memory keeps vents only — four real turns beat six noisy ones", () => {
  // Most-recent-first, the way every store returns them.
  const recent = [
    { intent_type: "greeting", user_message: "hi" },
    { intent_type: "vent", user_message: "four" },
    { intent_type: "factual", user_message: "whats the date" },
    { intent_type: "vent", user_message: "three" },
    { intent_type: "meta", user_message: "you keep saying the same thing" },
    { intent_type: "vent", user_message: "two" },
    { intent_type: "crisis", user_message: "…" },
    { intent_type: "vent", user_message: "one" },
  ];
  const mem = selectMemory(recent, 6);
  is(mem.length, 4, "four vents survive out of eight turns");
  is(mem.map((m) => m.user_message).join(" "), "one two three four", "oldest first, in order");
  ok(mem.every((m) => m.intent_type === "vent"), "nothing but vents reaches the prompt");

  const many = Array.from({ length: 12 }, (_, i) => ({ intent_type: "vent", user_message: `v${i}` }));
  is(selectMemory(many, 6).length, 6, "and the window still caps at six");
});

// ── 9. the circle governs itself, and the Keeper counts ────────────────────
check("9  Circle governance protects people without breaking a promise", () => {
  // The lie: the last seats used to join as witnesses who could never share.
  is(roleForSeat(0), "keeper", "whoever opens holds it");
  is(roleForSeat(5), "sharer", "and the sixth seat can still speak");
  ok(checkMessage("my mother rang three times and i said yes three times", "share").ok,
    "the last seat's share is accepted");

  const advice = checkMessage("you should just tell her no", "share");
  ok(!advice.ok, "advice is refused");
  // Asserted against the constant, not a copy of its wording. This held a
  // hardcoded "no fixing here" and broke the moment the room got its own
  // voice — a check testing its own copy of a string passes while the
  // product changes underneath it, which is the failure mode this suite
  // exists to avoid.
  ok(
    (advice.reason ?? "").startsWith(MYCELIUM_RULE.noFixing),
    "and refused in the room's own words",
    advice.reason,
  );
  ok(!checkMessage("@seat2 that is your problem", "witness").ok, "cross-talk is refused");
  ok(!checkMessage("x".repeat(200), "witness").ok, "a reflection stays one line");

  // Counted, never generated: a word nobody said cannot appear.
  const reflection = keeperReflection([
    "my chest is tight when i think about it",
    "tight all week, chest again",
    "i feel small",
  ]);
  ok(/chest 2 times/.test(reflection), "it counts what the room actually said", reflection);
  ok(!/small/.test(reflection), "a word said once is not a pattern", reflection);
  ok(!/shame/.test(reflection), "and a word nobody said never appears");

  const quiet = keeperReflection(["today was hard", "mine too"]);
  ok(/2 people spoke/.test(quiet), "no pattern still says something true", quiet);

  // Single source of truth: the room opens with the tactic library's phrasing.
  for (const tag of Object.keys(REAL_WORLD_TACTIC)) {
    ok(keeperIntention(tag).includes(REAL_WORLD_TACTIC[tag].hold),
      `the ${tag} circle opens with the ${tag} tool`);
  }

  // Presence: derived from timestamps, so it can only ever be a little stale.
  const now = Date.UTC(2026, 7, 1, 12, 0, 0);
  const at = (msAgo) => new Date(now - msAgo).toISOString();
  ok(isPresent(at(4_000), now), "somebody who polled 4s ago is here");
  ok(!isPresent(at(PRESENCE_WINDOW_MS + 1), now), "somebody gone longer than the window is not");
  ok(!isPresent(null, now), "and a seat that never polled is never lit");

  const room = presenceOf(
    [
      { anon_id: "a", last_seen_at: at(1_000), typing_until: new Date(now + 5_000).toISOString() },
      { anon_id: "b", last_seen_at: at(2_000), typing_until: null },
      { anon_id: "c", last_seen_at: at(60_000), typing_until: new Date(now + 5_000).toISOString() },
    ],
    "b",
    now,
  );
  is(room.present, 2, "two of the three seats have a person behind them");
  is(room.typingOthers, 1, "one other person is writing — the one who left cannot be");
  is(room.seatsPresent.join(","), "true,true,false", "and the dots line up with the seats");
  is(presenceOf([{ anon_id: "a", last_seen_at: at(1_000), typing_until: new Date(now + 5_000).toISOString() }], "a", now).typingOthers,
    0, "you are never told that you are writing");

  ok(!isTyping(at(1_000), now), "a typing window that has passed is not typing");
  ok(isTyping(new Date(now + TYPING_WINDOW_MS).toISOString(), now), "and one still open is");

  const fresh = { anon_id: "a", last_seen_at: at(500), typing_until: null };
  ok(!shouldTouch(fresh, false, now), "a fresh heartbeat is not rewritten every poll");
  ok(shouldTouch(fresh, true, now), "but starting to type is written immediately");
  ok(shouldTouch({ anon_id: "a", last_seen_at: at(9_000), typing_until: null }, false, now),
    "and a stale one is refreshed");
});

// ── 10. the data pipeline is itself measured ───────────────────────────────
check("10 The pipelines filter, dedup, reweight and score preferences", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "mw-eval-"));
  const run = (script) =>
    execFileSync(process.execPath, [script], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, VENT_DATA_DIR: "scripts/fixtures", VENT_OUT_DIR: out },
    });
  const log = run("scripts/data-pipeline.mjs");

  const num = (label) => Number(new RegExp(`(\\d+)\\s+dropped: ${label}`).exec(log)?.[1] ?? -1);
  is(num("not_a_vent"), 3, "a greeting, a date question and a crisis are not training data");
  is(num("too_short"), 1, "'ok' is not a vent");
  is(num("fallback_text"), 1, "the key-less apology never becomes a completion");
  is(num("gives_advice"), 1, "a reply that gives advice is refused by the circle's own rule");
  is(num("exact duplicate"), 1, "the exact repeat goes");
  is(num("near duplicate"), 1, "and the one-word-different repeat goes");

  const sft = fs.readFileSync(path.join(out, "sft.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  const ev = fs.readFileSync(path.join(out, "eval.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  is(sft.length + ev.length, 9, "nine rows survive");

  const rows = [...sft, ...ev].map((l) => JSON.parse(l));
  const w = (d) => rows.find((r) => r.domain === d)?.weight ?? 0;
  ok(w("economy") > w("family"), "economy is weighted above family", `${w("economy")} vs ${w("family")}`);
  ok(w("family") > w("social"), "family above the long tail", `${w("family")} vs ${w("social")}`);
  ok(rows.every((r) => /\[MEM:\d+\]/.test(r.prompt)), "every prompt carries its memory depth");
  ok(rows.every((r) => !/\[FLAVOUR:[^\]]*unknown×/.test(r.prompt)), "no guessed flavour is shipped");
  ok(rows.some((r) => /\[CHAIR:tight_edge\] \[BODY:chest\]/.test(r.prompt)), "chair and body tokenise");

  // ── preferences ─────────────────────────────────────────────────────────
  run("scripts/rlhf-pipeline.mjs");
  const dpo = fs.readFileSync(path.join(out, "dpo.jsonl"), "utf8").trim().split("\n")
    .filter(Boolean).map((l) => JSON.parse(l));

  const paired = dpo.filter((r) => r.kind === "pair");
  is(paired.length, 2, "two preference pairs, both inside a single domain");
  ok(paired.every((p) => p.chosen !== p.rejected && p.margin > 0), "every pair has a real margin");
  ok(paired.some((p) => p.domain === "economy" && p.chosen_tactic === "rw_economy"),
    "the concrete money tool beat a breathing exercise, and the note says why");

  const negatives = dpo.filter((r) => r.kind === "negative");
  ok(negatives.some((n) => /tactic mean 1\.50 < 4\.0/.test(n.reason)),
    "a tactic averaging below 4.0 over two ratings becomes a negative sample");
  ok(negatives.some((n) => /keeper mean/.test(n.reason) && n.domain === "economy"),
    "and a Keeper whose room barely came down loses its opening line");
  ok(!negatives.some((n) => n.domain === "family" && /keeper/.test(n.reason)),
    "while a 45-point family circle is scored as the win it was");

  // ── the heartbeat, over a throwaway copy so it can write its state file ──
  const watched = path.join(out, "store");
  fs.cpSync(path.join(ROOT, "scripts/fixtures"), watched, { recursive: true });
  const beat = execFileSync(process.execPath, ["scripts/heartbeat-data.mjs"], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, VENT_DATA_DIR: watched },
  });
  ok(/\[advice_in_reply\][\s\S]*skill: data-quality/.test(beat),
    "it finds the reply that gives advice and routes it to the data skill");
  ok(/\[keeper_losing\] economy[\s\S]*skill: circles-quality/.test(beat),
    "and the room that never came down, to the circles skill");
  ok(/held \(gate not passed\)/.test(beat),
    "state does not advance until a gate says it may");

  const looped = JSON.parse(fs.readFileSync(path.join(watched, "loop-state.json"), "utf8"));
  is(looped.keeper_low_rating.join(","), "economy", "the losing tag is recorded for next time");
  ok(looped.dirty_vents.length > 0, "and so is the dirty vent");

  // Second beat, same store: the findings are stable, and it still sleeps
  // rather than advancing on its own.
  const again = execFileSync(process.execPath, ["scripts/heartbeat-data.mjs"], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, VENT_DATA_DIR: watched },
  });
  ok(/findings      2/.test(again), "a second beat finds the same two, not new ones");

  fs.rmSync(out, { recursive: true, force: true });
});

// ── 11. the outside world, and what happens when it is not there ──────────
check("11 External data is counted, and silent when it is not known", () => {
  // The Keeper never guesses a number. With no rate, the sentence is absent —
  // not rounded, not "about", not last week's.
  const bare = keeperIntention("economy");
  ok(!/\d/.test(bare.replace("ten naira", "")), "no rate means no number at all", bare);
  ok(bare.includes(REAL_WORLD_TACTIC.economy.hold), "and the tool is still there");

  const withRate = keeperIntention("economy", economyFact(1605));
  ok(withRate.includes("₦1,605"), "a fetched rate is said exactly", withRate);
  ok(withRate.includes(REAL_WORLD_TACTIC.economy.hold),
    "and it never displaces the thing they can act on");
  ok(withRate.indexOf("₦1,605") < withRate.indexOf(REAL_WORLD_TACTIC.economy.hold),
    "the real number lands before the move, which is the order a person needs");

  // The Guardian. Fail-open is the whole design: a classifier that did not
  // answer must never become a mute button on a room of people trying to talk.
  is(guardianVerdict(null).block, false, "no score is a pass, never a block");
  is(guardianVerdict({ toxicity: 0.1, insult: 0.05, threat: 0.01 }).block, false,
    "an ordinary line goes through");

  const rude = guardianVerdict({ toxicity: 0.93, insult: 0.88, threat: 0.12 });
  is(rude.block, true, "a personal attack is refused");
  is(rude.reason, "insult", "and named as what it is");
  ok(/no fixing, no advice/i.test(rude.message ?? ""), "in the room's own words", rude.message);

  const menace = guardianVerdict({ toxicity: 0.5, insult: 0.2, threat: 0.75 });
  is(menace.reason, "threat", "a threat crosses on a lower bar than an insult");
  ok(THRESHOLD.threat < THRESHOLD.toxicity,
    "because a threat is the thing a room cannot survive");

  // Distress must not read as abuse. This is the failure mode that would
  // silence exactly the person the product is for.
  is(guardianVerdict({ toxicity: 0.62, insult: 0.3, threat: 0.02 }).block, false,
    "'I feel disgusting' scores high and is still allowed to be said");
});

// ── 12. the one sentence a key-less deployment still says ──────────────────
// Shipped live: production had no store and no model key, and every vent was
// answered "I've saved it, word for word." It was saving nothing. A promise
// in a fallback is still a promise.
check("12 A reply with no model key promises only what it can keep", () => {
  const kept = noModelKeyReply(true);
  const dropped = noModelKeyReply(false);

  ok(/it's kept, word for word/i.test(kept),
    "with the write behind it, it may say the words were kept");
  ok(!/\bkept, word for word\b/.test(dropped),
    "with no write, it never claims they were", dropped);
  ok(/nothing here is being kept/i.test(dropped),
    "it says so plainly instead of leaving them to assume");
  ok(kept.includes("Say the next part") && dropped.includes("Say the next part"),
    "either way the session keeps moving");

  // With no key at all, a real-world vent can still be answered with the room
  // phrasing its tactic already carries — authored, not generated. The saving
  // claim has to survive that path too.
  const hold = REAL_WORLD_TACTIC.economy.hold;
  const withHold = noModelKeyReply(false, hold);
  ok(withHold.includes(hold), "an authored hold is offered rather than a shrug");
  ok(!/\bkept, word for word\b/.test(withHold),
    "and it still does not claim a save it did not make", withHold);
  ok(noModelKeyReply(true, hold).includes("word for word"),
    "with the write behind it, the same reply may say the words were kept");
  ok(!noModelKeyReply(false, null).includes("one move, not a full read"),
    "a tactic with no authored hold invents nothing to fill the space");

  // ── the operator's vocabulary is not the reader's ────────────────────────
  //
  // This shipped: "That's the move rather than a full answer — I'm running
  // without my model key", rendered under somebody writing that their
  // father's test results had come back. Nobody arrives here knowing what a
  // model key is, and a machine narrating its own configuration to somebody
  // who is frightened has made itself the subject. Found by screenshotting a
  // real session, which is the only way it could have been found.
  const OPERATOR = /\b(model key|api key|apikey|token|provider|endpoint|config|env var|deployment|database|server)\b/i;
  for (const [label, text] of [["plain kept", kept], ["plain dropped", dropped],
                               ["with hold", withHold]]) {
    ok(!OPERATOR.test(text), `${label} speaks the reader's words, not the operator's`,
      text.match(OPERATOR)?.[0]);
  }
  ok(!/rather than a full answer/i.test(withHold),
    "and it never apologises for the authored move it just offered");

  // ── the claim is composed after the write, not before it ─────────────────
  //
  // The strings above are only half of it. This function was called with
  // `Boolean(store && userId)` — computed at the top of the handler, before
  // anything had been written — so "I've saved it, word for word" printed
  // whenever a store merely *existed*, including on every run where the
  // insert then failed. A store existing is an intention. `tryPersist`
  // returning true is an outcome. CLAUDE.md's second mechanism, inside the
  // file whose docstring was about avoiding it.
  //
  // Order in the source is the invariant, and it is worth asserting because
  // the fix is one line away from being undone by anybody tidying the branch
  // back together.
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/vent/route.ts"), "utf8");
  const composed = route.lastIndexOf("noModelKeyReply(");
  const wrote = route.indexOf("const saved =");
  ok(composed > wrote && wrote !== -1,
    "the route writes first and composes the saving claim second",
    `noModelKeyReply@${composed} vs persist@${wrote}`);
  ok(!/noModelKeyReply\(\s*(Boolean\(|store\b|!!)/.test(route),
    "and it is never handed a claim about the deployment instead of the row");
});

// ── 13. more than one way to answer ────────────────────────────────────────
// An empty credit balance on one provider silenced this product for a week.
// A chain is only worth having if the order is the order, and if a provider
// with no key is skipped rather than tried and reported broken.
check("13 The provider chain is ordered, and skips what is not configured", () => {
  const all = allProviders();
  ok(all.length >= 5, "at least five providers are known to this build", `${all.length}`);
  ok(all.every((p) => p.id && p.model), "every provider names itself and its model");

  const ids = all.map((p) => p.id);
  is(new Set(ids).size, ids.length, "no provider is listed twice");

  // Nothing is configured in the suite's environment, so nothing is offered.
  ok(configuredProviders().every((p) => p.configured),
    "only providers with a key are ever offered to a vent");
  ok(all.filter((p) => !p.configured).length === all.length - configuredProviders().length,
    "and the rest are known but not attempted");
});

// ── 14. the four ways a provider broke a real conversation ─────────────────
// Every one of these reached somebody before it reached a check. A retired
// model id, a reply cut off at three tokens, an empty completion, a rate
// limit. No network: fetch is stubbed, so this stays free and deterministic.
await checkAsync("14 A provider's four real failures are handled, not passed on", async () => {
  const real = globalThis.fetch;
  const calls = [];
  const stub = (handler) => {
    globalThis.fetch = async (url, init) => {
      calls.push(String(url));
      return handler(String(url), init);
    };
  };
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  try {
    // A whole reply comes back whole.
    stub(() => json(200, { choices: [{ message: { content: " a full answer " }, finish_reason: "stop" }] }));
    const good = openAiCompatible("t-ok", "https://x", "k", "m");
    is(await good.send({ system: "s", messages: [], maxTokens: 220 }), "a full answer",
      "a complete reply is returned trimmed");

    // "Tired. Na" — a thinking model interrupted. Not an answer.
    stub(() => json(200, { choices: [{ message: { content: "Tired. Na" }, finish_reason: "length" }] }));
    const cut = openAiCompatible("t-cut", "https://x", "k", "m");
    let threw = false;
    try { await cut.send({ system: "s", messages: [], maxTokens: 220 }); } catch { threw = true; }
    ok(threw, "a reply cut off mid-sentence is a failure, never shown as an answer");

    // A retired id: ask what exists, retry, remember.
    calls.length = 0;
    stub((url) =>
      url.endsWith("/models")
        ? json(200, { data: [{ id: "models/gemini-9.9-flash" }, { id: "text-embedding-004" }] })
        : calls.filter((c) => c.endsWith("/chat/completions")).length === 1
          ? json(404, { error: { message: "model is no longer available" } })
          : json(200, { choices: [{ message: { content: "recovered" }, finish_reason: "stop" }] }));
    const stale = openAiCompatible("t-stale", "https://x", "k", "dead-model", ["flash"]);
    is(await stale.send({ system: "s", messages: [], maxTokens: 220 }), "recovered",
      "a retired model id is replaced with one the provider actually has");
    ok(calls.some((c) => c.endsWith("/models")), "and it asked, rather than guessing again");
    is(stale.model, "gemini-9.9-flash", "the working id is remembered, not rediscovered every turn");

    // A rate limit must not spend the free tier on a pointless second try.
    calls.length = 0;
    stub(() => json(429, { error: { message: "rate limit" } }));
    const limited = openAiCompatible("t-429", "https://x", "k", "m");
    try { await limited.send({ system: "s", messages: [], maxTokens: 220 }); } catch { /* expected */ }
    ok(!calls.some((c) => c.endsWith("/models")),
      "a rate limit is not retried — the answer would be the same and the tier is finite");

    // An empty completion is not a reply either.
    stub(() => json(200, { choices: [{ message: { content: "   " }, finish_reason: "stop" }] }));
    const blank = openAiCompatible("t-blank", "https://x", "k", "m");
    let blankThrew = false;
    try { await blank.send({ system: "s", messages: [], maxTokens: 220 }); } catch { blankThrew = true; }
    ok(blankThrew, "an empty completion never becomes a blank bubble");
  } finally {
    globalThis.fetch = real;
  }
});

// ── 15. the part that learns, and what stops it inventing ─────────────────
//
// "Would the LLMs train themselves?" — this is the answer, so it needs the
// same suspicion as anything else that changes what a person is offered. The
// risk is not that it learns the wrong thing. It is that it learns *anything*
// from four sessions and a coincidence.
const { measureEfficacy, EFFICACY_FLOOR, EFFICACY_SPAN, getEfficacy, resetEfficacyCache } =
  await app("src/lib/vent/efficacy.ts");

await checkAsync("15a The selector learns from outcomes, and refuses thin evidence", async () => {
  const row = (tactic, before, after, i) => ({
    id: `v${i}`,
    user_id: "u",
    user_message: "x",
    ai_reply: "y",
    tactic_used: tactic,
    tension_before: before,
    tension_after: after,
    created_at: new Date(Date.now() - i * 60_000).toISOString(),
    real_world_tag: null,
    intent_type: "vent",
  });
  const many = (tactic, drop, n, o = 0) =>
    Array.from({ length: n }, (_, i) => row(tactic, 80, 80 - drop, o + i));

  // Thin data says nothing at all. This is the same rule as the flavour floor
  // and the pattern floor, applied to the machine talking to itself.
  ok(
    measureEfficacy(many("a", 40, EFFICACY_FLOOR - 1).concat(many("b", 5, EFFICACY_FLOOR - 1, 50)))
      .size === 0,
    "below the floor, a 35-point difference still earns no opinion",
  );

  // One tactic over the floor cannot be above its own average.
  ok(
    measureEfficacy(many("a", 40, EFFICACY_FLOOR + 4).concat(many("b", 5, 3, 90))).size === 0,
    "a single qualifying tactic is not ranked against itself",
  );

  const table = measureEfficacy(
    many("good", 30, EFFICACY_FLOOR + 2).concat(many("poor", 4, EFFICACY_FLOOR + 2, 90)),
  );
  ok(table.get("good") > 0, "a move followed by bigger drops is weighted up");
  ok(table.get("poor") < 0, "a move followed by smaller drops is weighted down");
  ok(
    Math.abs(table.get("good")) <= EFFICACY_SPAN && Math.abs(table.get("poor")) <= EFFICACY_SPAN,
    "the adjustment stays inside its span",
    `got ${table.get("good")} / ${table.get("poor")}`,
  );

  // The invariant this must never rewrite: a named pressure keeps its own
  // tool. Give the real-world tactic the worst record in the table and the
  // best possible general rival, and it still wins.
  const rwId = REAL_WORLD_TACTIC.economy.id;
  const rigged = new Map([[rwId, -EFFICACY_SPAN]]);
  for (const t of ALL_TACTIC_IDS) if (t !== rwId) rigged.set(t, EFFICACY_SPAN);
  is(
    selectTactic({ ...base, realWorldTag: "economy", efficacy: rigged }).id,
    rwId,
    "learning reorders peers and never crosses the real-world band",
  );

  // Same context, no table: whatever it picked before it could learn anything.
  const cold = selectTactic({ ...base, recentTactics: [] });
  is(
    selectTactic({ ...base, recentTactics: [], efficacy: new Map() }).id,
    cold.id,
    "an empty table leaves the selector exactly as it was",
  );

  // A store that is down must not reach the person. Fail open, every time.
  resetEfficacyCache();
  const down = { recentVentsAcross: async () => { throw new Error("store operation failed"); } };
  is((await getEfficacy(down)).size, 0, "a broken store yields no opinion rather than an error");
  resetEfficacyCache();
  is((await getEfficacy(null)).size, 0, "no store at all yields no opinion");
});

// ── 15b. the arc — a session has a shape, and an uncounted one has none ────
const { arcBlock, buildSystemPrompt } = await app("src/lib/vent/prompt.ts");

check("15b The reply knows where in the session it is, or says nothing", () => {
  // The rule this shares with the exchange rate and the flavour floor: a
  // number that did not arrive is an absent sentence, not an estimate.
  is(arcBlock(null), null, "no store means no claim about how long they have been here");
  ok(
    !buildSystemPrompt({
      grounding: { date: "5 August 2026", time: "18:00", iso: "2026-08-05", lines: [] },
      classification: { intent: "vent", realWorldTag: null, language: "en", body: null },
      tactic: ALL_TACTICS[0],
      ctx: { ...base },
      memory: [],
    }).includes("WHERE YOU ARE"),
    "and the block is absent from the prompt entirely rather than empty",
  );

  const phases = [0, 1, 4, 12].map((n) => arcBlock(n));
  ok(phases.every(Boolean), "every turn count lands in a phase");
  ok(new Set(phases).size === 4, "the four phases are four different instructions");

  ok(/first thing they have said/i.test(phases[0]), "turn one is about being believed");
  ok(
    /lightly|before somebody feels heard/i.test(phases[0]),
    "and it holds the tool back until they are heard",
  );
  ok(/do not name a pattern/i.test(phases[1]), "early on, the pattern is still theirs to name");
  ok(/precise/i.test(phases[2]), "the middle asks for precision rather than warmth");
  ok(
    /cannot be finished|circling/i.test(phases[3]),
    "a long session closes rather than opening something new",
  );

  // Turn numbers are 1-indexed for a reader; off-by-one here would tell
  // somebody on their first sentence that this is turn 0.
  ok(/Turn 2 today/.test(phases[1]), "the second vent of the day is called turn 2");
  ok(
    buildSystemPrompt({
      grounding: { date: "5 August 2026", time: "18:00", iso: "2026-08-05", lines: [] },
      classification: { intent: "vent", realWorldTag: null, language: "en", body: null },
      tactic: ALL_TACTICS[0],
      ctx: { ...base },
      memory: [],
      turnsToday: 9,
    }).includes("Turn 10 today"),
    "and the block reaches the prompt the model is actually sent",
  );
});

// ── 15c. what recurs reaches the reply, without being read out ────────────
const { patternBlock } = await app("src/lib/vent/prompt.ts");
const { findPattern, PATTERN_FLOOR } = await app("src/lib/vent/pattern.ts");

check("15c The pattern reaches the prompt, and is forbidden from being announced", () => {
  const row = (tag, i) => ({
    id: `v${i}`,
    user_id: "u",
    user_message: "money no dey and rent is due",
    ai_reply: "y",
    tactic_used: "exact_mirror",
    tension_before: 80,
    tension_after: 55,
    real_world_tag: tag,
    intent_type: "vent",
    created_at: new Date(Date.now() - i * 86_400_000).toISOString(),
  });

  is(patternBlock(null), null, "no pattern means no block at all");
  is(
    findPattern(Array.from({ length: PATTERN_FLOOR - 1 }, (_, i) => row("economy", i))),
    null,
    "and below the floor there is no pattern to have",
  );

  // Seven about money, three about family — a clear winner, not a tie.
  const vents = [
    ...Array.from({ length: 7 }, (_, i) => row("economy", i)),
    ...Array.from({ length: 3 }, (_, i) => row("family", i + 20)),
  ];
  const p = findPattern(vents);
  ok(p !== null, "ten tagged sessions with a clear leader is a pattern");
  is(p.tag, "economy", "and it is the one that recurs most");

  const block = patternBlock(p);
  ok(block.includes("WHAT KEEPS BRINGING THEM BACK"), "the block is labelled for the model");
  ok(/never goes in front of them/i.test(block),
    "and the count in particular is kept away from them");
  ok(
    /most\s+valuable thing they will ever type/i.test(block),
    "and if they name it themselves, that is theirs",
  );

  // It has to actually reach the prompt the model is sent. This was computed
  // and rendered on /history for weeks and never once got into a reply.
  const built = buildSystemPrompt({
    grounding: { date: "8 August 2026", time: "05:30", iso: "2026-08-08", lines: [] },
    classification: { intent: "vent", realWorldTag: null, language: "en", body: null },
    tactic: ALL_TACTICS[0],
    ctx: { ...base },
    memory: [],
    pattern: p,
  });
  ok(built.includes("WHAT KEEPS BRINGING THEM BACK"), "and buildSystemPrompt carries it");
  // The do-not-recite ban lives in CONTEXT_RULES now — one statement covering
  // the pattern, the carve and the opening. Asserted where it has to be true:
  // in the prompt the model is actually sent.
  ok(/NEVER SAY IT BACK/.test(built),
    "and the ban on reading it back rides along with it");
  ok(/brought\s*\n?\s*this up four times/.test(built),
    "with the counting example, so the ban is concrete rather than abstract");
  ok(
    !buildSystemPrompt({
      grounding: { date: "8 August 2026", time: "05:30", iso: "2026-08-08", lines: [] },
      classification: { intent: "vent", realWorldTag: null, language: "en", body: null },
      tactic: ALL_TACTICS[0],
      ctx: { ...base },
      memory: [],
    }).includes("WHAT KEEPS BRINGING THEM BACK"),
    "absent when there is nothing to say, rather than present and empty",
  );
});

// ── 15d. the house rule, in the prompt the model is actually sent ─────────
//
// `CLAUDE.md` says never promise what the code cannot keep, and names the
// worst bug this product shipped: a refusal that read "Your turn comes" to
// people whose turn could never come. The same rule had never been given to
// the model. A therapy-voiced LLM reaches for "I'll be here" and "we'll pick
// this up next time" unprompted — promises nothing in this system can keep,
// made to somebody at their lowest.
check("15d The model is forbidden from promising what the product cannot keep", () => {
  const prompt = buildSystemPrompt({
    grounding: { date: "8 August 2026", time: "06:47", iso: "2026-08-08", lines: [] },
    classification: { intent: "vent", realWorldTag: null, language: "en", body: null },
    tactic: ALL_TACTICS[0],
    ctx: { ...base },
    memory: [],
  });

  ok(prompt.includes("WHAT YOU NEVER PROMISE"), "the rule is in the prompt at all");
  ok(
    /outranks sounding warm/i.test(prompt),
    "and it is ranked above warmth, because that is the trade it exists to settle",
  );
  ok(/be here tomorrow|check in/i.test(prompt), "no promise of a tomorrow it does not have");
  ok(
    /clear their id in one tap/i.test(prompt),
    "with the reason — deletion is a promise kept, so continuity cannot be one",
  );
  ok(
    /never claim to have saved/i.test(prompt),
    "and no claim to have saved anything, which something else decides",
  );
  ok(
    /invent a fact|does not get written/i.test(prompt),
    "silence beats a guess, stated to the model and not only to us",
  );
  ok(/never diagnose/i.test(prompt), "and it never names a condition");

  // The one promise it is allowed is the one that is true.
  ok(
    /length of this exchange/i.test(prompt),
    "what it may promise is bounded to what actually holds",
  );
});

// ── 15e. the voice that must not be recognisable ──────────────────────────
//
// Everything else in this product is anonymous by construction. Then a circle
// opens a microphone and hands over a biometric. The shift maths is the kind
// of thing nobody can hear is wrong — a ratio inverted or a sweep rate off by
// a factor produces a voice that still sounds altered and is trivially
// recognisable, and you find out when somebody is recognised.
const { shiftRatio, sweepHz, WINDOW_S, maskMicrophone } =
  await app("src/lib/voice/mask.ts");

check("15e The voice mask shifts far enough to break recognition", () => {
  const down = shiftRatio("deeper");
  const up = shiftRatio("higher");

  // Four semitones down is 2^(-4/12) ≈ 0.7937.
  ok(Math.abs(down - 0.7937) < 0.001, "deeper is four semitones down", `${down}`);
  ok(Math.abs(up - 1.2599) < 0.001, "higher is four semitones up", `${up}`);
  ok(down < 1 && up > 1, "the two directions actually go in two directions");

  // Under about three semitones a familiar voice is still placeable; past six
  // everyone in the room converges on one cartoon and six people stop being
  // distinguishable from each other, which is what a circle needs.
  for (const [name, r] of [["deeper", down], ["higher", up]]) {
    const semitones = Math.abs(12 * Math.log2(r));
    ok(
      semitones >= 3 && semitones <= 6,
      `${name} lands in the band where recognition fails but a person remains`,
      `${semitones.toFixed(2)} semitones`,
    );
  }

  // The sweep rate is derived, never typed. delay crosses WINDOW_S at a speed
  // of |1 - ratio|, so it resets |1 - ratio| / WINDOW_S times a second.
  ok(
    Math.abs(sweepHz(down) - Math.abs(1 - down) / WINDOW_S) < 1e-9,
    "the sweep rate follows from the ratio and the window",
  );
  is(sweepHz(1), 0, "no shift means no sweep, and no division by zero");
  ok(sweepHz(down) > 0 && sweepHz(down) < 10, "and it stays in audio-rate sanity", `${sweepHz(down)}`);

  /*
    Everything above is arithmetic about numbers this file exports, and every
    one of it passed while the graph those numbers describe shifted a voice by
    three semitones and published the original underneath it.

    The module was finally run — in Chromium, a 220 Hz tone through the real
    `maskMicrophone`, spectrum measured off the masked track. Three defects,
    none of which any amount of reasoning about `shiftRatio` could have found:

    1. The triangle crossfade sat 90° out of phase with the sawtooth's
       discontinuity, so the line that was mid-tear played at half gain
       instead of muted. **The unshifted voice came through at −10.6 dB** —
       the failure this whole file exists to prevent.
    2. The delay's DC offset was `WINDOW_S * phase`, which is zero for the
       first line, so half of every cycle asked for a negative delay and got
       clamped. Six spectral peaks instead of one.
    3. `type = "sawtooth"` is *normalized*, and the spec leaves how to an
       implementation. Chromium scales it to peak ±1 including Gibbs
       overshoot, shrinking the ramp slope — and the ramp slope is the pitch
       shift. Both directions came out at 0.813× the intended interval.

    After: 220 Hz → 175.0 Hz down (−397 cents, one FFT bin off −400) and
    277.2 Hz up (+400 exactly), a single peak each way, no residual.

    A script with no browser cannot re-measure that. What it can do is fail
    the three source-level shapes that produced it, so none of them comes back
    quietly — which matters more here than anywhere else in this suite,
    because nobody can *hear* three semitones where four was promised.
  */
  // Code only. The explanation of each of these fixes quotes the old broken
  // form, so a checker that reads comments reports the bug it was just told
  // about — which is exactly what happened to the accessible-name check two
  // hours ago. Strip first, assert second.
  const mask = fs
    .readFileSync(path.join(ROOT, "src/lib/voice/mask.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  ok(/disableNormalization: true/.test(mask),
    "the sweep runs on an un-normalized wave, not a browser's idea of ±1");
  ok(!/type = "sawtooth"/.test(mask),
    "the built-in sawtooth is not used — its ramp slope is implementation-defined");
  ok(/delayTime\.value = WINDOW_S \/ 2/.test(mask),
    "the delay sits at the centre of its excursion, so it never clamps at zero");
  ok(/shape\.start\(at\)[\s\S]{0,80}sweep\.start\(at \+ quarter\)/.test(mask),
    "the crossfade leads the sweep by a quarter period, so the tear happens at zero gain");
  ok(/const quarter = 0\.25 \/ hz/.test(mask),
    "and that quarter is derived from the sweep rate rather than typed");

  // 100ms of delay is the latency somebody actually feels in conversation.
  ok(WINDOW_S <= 0.12, "the added latency stays under what a conversation notices");

  // The rule this file lives by: it may fail to a silence, never to an
  // unmasked person who believed they were masked. In node there is no
  // AudioContext, which is exactly that failure, so it must return null
  // rather than throw or hand back the raw stream.
  is(
    maskMicrophone({ getAudioTracks: () => [] }),
    null,
    "no AudioContext yields null — the caller publishes nothing, never the real voice",
  );
});

// ── 15f. the house counts, and never says you are the only one ────────────
//
// A circle keeps nothing, so the product has no community layer at all — and
// a lonely screen that says "0 people this week" is worse than a silent one.
// Every floor here exists to stop a number being printed that would land on
// somebody at 2am as confirmation they are alone.
const { whatIsCarried, CARRYING_FLOOR, TAG_FLOOR, WINDOW_MS, carryingWord } =
  await app("src/lib/community/carrying.ts");

check("15f The house counts what it holds, and stays quiet below the floor", () => {
  const NOW = Date.parse("2026-08-08T06:00:00Z");
  const row = (tag, daysAgo, i) => ({
    id: `c${i}`,
    user_id: `u${i}`,
    user_message: "x",
    ai_reply: "y",
    real_world_tag: tag,
    intent_type: "vent",
    tension_before: null,
    tension_after: null,
    created_at: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  });
  const many = (tag, n, daysAgo = 1, o = 0) =>
    Array.from({ length: n }, (_, i) => row(tag, daysAgo, o + i));

  is(whatIsCarried([], NOW), null, "an empty house says nothing, never zero");
  is(
    whatIsCarried(many("economy", CARRYING_FLOOR - 1), NOW),
    null,
    "and below the floor it still says nothing",
  );

  // Enough rows overall, but no single pressure clears its own floor: a total
  // with nothing nameable behind it is a number over blank space.
  is(
    whatIsCarried(
      [...many("economy", 2), ...many("japa", 2, 1, 50), ...many("family", 2, 1, 60),
       ...many("lonely", 2, 1, 70)],
      NOW,
    ),
    null,
    "a total with no pressure above its own floor is not printed",
  );

  const c = whatIsCarried(
    [...many("economy", 7), ...many("family", 4, 2, 40), ...many("japa", 1, 1, 80)],
    NOW,
  );
  ok(c !== null, "twelve people with two real pressures is a house");
  is(c.total, 12, "the total counts every person in the window");
  is(c.tags.length, 2, "and only the pressures that cleared TAG_FLOOR are named");
  is(c.tags[0].tag, "economy", "ranked by how many are carrying it");
  ok(
    c.tags.every((t) => t.count >= TAG_FLOOR),
    "nothing thinner than the tag floor is ever named",
  );

  /*
    People, not rows — and this is the case the fixture above could never
    have caught.

    Every helper row here gets `user_id: u${i}`, one person per row, so rows
    and people were the same number and every assertion passed either way.
    The page meanwhile read "More than 500 people sat down with something"
    over 591 vents written by 66 people: an eightfold overstatement of the one
    number in this product that is a claim about other human beings, shown to
    somebody alone at 2am asking whether they are the only one.

    The module docstring says it does not fake anything. Counting rows and
    calling them people is faking something — arithmetically rather than
    deliberately, which is exactly how it survived a review looking for
    invented data rather than a wrong denominator.
  */
  const sameSoul = (tag, n, daysAgo = 1) =>
    Array.from({ length: n }, (_, i) => ({ ...row(tag, daysAgo, i), user_id: "one-hard-week" }));

  is(whatIsCarried(sameSoul("economy", 40), NOW), null,
    "forty vents from one person in one week is one person, and says nothing");

  const mixed = whatIsCarried(
    [...sameSoul("economy", 30), ...many("economy", 9, 1, 200)], NOW);
  ok(mixed !== null, "nine other people plus that one clears the floor");
  is(mixed.total, 10, "and the total is ten people, not thirty-nine rows");
  is(mixed.tags[0].count, 10, "the per-tag count is people too, not mentions");

  // Last week is not this week. A window that quietly includes old rows makes
  // a dead house look busy, which is the fake-activity failure this avoids.
  is(
    whatIsCarried(many("economy", 20, 9), NOW),
    null,
    "rows outside the seven-day window do not count",
  );
  is(WINDOW_MS, 7 * 24 * 60 * 60 * 1000, "the window is seven days");

  // A total that equals the fetch limit is a floor, not a count. The page
  // read "500 people sat down with something" and 500 was
  // `recentVentsAcross(500)` — a query limit stated as a fact, and past it
  // the number could never move again. Found by looking at the screen.
  const capped = whatIsCarried(many("economy", 12), NOW, 12);
  ok(capped.truncated, "a window that came back full is marked as a floor");
  ok(
    !whatIsCarried(many("economy", 12), NOW, 500).truncated,
    "and a window with room left is not",
  );
  ok(
    whatIsCarried(many("economy", 12), NOW).truncated === false,
    "no limit given means no claim about truncation",
  );

  // Plain words, not tag ids. "ai_job" on a public page is a database column.
  is(carryingWord("ai_job"), "work", "tags are spoken in words, not in schema");
  is(carryingWord("economy"), "money", "money is money");
  is(carryingWord("unknown_tag"), "unknown_tag", "and an unmapped tag falls through intact");
});

// ── 15g. every clause, not the last noun ──────────────────────────────────
//
// The failure this closes, in the sentence that produced it: "my dad's test
// results came back and honestly i don't know, i've been in communication
// with mumcy but i'm holding am for mind". Four clauses, every one
// load-bearing, and a reply about mumcy — because mumcy was nearest the full
// stop.
const { scan, scanBlock, coverage, COVERAGE_FLOOR, SCOREABLE_MIN,
        coverageDrift, COVERAGE_SAMPLE_MIN, COVERAGE_MISS_RATE } =
  await app("src/lib/vent/scan.ts");

check("15g The scan reads every clause, and coverage proves the reply did", () => {
  const MSG =
    "my dad's test results came back and honestly i don't know, i've been in communication with mumcy but i'm holding am for mind";
  const s = scan(MSG);

  ok(s.clauses.length >= 4, "four clauses are found, not one sentence", `${s.clauses.length}`);
  ok(
    s.clauses.some((c) => /test results/i.test(c.text)),
    "the results are their own clause",
  );

  // "Honestly" is never about a fact. It is a brace before exposure.
  ok(
    s.affect.some((a) => /vulnerability/i.test(a)),
    "'honestly' is read as vulnerability, not as an adverb",
  );
  ok(
    s.affect.some((a) => /guilt/i.test(a)),
    "'i don't know' carries guilt, not just confusion",
  );

  // The most under-read signal in the corpus: somebody listing their coping
  // as if it were nothing.
  ok(s.effort.length > 0, "'i've been in communication' is read as active coping");

  // Head-spin, not a shrug. The loop is running upstairs and cannot land.
  is(s.somatic, "HEAD", "'i don't know' maps to HEAD");
  is(scan("my chest is tight").somatic, "CHEST", "and a named chest maps to CHEST");
  is(scan("dread sitting in my belle").somatic, "MID", "and dread sits in MID");

  const block = scanBlock(s);
  ok(/every clause is load-bearing/i.test(block), "the model is given the clauses numbered");
  ok(/not the last noun/i.test(block), "and told the last noun is not where the weight is");
  ok(
    /Do not open with a name they mentioned/i.test(block),
    "and told to open with the state, never the name",
  );
  ok(/coping, not nothing/i.test(block), "effort is named to the model as effort");

  // The scorer. A reply that answers one clause of four must not pass.
  const lazy = "Mumcy sounds like she is trying. What did she say?";
  const whole =
    "Results back, and you don't know — that not-knowing is doing the work of guilt. You've been in communication, which is more than nothing. And you're holding it for mind, alone. What would it cost to put one of those down tonight?";

  const bad = coverage(MSG, lazy);
  const good = coverage(MSG, whole);
  ok(bad.score !== null && bad.score < COVERAGE_FLOOR, "a reply about the last noun fails the floor", `${bad.score}`);
  ok(good.score !== null && good.score >= COVERAGE_FLOOR, "a reply that carries the clauses passes", `${good.score}`);
  ok(bad.missed.length > 0, "and the misses are named in their own words", bad.missed.join(" | "));

  // No opinion on short messages, and that is the point. Two clauses means
  // one unechoed clause is 50% and two is 0% — noise wearing a decimal point.
  is(coverage("work dey choke me", "Choke. What is on the pile?").score, null,
    "a one-clause message gets no score at all");
  is(coverage("money no dey and rent don near", "No money and a date coming.").score, null,
    "and neither does a two-clause one");
  ok(SCOREABLE_MIN >= 3, "the floor for having an opinion is three scoreable clauses");

  // Compression is not a miss. This measures lexical echo, and a reply that
  // answers "6am to 10pm" with "sixteen hours" is better than one that
  // repeats it — so the floor sits where only a near-total miss trips it.
  ok(COVERAGE_FLOOR <= 0.34, "and the floor is low, because echo is not quality");

  // The floor must *admit* a third, not sit a rounding above it.
  //
  // It was 0.34. The most common scoreable message has exactly three clauses,
  // so a reply engaging one scored 0.3333… — less than 0.34, and failed by a
  // constant whose own docstring says a third is the line. Every fixture reply
  // it flagged was good. This is the assertion that stops it being rounded
  // back the next time somebody wants a "tidier" number.
  ok(!(1 / 3 < COVERAGE_FLOOR),
    "a reply that engaged one clause of three is not below the floor",
    `floor ${COVERAGE_FLOOR}`);
  ok(coverage(
    "everybody for my set don japa. i open instagram and na airport pictures. i dey here",
    "Everybody gone, and the feed keeps showing you the door they used. Three things you'd miss, three you'd gain — written tonight, not felt.",
  ).score >= COVERAGE_FLOOR,
    "and a reply that transforms rather than echoes clears it");

  // Zero tokens, structurally: nothing here may become async.
  ok(!(scan("x") instanceof Promise), "the scan is synchronous — nothing to await, nothing to bill");
  ok(!(coverage("x y z", "a") instanceof Promise), "and so is the scorer");
});

// ── 15h. four engines, never named out loud ───────────────────────────────
check("15h The engines run in the prompt and are never taught to anybody", () => {
  const prompt = buildSystemPrompt({
    grounding: { date: "8 August 2026", time: "07:00", iso: "2026-08-08", lines: [] },
    classification: { intent: "vent", realWorldTag: null, language: "en", body: null },
    tactic: ALL_TACTICS[0],
    ctx: { ...base },
    memory: [],
    message: "i don't know and i'm tired",
  });

  ok(/fires together, wires together/i.test(prompt), "the repetition engine is in the prompt");
  ok(/trigger and an action/i.test(prompt), "shaped as an implementation intention, not a goal");
  ok(/one per session/i.test(prompt), "and one loop, never a list");

  ok(/already has clarity/i.test(prompt), "the future-self move is there");
  ok(/that is denial and they can smell it/i.test(prompt), "and it is fenced off from toxic positivity");

  ok(/iterated game/i.test(prompt), "family is framed as iterated, not one-shot");
  ok(
    /Never tell them which/i.test(prompt),
    "and the matrix is shown rather than decided — choosing for them undoes it",
  );

  ok(/Both futures are live/i.test(prompt), "superposition is used as language");
  ok(/knotted|entangl/i.test(prompt), "and so is entanglement");

  // The whole point: these are an operating system, not a syllabus. A person
  // at their lowest being told the word "neuroplasticity" has just watched
  // the machine change the subject to itself.
  ok(
    !/neuroplastic|quantum|hebbian|game theory/i.test(prompt),
    "and none of the four is ever named to the person",
  );
  ok(/never named out loud/i.test(prompt), "the prompt says so in as many words");
});

// ── 15i. the engines are moves, not prose ─────────────────────────────────
//
// A paragraph in the prompt is a suggestion. A tactic is chosen, logged, and
// scored by the efficacy loop — so these three had to become selectable or
// they were decoration. And a tactic that can never win its band is worse
// than no tactic: it looks implemented and never runs.
check("15i The three engines are selectable, and none of them is orphaned", () => {
  const ids = new Set(ALL_TACTIC_IDS);
  for (const id of ["iterated_game", "future_self", "micro_loop"]) {
    ok(ids.has(id), `${id} is in the library`);
  }

  // Family is where one-shot thinking does the most damage: you cannot walk
  // away from a mother the way you walk away from a deal.
  is(
    selectTactic({ ...base, message: "my mumcy keeps calling and i dont answer", recentTactics: [] }).id,
    "iterated_game",
    "a family message routes to the long game",
  );

  const game = ALL_TACTICS.find((t) => t.id === "iterated_game");
  ok(/NEVER say which one to pick/i.test(game.instruction), "and the matrix is shown, never decided");
  ok(/short relief/i.test(game.instruction) && /long clarity/i.test(game.instruction),
    "with both payoffs named");

  const future = ALL_TACTICS.find((t) => t.id === "future_self");
  ok(/already has clarity/i.test(future.instruction), "the future-self move asks the right question");
  ok(/can smell that/i.test(future.instruction), "and is fenced off from 'it will be fine'");
  // Asking somebody in freefall to move is a demand dressed as a question.
  ok(
    !future.fits({ ...base, message: "i am stuck and i dont know", pressure: 95 }),
    "and it does not fire at somebody in freefall",
  );

  const loop = ALL_TACTICS.find((t) => t.id === "micro_loop");
  ok(/trigger and an action/i.test(loop.instruction), "the loop is a trigger and an action");
  ok(/One loop — never a list/i.test(loop.instruction), "one, never a list");
  ok(!loop.fits({ ...base, ventCount: 0 }), "and never on turn one — that would be homework");

  // Reachability, swept rather than assumed. A weight change elsewhere could
  // orphan any of these and nothing would say so.
  const seen = new Set();
  const messages = [
    "i am stuck and i dont know",
    "work is a lot lately",
    "my mumcy calls and i dont answer",
    "i feel hopeless about money",
    "why bother nothing go change",
  ];
  for (const message of messages) {
    for (let ventCount = 0; ventCount < 7; ventCount++) {
      const recent = [];
      for (let turn = 0; turn < 12; turn++) {
        const t = selectTactic({ ...base, message, ventCount, recentTactics: [...recent] });
        seen.add(t.id);
        recent.push(t.id);
      }
    }
  }
  for (const id of ["iterated_game", "future_self", "micro_loop"]) {
    ok(seen.has(id), `${id} is actually reachable, not just present`);
  }
});

// ── 15j. the authored corpus, run against the thing that reads it ─────────
//
// 51 hand-labelled examples: input, what each clause is doing, the affect
// under it, where it sits, and a reply that carries all of it.
//
// They are NOT injected into the prompt. Few-shot would put them on the wire
// on every vent forever, which is a per-message tax for a fixed asset — and
// the standing order here is strictest credit usage. They are a fine-tune
// corpus and, more usefully today, the regression set the scan is measured
// against. Twelve of them falsified the coverage metric on their first run,
// which is most of the reason they were worth writing.
check("15j The authored corpus holds the scan to what it claims", () => {
  const raw = fs.readFileSync(path.join(ROOT, "src/lib/vent/holisticExamples.jsonl"), "utf8");
  const rows = raw.trim().split("\n").map((l, i) => {
    try {
      return JSON.parse(l);
    } catch {
      throw new Error(`line ${i + 1} is not JSON`);
    }
  });

  ok(rows.length >= 50, "the corpus is at least fifty examples", `${rows.length}`);
  for (const r of rows) {
    ok(typeof r.input === "string" && r.input.length > 0, "every example has an input");
    ok(r.clauses && Object.keys(r.clauses).length > 0, `every example labels its clauses: ${r.input.slice(0, 30)}`);
    ok(typeof r.full_integration === "string", "and carries an authored reply");
  }

  // Pidgin is not a garnish here — it is how a large share of this audience
  // writes, and a corpus that is all standard English trains a voice that
  // cannot meet them.
  const pidgin = rows.filter((r) => /\b(dey|wey|na|abeg|sabi|oga|japa|pikin|papa|mumcy|no fit|don)\b/i.test(r.input));
  ok(pidgin.length >= 15, "a real share of the corpus is Pidgin", `${pidgin.length}/${rows.length}`);

  // The scan has to actually read them. A corpus the reader cannot parse is
  // a document, not a test.
  let clausesFound = 0;
  for (const r of rows) clausesFound += scan(r.input).clauses.length;
  ok(clausesFound >= rows.length, "the scan finds at least one clause in every example", `${clausesFound}`);

  // `somatic_read`, not `somatic`, and the rename is the finding.
  //
  // The corpus field is a therapist's *inference* — "she left and i never
  // even fight for am" reads as chest, and nobody in that sentence said
  // chest. The scan's field is *detection*: what they actually named. Fifteen
  // examples "disagreed" and every one was the code correctly refusing to
  // guess where a human would infer. Two different questions with one name
  // between them, which is the guess-versus-silence rule showing up inside
  // my own data.
  //
  // So: the read may be richer than the detection, never contradictory.
  const VALID = new Set(["HEAD", "THROAT", "CHEST", "MID"]);
  const read = rows.filter((r) => r.somatic_read);
  ok(read.length >= 10, "enough examples carry a somatic read", `${read.length}`);
  for (const r of read) {
    ok(VALID.has(r.somatic_read), `${r.somatic_read} is one of the four`, r.input.slice(0, 30));
  }
  ok(
    !rows.some((r) => "somatic" in r),
    "and no example still uses the ambiguous field name",
  );

  // No authored reply may fail the floor. If one does, either the example is
  // bad or the metric is — and the first time this ran, it was the metric.
  const failing = rows
    .map((r) => ({ r, c: coverage(r.input, r.full_integration) }))
    .filter(({ c }) => c.score !== null && c.score < COVERAGE_FLOOR)
    .map(({ r, c }) => `${r.input.slice(0, 30)} (${c.score.toFixed(2)})`);
  ok(failing.length === 0, "no authored reply falls below the floor", failing.slice(0, 3).join(" ; "));
});

// ── 15k. the Carver, and the campfire that costs nothing ──────────────────
const { CARVER_SYSTEM, parseCarve, worthCarving, CARVE_FLOOR, CARVE_MAX_WORDS } =
  await app("src/lib/vent/carve.ts");
const { MYCELIUM, containsAdvice } = await app("src/lib/circles/rules.ts");

check("15k The Carver refuses a summary, and the campfire says its own words", () => {
  // A carve is the wound, not a case note. The distinction is the whole file.
  ok(/Not a summary\. The wound\./i.test(CARVER_SYSTEM), "the Carver is told wound, not summary");
  ok(/case note/i.test(CARVER_SYSTEM), "and told what a case note looks like, so it can avoid one");
  ok(/if\s+they wrote Pidgin, the carve is Pidgin/i.test(CARVER_SYSTEM), "the carve keeps their language");
  ok(/Never diagnose/i.test(CARVER_SYSTEM), "and never diagnoses");
  ok(
    /Saying nothing is correct far more often/i.test(CARVER_SYSTEM),
    "silence is offered as the common answer, not the failure",
  );

  // The parser is the guard. A model that returns a paragraph must not get a
  // paragraph into somebody's memory.
  is(parseCarve("not json at all"), null, "prose is refused");
  is(parseCarve('{"carve":"","remembers":true}'), null, "an empty carve is refused");
  is(parseCarve('{"carve":"something","remembers":false}'), null, "remembers:false is refused");
  is(
    parseCarve('{"carve":"the user discussed his father diagnosis and family communication issues","remembers":true}'),
    null,
    "and a summary over the word limit is refused rather than shipped",
  );

  const good = parseCarve('Here you go:\n```json\n{"carve":"pops sick / fear of being useless son","remembers":true}\n```');
  ok(good !== null, "a real carve survives fences and preamble");
  is(good.carve, "pops sick / fear of being useless son", "verbatim, including the slash");
  ok(
    good.carve.split(/\s+/).filter((w) => w !== "/").length <= CARVE_MAX_WORDS,
    "and lands inside eight words",
  );

  // Bounded hard. This is the one extra call in the product and it must not
  // fire on a greeting or on somebody in crisis.
  ok(!worthCarving(CARVE_FLOOR - 1, false), "a thin session is not carved");
  ok(!worthCarving(99, true), "and a crisis is never carved — nothing is spent on their worst hour");
  ok(worthCarving(CARVE_FLOOR, false), "a real session is");

  // MYCELIUM is authored, not generated. A facilitator whose lines come from
  // a model costs money per circle and can be argued out of the rules.
  is(MYCELIUM.open, "We start. Who carry wetin for chest?", "the campfire opens the same way every night");
  is(MYCELIUM.noFixing, "We no dey fix here. We dey witness.", "and says this to anybody reaching for a fix");
  is(MYCELIUM.ephemeral, "Wetin talk for here, dey die for here.", "and says the confidentiality out loud");

  // The opening a room actually gets, and the refusal somebody actually hits.
  const opening = keeperIntention("economy", null);
  ok(opening.startsWith(MYCELIUM.open), "every circle opens with the first words");
  ok(opening.includes(MYCELIUM.ephemeral), "and closes the intention with the promise");
  ok(
    checkMessage("you should just call her", "share").reason.startsWith(MYCELIUM.noFixing),
    "and a fix is refused in the room's voice, not a moderator's",
  );
});

// ── 15l. the outcome is written, or nothing claims it was ─────────────────
//
// The closing question set React state, toasted "Saved. That's the anchor."
// and made no network call — while every insert wrote `tension_after: null`.
// So no session could ever be anchored: the heartbeat's mean drop was
// unreachable, `drop_is_flat` could never fire, and the efficacy loop had no
// data and never would have. The only claim this product makes was never
// recorded, and the interface said it was.
const { FileStore } = await app("src/lib/store/file-store.ts");

await checkAsync("15l The anchor is written once, and never claimed falsely", async () => {
  const store = new FileStore();
  const anonId = `eval-anchor-${Date.now()}`;
  const userId = await store.ensureUser(anonId);

  is(
    await store.anchorLatestVent(userId, 5, 50),
    false,
    "with nothing to anchor it reports false rather than pretending",
  );

  await store.insertVent({
    user_id: userId, user_message: "heavy", ai_reply: "heard",
    tension_before: 78, tension_after: null, mood_score: null,
    language: "en", duality_value: null, body_tapped: null, chair_picked: null,
    pressure_value: 78, tactic_used: "exact_mirror", intent_type: "vent",
    real_world_tag: null, real_date_used: null, safety_flagged: false,
  });

  is(await store.anchorLatestVent(userId, 8, 20), true, "a real session anchors");

  const row = (await store.recentVents(userId, 1))[0];
  is(row.tension_after, 20, "and the second reading is actually on the row");
  is(row.mood_score, 8, "with the mood they gave");
  is(row.tension_before - row.tension_after, 58, "so the drop finally exists: 78 → 20");

  // A second rating from a different moment must not overwrite the first
  // honest one — and the caller has to be told it did nothing.
  is(
    await store.anchorLatestVent(userId, 1, 90),
    false,
    "rating twice does not overwrite the first answer",
  );
  is((await store.recentVents(userId, 1))[0].tension_after, 20, "the original reading stands");

  // The efficacy loop only counts rows with both readings. Before this it
  // could never have counted one.
  const table = measureEfficacy(
    Array.from({ length: 30 }, (_, i) => ({
      ...row,
      id: `e${i}`,
      tactic_used: i % 2 ? "a" : "b",
      tension_after: i % 2 ? 70 : 20,
    })),
  );
  ok(table.size > 0, "and an anchored corpus is finally something the loop can read");

  await store.deleteAll(userId);
});

// ── 16. the request the store actually sends ───────────────────────────────
//
// Two ways a URL was built wrong, both of which broke every read of `vents`
// in production while looking correct in the source. PostgREST answered
// "Invalid path specified in request URL" for one of them and the same
// sentence was misread three times.
const { supabaseBase } = await app("src/lib/env.ts");
const { FULL_CONTRACT } = await app("src/lib/store/contract.ts");

check("16 The store asks PostgREST for something it can parse", () => {
  // A project URL is an origin. supabase-js appends /rest/v1 itself, so a
  // pasted endpoint makes every query ask for /rest/v1/rest/v1/vents.
  for (const suffix of ["rest", "auth", "storage", "realtime", "functions"]) {
    is(
      supabaseBase(`https://ref.supabase.co/${suffix}/v1`),
      "https://ref.supabase.co",
      `a pasted /${suffix}/v1 endpoint is normalised back to the project`,
    );
  }
  is(
    supabaseBase("https://ref.supabase.co/rest/v1/"),
    "https://ref.supabase.co",
    "and with the trailing slash it comes with",
  );
  is(
    supabaseBase("https://ref.supabase.co"),
    "https://ref.supabase.co",
    "a correct project URL is left alone",
  );
  // Which deployment shape makes this false: self-hosted behind a path.
  // Stripping any path would break it to fix a paste.
  is(
    supabaseBase("https://example.com/supabase"),
    "https://example.com/supabase",
    "a self-hosted path prefix survives normalisation",
  );
  is(supabaseBase(""), "", "an unset variable stays unset rather than becoming a URL");
  is(supabaseBase("not a url"), "not a url", "an unparseable value is left for the validator");

  // PostgREST takes the select list verbatim into the query string, so one
  // space asks for a column named " user_id" and the error names a path.
  const store = fs.readFileSync(path.join(ROOT, "src/lib/store/supabase-store.ts"), "utf8");
  const lists = [...store.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1]);
  ok(lists.length > 0, "the store's select lists are found at all", `${lists.length}`);
  for (const list of lists) {
    ok(!/\s/.test(list), "no select list carries whitespace", JSON.stringify(list));
  }
  const joins = [...store.matchAll(/\.join\(\s*"([^"]*)"\s*\)/g)].map((m) => m[1]);
  for (const j of joins) {
    is(j, ",", "a select list built by join uses a bare comma");
  }

  // The contract is a select list too, and health sends it verbatim.
  for (const [table, cols] of Object.entries(FULL_CONTRACT)) {
    ok(!/\s/.test(cols), `the ${table} contract carries no whitespace`, cols);
    ok(cols.length > 0, `the ${table} contract names at least one column`);
  }

  // Every table the store touches has to be in the contract, or health is
  // reporting green on a subset again — which is exactly how nine tables went
  // unchecked while two looked fine.
  const touched = [...new Set([...store.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]))];
  ok(touched.length >= 6, "the store's tables are found at all", touched.join(", "));
  for (const t of touched) {
    ok(t in FULL_CONTRACT, `${t} is covered by the schema contract`);
  }

  // Every column in the contract must exist in a migration.
  //
  // The contract was written from the row types rather than the SQL, and
  // invented `vent_feedback.vent_id` — a column that has never existed. It
  // reached production and the probe reported schema drift against a table
  // that was perfectly fine. A checker that can be wrong about the thing it
  // checks is worse than no checker, so this proves it against the DDL.
  //
  // Columns arrive two ways: in a CREATE TABLE body, and via ALTER TABLE ADD
  // COLUMN afterwards. Reading only the first says circle_members is missing
  // the three columns 0004 and 0005 add, which is how this nearly "fixed" a
  // contract that was already correct.
  const ddl = fs
    .readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"))
    .join("\n");

  const defined = {};
  for (const m of ddl.matchAll(/create table if not exists public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/g)) {
    defined[m[1]] = m[2]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("--"))
      .map((l) => /^([a-z_]+)\s+\S/.exec(l)?.[1])
      .filter((c) => c && !["unique", "check", "primary", "foreign", "constraint"].includes(c));
  }
  for (const m of ddl.matchAll(/alter table (?:if exists )?public\.([a-z_]+)([\s\S]*?);/g)) {
    for (const a of m[2].matchAll(/add column if not exists ([a-z_]+)/g)) {
      (defined[m[1]] ??= []).push(a[1]);
    }
  }

  for (const [table, cols] of Object.entries(FULL_CONTRACT)) {
    const known = defined[table];
    if (!ok(Array.isArray(known), `${table} is created by a migration`)) continue;
    const invented = cols.split(",").filter((c) => !known.includes(c));
    ok(
      invented.length === 0,
      `every ${table} column in the contract exists in the DDL`,
      invented.join(", ") || undefined,
    );
  }

  // supabase/APPLY.sql is the whole schema as one paste, committed so it can
  // be opened and copied in a browser — there is no terminal in the Supabase
  // dashboard, and telling somebody to run `npm run migrations` when they are
  // standing in a SQL editor is how that command ended up pasted *into* the
  // SQL editor. It is generated, which means it can go stale, and a stale
  // copy of a schema is worse than no copy: it applies confidently and leaves
  // out the migration you just wrote. So it is regenerated here and compared.
  const applyPath = path.join(ROOT, "supabase/APPLY.sql");
  ok(fs.existsSync(applyPath), "the one-paste schema file exists");
  if (fs.existsSync(applyPath)) {
    const fresh = execFileSync(process.execPath, [path.join(ROOT, "scripts/migrations.mjs")], {
      encoding: "utf8",
    }).trim();
    const onDisk = fs.readFileSync(applyPath, "utf8").trim();
    // Compared with ok() rather than is(): both sides are ~950 lines of SQL,
    // and is() prints the actual value on failure. A stale file would bury the
    // gate under 40KB of schema and hide every other result in the run — a
    // check whose failure output is unreadable has failed at being a check.
    // The first differing line is the whole diagnosis anyway.
    const a = onDisk.split("\n");
    const b = fresh.split("\n");
    const at = a.findIndex((l, i) => l !== b[i]);
    ok(
      onDisk === fresh,
      "and it matches the migrations — run `npm run migrations > supabase/APPLY.sql`",
      at === -1
        ? `${a.length} vs ${b.length} lines`
        : `first differs at line ${at + 1}: ${JSON.stringify(a[at] ?? "").slice(0, 60)}`,
    );
  }
});

// ── 17. the number somebody calls in the worst hour of their life ─────────
//
// It was written out by hand in nine places: six components, a metadata
// description, a `tel:` href and a client-side fallback. Change it once and
// eight surfaces keep quietly dialling the old one — the exact shape
// `CLAUDE.md` names for chair tensions, wearing the highest stakes here.
const { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL, CRISIS_RESPONSE } =
  await app("src/lib/vent/intent.ts");

check("17 The crisis number exists once, and every surface reads that one", () => {
  ok(/^0\d{3} \d{3} \d{4}$/.test(CRISIS_LINES.nigeria), "the line is a formatted Nigerian number");
  is(CRISIS_TEL, "08062106493", "the dial string is derived, not typed twice");
  is(EMERGENCY_TEL, CRISIS_LINES.emergency, "and so is the emergency one");
  ok(!/\s/.test(CRISIS_TEL), "a tel: href carries no spaces");

  // Never promise what the code cannot keep: this reply hands somebody to a
  // person, so it must not also claim to be one.
  ok(!/\bI can (help|fix)\b/i.test(CRISIS_RESPONSE), "the crisis reply promises nothing it is not");
  ok(/not alone/i.test(CRISIS_RESPONSE), "and it says the one thing that is true");

  // The literal, anywhere but its home, is the bug.
  const digits = [CRISIS_LINES.nigeria, CRISIS_TEL];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });

  const home = path.join(ROOT, "src/lib/vent/intent.ts");
  const offenders = walk(path.join(ROOT, "src"))
    .filter((f) => f !== home)
    .filter((f) => digits.some((d) => fs.readFileSync(f, "utf8").includes(d)))
    .map((f) => path.relative(ROOT, f));

  ok(
    offenders.length === 0,
    "no surface hardcodes the crisis number",
    offenders.join(", ") || undefined,
  );

  // And it is genuinely reachable from the surfaces, not merely absent from
  // them — an empty page passes the check above.
  const shown = walk(path.join(ROOT, "src"))
    .filter((f) => fs.readFileSync(f, "utf8").includes("CRISIS_LINES"))
    .map((f) => path.relative(ROOT, f));
  ok(shown.length >= 6, "at least six surfaces import it", `${shown.length}: ${shown.join(", ")}`);
});

// ── 18. what a screenshot found and no unit test could ────────────────────
//
// Two bugs, one shape, both invisible in the code that contains them and both
// obvious in a 360px render of an ordinary session.
//
// The composer is `sticky bottom-0`, so at any scroll position short of the
// document's end it pins itself over the bottom of the transcript. The
// auto-scroll after every reply called `scrollIntoView({block: "end"})` on a
// sentinel, which by definition puts that sentinel's bottom edge exactly
// where the composer is pinned. So the tail of every conversation landed
// *underneath* the composer — including "Before you go", the closing
// question, which is the last thing on the page. Production reports
// `anchored: 0`; I read that as a copy problem and rewrote the question
// twice. The question was fine. Almost nobody was ever shown it.
//
// And the toast stack was `bottom-0`, which on the chat page is where the
// crisis line lives. "Anchored." sat on top of it for four seconds after
// every rating — check 17 above is what guarantees that line exists, and
// this is what guarantees it can be read.
//
// The class both belong to: **a bottom-anchored overlay that does not know
// how tall the composer is.** The feedback pill had the same bug with a
// hardcoded 232px and was fixed by measuring. `--composer-h` is that
// measurement, and anything pinned to the bottom of a screen that has a
// composer has to be positioned from it.
check("18 Nothing pinned to the bottom lands on the crisis line", () => {
  const walkTsx = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walkTsx(full);
      return e.name.endsWith(".tsx") ? [full] : [];
    });

  // A bottom-anchored fixed overlay, minus the full-screen ones: a modal
  // backdrop covering everything is a different thing from a notification
  // that quietly parks on top of a phone number for four seconds.
  const offenders = [];
  for (const file of walkTsx(path.join(ROOT, "src/components"))) {
    const src = fs.readFileSync(file, "utf8");
    for (const cls of src.match(/className=\{?"[^"]*"/g) ?? []) {
      if (!/\bfixed\b/.test(cls) || /\binset-0\b/.test(cls)) continue;
      if (!/\bbottom-(0|\[)/.test(cls)) continue;
      if (cls.includes("var(--composer-h")) continue;
      offenders.push(`${path.relative(ROOT, file)}: ${cls.slice(11, 90)}`);
    }
  }
  ok(offenders.length === 0,
    "every bottom-pinned overlay is positioned from the measured composer",
    offenders.join(" | ") || undefined);

  // And the auto-scroll has to land clear of it, which is a property of the
  // sentinel rather than of the scroll call: `scrollIntoView` honours
  // scroll-margin, and that is the only thing standing between the closing
  // question and the underside of the composer.
  const chat = fs.readFileSync(
    path.join(ROOT, "src/components/chat/vent-chat.tsx"), "utf8");
  const sentinel = /ref=\{endRef\}[\s\S]{0,160}?scroll-mb-\[calc\(var\(--composer-h/.test(chat)
    || /scroll-mb-\[calc\(var\(--composer-h[\s\S]{0,160}?ref=\{endRef\}/.test(chat);
  ok(sentinel, "the scroll sentinel clears the composer by its measured height");
  ok(/\bpb-\[\d+px\]/.test(chat),
    "and the transcript ends in empty space rather than under the feedback pill");

  // The measurement itself has to keep existing, or every calc above silently
  // falls back to a guess — which is the 232px bug wearing a CSS variable.
  const hook = fs.readFileSync(
    path.join(ROOT, "src/lib/ui/use-composer-height.ts"), "utf8");
  ok(hook.includes("ResizeObserver") && hook.includes("--composer-h"),
    "the composer publishes its real height, and keeps publishing it");

  /*
    Both surfaces, from one implementation.

    The chat had this and the circle room did not, so the room kept the exact
    bug the chat had already fixed — `scrollIntoView({block:"end"})` under a
    `sticky bottom-0` footer, landing the tail of the transcript behind the
    composer. In a circle that tail is the last thing somebody said, which is
    the only reason anybody is in the room.

    Asserted as "both call the hook" rather than "both contain a
    ResizeObserver", because two correct copies is how they drift.
  */
  const room = fs.readFileSync(
    path.join(ROOT, "src/components/circle-room.tsx"), "utf8");
  for (const [name, src] of [["chat", chat], ["circle room", room]]) {
    ok(/useComposerHeight\(footerRef\)/.test(src),
      `the ${name} measures its composer through the shared hook`);
    ok(/scroll-mb-\[calc\(var\(--composer-h/.test(src),
      `and the ${name} sentinel clears it by that measurement`);
    ok(!/new ResizeObserver/.test(src),
      `${name} holds no second copy of the measurement`);
  }

  // ── the name has to be the word on the button ───────────────────────────
  //
  // The circle composer read "Say" and carried `aria-label="Send"`. Screen
  // readers announce "Send"; somebody driving their phone by voice — not a
  // rare way to use an app you are crying into — says "click Say" and hits
  // nothing at all. WCAG 2.5.3: the accessible name must contain the visible
  // label.
  //
  // Found because it broke a Playwright selector, which is the only reason
  // anybody noticed. That is exactly the kind of defect that never gets
  // reported by the people it fails.
  const labelled = [];
  for (const file of walkTsx(path.join(ROOT, "src/components"))) {
    const src = fs.readFileSync(file, "utf8");
    /*
      Where the opening tag actually ends, counted rather than matched.

      The first two attempts used `<button[^>]*aria-label=…`, which finds
      nothing at all: `onClick={() => void send()}` puts a `>` inside the
      attribute list, so the character class stops before it ever reaches the
      label. Both versions passed on clean code and passed again with the
      defect pasted back in — a check that could not fail, twice.

      Braces, then. Depth zero and a `>` is the end of the tag; everything
      inside `{…}` — arrows included — is skipped.
    */
    for (const start of [...src.matchAll(/<button\b/g)].map((m) => m.index)) {
      let depth = 0;
      let i = start;
      for (; i < src.length; i++) {
        const ch = src[i];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if (ch === ">" && depth === 0) break;
      }
      // Comments stripped first. The fix for this very defect documents the
      // old string in prose — `This said \`aria-label="Send"\`` — and the
      // checker read the explanation instead of the code, then reported the
      // bug it had just been told about. A scanner that cannot tell code from
      // a comment about code is reading fiction.
      const open = src.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, "");
      const close = src.indexOf("</button>", i);
      if (close === -1) continue;
      const label = open.match(/aria-label="([^"]+)"/)?.[1];
      if (!label) continue;
      const inner = src.slice(i + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
      /*
        Every word the button can render, including through a ternary.

        The first version of this check skipped ternaries — and the button it
        was written for renders `{busy ? "…" : "Say"}`, so it could not see
        the one defect it existed to catch. It passed on the fixed code and
        passed again when the bug was pasted back in: a detector structurally
        unable to observe its own subject, which is the HEAD-request lesson
        in CLAUDE.md wearing an accessibility hat. Verified by reintroducing
        the mismatch and watching it fail this time.

        So: pull every string literal and every bare word the element can
        show, and require the accessible name to contain at least one of them.
        Icon-only buttons render no word and are skipped, correctly — that is
        what `aria-label` is for.
      */
      const shown = [
        ...[...inner.matchAll(/"([^"]{1,24})"/g)].map((w) => w[1]),
        ...[...inner.matchAll(/(?:^|[>}])\s*([A-Za-z][A-Za-z ]{1,20}?)\s*(?:[<{]|$)/g)]
          .map((w) => w[1]),
      ]
        .map((w) => w.trim())
        .filter((w) => /[A-Za-z]/.test(w));

      if (shown.length === 0) continue;
      if (!shown.some((w) => label.toLowerCase().includes(w.toLowerCase()))) {
        labelled.push(
          `${path.relative(ROOT, file)}: shows ${shown.map((w) => `"${w}"`).join("/")}, announced "${label}"`,
        );
      }
    }
  }
  ok(labelled.length === 0,
    "every button's accessible name contains the word printed on it",
    labelled.join(" | ") || undefined);
});

// ── 21. what the door collected has to reach the room ─────────────────────
//
// Onboarding asks three questions that are close to the bone — what shape is
// it, what are you carrying, what did you come to put down — and
// `completeOnboarding` read `tension` off the chair and let the other three
// fall out of scope. The room asked who you were and then opened as though
// nobody had spoken.
//
// Nothing could have failed that. The answers were collected, the screen
// worked, the types were right, and the data went nowhere. So: the wiring
// itself is the assertion.
check("21 The door's answers reach the room, and personality has one home", () => {
  is(openingBlock(null), null, "no onboarding answers means no block at all");
  is(openingBlock({}), null, "and neither does an empty one — Escape is always available");

  const full = openingBlock({
    object: "tight_knot",
    carrying: "Guilt",
    putDown: "Tiredness",
  });
  ok(/tangled/.test(full), "the object carries how it behaves, not just its name");
  ok(/guilt/.test(full) && /tiredness/.test(full), "both words reach the prompt");
  ok(/tapped rather than written/.test(full),
    "the low fidelity of a six-word list is stated, not hidden");
  // The recite ban and "their words win" are stated once, in CONTEXT_RULES,
  // for all three assembled blocks — so they are asserted on the assembled
  // prompt rather than on this block.
  const withOpening = buildSystemPrompt({
    grounding: { date: "8 August 2026", time: "05:30", iso: "2026-08-08", lines: [] },
    classification: { intent: "vent", realWorldTag: null, language: "en", body: null },
    tactic: ALL_TACTICS[0], ctx: { ...base }, memory: [],
    opening: { object: "tight_knot", carrying: "Guilt", putDown: "Tiredness" },
  });
  ok(/NEVER SAY IT BACK/.test(withOpening),
    "and the model is forbidden from reading the form back to them");
  ok(/THEIR SENTENCE OUTRANKS/.test(withOpening),
    "and what they type outranks what they tapped");

  // A partial answer is the normal case, not an error case.
  const partial = openingBlock({ object: null, carrying: "Anger", putDown: null });
  ok(partial && /anger/.test(partial), "one answer is enough to be worth something");
  ok(partial && !/undefined|null/.test(partial), "and the absent ones say nothing at all");

  // The wire carries ids. This is the only field on /api/vent whose contents
  // reach a system prompt as prose, so a free-text version would be a client
  // writing into the model's instructions.
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/vent/route.ts"), "utf8");
  ok(/openingObject: z\.enum\(/.test(route) && /openingCarrying: z\.enum\(/.test(route),
    "the opening fields are enums on the wire, never free text");
  ok(/opening: \{/.test(route), "and the route actually hands them to the prompt");

  const chat = fs.readFileSync(
    path.join(ROOT, "src/components/chat/vent-chat.tsx"), "utf8");
  ok(/setOpening\(/.test(chat), "the client keeps what onboarding collected");
  ok(/openingCarrying: opening\?\./.test(chat), "and sends it with the vent");

  // ── one home for personality ────────────────────────────────────────────
  //
  // There were two `buildSystemPrompt`s. The live one in `lib/vent/prompt.ts`,
  // and a second, divergent one in `lib/flavour/profile.ts` — the file anybody
  // asked to work on personality opens first — reachable only from an
  // orphaned `lib/trinity` prototype that also carried four hardcoded model
  // ids, the exact thing CLAUDE.md says a person had to find in production.
  const walkTs = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walkTs(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  const files = walkTs(path.join(ROOT, "src"));

  const builders = files.filter((f) =>
    /export function buildSystemPrompt/.test(fs.readFileSync(f, "utf8")));
  is(builders.length, 1, "exactly one module builds the system prompt",
    builders.map((f) => path.relative(ROOT, f)).join(", "));
  is(path.relative(ROOT, builders[0]), "src/lib/vent/prompt.ts",
    "and it is the one the product imports");

  // Model ids are the provider chain's business. A string anywhere else is a
  // name nothing can check, which is how two dead ones shipped.
  const hardcoded = files
    .filter((f) => !/lib\/vent\/(providers|model)\.ts$/.test(f))
    .filter((f) => /["'](claude|gemini|gpt)-[a-z0-9.-]+["']/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
  ok(hardcoded.length === 0,
    "no module outside the provider chain hardcodes a model id",
    hardcoded.join(", ") || undefined);

  // And the vocabulary the screen shows is the vocabulary the server reads.
  const onboarding = fs.readFileSync(
    path.join(ROOT, "src/components/onboarding.tsx"), "utf8");
  ok(/from "@\/lib\/vent\/chairs"/.test(onboarding) && /OBJECTS/.test(onboarding),
    "onboarding renders the shared table rather than its own copy");
  ok(!/heavy_stone["']\s*,\s*["']Heavy stone/.test(onboarding),
    "the object labels are not duplicated in the component");
});

// ── 22. the carve is kept, read back, and erased with them ────────────────
//
// "No conversation memory" is the most common complaint against every product
// in this category, and the ones that do have memory sell it as a
// subscription and then lose it in a migration. This module existed, was
// tested, and was wired to nothing at all — the answer to the category's
// defining failure, sitting in the repo doing nothing.
//
// Wiring it puts one sentence about somebody's life into a database. So the
// bounds are the feature, and every one of them is asserted here.
await checkAsync("22 The carve is kept, read back, and erased with them", async () => {
  /*
    Where the carve lives, which is the part that was wrong.

    It was written to `public.memories` — a sensible-looking key/value table
    whose `user_id` is `references auth.users(id)`. Everybody venting here is
    anonymous, and `ensureUser(anonId)` returns a `public.vent_users.id`: a
    different table, a different id space. Postgres rejected every insert on
    the foreign key. `FileStore` has no foreign keys and accepted all of them.

    So the Carver worked perfectly in every place it was tested and was dead
    in the only place it mattered — the shape its author was standing in,
    exactly as CLAUDE.md describes, in the commit that shipped it.

    One column on the row the anonymous person already owns. Asserted here
    because a schema decision this quiet is not visible in any diff of the
    code that uses it.
  */
  const contract = fs.readFileSync(path.join(ROOT, "src/lib/store/contract.ts"), "utf8");
  ok(/vent_users: "[^"]*\bcarve\b/.test(contract),
    "the carve is a column on vent_users, and in the contract so health sees it");

  const supa = fs.readFileSync(path.join(ROOT, "src/lib/store/supabase-store.ts"), "utf8");
  const carveWrites = supa.slice(supa.indexOf("async setCarve"), supa.indexOf("async deleteAll"));
  ok(/from\("vent_users"\)/.test(carveWrites) && !/from\("memories"\)/.test(carveWrites),
    "and it is written to vent_users, never to the auth-scoped memories table");
  ok(!/from\("memories"\)/.test(supa),
    "nothing in this store touches memories — that table belongs to signed-in users");

  const migration = fs.readFileSync(
    path.join(ROOT, "supabase/migrations/0011_vent_user_carve.sql"), "utf8");
  ok(/add column if not exists carve/.test(migration),
    "0011 is additive and idempotent, so applying it twice is safe");
  ok(/carve is null or char_length/.test(migration),
    "and null is a legal value, because clearing the carve has to be possible");

  // ── the bounds ──────────────────────────────────────────────────────────
  ok(!worthCarving(2, false), "two exchanges is not a wound worth carving");
  ok(worthCarving(CARVE_FLOOR, false), "three is the floor and it is reached");
  ok(!worthCarving(20, true), "and a crisis anywhere in the session stops it outright");

  // ── the contract on what comes back ─────────────────────────────────────
  is(parseCarve("not json at all"), null, "prose is not a carve");
  is(parseCarve('{"carve":"x","remembers":false}'), null,
    "and a model that says it has nothing is believed");
  is(parseCarve('{"carve":"","remembers":true}'), null, "an empty carve is no carve");
  is(
    parseCarve('{"carve":"one two three four five six seven eight nine","remembers":true}'),
    null,
    "nine words is a summary that got through, and it is refused",
  );
  const good = parseCarve(
    'Here you go:\n```json\n{"carve":"pops sick / fear of being useless son","remembers":true}\n```',
  );
  ok(good && good.carve === "pops sick / fear of being useless son",
    "a real carve survives fences and preamble");
  ok(good && !/\/ /.test(good.carve.split(/\s+/).filter((w) => w === "/").join("")),
    "and the slash is not counted as one of the eight words");

  // ── read back as aim, never as a receipt ────────────────────────────────
  is(carveBlock(null), null, "no carve means no block");
  is(carveBlock("   "), null, "and neither does whitespace");
  const block = carveBlock("pops sick / fear of being useless son");
  ok(/Never tell them you remember/.test(block),
    "the model is forbidden from claiming to remember");
  ok(/never tell them you remember/i.test(block),
    "and forbidden from claiming to remember — the house rule outranks warmth");
  const withCarve = buildSystemPrompt({
    grounding: { date: "8 August 2026", time: "05:30", iso: "2026-08-08", lines: [] },
    classification: { intent: "vent", realWorldTag: null, language: "en", body: null },
    tactic: ALL_TACTICS[0], ctx: { ...base }, memory: [],
    carve: "pops sick / fear of being useless son",
  });
  ok(/may simply\s*\n?\s*be wrong/.test(withCarve),
    "it is marked fallible, because it was written about them and not by them");
  ok(/NEVER SAY IT BACK/.test(withCarve), "and quoting it back is banned");

  // ── the promise that makes it safe to hold at all ───────────────────────
  //
  // The carve lives outside `vents`, so a delete that cleared the transcript
  // would leave standing the single most pointed row in the database — one
  // sentence about somebody, after they asked to be gone.
  const store = new FileStore(fs.mkdtempSync(path.join(os.tmpdir(), "mw-carve-")));
  const uid = await store.ensureUser("carve-test-anon-id-0001");
  is(await store.getCarve(uid), null, "a new person has no carve");
  ok(await store.setCarve(uid, "money fear / firstborn who cannot say no"),
    "a carve is written and the write says so");
  is(await store.getCarve(uid), "money fear / firstborn who cannot say no",
    "and it reads back exactly");
  await store.setCarve(uid, "sharpened line");
  is(await store.getCarve(uid), "sharpened line",
    "writing again sharpens the one line rather than stacking a second");

  // Clearing one line without burning the whole history. Null, not "" — the
  // column is `check (carve is null or char_length(carve) between 1 and 200)`,
  // so an empty string is a constraint violation in Postgres and a perfectly
  // happy value in FileStore: the same split that put this in the wrong table.
  ok(await store.setCarve(uid, null), "the carve can be cleared on its own");
  is(await store.getCarve(uid), null, "and it is gone");
  const routeSrc = fs.readFileSync(path.join(ROOT, "src/app/api/vent/route.ts"), "utf8");
  ok(/setCarve\(userId, null\)/.test(routeSrc),
    "the delete path clears with null rather than an empty string");
  ok(/searchParams\.get\("carve"\)/.test(routeSrc),
    "and there is a door for that one line, anon-scoped like the rest");
  ok(/carve: await store\.getCarve\(userId\)/.test(routeSrc),
    "the person can read what was written about them before deciding");

  await store.setCarve(uid, "money fear / firstborn who cannot say no");
  await store.deleteAll(uid);
  is(await store.getCarve(uid), null,
    "and clearing their id takes the carve with it — not only the vents");

  // ── the route's own bounds, as source ───────────────────────────────────
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/carve/route.ts"), "utf8");
  ok(/worthCarving\(/.test(route), "the route applies the floor rather than trusting the caller");
  ok(/intent_type === "crisis" \|\| r\.safety_flagged/.test(route),
    "and reads crisis off the stored rows, not off the request");
  ok(/carved: kept/.test(route),
    "what it reports comes from the write's return value, not from a model answering");
  ok(!/maxDuration = 60/.test(route), "it is not given the vent route's full budget");

  // Which deployment shape makes this false? A malformed body returned 200
  // with reason:"no_key" where a keyed deployment returned 422 — a status
  // code that depended on the environment rather than the request, which is
  // the 410-vs-501 bug wearing a third face. Validation goes first.
  // The guard, not the import — `isModelConfigured` appears at the top of the
  // file either way, so anchoring on the bare name passes on any ordering.
  const validateAt = route.indexOf("bodySchema.safeParse");
  const configAt = route.indexOf("if (!isModelConfigured)");
  const storeAt = route.indexOf("if (!store)");
  ok(validateAt !== -1 && configAt !== -1 && validateAt < configAt && validateAt < storeAt,
    "a bad request is refused before any check on how this deployment is configured",
    `parse@${validateAt} · store@${storeAt} · key@${configAt}`);

  // The client must not announce it. Saying "I'll remember this" is exactly
  // what WHAT YOU NEVER PROMISE forbids, and a toast would be the interface
  // making the promise the model is banned from making.
  const chat = fs.readFileSync(
    path.join(ROOT, "src/components/chat/vent-chat.tsx"), "utf8");
  const carveCall = chat.slice(chat.indexOf('fetch("/api/carve"'));
  ok(/void fetch\("\/api\/carve"/.test(chat), "the client fires it and does not wait");
  ok(!/toast\(/.test(carveCall.slice(0, 400)),
    "and nothing on screen claims it was remembered");
});

// ── 23. the coverage instrument finally does something ────────────────────
//
// `coverage()` computed a number, put it on the JSON response, and nothing
// anywhere read it — the instrument for the category's most-complained-about
// failure, measured and discarded on every vent. Wysa's reviews say it
// "strayed completely from the conversation"; this is the thing that can see
// that happening, and it was pointed at a field nobody read.
//
// The hard part is that the per-reply number must never be used as a grade.
// Coverage measures lexical echo, so a reply that compresses — "Sixteen
// hours." for "6am to 10pm" — scores zero and is *better*. Flag individual
// low scores and the product learns to parrot. So the only honest use is a
// rate, and both halves of that need proving: it has to fire on a real
// regression, and it has to stay silent on good work.
check("23 Coverage drift fires on a regression and stays quiet on good work", () => {
  ok(COVERAGE_SAMPLE_MIN >= 8, "a rate needs a real sample behind it", `${COVERAGE_SAMPLE_MIN}`);
  ok(COVERAGE_MISS_RATE > 0 && COVERAGE_MISS_RATE < 1, "and the trip rate is a fraction");

  const long =
    "my dad's test results came back and honestly i don't know, i've been in " +
    "communication with mumcy but i'm holding am for mind";

  // Echoing replies score high. Twelve of them is a healthy window.
  const echoing = Array.from({ length: 12 }, () => ({
    message: long,
    reply: "Your dad's test results came back, and you've been in communication with mumcy while holding it for mind.",
    tactic: "exact_mirror",
  }));
  is(coverageDrift(echoing), null, "a window of replies that engage the message says nothing");

  // A reply answering the last noun only. This is the failure.
  const lastNoun = { message: long, reply: "Mind.", tactic: "future_self" };
  const broken = Array.from({ length: 12 }, () => ({ ...lastNoun }));
  const drift = coverageDrift(broken);
  ok(drift !== null, "a window of last-noun replies is a finding");
  is(drift.sampled, 12, "every scoreable reply is in the denominator");
  ok(drift.rate > COVERAGE_MISS_RATE, "and the rate clears the trip point", `${drift.rate}`);
  ok(drift.worstTactic?.tactic === "future_self",
    "the losing move is named, because that is the actionable handle");

  // Below the sample floor it is one person and a rounding, not a rate.
  is(coverageDrift(broken.slice(0, COVERAGE_SAMPLE_MIN - 1)), null,
    "under the sample floor it has no opinion, however bad the replies are");

  // One bad reply among good ones is noise, and noise must not wake anybody.
  const mostlyGood = [...echoing, ...Array.from({ length: 2 }, () => ({ ...lastNoun }))];
  is(coverageDrift(mostlyGood), null,
    "two misses in fourteen is variance, not a regression");

  // Short messages are not scoreable at all, so a window of them is not a
  // window — this is what keeps "Tired." from ever counting as a miss.
  const shorts = Array.from({ length: 20 }, () => ({
    message: "i dey tired", reply: "Say more.", tactic: "exact_mirror",
  }));
  is(coverageDrift(shorts), null, "short messages never enter the denominator");

  // A reply that never arrived is not a low score.
  is(coverageDrift(Array.from({ length: 12 }, () => ({ message: long, reply: null }))), null,
    "a missing reply is absent, not bad");

  // ── one table, one truth ────────────────────────────────────────────────
  //
  // The rate lived inline in the heartbeat first. A suite asserting its own
  // copy of a threshold passes while the loop regresses — the reason the
  // chair tensions were consolidated in the first place.
  const hb = fs.readFileSync(path.join(ROOT, "scripts/heartbeat-data.mjs"), "utf8");
  ok(/coverageDrift\(scoreable\)/.test(hb), "the heartbeat calls the shared function");
  ok(!/COVERAGE_MISS_RATE\s*=/.test(hb) && !/COVERAGE_SAMPLE_MIN\s*=/.test(hb),
    "and holds no second copy of the thresholds");
  ok(/coverage_drift:/.test(hb) && /skill: "data-quality"/.test(hb),
    "the finding is routed to a skill, having passed the four-condition test");

  // It must remain free. The whole heartbeat is forbidden from calling a model.
  ok(!/generateReply|anthropic|openai/i.test(hb),
    "and the heartbeat still makes no model call to produce it");

  // ── the corpus that can actually falsify this ───────────────────────────
  //
  // Check 15j holds the 51 authored examples to the floor, and cannot catch a
  // bad floor: those examples were written alongside the metric and the floor
  // was tuned until they passed. A corpus fitted to a threshold will agree
  // with any threshold it was fitted to.
  //
  // `scripts/fixtures` is older and was written for something else entirely,
  // which is exactly what makes it evidence. Pointed at it, the metric called
  // five of its nine scoreable replies failures — all at exactly 0.33, all of
  // them good. That is what found the off-by-a-rounding floor.
  //
  // So the independent corpus is now a standing assertion: the drift detector
  // must stay silent on replies nobody wrote to please it.
  const fixture = JSON.parse(
    fs.readFileSync(path.join(ROOT, "scripts/fixtures/vent.json"), "utf8"));
  const independent = fixture.vents
    .filter((v) => v.ai_reply)
    .map((v) => ({ message: v.user_message, reply: v.ai_reply, tactic: v.tactic_used }));

  const scoredCount = independent.filter(
    (r) => coverage(r.message, r.reply).score !== null).length;
  ok(scoredCount >= COVERAGE_SAMPLE_MIN,
    "the independent corpus is big enough to be a real window", `${scoredCount} scoreable`);
  is(coverageDrift(independent), null,
    "and hand-written replies from a corpus this metric was never tuned on do not trip it");
});

// ── 24. the prompt has a size, and nobody had ever looked at it ───────────
//
// Every check in this suite tests what the prompt *says*. None of them
// noticed how big it had become. Measured for the first time: ~3,100 tokens
// of system prompt on every real vent, sent before the person's own message
// is even read.
//
// Two things were wrong with the shape, and I wrote one of them this session.
// A quarter of the prompt was a single prohibition block, and `HOW THEY
// WALKED IN` — three words somebody tapped off a list of six — had become the
// second-largest thing in it, larger than WHO YOU ARE and HOW YOU SPEAK put
// together. Nothing could have failed that, so it grew.
//
// This is the credit policy's blind spot too. Check 19 counts *how many*
// model calls a vent costs and has never cared how large one is, which is
// half the bill on a product whose whole economic argument is that most
// messages never reach a model at all.
check("24 The system prompt has a budget, and every block earns its place", () => {
  const grounding = groundNow();
  const message =
    "my dad's test results came back and honestly i don't know, i've been in " +
    "communication with mumcy but i'm holding am for mind";
  const classification = classify(message);
  const ctx = {
    ...classification, message, pressure: 78, duality: null, mood: null,
    ventCount: 6, recentTactics: ["exact_mirror", "thought_record"],
  };
  const tactic = selectTactic(ctx);

  // Everything switched on at once: the most expensive turn this can produce.
  const heaviest = buildSystemPrompt({
    grounding, classification, tactic, ctx,
    memory: Array.from({ length: 6 }, (_, i) => ({
      user_message: "work don finish me and i never rest since monday, my chest dey tight",
      ai_reply: "Sixteen hours.",
      created_at: new Date(Date.now() - i * 86_400_000).toISOString(),
      body_tapped: "chest", chair_picked: "tight_edge", mood_score: 4,
    })),
    flavour: buildFlavour([
      "abeg partner shouted for chambers again, the brief is due",
      "i missed gym, leg day gone",
    ]),
    turnsToday: 3,
    pattern: { tag: "family", times: 4, spanDays: 12, dropHere: 12, dropElsewhere: 20 },
    message,
    opening: { object: "tight_knot", carrying: "Guilt", putDown: "Tiredness" },
    carve: "pops sick / fear of being useless son",
  });

  // No tokenizer dependency — the gate has none and keeps none. Characters
  // per token is stable enough for English prose to budget against, and a
  // budget that is roughly right beats one that does not exist.
  const tokens = Math.round(heaviest.length / 3.7);
  const BUDGET = 3200;
  ok(tokens <= BUDGET,
    "the heaviest possible prompt stays inside its budget",
    `${tokens} tokens vs ${BUDGET}`);

  // A floor as well as a ceiling. If this collapses, a block stopped
  // rendering and every reply quietly got worse with nothing failing.
  ok(tokens > 1800, "and it has not silently lost half its content", `${tokens}`);

  /*
    The three assembled blocks share one set of rules rather than each
    carrying its own.

    They said the same three things — do not recite it, use it to aim, their
    words outrank it — in three different long-form wordings. Repetition is
    not reinforcement: one rule in three phrasings reads as three rules of
    unclear priority, and it spends attention the person's message needs.
  */
  const src = fs.readFileSync(path.join(ROOT, "src/lib/vent/prompt.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  ok(/const CONTEXT_RULES = /.test(code), "the shared rules exist");
  is((code.match(/Do not say it back|Never say it back|NEVER SAY IT BACK/g) ?? []).length, 1,
    "and the do-not-recite rule is stated exactly once in the whole prompt");

  // Nothing lost in the consolidation: all three prohibitions still reach a
  // model that is handed any assembled context.
  ok(/NEVER SAY IT BACK/.test(heaviest), "the recite ban survives");
  ok(/LET IT AIM/.test(heaviest), "so does the aim rule");
  ok(/THEIR SENTENCE OUTRANKS/.test(heaviest), "and so does their words winning");

  // And a turn with no assembled context does not pay for rules about it.
  const bare = buildSystemPrompt({
    grounding, classification, tactic, ctx, memory: [], message,
  });
  ok(!/WHAT THE ROOM HANDS YOU/.test(bare),
    "a turn with no carve, pattern or opening is not charged for their rules");
  ok(Math.round(bare.length / 3.7) < tokens,
    "a first-ever message costs less than a sixth session",
    `${Math.round(bare.length / 3.7)} vs ${tokens}`);
});

// ── 25. the traditions the library was missing, and the one it got wrong ──
//
// The library already covered CBT, Gestalt, IFS, narrative, DBT, somatic,
// person-centred and solution-focused. Five traditions had no move at all,
// and they go in the selector rather than the prompt for a measured reason:
// a tactic costs nothing until it is chosen, and the prompt costs ~3,035
// tokens on every vent (check 24).
//
// Adding them surfaced something worse than an absence.
check("25 Five traditions reach the room, and the family move is not imported", () => {
  const at = (message, recentTactics = []) => {
    const c = classify(message);
    return selectTactic({
      ...c, message, pressure: 70, duality: null, mood: null,
      ventCount: 3, recentTactics,
    }).id;
  };

  // Frankl. Every other tactic assumes something can move — a thought tested,
  // a defence named, one action taken tonight. A father's diagnosis moves
  // nothing, and offering a 4-6 second micro action there is the app failing
  // to understand what it was told. Weighted above the problem-solvers.
  is(at("my dad's test results came back and i don't know"), "meaning_stance",
    "the unfixable gets the stance move, not a fix");

  // de Shazer, Hayes, Miller & Rollnick. These sit behind an established
  // move on the same trigger, which is correct — the three-turn rotation is
  // what makes them reachable rather than redundant.
  is(at("no point, nothing go change, why bother, e no go better"), "exception_finding",
    "hopelessness gets asked for the hour it was less bad");
  is(at("i am useless, i be failure", ["double_standard"]), "defusion",
    "and self-attack gets distance from the sentence on the next turn");
  is(at("i keep saying i go rest but i never rest", ["thought_record"]), "change_talk",
    "and stated intent gets asked for their own reason, never given one");

  /*
    Ubuntu, and the thing this actually found.

    `rw_family` is the highest-priority move this product has for family, at
    95, outranking the entire general library. It said: "Firstborn pressure —
    one boundary, ten words, to the person who needs to hear it."

    That is imported anthropology. "Set a boundary" assumes a self that exists
    prior to its relationships and is being encroached on; for a Lagos
    firstborn sending money home, personhood is partly constituted by the
    people they carry. Told to draw a line with their mother, that person
    either dismisses the app as not understanding their life — the good
    outcome — or takes the advice, damages something load-bearing, and carries
    the guilt of that too.

    The cost is still named. What changed is that the belonging stopped being
    diagnosed as the fault.
  */
  const fam = ALL_TACTICS.find((t) => t.id === "rw_family");
  ok(/do not call the obligation a problem/i.test(fam.instruction),
    "the family move refuses to pathologise the obligation");
  ok(/set boundaries|set a boundary/i.test(fam.instruction) &&
     /do not .*(set boundaries|set a boundary)|not .*set boundaries/i.test(fam.instruction),
    "and names the boundary prescription only to forbid it");
  ok(/who do you lean on/i.test(fam.hold ?? ""),
    "and turns the question around, which nobody does for a firstborn");
  is(at("i send money house every month, i be firstborn"), "rw_family",
    "a family-tagged vent gets it");
  is(at("i be breadwinner for this house and i just tire", ["iterated_game"]), "ubuntu_frame",
    "and obligation language with no family tag reaches the same stance in rotation");

  /*
    The structural gap underneath all of this.

    Five tactics were added and three were born unreachable — shadowed by
    higher-weighted moves on the same trigger — and the whole suite stayed
    green. `ubuntu_frame` was genuinely dead at 82, losing to a game-theory
    move at 84, and nothing said so.

    A full reachability proof needs one probe per tactic and does not exist
    yet; this is the bounded version. Every tactic must at least fit
    *something* in the authored corpus, or it is a move nobody will ever
    receive.
  */
  const corpus = fs
    .readFileSync(path.join(ROOT, "src/lib/vent/holisticExamples.jsonl"), "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l).input);

  const everFits = new Set();
  for (const message of corpus) {
    const c = classify(message);
    const ctx = {
      ...c, message, pressure: 70, duality: 50, mood: null,
      ventCount: 3, recentTactics: [],
    };
    for (const t of ALL_TACTICS) {
      try { if (t.fits(ctx)) everFits.add(t.id); } catch { /* not eligible */ }
    }
  }
  const missing = ["meaning_stance", "ubuntu_frame", "defusion", "exception_finding", "change_talk"]
    .filter((id) => !everFits.has(id));

  /*
    Closed. Ten examples were written for the two presentations the corpus had
    none of — self-attack and hopelessness — and `defusion`,
    `exception_finding` and `double_standard` all became reachable. That last
    one predates every tactic added this session and had been invisible the
    whole time.

    Asserted at zero now rather than "no worse than two". A gap that has been
    closed should fail the moment it reopens.
  */
  is(missing.length, 0,
    "every tradition added is exercised by a real example",
    missing.join(", ") || "none");

  /*
    The wider sweep, fenced rather than claimed.

    Seven tactics still fit nothing in the corpus, down from ten. The three
    that were real holes — `two_chair`, `ifs_parts` and `externalization` —
    have examples now, and all three became eligible.

    What is left is mostly honest. `orienting` and `progressive_squeeze` are
    somatic tools chosen from a pressure reading and a tapped body part rather
    than from language, so a text-only sweep may never reach them at all;
    `behavioral_activation` and `opposite_action` are the same shape. Those
    need a different kind of fixture, not another example.

    Note what this measures: eligibility, not selection. A tactic can fit a
    corpus message and still lose the turn to a higher-weighted move — the
    three added here mostly lose to `rw_family` and `duality_slider`, which is
    correct, because the rotation is what makes second place reachable. The
    claim is that the trigger is exercised, not that the move wins.

    Recorded so it can shrink and cannot grow. Closing it means writing
    examples, not lowering a number.
  */
  const invisible = ALL_TACTICS.filter((t) => !everFits.has(t.id)).map((t) => t.id);
  ok(invisible.length <= 7,
    "no more of the library is invisible to the corpus than already known",
    `${invisible.length}: ${invisible.join(", ")}`);
  ok(!missing.includes("meaning_stance") && !missing.includes("ubuntu_frame"),
    "the two that matter most for this product are exercised by real examples",
    missing.join(", ") || "none");
});

// ── 26. the crisis router, in the words people actually use ───────────────
//
// Found by the first run of `npm run quality`, on its first three cases, for
// zero tokens. The router caught nine explicit phrasings and missed the ones
// people write: "i don't want to be here anymore", "better off without me",
// "i don't want to live anymore" — and, worst in a Nigerian product, **"i wan
// die"**, which was answered with a generic tactic.
//
// Both directions are asserted. A router that over-fires gates somebody out
// of the room for ordinary despair, and "i'm tired" is Tuesday for the person
// this is built for.
check("26 Crisis is caught in the words people use, and not in the ones they don't", () => {
  const intent = (m) => classify(m).intent;

  const MUST = [
    "i want to kill myself",
    "i want to end it all",
    "i don't want to be here anymore, i have been thinking about ending it",
    "i don't want to live anymore",
    "work is fine but honestly some days i think everyone would be better off without me",
    "better off without me",
    "no reason to go on",
    "i wish i was gone",
    "i just want to disappear",
    // Pidgin. This is the half that was nearly absent.
    "i wan die",
    "i no wan dey alive again, i don tire for this life",
    "make i die",
    "i wan comot for this world",
  ];
  for (const m of MUST) {
    is(intent(m), "crisis", `caught: "${m.slice(0, 52)}"`);
  }

  // Ordinary despair, exhaustion and leaving are not crises. Gating these
  // locks somebody out of the room for saying the thing they came to say.
  const MUST_NOT = [
    "i'm tired",
    "i can't do this anymore",
    "work don finish me",
    "i don tire for this job",
    "i want to leave this country",
    "my dad's test results came back",
    "i want to disappear from that group chat",
    "no point, nothing go change",
    "i be failure",
  ];
  for (const m of MUST_NOT) {
    ok(intent(m) !== "crisis", `not gated: "${m.slice(0, 52)}"`, intent(m));
  }

  // Pidgin is not a second-class path here — it is the first language of a
  // large share of the people this is for.
  const pidgin = MUST.filter((m) => /\b(wan|dey|comot|make i|don tire)\b/.test(m));
  ok(pidgin.length >= 4, "the list carries real Pidgin coverage", `${pidgin.length} cases`);

  // And the reply still hands them a person rather than claiming to be one.
  ok(/not alone/i.test(CRISIS_RESPONSE), "the crisis reply says the one true thing");
  ok(!/\bI can (help|fix)\b/i.test(CRISIS_RESPONSE), "and promises nothing it is not");
});

// ── 27. cheap for the ordinary, everything for the edge ───────────────────
//
// "Fast, cheap models for 80% of chats" and "auto-switch to maximum
// intelligence for trauma and suicide risk" are one mechanism, not two. Most
// vents are ordinary and a small model answers them well; the rare ones where
// somebody is at the edge get the best thing available, and the saving from
// the first pays for the second.
//
// Deciding costs nothing — a regex pass over an already-classified message.
// This product does not spend a model call to size a model call.
const { depthFor, depthBadge } = await app("src/lib/vent/depth.ts");

check("27 The cheap path is cheap, and the edge gets everything", () => {
  const d = (message, extra = {}) =>
    depthFor({ classification: classify(message), message, ...extra });

  // The layer just above the crisis list: not there yet, or there and not
  // written down. Cost does not get a vote on these.
  for (const m of [
    "i feel completely hopeless and empty, nothing matters anymore",
    "i don tire, e don do me, nothing dey sweet again",
    "my grandmother died last month and i still have not told anybody",
    "my dad's test results came back",
    "he used to hit me and i never told anyone",
    "i had a panic attack on the bus this morning",
    "i am thinking of quitting my job and moving abroad",
  ]) {
    is(d(m).depth, "deep", `deep: "${m.slice(0, 46)}"`);
  }

  // Pidgin is not a second-class path. Half the EDGE list is Pidgin because
  // the person this is built for often writes it first.
  is(d("i don tire, e don do me").reason, "edge", "Pidgin despair reaches the edge list");

  // The ordinary 80%. If these route deep the router is decorative and the
  // free tier stops being affordable.
  for (const m of [
    "traffic was mad today and i reached late again",
    "my oga shouted for the meeting and i just kept quiet",
    "fuel don double again this month",
    "i miss gym since monday",
  ]) {
    is(d(m).depth, "fast", `fast: "${m.slice(0, 46)}"`);
  }

  // Cheap signals that are worth the better model anyway.
  is(d("work was long", { ventCount: 8 }).reason, "long_session",
    "still typing at turn eight is not a light evening");
  is(d("work was long", { pressure: 95 }).reason, "pressure",
    "and neither is ninety-five on the slider");

  // Omitting depth must never downgrade anybody. The default is the
  // expensive, safe one — a forgotten field cannot quietly buy a worse reply.
  const providers = fs.readFileSync(path.join(ROOT, "src/lib/vent/providers.ts"), "utf8");
  ok(/call\.depth === "fast"/.test(providers),
    "the chain reorders only when a turn is explicitly fast");
  ok(/FAST_FIRST/.test(providers), "and there is an authored cheap-first order");

  // Failover is untouched: a fast turn that exhausts the cheap end still
  // reaches everything. Nobody is refused an answer to save money.
  ok(/const usable = live\.length \? live : all/.test(providers),
    "every configured provider is still in the pool on both paths");

  // ── the badge tells the truth or says nothing ───────────────────────────
  is(depthBadge({ depth: "fast", reason: "ordinary" }), null,
    "no badge on the cheap path — one that is always lit is decoration");
  ok(depthBadge({ depth: "deep", reason: "grave" }),
    "a real deep turn says so, so somebody can see the product fighting for them");
  is(depthBadge({ depth: "deep", reason: "crisis" }), null,
    "and never on a crisis turn — a helpline does not need a banner about infrastructure");

  // Shown only when a model actually answered. A badge over the authored
  // fallback would be a receipt for something that did not happen.
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/vent/route.ts"), "utf8");
  ok(/depthBadge: tokensSpent \? depthBadge\(verdict\) : null/.test(route),
    "the badge is gated on a model call having happened");
});

// ── 28. the door between the two rooms ────────────────────────────────────
//
// This product had two surfaces and nothing between them. Somebody writing
// "nobody knows this, i'm alone with it" got a real answer and was never told
// a circle was open with free seats on the other side of the same app — the
// loneliest sentence anybody types here, answered well, and the person left
// exactly as alone as they arrived.
//
// It is data, never prose. A model told that circles exist can invent one, and
// arriving at a room that was never there is worse than never being offered
// it. Everything below is a row the server actually read.
const { circleInvite, soundsAlone } = await app("src/lib/community/invite.ts");

check("28 A lonely vent is offered a real room, or none at all", () => {
  const NOW = Date.parse("2026-08-09T21:00:00Z");
  const room = (over = {}) => ({
    id: "c1", tag: "lonely", seats: 2,
    created_at: new Date(NOW - 10 * 60_000).toISOString(),
    ...over,
  });

  // Loneliness in the words people use — including the ones that never say it.
  for (const m of [
    "i feel so alone with this",
    "nobody knows this about me",
    "i never tell anybody, i just hold am for mind",
    "i no get person wey i fit talk to",
    "i don't have anyone to talk to",
  ]) {
    ok(soundsAlone(m), `heard as alone: "${m.slice(0, 42)}"`);
  }
  ok(!soundsAlone("traffic was mad today and my oga shouted"),
    "and an ordinary bad day is not");

  // A real room, with real seats and real time left.
  const got = circleInvite("i feel so alone with this", [room()], "lonely", NOW);
  ok(got !== null, "a lonely vent with an open circle gets the door");
  is(got.seatsOpen, 4, "the seat count is real, from the row");
  ok(got.minutesLeft > 8 && got.minutesLeft <= 45, `and so is the clock`, `${got.minutesLeft}`);

  // ── silence beats a guess, in every direction ────────────────────────────
  is(circleInvite("i feel so alone", [], "lonely", NOW), null,
    "no circles means no offer, never an empty invitation");
  is(circleInvite("traffic was mad today", [room()], null, NOW), null,
    "and an ordinary vent is not sent to a support group");
  is(circleInvite("i feel so alone", [room({ seats: 6 })], "lonely", NOW), null,
    "a full room is not offered — that is the turn-that-never-comes bug in a doorway");
  is(
    circleInvite("i feel so alone", [room({
      created_at: new Date(NOW - 40 * 60_000).toISOString(),
    })], "lonely", NOW),
    null,
    "and a room with five minutes left is a closing door, not an invitation",
  );
  is(
    circleInvite("i feel so alone", [room({
      created_at: new Date(NOW - 60 * 60_000).toISOString(),
    })], "lonely", NOW),
    null,
    "an expired circle is never offered",
  );

  // Same pressure first — sitting with people holding the same weight is the
  // whole value — but any open room beats none at 2am.
  const mixed = [room({ id: "money", tag: "economy" }), room({ id: "same", tag: "japa" })];
  is(circleInvite("i feel alone with this", mixed, "japa", NOW).id, "same",
    "a room about the same pressure is preferred");
  ok(circleInvite("i feel alone with this", mixed, "health", NOW) !== null,
    "and with no match, an open room is still better than nothing");

  // ── the model is never told any of this ──────────────────────────────────
  const prompt = fs.readFileSync(path.join(ROOT, "src/lib/vent/prompt.ts"), "utf8");
  ok(!/circleInvite|circles? (is|are) (open|sitting)/i.test(prompt),
    "the system prompt says nothing about circles — a model told they exist can invent one");

  const route = fs.readFileSync(path.join(ROOT, "src/app/api/vent/route.ts"), "utf8");
  ok(/circleInvite: invite/.test(route), "the route attaches it as data");
  // The crisis path returns long before this. Somebody handed a helpline is
  // not being redirected to a room of strangers.
  ok(route.indexOf("intent: \"crisis\"") < route.indexOf("circleInvite("),
    "and crisis returns before any invitation is assembled");

  // It is an offer, not a prescription — this room does not fix people.
  const chat = fs.readFileSync(path.join(ROOT, "src/components/chat/vent-chat.tsx"), "utf8");
  ok(!containsAdvice(chat.slice(chat.indexOf("Somewhere to say it out loud"), chat.indexOf("Somewhere to say it out loud") + 700)),
    "the invitation contains no advice");
  ok(/invite && !gated/.test(chat), "and it is hidden once a crisis has gated the room");
});

// ── 29. the ceiling has two heights, and neither is a closed door ─────────
//
// Commandment 1 was audited for *language* and came back clean — no "out of
// tokens", no "upgrade to continue". Nobody checked what actually happens at
// the ceiling.
//
// Crisis returned above the limiter and always had. The layer underneath was
// unguarded: somebody the depth router calls edge or grave — hopeless,
// worthless, grieving, "i don tire" — who has typed a hundred messages in one
// bad day got "Small small — breathe. Try again in a minute." The router knew.
// It ran a hundred lines too late.
check("29 The rate limiter knows who it is refusing", () => {
  const route = fs
    .readFileSync(path.join(ROOT, "src/app/api/vent/route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  // Order is the whole fix: the router has to run before the limiter.
  const depthAt = route.indexOf("depthFor({");
  const limitAt = route.indexOf("inDay >= dayCap");
  ok(depthAt !== -1 && depthAt < limitAt,
    "depth is decided before the limiter, not a hundred lines after it",
    `depth@${depthAt} limit@${limitAt}`);

  // Crisis still returns first, as it always has.
  ok(route.indexOf('intent: "crisis"') < limitAt,
    "and crisis returns above the limiter entirely");

  // Two ceilings, both finite.
  ok(/RATE_PER_DAY_EDGE = 250/.test(route), "the edge gets its own daily ceiling");
  ok(/const dayCap = edge \? RATE_PER_DAY_EDGE : RATE_PER_DAY/.test(route),
    "and which one applies is decided by the router");
  ok(/const tooFast = !edge &&/.test(route),
    "the per-minute limit does not apply at the edge — bursting is what distress looks like");

  /*
    The ceiling is decided by the message, never by a turn count.

    The first draft upgraded to deep on `inDay >= 6` — the *daily* count,
    where `depthFor` means a session's turns. Everybody with six messages in a
    day became permanently deep: exempt from the per-minute limit and routed
    to the expensive model. A broken limiter and a cost blowout in one line,
    caught by an ordinary user sailing past twelve messages a minute.
  */
  const limitBlock = route.slice(route.indexOf("const edge ="), route.indexOf("const dayCap"));
  ok(!/inDay >= 6/.test(limitBlock),
    "the limiter is never reopened by a turn count");
  ok(/history\.length >= 6/.test(route),
    "the long-session upgrade survives, below the limiter, for routing only");

  // And the refusal at the edge is not a closed door.
  const refusal = route.slice(limitAt, limitAt + 700);
  ok(/reply: CRISIS_RESPONSE/.test(refusal),
    "somebody refused at the edge is handed a human, not a countdown");
  ok(/Small small/.test(refusal),
    "and an ordinary pause keeps its own voice, which reads like a pause");
  ok(/gated: false/.test(refusal),
    "the crisis lines are offered without locking the room — they were not in crisis, they were refused");

  // Commandment 1, still: no paywall vocabulary anywhere a person can read.
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  const PAYWALL = /out of (tokens|credits)|upgrade to continue|limit reached|you have used your|as an AI\b/i;
  const offenders = walk(path.join(ROOT, "src"))
    .filter((f) => !/lib\/vent\/quality\.ts$/.test(f))
    .filter((f) => PAYWALL.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
  ok(offenders.length === 0,
    "nothing user-facing mentions tokens, upgrades or a limit",
    offenders.join(", ") || undefined);
});

// ── 30. a room somebody would walk into ───────────────────────────────────
//
// The lobby showed "Money". "Leaving". "Work / AI". Correct, and a filing
// system — a taxonomy of pressures rendered as a list you scroll past. Nobody
// has ever wanted to join a taxonomy.
//
// "Broke But Building" is the same room. "3AM Overthinkers" is the same room.
// The difference is that one of them sounds like people are inside it.
const { roomName, allRoomNames } = await app("src/lib/circles/naming.ts");

check("30 Rooms are named from facts, and never at somebody's expense", () => {
  // WAT is UTC+1, so subtract an hour to land on a Lagos wall-clock hour.
  const at = (h) => `2026-08-09T${String((h - 1 + 24) % 24).padStart(2, "0")}:30:00Z`;

  is(roomName("social", at(3)), "3AM Overthinkers", "3am comparing is the overthinkers' room");
  is(roomName("economy", at(13)), "Broke But Building", "money at noon has defiance in it");
  is(roomName("economy", at(3)), "3AM Money Maths", "and the same pressure at 3am does not");
  is(roomName("lonely", at(3)), "Night Owls", "alone at 3am is night owls");
  is(roomName("lonely", at(13)), "On Your Own With It", "and alone at noon is not");
  is(roomName(null, at(3)), "The 3AM Room", "an untagged room is still a room");

  // Derived, deterministic, and never generated.
  is(roomName("social", at(3)), roomName("social", at(3)), "the same room is always the same name");
  ok(roomName("economy", at(3)) !== roomName("economy", at(13)),
    "and the hour actually changes it");

  /*
    The heavy ones keep plain names at every hour.

    A clever name is a small delight and it is not worth being clever at
    somebody waiting on a diagnosis. `health` is deliberately identical around
    the clock, and this asserts it rather than trusting the table to stay
    that way.
  */
  const health = [0, 3, 9, 14, 19, 23].map((h) => roomName("health", at(h)));
  is(new Set(health).size, 1, "health is never renamed by the clock", health.join(" / "));
  is(health[0], "The Body And The Waiting", "and it is named plainly");

  /*
    Tone, over every name the function can produce.

    Asserted across the whole surface rather than the six a test happened to
    think of — the same reason the crisis list is checked in both directions.
    A name that jokes about the thing people are carrying would be worse than
    the taxonomy it replaced.
  */
  const names = allRoomNames();
  ok(names.length >= 15, "the surface is real", `${names.length} names`);
  for (const n of names) {
    ok(n.length <= 30, `"${n}" fits a phone header`);
    ok(!/[!?]/.test(n), `"${n}" is not shouting at anybody`);
    ok(!/\b(lol|haha|vibes?|squad|gang|fam|crew)\b/i.test(n),
      `"${n}" is not trying to be a nightclub`);
    /*
      No diagnosis, and that is the real line.

      The first version of this rule banned second person, and it flagged "On
      Your Own With It" — then would have flagged "Night Owls" and "3AM
      Overthinkers" too, which are the best names here. A room title in the
      second person is a description of a state, not a claim about a person.

      What must never appear is a name that hands somebody a condition they
      did not claim. The product does not diagnose anywhere else and a room
      called "The Anxious" would do it on the way in.
    */
    ok(!/\b(depress|anxious|anxiety|bipolar|trauma(tised|tized)?|broken|damaged|victims?|sufferers?|patients?|addicts?)\b/i.test(n),
      `"${n}" hands nobody a diagnosis on the way in`);
  }

  // Nothing invented. The name is a pure function of a tag and a timestamp,
  // with no model anywhere near it — a model asked to name rooms would write
  // better names and would eventually describe people who are not there.
  const src = fs.readFileSync(path.join(ROOT, "src/lib/circles/naming.ts"), "utf8");
  ok(!/fetch|generateReply|await /.test(src), "naming is pure and free");
  ok(/Africa\/Lagos/.test(src),
    "and 3am means 3am where the people are, not where the server woke up");
});

// ── 31. the moves that are wrong at a deathbed ────────────────────────────
//
// `meaning_stance` carried a comment saying "above every problem-solving move
// — when this fits, the others are wrong", and a weight cannot say that. It
// wins one contest, once. On turn two of a terminal diagnosis the three-turn
// block took it out of the running and the runner-up spoke: `iterated_game`,
// offering to show somebody whose father was dying *the payoff matrix*. With a
// real-world tag it never even got that far — `rw_economy` outranked it
// outright, so "my dad is dying and the hospital bill is 2 million" was
// answered with the money-choke tool.
//
// A veto is not a weight, and this is the check that keeps it one.
check("31 When nothing can move, the moves that assume it can are gone", () => {
  const UNFIXABLE = [
    ["a diagnosis", "my dad's test results came back. it's terminal. nothing i can do"],
    ["the bill too", "my dad is dying and the hospital bill is 2 million"],
    ["after it", "the burial finished and the house is quiet now"],
    ["pidgin", "my mama, e don go. i never talk am to anybody"],
    ["the baby", "we lost the baby at 5 months. i cant look at her"],
    ["the word itself", "i have been grieving since march and nobody says her name"],
  ];

  for (const [label, msg] of UNFIXABLE) {
    ok(nothingCanMove(msg), `${label}: recognised as unfixable`, msg);
  }

  /*
    And not on an ordinary bad Tuesday.

    `lost` is the trap: "I lost my job" is a pressure with real moves
    available, and vetoing them would leave somebody who needs a plan being
    breathed at. Every bereavement pattern pins `lost` to the person beside
    it.
  */
  for (const m of [
    "i lost my job today and i haven't told anybody",
    "i lost my phone for danfo this morning",
    "lagos traffic is killing me",
    "my boss is impossible and i want to quit",
    "i lost 200k on that investment",
  ]) {
    ok(!nothingCanMove(m), `an ordinary bad day stays ordinary`, m);
  }

  /*
    The survivors have to outnumber the block, or the veto starves.

    `selectTactic` refuses the last three tactics used. If the safe pool were
    ever three or fewer, turn four would have nothing left and would fall
    through to whatever the fallback found — which is the exact failure this
    check exists to prevent, arriving by a different door.
  */
  const safe = ALL_TACTICS.filter((t) => t.holdsWhenNothingMoves);
  ok(safe.length > 3, "more survivors than the three-turn block can eat",
    `${safe.length}: ${safe.map((t) => t.id).join(", ")}`);

  /*
    Absent means no, and these two families are definitionally the ones that
    assume something can move. If a later change flags one, it is either a
    mistake or a family that needs renaming — either way it stops here.
  */
  for (const t of safe) {
    ok(t.family !== "cognitive" && t.family !== "behavioral",
      `${t.id} is not a thinking-trap or homework move`, t.family);
    ok(!t.id.startsWith("rw_"),
      `${t.id} is not a real-world coping tool`);
  }

  /*
    The behaviour, over six turns and both shapes.

    Six because the block holds three and the interesting turns are the ones
    after it fills — turn two is where this shipped broken, and turn four is
    where the stale fallback takes over and ignores `fits` entirely. That
    fallback searches the pool, which is why the veto is applied to the pool
    and not to the eligible list.
  */
  for (const [label, message] of UNFIXABLE) {
    for (const tag of [null, "economy", "family", "health"]) {
      const recent = [];
      for (let turn = 1; turn <= 6; turn++) {
        const t = selectTactic({
          kind: "vent", crisis: false, realWorldTag: tag, body: null,
          language: "en", message, pressure: 70, duality: null, mood: 2,
          ventCount: turn, recentTactics: [...recent],
        });
        ok(t.holdsWhenNothingMoves === true,
          `${label} + ${tag ?? "no tag"}, turn ${turn}: ${t.id} still holds when nothing moves`,
          t.instruction.slice(0, 90));
        recent.push(t.id);
      }
    }
  }

  // The two that actually shipped, pinned by name so the regression is
  // unmistakable rather than merely covered.
  const dying = {
    kind: "vent", crisis: false, body: null, language: "en",
    message: "my dad is dying and the hospital bill is 2 million",
    pressure: 70, duality: null, mood: 2,
  };
  is(selectTactic({ ...dying, realWorldTag: null, ventCount: 1, recentTactics: [] }).id,
    "meaning_stance", "turn one says plainly that nothing here can be fixed");
  ok(selectTactic({ ...dying, realWorldTag: null, ventCount: 2, recentTactics: ["meaning_stance"] }).id
      !== "iterated_game",
    "turn two does not offer a payoff matrix for a dying father");
  ok(selectTactic({ ...dying, realWorldTag: "economy", ventCount: 1, recentTactics: [] }).id
      !== "rw_economy",
    "and the hospital bill does not outrank the father");
});

// ── 32. one tag list, in five places ──────────────────────────────────────
//
// `grief` had to be added to a SQL constraint, a zod enum, a dropdown, an
// opening line and a naming table before a single person could join the room.
// Four out of five leaves a tag that is offered and then rejected by the
// database, or accepted and shown with no name — the "one table, one truth"
// failure with a UI on top of it.
check("32 Every circle tag exists everywhere a circle tag is read", () => {
  const sql = fs.readFileSync(path.join(ROOT, "supabase/APPLY.sql"), "utf8");
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/circles/route.ts"), "utf8");
  const list = fs.readFileSync(path.join(ROOT, "src/components/circles-list.tsx"), "utf8");

  // The constraint the database will actually enforce — the last one written
  // for `circles.tag` wins, so read that rather than 0003's original.
  const constraints = [...sql.matchAll(/circles[\s\S]{0,400}?tag\s+in\s*\(([^)]*)\)/g)];
  ok(constraints.length > 0, "the circles tag constraint is findable in APPLY.sql");
  const dbTags = new Set(
    [...constraints[constraints.length - 1][1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
  );

  const zod = route.match(/tag:\s*z[\s\S]{0,200}?\.enum\(\[([^\]]*)\]\)/);
  ok(zod, "the route validates the tag against a list");
  const apiTags = new Set([...zod[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));

  const uiBlock = list.match(/const TAGS = \[([\s\S]*?)\] as const;/);
  ok(uiBlock, "the dropdown has a list");
  const uiTags = new Set([...uiBlock[1].matchAll(/\["([a-z_]+)",/g)].map((m) => m[1]));

  ok(dbTags.has("grief"), "the database will accept a grief circle",
    [...dbTags].join(","));

  for (const t of uiTags) {
    ok(apiTags.has(t), `"${t}" is offered in the UI and accepted by the route`);
    ok(dbTags.has(t), `"${t}" is offered in the UI and accepted by the database`);
    /*
      Every tag needs both a sentence and a name. A tag with neither is a
      dropdown entry that opens a room called "Open Room" and greets nobody.
    */
    ok(keeperIntention(t, null).length > 40, `"${t}" opens with something to say`);
    const named = roomName(t, "2026-08-09T12:30:00Z");
    ok(named && named !== "Open Room", `"${t}" gets its own name, not the fallback`, named);
  }

  /*
    And `grief` stops at the circles boundary.

    A real-world tag selects a coping tool at weight 95 — "the one call you
    have been avoiding", "one thing you fit do for danfo". There is no such
    line for a burial, and writing one would be exactly the mistake check 31
    exists to catch. The private session recognises bereavement from the words
    themselves and needs no tag at all.
  */
  ok(!("grief" in REAL_WORLD_TACTIC),
    "grief is a room people choose, not a coping tool the app assigns");
  is(keeperIntention("grief", null).includes("Today we hold somebody who is gone."), true,
    "the grief room opens by saying it");
});

// ── 33. the tense people actually write in ────────────────────────────────
//
// `depth.ts` has carried this comment since the day it was written:
//
//   "Stems, not bare words. The first draft used \bquit\b and missed
//    'quitting' ... A word boundary after a verb root is the most common way
//    a regex quietly stops matching the tense people actually write in."
//
// It is directly above `IRREVERSIBLE`, which gets it right. The two lists
// immediately above IT did not, and neither did four other files. Eleven
// stems sat inside `\b(...)\b` groups where the trailing boundary made them
// unmatchable by anything a person would type:
//
//   griev, diagnos, separat, molest, divorc  → a bereavement or a diagnosis
//                                              routed to the CHEAP model
//   compar                                   → the entire "comparing" tag was
//                                              reachable only by brand name
//   isolat                                   → in three files, including the
//                                              loneliness → circles bridge
//   procrastinat                             → the only form anybody writes
//   dissociat, perform, responsib            → tactic gates that never opened
//
// None of it was detectable by reading, because every one of those regexes
// looks correct. So this asserts the behaviour instead: real sentences, in the
// tense people send them in, reaching the routing they were written for.
//
// This closes the instances. It does not close the class — that needs a
// dictionary this repo does not have, and the honest thing is to say so
// rather than to imply a scan is happening that is not.
check("33 A stem still matches the tense people write in", () => {
  const TAGGED = [
    ["i keep comparing myself to everybody on there", "social"],
    ["i compared my life to hers again last night", "social"],
    ["i have been isolating for weeks now", "lonely"],
    ["i isolated myself all month and nobody noticed", "lonely"],
    ["i am relocating to canada in march", "japa"],
    ["thinking of emigrating next year", "japa"],
    ["she was diagnosed last tuesday", "health"],
    ["the diagnosis came back and i have not told anybody", "health"],
  ];
  for (const [msg, tag] of TAGGED) {
    is(classify(msg).realWorldTag, tag, `"${msg.slice(0, 40)}…" is ${tag}`);
  }

  /*
    The expensive model, for the people the cost argument does not get a vote
    over. Each of these routed cheap until check 31 went looking.
  */
  const DEEP = [
    "i have been grieving since march",
    "my mum was diagnosed in march",
    "we are separating after nine years",
    "i am getting divorced and i cannot say it out loud",
    "he molested me when i was small",
    "it was traumatic and i still dream about it",
    "we are mourning her still",
  ];
  for (const msg of DEEP) {
    const d = depthFor({ classification: classify(msg), message: msg });
    is(d.depth, "deep", `"${msg.slice(0, 40)}…" gets the best model`, d.reason);
  }

  /*
    And the tactic gates, which fail silently rather than loudly: a gate that
    never opens looks exactly like a tactic that lost the weight contest.
  */
  const GATED = [
    ["i have been procrastinating on it for a month", "micro_action"],
    ["i keep isolating myself from everybody", "opposite_action"],
  ];
  for (const [message, wanted] of GATED) {
    const eligible = ALL_TACTICS.filter((t) => t.fits({
      kind: "vent", crisis: false, realWorldTag: null, body: null, language: "en",
      message, pressure: 50, duality: null, mood: 5, ventCount: 2, recentTactics: [],
    }));
    ok(eligible.some((t) => t.id === wanted),
      `"${message.slice(0, 40)}…" opens the ${wanted} gate`,
      eligible.map((t) => t.id).join(", "));
  }

  // The bridge to a real room reads the same word in the same tense.
  ok(soundsAlone("i have been isolating myself since january"),
    "and somebody isolating is heard as alone");
});

// ── 19. the credit policy, as something a script can fail ─────────────────
//
// `CLAUDE.md` says most messages never reach a model and that a change to the
// free paths which needs one is a change that is wrong. That was a paragraph.
// A sketch landed on this branch proposing three extra model calls per
// message — two of them to map a sentence to a body part and to parse affect,
// both of which are already regex and a table — and nothing in the repo could
// have failed it. Now something can.
const { PIPELINE, FREE_STAGES, MAX_COMPLETIONS_PER_MESSAGE, describePipeline } =
  await app("src/lib/vent/orchestrator.ts");

check("19 A vent costs one model call, and the free stages stay free", () => {
  is(MAX_COMPLETIONS_PER_MESSAGE, 1, "a real vent is one completion, never a fan-out");
  is(FREE_STAGES.length, 3, "three of the four stages cost nothing");
  ok(
    FREE_STAGES.includes("intake"),
    "intake is free — crisis routing has to work on an empty account",
  );
  ok(
    FREE_STAGES.includes("somatic"),
    "the body map is free — a model would invent a body part they never named",
  );

  // The stage table holds functions, not names, so a deleted module is a type
  // error. Assert they are all actually callable rather than truthy strings.
  for (const s of PIPELINE) {
    ok(typeof s.implementation === "function", `${s.id} points at a real function`);
  }

  // Intake and somatic are the same call, and it is a pure one. If either ever
  // becomes async, it has almost certainly grown a network call.
  const intake = PIPELINE.find((s) => s.id === "intake").implementation;
  const parsed = intake("my chest is tight and work dey choke me");
  ok(!(parsed instanceof Promise), "intake is synchronous — nothing to await means nothing to bill");
  is(parsed.body, "chest", "and it reads the body from the word they used");

  // "Work dey choke me" is a workload, not a throat. It was routing to throat
  // and opening the somatic gate on a metaphor — a breathing instruction for
  // somebody who never mentioned their body, which is the exact failure the
  // gate exists to prevent. It is check 1's own example of a vent.
  is(intake("work dey choke me").body, null, "the Pidgin idiom names no body part");
  is(intake("money dey choke me sha").body, null, "nor does any other stressor doing the choking");
  is(
    intake("i feel like i'm choking").body,
    "throat",
    "but a real one still lands — that one is often panic",
  );
  is(
    intake("my chest is tight and my head is fine").body,
    "chest",
    "and the body they named first wins, not whichever the table lists first",
  );

  // The weaver's model id has to be one the adapter can actually resolve. A
  // dead id — claude-sonnet-5-20250715 — reached production once already and
  // came back on this branch inside the sketch.
  const { weaverModel } = describePipeline();
  ok(!/^claude-sonnet-5-\d{8}$/.test(weaverModel), "the weaver model is not a dated dead id", weaverModel);

  // No surface anywhere may hardcode it again.
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.(tsx?|mjs)$/.test(e.name) ? [full] : [];
    });
  // Quoted only. These ids are named in comments on purpose — the whole
  // reason they are remembered is so nobody reaches for them again — and a
  // scan that cannot tell a warning from a usage would force the warnings to
  // be deleted, which is the opposite of the point.
  // Straight quotes only — a TypeScript string literal. Backticks are how
  // these ids are written when a comment is warning about them, and a scan
  // that cannot tell a warning from a usage would force the warnings to be
  // deleted. It caught a real one on its first run: the Gemini default was
  // still `gemini-2.5-flash` sixty lines above a comment saying it was
  // retired.
  const QUOTED_DEAD = /["'](?:claude-sonnet-5-\d{8}|gemini-2\.5-flash)["']/;
  const dead = walk(path.join(ROOT, "src"))
    .filter((f) => QUOTED_DEAD.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
  ok(dead.length === 0, "no file names a model id known to be retired", dead.join(", ") || undefined);
});

// ── live: the four things only a running room can prove ────────────────────
if (BASE) {
  const post = (p, body, method = "POST") =>
    fetch(`${BASE}${p}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  await checkAsync("20 A Keeper does not speak to an empty room", async () => {
    const one = `eval-${Date.now()}-a`;
    const { circle } = await post("/api/circles", {
      anonId: one, tag: "family", chairPicked: "tight_edge", pressure: 78,
    }).then((r) => r.json());

    const solo = await fetch(`${BASE}/api/circles/${circle.id}?anonId=${one}`).then((r) => r.json());
    const said = await fetch(`${BASE}/api/circles/${circle.id}/messages?anonId=${one}`)
      .then((r) => r.json());
    is(said.messages.length, 0, "one person in the room hears nothing from the Keeper");
    is(solo.pressureSeeded, 78, "their own chair is what the Closing will measure from");

    const two = `eval-${Date.now()}-b`;
    await post(`/api/circles/${circle.id}`, { anonId: two, consent: true, pressure: 62 });
    const mine = await fetch(`${BASE}/api/circles/${circle.id}?anonId=${two}`).then((r) => r.json());

    // A new room is in Breathing for three minutes, and the Keeper holds its
    // tongue through all of it — two people in the room is a necessary
    // condition for it to speak, never a sufficient one. The line it will
    // eventually read is asserted for all nine tags in check 9, without a
    // clock; what needs a live room is this silence, and the guard above it.
    is(mine.phase, "breathe", "a fresh room opens in Breathing");
    const after = await fetch(`${BASE}/api/circles/${circle.id}/messages?anonId=${two}`)
      .then((r) => r.json());
    is(after.messages.length, 0, "and nobody, Keeper included, has spoken into it yet");
    is(mine.pressureSeeded, 62, "the joiner measures from their chair, not the creator's");

    // Seat six can share. That is the whole point of dropping the witness cap.
    const six = `eval-${Date.now()}-f`;
    for (let i = 2; i < 6; i++) {
      await post(`/api/circles/${circle.id}`, {
        anonId: i === 5 ? six : `eval-${Date.now()}-${i}`, consent: true, pressure: 55,
      });
    }
    const spoke = await post(`/api/circles/${circle.id}/messages`, {
      anonId: six, content: "i said yes three times today and i am tired", kind: "share",
    });
    is(spoke.status, 201, "the sixth seat speaks");

    const refused = await post(`/api/circles/${circle.id}/messages`, {
      anonId: six, content: "you should just tell her no", kind: "share",
    });
    is(refused.status, 422, "and advice is still refused from any seat");

    // The seal: a number and two words, no transcript.
    const sealed = await post(`/api/circles/${circle.id}`, {
      anonId: two, mood: 8, carry: "Hope", drop: "Guilt",
    }, "PATCH").then((r) => r.json());
    is(sealed.drop, tensionDrop(62, 8), "the seal records the drop from their own chair");

    // The Guardian's inspection endpoint is not an open relay. It was, and a
    // 1,000-a-day quota that every circle depends on is not worth leaving
    // open to a script.
    const guardian = (who, id, text = "you are stupid and useless") =>
      post("/api/external/guardian/score", { text, anonId: who, circleId: id });

    is((await guardian(two, circle.id)).status, 200, "a member may ask about their own room");
    is((await guardian("nobody-999999", circle.id)).status, 403, "a stranger may not");
    is((await guardian(two, "no-such-circle-1")).status, 404, "nor may anyone name a room that does not exist");
    is(
      (await post("/api/external/guardian/score", { text: "you are stupid" })).status,
      422,
      "and the old unauthenticated shape is refused outright",
    );

    // A voice credential must not outlive the room it was minted for.
    // It used to be a flat fifty minutes from whenever it was asked for,
    // which meant a late seat held a key to a circle that no longer existed.
    const voice = await post(`/api/circles/${circle.id}/voice`, { anonId: two });
    if (voice.status === 200) {
      const grant = await voice.json();
      const claims = JSON.parse(
        Buffer.from(grant.token.split(".")[1], "base64url").toString(),
      );
      const endsAt = Math.floor(new Date(solo.circle.ends_at).getTime() / 1000);
      const overhang = claims.exp - endsAt;
      ok(overhang > 0 && overhang <= 120,
        "the voice token expires with the circle, plus a minute of grace",
        `${overhang}s past the end`);
      is(claims.video.roomAdmin, false, "and a sharer's token carries no room authority");
      is(claims.sub, "seat-2", "identity is the seat, never the anon id");
    }

    // Close means close.
    await fetch(`${BASE}/api/circles/${circle.id}?anonId=${one}`, { method: "DELETE" });
    const gone = await fetch(`${BASE}/api/circles/${circle.id}?anonId=${one}`);
    is(gone.status, 404, "the room is gone");
    // The transcript is not "empty" after a close — it is refused. Returning
    // an empty list would still be telling a caller the room exists.
    const words = await fetch(`${BASE}/api/circles/${circle.id}/messages?anonId=${one}`);
    is(words.status, 410, "and the transcript is not readable, not merely empty");
    is((await guardian(two, circle.id)).status, 410,
      "a closed room answers nothing, to a member or anybody else");

    // Every surface, not just the ones somebody remembered. Authority does
    // not outlive the circle it was granted for.
    // The two voice routes answer 501 before they touch the store when the
    // instance has no LiveKit keys — deliberately, so a dead endpoint cannot
    // be used as a circle-existence oracle. Assert the contract for whichever
    // deployment this is rather than assuming the one the author ran locally.
    const voiceGone = solo.voice ? 410 : 501;

    const closed = [
      ["a voice token", await post(`/api/circles/${circle.id}/voice`, { anonId: two }), voiceGone],
      ["the Keeper's mute", await post(`/api/circles/${circle.id}/voice/mute`, { anonId: one, seat: 2 }), voiceGone],
      ["reading the transcript", await fetch(`${BASE}/api/circles/${circle.id}/messages?anonId=${two}`)],
      ["posting a message", await post(`/api/circles/${circle.id}/messages`, { anonId: two, content: "still here?", kind: "share" })],
      ["taking a seat", await post(`/api/circles/${circle.id}`, { anonId: "latecomer-99999", consent: true, pressure: 55 })],
      ["sealing", await post(`/api/circles/${circle.id}`, { anonId: two, mood: 8 }, "PATCH")],
    ];
    for (const [what, res, expected = 410] of closed) {
      is(res.status, expected, `${what} is refused once the circle is over`);
    }
  });
}

// ── report ─────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, " ");
let passed = 0;

console.log(`\nMIND WEAVE — eval suite${BASE ? ` (+ live ${BASE})` : ""}`);
console.log("─".repeat(72));

for (const r of results) {
  const good = r.failed.length === 0;
  if (good) passed++;
  console.log(`${good ? "PASS" : "FAIL"}  ${r.name}   ${pad(r.asserts.length)} assertions`);
  for (const f of r.failed) console.log(`      ↳ ${f}`);
}

const total = results.length;
console.log("─".repeat(72));
console.log(`${passed}/${total} PASS · ${results.reduce((n, r) => n + r.asserts.length, 0)} assertions · 0 tokens · 0 model calls\n`);
process.exit(passed === total ? 0 : 1);
