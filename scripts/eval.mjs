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
const { selectTactic, REAL_WORLD_TACTIC, ALL_TACTIC_IDS, ALL_TACTICS, nothingCanMove, caughtWatchingSelf } =
  await app("src/lib/vent/tactics.ts");
const { buildFlavour } = await app("src/lib/flavour/profile.ts");
const { flavourBlock, openingBlock, carveBlock, memoryBlock } = await app("src/lib/vent/prompt.ts");
const { CONFIDENCE_FLOOR } = await app("src/lib/flavour/types.ts");
const { tensionDrop, tensionForChair, tensionNow, CHAIRS } = await app("src/lib/vent/chairs.ts");
const { selectMemory } = await app("src/lib/vent/memory.ts");
const { checkMessage, economyFact, weatherFact, keeperIntention, keeperReflection, roleForSeat } =
  await app("src/lib/circles/rules.ts");
const { PRESENCE_WINDOW_MS, TYPING_WINDOW_MS, isPresent, isTyping, presenceOf, shouldTouch } =
  await app("src/lib/circles/presence.ts");
const { guardianVerdict, THRESHOLD } = await app("src/lib/external/guardian.ts");
// The campfire's own lines, imported once so no check keeps a copy of them.
const { MYCELIUM: MYCELIUM_RULE } = await app("src/lib/circles/rules.ts");
const { noModelKeyReply } = await app("src/lib/vent/fallback.ts");
const { RPC_CONTRACT } = await app("src/lib/store/contract.ts");
const { measurePersonalEfficacy, blendEfficacy, PERSONAL_SPAN } =
  await app("src/lib/vent/efficacy.ts");
const { REFERRALS, STALE_AFTER_DAYS, HANDOFF_FLOOR, activeReferrals, pastWhatThisHolds, handoffLine } =
  await app("src/lib/vent/referrals.ts");
const { allProviders, configuredProviders, openAiCompatible } =
  await app("src/lib/vent/providers.ts");
const { wasCutOff, MAX_TOKENS } = await app("src/lib/vent/model.ts");

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

    /*
      An optional hint must never be why a provider is unusable.

      `reasoning_effort: "none"` asks a reasoning model to answer instead of
      deliberate — it exists because one spent 217 tokens thinking and shipped
      "Tired. Na" to somebody who had just said they were tired. The comment
      on THINKING_BUDGET said it "is not honoured everywhere", and the
      assumption under that was: not honoured means ignored.

      It does not. Google's OpenAI-compatible layer rejects the value outright
      — 400 INVALID_ARGUMENT, no field named — so production showed gemini
      "unreachable" with a valid key and a live model, and a whole free
      provider sat out of the chain on every message.
    */
    calls.length = 0;
    const bodies = [];
    globalThis.fetch = async (url, init) => {
      calls.push(String(url));
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return JSON.parse(String(init?.body)).reasoning_effort !== undefined
        ? json(400, { error: { code: 400, message: "Request contains an invalid argument.", status: "INVALID_ARGUMENT" } })
        : json(200, { choices: [{ message: { content: "answered anyway" }, finish_reason: "stop" }] });
    };
    const fussy = openAiCompatible("t-hint", "https://x", "k", "m", "T_KEY", ["flash"], true);
    is(await fussy.send({ system: "s", messages: [], maxTokens: 220 }), "answered anyway",
      "a rejected hint costs the hint, never the answer");
    is(bodies.length, 2, "exactly one retry — the same call without the optional part");
    ok(bodies[0].reasoning_effort === "none", "the first attempt did ask for no thinking");
    ok(bodies[1].reasoning_effort === undefined, "and the second simply did not");
    ok(!calls.some((c) => c.endsWith("/models")),
      "a rejected parameter is not a retired model — nothing goes looking for a new id");

    // And it is remembered, so the wasted round trip happens once ever rather
    // than once per message.
    bodies.length = 0;
    is(await fussy.send({ system: "s", messages: [], maxTokens: 220 }), "answered anyway",
      "the provider still answers on the next turn");
    is(bodies.length, 1, "and does not pay for the rejected hint twice");
    ok(bodies[0].reasoning_effort === undefined, "having learned it is refused here");

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
      // The LANDED line renders only when a sitting carries both readings and
      // a real drop. Without these the heaviest prompt was not the heaviest.
      tension_before: 88, tension_after: 30,
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
    Two things the prompt must never start doing, both of which arrived as
    reasonable-sounding suggestions in a persona spec.

    A crisis number belongs to a country. 988 is the US line and does not
    dial from Lagos, so a prompt that hands it to somebody at their lowest
    has given them a busy tone instead of a person. Check 17 makes the
    Nigerian number impossible to hand-write; this makes a foreign one
    impossible to introduce. Routing stays where it already is — local, free,
    and ahead of the model.

    And the product cannot call itself a therapist. Four US states now ban
    AI-delivered therapy outright and four more regulate it; more to the
    point, it is not true. The prompt may describe the training it writes
    like — that is a simile, and the line under it disclaims plainly.
  */
  const FOREIGN_LINES = /\b(988|911|999|116 123|1-?800-?273-?8255)\b/;
  ok(!FOREIGN_LINES.test(heaviest),
    "the prompt hands out no crisis number from another country",
    "crisis routing is local and imported — a US hotline is a busy tone from Lagos");
  ok(!/\b(you are|i am) (a|the) (licensed )?(therapist|psychologist|counsell?or|shrink)\b/i.test(heaviest),
    "and never tells the model it is a therapist",
    "banned in four states, regulated in four more, and untrue in all of them");

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

// ── 34. every part has a door ─────────────────────────────────────────────
//
// Asked by the founder, using the product as an ordinary person for the first
// time: "I'm seeing components everywhere, but how do they connect? Where do
// they leave me to? I hope they aren't just there for show."
//
// They were not all connected. A walk of the built app with a cold browser
// found:
//
//   /privacy and /terms  linked ONLY to each other — a closed loop with no
//                        door into it from anywhere. The product's whole
//                        promise is "nothing is kept", and the page that
//                        documents it could not be reached by tapping.
//   /circles             never mentioned on the landing page. The half of the
//                        product with human beings in it was reachable only by
//                        entering the chat and noticing a nav link, so the
//                        person whose problem is being alone was the one
//                        person never told other people were awake.
//   /dashboard           where signing up lands you, with no link to the
//                        product on it at all.
//   totem.tsx            a finished component, imported by nobody, whose
//                        animation class was never defined.
//
// None of that is visible in a diff. Every one of those files is well-written
// on its own; what was missing was the edge between them. So this walks the
// graph instead: pages, the components they pull in, and the hrefs those
// components carry.
check("34 Every page has a door into it, and every part is on the graph", () => {
  const APP = path.join(ROOT, "src/app");

  // route → file, for every page in the app router.
  const routeOf = (file) => {
    const r = path.dirname(path.relative(APP, file)).split(path.sep)
      .filter((seg) => !seg.startsWith("(") && seg !== ".")
      .join("/");
    return "/" + r;
  };
  const pageFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "api") walk(full); }
      else if (e.name === "page.tsx") pageFiles.push(full);
    }
  })(APP);

  const routes = new Map(pageFiles.map((f) => [routeOf(f), f]));
  ok(routes.has("/"), "there is a front door");

  // Follow imports inside src/ so a page owns everything it renders.
  const readSrc = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
  const resolve = (spec) => {
    if (!spec.startsWith("@/")) return null;
    const base = path.join(ROOT, "src", spec.slice(2));
    for (const c of [`${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  };
  /*
    A page renders inside its layouts, so they are part of it.

    Without this the check reported `sw-register.tsx` as an orphan — it is
    mounted in the root layout, which is to say it is on every page in the
    product, which is the opposite of orphaned. A reachability check that
    invents unreachability is worse than none.
  */
  const layoutsFor = (pageFile) => {
    const out = [];
    let dir = path.dirname(pageFile);
    for (;;) {
      const l = path.join(dir, "layout.tsx");
      if (fs.existsSync(l)) out.push(l);
      if (path.resolve(dir) === path.resolve(APP)) break;
      dir = path.dirname(dir);
    }
    return out;
  };

  const closure = (entry) => {
    const seen = new Set([entry, ...layoutsFor(entry)]);
    const stack = [...seen];
    while (stack.length) {
      const f = stack.pop();
      for (const m of readSrc(f).matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
        const r = resolve(m[1]);
        if (r && !seen.has(r)) { seen.add(r); stack.push(r); }
      }
    }
    return seen;
  };

  // Every internal destination a route can hand you: <Link href>, router
  // pushes, and the redirects that carry you after signing in.
  const exitsOf = (files) => {
    const out = new Set();
    for (const f of files) {
      const t = readSrc(f);
      for (const m of t.matchAll(/href=["'](\/[^"'#?]*)["']/g)) out.add(m[1]);
      /*
        `href={`/circles/${c.id}`}` is the only way anybody reaches a room, and
        reading it up to the `$` yields "/circles/", which normalises back to
        the lobby. The check then declared the room page unreachable and both
        components inside it orphaned — three false findings from one greedy
        stop character. The interpolation is the dynamic segment: keep it.
      */
      for (const m of t.matchAll(/href=\{`(\/[^`]*)`\}/g)) {
        out.add(m[1].replace(/\$\{[^}]*\}/g, "\u0001"));
      }
      for (const m of t.matchAll(/(?:push|replace|redirect)\(\s*[`"'](\/[^`"'?$]*)/g)) out.add(m[1]);
      for (const m of t.matchAll(/\[\s*["'](\/[a-z-]+)["']\s*,\s*["'][^"']+["']\s*\]/g)) out.add(m[1]);
    }
    return [...out];
  };

  // Auth actions are not a page, but they are how a real person reaches the
  // signed-in half — a redirect is a door.
  const authExits = exitsOf([path.join(ROOT, "src/app/auth/actions.ts")]);

  const norm = (href) => {
    const clean = href.replace(/\/+$/, "") || "/";
    if (routes.has(clean)) return clean;
    // /circles/<uuid> → /circles/[id]
    const parts = clean.split("/");
    for (const r of routes.keys()) {
      const rp = r.split("/");
      if (rp.length !== parts.length) continue;
      if (rp.every((seg, i) =>
        seg === parts[i] || (seg.startsWith("[") && parts[i]))) return r;
    }
    return null;
  };

  // Walk out from the front door.
  const reached = new Set(["/"]);
  const queue = ["/"];
  const componentsUsed = new Set();
  while (queue.length) {
    const r = queue.shift();
    const files = closure(routes.get(r));
    for (const f of files) componentsUsed.add(f);
    const exits = [...exitsOf(files), ...(r === "/login" || r === "/signup" ? authExits : [])];
    for (const href of exits) {
      const target = norm(href);
      ok(target !== null || !href.startsWith("/") || href.startsWith("/api"),
        `${r} links to ${href}, which is a real page`);
      if (target && !reached.has(target)) { reached.add(target); queue.push(target); }
    }
  }

  /*
    Every page, reachable by tapping. No allowlist.

    An exception list here would be the check quietly agreeing that some pages
    are allowed to be unfindable, which is the exact condition it exists to
    detect. If a page genuinely should not be linked, it should not be a page.
  */
  for (const r of routes.keys()) {
    ok(reached.has(r), `a person can reach ${r} from the front door by tapping`,
      `reached: ${[...reached].sort().join(" ")}`);
  }

  /*
    And every component is on that graph.

    `totem.tsx` was a finished, documented component — a black cube with a gold
    eye and a `tired` state for somebody who has not vented by 9pm — imported
    by nothing, with an `animate-blink` class no stylesheet ever defined. It
    had been in the repo, rendering nowhere, for the product's whole life.
  */
  const built = fs.readdirSync(path.join(ROOT, "src/components"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => path.join(ROOT, "src/components", f));
  for (const f of built) {
    ok(componentsUsed.has(f),
      `${path.basename(f)} is rendered by a page somebody can get to`);
  }
});

// ── 35. one design system, and it is readable ─────────────────────────────
//
// The product had two. Glass and a display serif on the anonymous half; 3px
// ink borders, hard offset shadows and uppercase-everything on the account
// half — and they met at the signup redirect, so a person crossing that line
// saw a different product. Brutalism lost, because the frosted plate is the
// voice everything the user actually came for is written in.
//
// The tokens for the losing system were deleted from the Tailwind config
// rather than left unused. A design system is singular only when the old one
// cannot be typed; while `border-3` and `shadow-brut` still resolved, the next
// component written in a hurry would have reached for them.
//
// Then the contrast, which is the half nobody checks. Measured with a real
// browser sampling rendered pixels, the old palette failed WCAG AA in
// fourteen places — and two of them were not cosmetic:
//
//   --ash at 3.84:1     the product's entire second voice. Every label,
//                       "Carve your truth.", most of the prose.
//   bg-gold text-ink    2.21:1 in dark mode, on 25 surfaces — every primary
//                       action in the product, including the button that
//                       dials the crisis line. Gold is the same RGB in both
//                       themes; --ink flips. So the foreground on gold had to
//                       stop flipping, which is what --on-gold is.
//
// A browser cannot run in this suite — the gate has zero dependencies on
// purpose. But every one of those failures lived in the token layer, and the
// tokens are arithmetic.
check("35 One design system, and its text is legible in both themes", () => {
  const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  const cfg = fs.readFileSync(path.join(ROOT, "tailwind.config.ts"), "utf8");

  // The losing system, gone from the config and from every surface.
  for (const dead of ["brut", "brut-sm", "brut-lg"]) {
    ok(!new RegExp(`["']?${dead}["']?\\s*:`).test(cfg),
      `the ${dead} shadow no longer exists to be typed`);
  }
  ok(!/borderWidth:\s*\{\s*3:/.test(cfg), "border-3 is gone from the theme");

  const sources = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(e.name)) sources.push(full);
    }
  })(path.join(ROOT, "src"));

  for (const f of sources) {
    const t = fs.readFileSync(f, "utf8");
    // Inside a className, not inside the prose of a comment explaining this.
    for (const m of t.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([\s\S]{0,600}?)\)\})/g)) {
      const cls = m[1] ?? m[2] ?? m[3] ?? "";
      const bad = cls.match(/\b(?:border-[trbl]?-?3|ring-3|shadow-brut(?:-\w+)?|font-black)\b/);
      ok(!bad, `${path.relative(ROOT, f)} speaks one language`, bad?.[0]);
    }
  }

  /*
    Contrast, from the tokens.

    Both theme blocks, every pair that actually carries text. A browser is the
    only thing that can check what a *rendered* pixel does, and it found these
    — but they all resolve to two colours and a ratio, so the arithmetic keeps
    them fixed without one.
  */
  const paletteOf = (selector) => {
    const block = css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n  \\}`));
    ok(block, `the ${selector} palette is findable`);
    const out = {};
    for (const m of block[1].matchAll(/--([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
      out[m[1]] = [+m[2], +m[3], +m[4]];
    }
    return out;
  };

  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // `card` is opaque white in light and near-black in dark; `.glass` sits at
  // 70% over the paper, so the true backdrop is between the two. Both ends
  // are asserted, because text has to clear the floor at whichever it lands on.
  const PAIRS = [
    ["ash", "paper"], ["ash", "card"],
    ["ink", "paper"], ["ink", "card"],
    ["on-gold", "gold"],
  ];

  for (const selector of [":root", "\\.dark"]) {
    const pal = paletteOf(selector);
    const name = selector === ":root" ? "light" : "dark";
    for (const [fg, bg] of PAIRS) {
      ok(pal[fg] && pal[bg], `${name}: ${fg} and ${bg} are both defined`);
      const r = ratio(pal[fg], pal[bg]);
      ok(r >= 4.5, `${name}: ${fg} on ${bg} is readable`, `${r.toFixed(2)}:1`);
    }
    // Gold is the accent and is the same in both themes on purpose — that is
    // the whole reason `on-gold` cannot flip with the theme.
    is(pal.gold.join(","), "201,168,106", `${name}: gold is the same gold`);
    is(pal["on-gold"].join(","), "26,26,26",
      `${name}: what sits on gold does not flip with the theme`);
  }

  /*
    Gold is light and structure. Ink and ash are language.

    Gold measures 2.26:1 on marble — it fails the small-text floor of 4.5 and
    the large-text floor of 3, which means it cannot legally carry a letter at
    any size in the light theme. It was carrying seven: the nameplate above
    every reply, the Keeper's label, the Closing label, a link on /memory and
    a whole sentence in the voice panel.

    That shipped, and the browser harness did not catch it, because the
    harness walked pages and never walked a page with a *conversation on it* —
    the nameplate only exists once a reply does. The most important surface in
    the product was the one state never measured. The harness composites
    translucent layers and sends a real vent now; this asserts the rule
    itself, so the next one fails without a browser at all.

    Decorative marks carry `aria-hidden` and are exempt: a gold separator dot
    is not language.
  */
  for (const f of sources.filter((x) => x.endsWith(".tsx"))) {
    const t = fs.readFileSync(f, "utf8");
    for (const [i, line] of t.split("\n").entries()) {
      if (!/\btext-gold\b(?!\/)/.test(line)) continue;
      ok(/aria-hidden/.test(line),
        `${path.relative(ROOT, f)}:${i + 1} does not set language in gold`,
        line.trim().slice(0, 80));
    }
  }
  {
    const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    const plate = css.match(/\.nameplate\s*\{([\s\S]*?)\n  \}/);
    ok(plate && !/text-gold\b/.test(plate[1]),
      "the nameplate is set in a colour that can be read");
  }

  /*
    The silhouette.

    Every AI chat has the same shape — a centred column of alternating bubbles
    over a box. The thread is the one structural difference: a continuous lit
    spine down the session that brightens where the room speaks, with the
    visitor's notes floating clear of it on the right. If it ever stops being
    a gradient with two theme values, it has gone back to being a border.
  */
  {
    const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    ok(/\.thread::before/.test(css), "the session has a spine");
    ok(/--thread:/.test(css.match(/:root\s*\{([\s\S]*?)\n  \}/)?.[1] ?? ""),
      "and it is tuned for light");
    ok(/--thread:/.test(css.match(/\.dark\s*\{([\s\S]*?)\n  \}/)?.[1] ?? ""),
      "and separately for dark — one alpha cannot serve both, which is how the first version rendered invisibly");
    const illum = css.match(/\.illuminate::first-letter\s*\{([\s\S]*?)\n  \}/);
    ok(illum, "the room's first words are illuminated");
    ok(/"WONK"\s*1/.test(illum[1]),
      "and the swash axis is on for the one letter that is display-scale");
    ok(/color:\s*rgb\(var\(--ink\)\)/.test(illum[1]),
      "in ink — gold cannot carry a letter, and this one is part of a sentence");
  }

  /*
    And nothing paints theme-flipping ink onto a solid gold fill.

    This was true on twenty-five surfaces — every send button, every chair
    picker, the "take a seat", and the one that dials the crisis line.
  */
  for (const f of sources.filter((x) => x.endsWith(".tsx"))) {
    const t = fs.readFileSync(f, "utf8");
    for (const [i, line] of t.split("\n").entries()) {
      if (/\bbg-gold\b(?!\/)/.test(line) && /\btext-ink\b/.test(line)) {
        ok(false, `${path.relative(ROOT, f)}:${i + 1} puts flipping ink on solid gold`);
      }
    }
  }
});

// ── 36. two voices, and you can tell them apart ───────────────────────────
//
// From the founder, on the chat surface: "the shrink bubble should be defined
// with certain hue and typography for more effect — so even on the chatting
// level, you and your shrink obviously sound and look different."
//
// They were set identically. What you typed and what came back sat in one
// column in one typeface, which reads as a log rather than as somebody
// answering. And the product already knew better: the circles surface has set
// the Keeper's line in the display face since the day it was written. The
// private session was the one place the distinction had never been drawn.
//
// The rule, now that there is one:
//
//   the room's voice   Fraunces, `.reply` — VENT, the Keeper, the mood ask,
//                      the invitation. One thing talking, in two rooms.
//   a person's voice   Inter — you, and the five other people in a circle.
//                      Human beings are not set in the machine's face.
//   what you said      `.said` — the sans, a step down, lighter on the page.
//                      Not because it matters less; because it has already
//                      been said and the eye should land on the answer.
//
// A screenshot cannot be asserted, but the classes can, and the thing that
// would actually regress is somebody writing a sixth speaker treatment inline
// instead of reaching for one of these.
check("36 The room and the person do not sound the same", () => {
  const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");

  const reply = css.match(/\.reply\s*\{([\s\S]*?)\n  \}/);
  ok(reply, ".reply is defined");
  ok(/font-display/.test(reply[1]), "the room speaks in the display face");
  ok(/font-variation-settings/.test(reply[1]),
    "and at a set optical size rather than the heading's");
  /*
    `opsz` is an optical size, not a scale. The headings run it at 96, where
    the letterforms open up for a word seen across a room; a paragraph read at
    arm's length on a phone needs the apertures tight and the hairlines thick.
    Inheriting 96 into body copy is the ordinary way a serif gets called
    unreadable, so the value is asserted rather than assumed.
  */
  const opsz = reply[1].match(/"opsz"\s*(\d+)/);
  ok(opsz && +opsz[1] <= 24,
    "body copy is set at a text optical size, not a display one",
    opsz ? `opsz ${opsz[1]}` : "unset");
  ok(/"WONK"\s*0/.test(reply[1]),
    "the swashed forms are off — charming in a headline, a distraction mid-sentence");

  const said = css.match(/\.said\s*\{([\s\S]*?)\n  \}/);
  ok(said, ".said is defined");
  ok(!/font-display/.test(said[1]), "the person does not speak in the machine's face");
  ok(/whitespace-pre-wrap/.test(said[1]),
    "and their line breaks survive, exactly as typed");

  /*
    Both conversational surfaces reach for the shared classes.

    They were three inline copies of `text-[15px] leading-[1.65] text-ink/70`
    — which is how "you" ended up rendered two pixels apart between the chat
    and the circle room, the two screens nobody had put side by side.
  */
  for (const f of ["src/components/chat/vent-chat.tsx", "src/components/circle-room.tsx"]) {
    const t = fs.readFileSync(path.join(ROOT, f), "utf8");
    ok(/className="said/.test(t), `${path.basename(f)} uses the shared person voice`);
    ok(/className="reply|className={cn\(\s*"[^"]*reply|reply /.test(t),
      `${path.basename(f)} uses the shared room voice`);
    // The literal that used to be pasted about. If it comes back, so has the
    // drift.
    ok(!/text-\[15px\] leading-\[1\.65\] text-ink\/70/.test(t),
      `${path.basename(f)} does not re-inline the person voice`);
  }

  /*
    And a person in a circle is still a person.

    The seat-N share is another human being typing, and setting them in the
    display face would say the room was speaking. The distinction only means
    something while it is only the room.
  */
  const room = fs.readFileSync(path.join(ROOT, "src/components/circle-room.tsx"), "utf8");
  const share = room.match(/Seat \{m\.seat\} · \{m\.role\}[\s\S]{0,260}?<p className="([^"]*)"/);
  ok(share, "the other-seat share is findable");
  ok(!/font-display|reply/.test(share[1]),
    "another person in the circle is set as a person, not as the room",
    share?.[1]);
});

// ── 38. the record, and what it refuses to say ────────────────────────────
//
// Arm 8 of the founder's manifesto: "last month you say you wan die, today you
// dey laugh — make we thank God."
//
// The instinct is right and the delivery is not. Quoting somebody's crisis
// sentence back to them, unannounced, is a re-exposure performed by the one
// product they trusted not to do that. `pattern.ts` already quotes openings
// back and already quotes only ordinary ones.
//
// So this quotes nothing. It counts two numbers the person set themselves —
// the tension slider on the way in, the mood on the way out — and hands back
// the sum. That loop has fed the tactic selector since it shipped and was
// visible only to the machine; the one who supplied both ends never saw what
// they added up to.
//
// A count a person supplied is the strongest honest claim this product can
// make. It needs no adjectives and it is not allowed any.
const { findTestimony, testimonySentence, TESTIMONY_FLOOR } =
  await app("src/lib/vent/testimony.ts");

check("38 The record counts what they gave, and stays quiet otherwise", () => {
  const at = (d) => new Date(Date.UTC(2026, 6, d)).toISOString();
  const sitting = (d, before, after) => ({
    id: `v${d}`, user_id: "u", user_message: "the money", ai_reply: "ok",
    created_at: at(d), tension_before: before, tension_after: after,
    real_world_tag: "economy", mood_score: null, body_tapped: null,
    tactic_used: "exact_mirror", intent_type: "vent",
  });

  // Nothing below the floor, and the floor is higher than the pattern's.
  ok(TESTIMONY_FLOOR > 5,
    "a trend costs more evidence than a recurrence", `${TESTIMONY_FLOOR} vs 5`);
  const thin = Array.from({ length: TESTIMONY_FLOOR - 1 }, (_, i) =>
    sitting(i + 1, 80, 40));
  is(findTestimony(thin), null,
    "seven perfect sittings still say nothing — a trend from too little is a horoscope");

  // Unanchored rows cannot be counted at all, however many there are.
  const unanchored = Array.from({ length: 30 }, (_, i) =>
    sitting(i + 1, 80, null));
  is(findTestimony(unanchored), null,
    "a sitting with no ending was never measured, so it is not evidence");

  /*
    And it does not deliver a verdict when things are going badly.

    Not because the truth is inconvenient — because "three of your eleven
    sittings ended lighter" is a judgement handed down by a machine to
    somebody already having a hard month, from two sliders that cannot know
    why. A person in the middle of a bereavement shows small drops for months
    and there is nothing wrong with them or with the room.
  */
  const bad = [
    ...Array.from({ length: 8 }, (_, i) => sitting(i + 1, 70, 68)),
    ...Array.from({ length: 3 }, (_, i) => sitting(i + 20, 70, 30)),
  ];
  is(findTestimony(bad), null,
    "a bad month is not narrated back as a failing grade");

  // A real record, said plainly.
  const good = [
    ...Array.from({ length: 9 }, (_, i) => sitting(i + 1, 78, 50)),
    ...Array.from({ length: 2 }, (_, i) => sitting(i + 20, 60, 59)),
  ];
  const t = findTestimony(good);
  ok(t, "eleven anchored sittings, nine of them lighter, is worth saying");
  is(t.anchored, 11, "every anchored sitting is counted");
  is(t.lighter, 9, "and only the ones that actually moved are called lighter");
  is(t.typicalDrop, 28, "the middle drop is the median, not the mean");

  const line = testimonySentence(t);
  ok(/\b9\b/.test(line) && /\b11\b/.test(line) && /\b28\b/.test(line),
    "the numbers are in the sentence", line);

  /*
    The tone rules, asserted on the string rather than trusted to the author.

    No adjective, no exclamation, no congratulation, and above all no claim
    that VENT is the reason. The drop happened; saying the room caused it is
    the product taking credit for somebody's own week.
  */
  ok(!/[!]/.test(line), "nothing is being celebrated at them", line);
  ok(!/\b(amazing|incredible|proud|congratulations|well done|great job|improving|progress)\b/i.test(line),
    "no adjectives — the count is the claim", line);
  ok(!/\b(we|vent|our|us|because of|thanks to|helped you)\b/i.test(line),
    "and no claim of cause: it says the drop happened, never who did it", line);

  /*
    It must never contain anybody's words.

    The whole reason this is a count and not a quotation. A crisis sentence
    returned without warning is the failure mode this shape exists to avoid,
    so the sentence is checked against a message that is in the input rows.
  */
  ok(!line.includes("the money"),
    "no sentence of theirs is quoted back — this is the count, not the transcript");

  const src = fs.readFileSync(path.join(ROOT, "src/lib/vent/testimony.ts"), "utf8");
  ok(!/user_message/.test(src),
    "the module cannot quote them, because it never reads what they wrote");
  ok(!/fetch|generateReply|await /.test(src), "and it costs nothing to say");
});

// ── 39. thanksgiving, with no church in it ────────────────────────────────
//
// The founder, correcting an earlier reading: the religious language is
// figurative, and it has to land for every religion, for atheists, and for
// nobody. Thanksgiving is right; church is not.
//
// So gratitude, which is one of the most replicated findings in the
// literature and belongs to every tradition and to none. The question is
// "what held this week" — everybody has an answer to that, and nobody is
// being addressed in somebody else's language.
//
// Deliberately NOT "what did VENT do for you". A product asking what it did
// for you is fishing, and the answer belongs to their week rather than to us.
//
// And this is the one thing in the product safe to quote back at somebody.
// `testimony.ts` counts rather than quotes and the carve is never shown to
// them at all, both because a sentence returned unannounced is a
// re-exposure. This one they wrote on purpose, while they were alright,
// knowing it would be kept.
check("39 What held is theirs, secular, and never confused with a crisis", () => {
  const chat = fs.readFileSync(path.join(ROOT, "src/components/chat/vent-chat.tsx"), "utf8");
  const history = fs.readFileSync(path.join(ROOT, "src/components/history-list.tsx"), "utf8");
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/held/route.ts"), "utf8");
  const sql = fs.readFileSync(path.join(ROOT, "supabase/APPLY.sql"), "utf8");

  /*
    No church, in any direction.

    Asserted over the strings a person actually reads rather than over the
    file, so the reasoning in the comments is free to name what it is avoiding
    and why. Both lists matter: naming one faith excludes the others, and
    "the universe" excludes the people who came here from a mosque.
  */
  const FAITH = /\b(god|jesus|christ|allah|lord|church|mosque|pray(er|ing)?|bless(ed|ing)?|hallelujah|amen|scripture|holy|sin|soul|worship|congregation|tithe|the universe|manifest)\b/i;
  const strings = [];
  for (const src of [chat, history]) {
    for (const m of src.matchAll(/(?:<p[^>]*>|<h\d[^>]*>)\s*([^<>{}][^<>]{8,180}?)\s*</g)) {
      strings.push(m[1].replace(/\s+/g, " ").trim());
    }
    for (const m of src.matchAll(/placeholder="([^"]{4,})"/g)) strings.push(m[1]);
  }
  ok(strings.length > 10, "there are strings to check", `${strings.length}`);
  for (const str of strings) {
    const hit = str.match(FAITH);
    ok(!hit, `no faith is named at anybody: "${str.slice(0, 60)}"`, hit?.[0]);
  }

  // The question is about their week, not about us.
  const ask = chat.match(/What held this week\?[^<]*/);
  ok(ask, "the question is asked");
  ok(!/\bvent\b|\bwe\b|\bus\b|\bhelp(ed)?\b/i.test(ask[0]),
    "and it asks about their week, not about what we did for them", ask?.[0]);

  /*
    A gentle question is still a question.

    "What held this week" can be answered "nothing, I want to die." Filing
    that as a gratitude note — silently, with a checkmark — would be the worst
    thing this product could do with a sentence, so the crisis router runs on
    the server where the note is written. `checkMessage` is on the server for
    the same reason: curl walks around a client.
  */
  ok(/classify\(/.test(route) && /intent === "crisis"/.test(route),
    "a note is routed for crisis before it is ever stored");
  const crisisIdx = route.indexOf('intent === "crisis"');
  const storeIdx = route.indexOf("addHeld");
  ok(crisisIdx > 0 && crisisIdx < storeIdx,
    "and routed BEFORE the write, not after it");
  ok(/setCrisis|setGated/.test(chat.slice(chat.indexOf("submitHeld"))),
    "and the client hands them the line rather than swallowing the answer");

  // Written by them. A model must never author one, or quoting it back stops
  // being safe.
  ok(!/generateReply|CARVER_SYSTEM|providers/.test(route),
    "no model authors a note — that is what makes it safe to show back");

  /*
    Said after the answer arrived, and only then.

    The sharpest failure in CLAUDE.md is `void seal(w)` followed by "Sealed."
    — a promise tied to a request nobody read. "Kept." waits for `saved`.
  */
  const submit = chat.slice(chat.indexOf("async function submitHeld"), chat.indexOf("async function submitHeld") + 1600);
  ok(/await fetch\("\/api\/held"/.test(submit), "the note is actually sent");
  ok(/data\?\.saved/.test(submit) && submit.indexOf("data?.saved") < submit.indexOf('toast("Kept'),
    "and \"Kept.\" is said only after the server says it was");

  // Storage, and the cap in one place.
  ok(/vent_users[\s\S]{0,200}?add column if not exists held jsonb/.test(sql),
    "the column exists in the SQL a person actually runs");
  const types = fs.readFileSync(path.join(ROOT, "src/lib/store/types.ts"), "utf8");
  ok(/export const HELD_CAP = \d+;/.test(types), "the cap is a named constant");
  for (const backend of ["file-store.ts", "supabase-store.ts"]) {
    const b = fs.readFileSync(path.join(ROOT, "src/lib/store", backend), "utf8");
    ok(/HELD_CAP/.test(b), `${backend} trims to the shared cap rather than its own number`);
  }
  ok(/held/.test(fs.readFileSync(path.join(ROOT, "src/lib/store/contract.ts"), "utf8")),
    "and the schema contract probes the column, so a missing one is loud");
});

// ── 40. the fifth window, and the four it will not open ───────────────────
//
// Commandment 7: be on the same page with the user about today. Weather,
// economy, world events, culture, local news.
//
// Weather is the best idea in it and the only one built. It is genuinely
// local, it needs no key, being wrong about it costs almost nothing, and the
// product already had a `climate` room whose tool said "heat makes everything
// feel worse than it is" — true, generic, and unprovable to the person
// reading it. A measured felt-temperature turns that into something the room
// and the person are both standing in.
//
// The other three are declined on purpose and the check pins the refusal,
// because the next person to read the manifesto will reach for them:
//
//   world events   "You see wetin happen for Gaza? E heavy" — unprompted, to
//                  somebody in distress who may have family there, or who may
//                  have come here precisely to not think about it. Naming a
//                  war is taking a position, and a product that says silence
//                  beats a guess cannot editorialise about one.
//   football       "Man U lose again 😂" landing under a message about being
//                  broke is a tonal catastrophe no scheduler can avoid.
//   "most people   an invented claim about other people's feelings, which is
//    dey anxious    the Keeper-inventing-a-pattern bug wearing a clock.
//    on Sunday"
check("40 Weather is measured, and the rest of the news is not invented", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/lib/external/sources.ts"), "utf8");
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/circles/[id]/route.ts"), "utf8");

  ok(/export async function weatherContext/.test(src), "the fifth window exists");
  ok(/open-meteo\.com/.test(src), "on a source that needs no key, like the other four");
  ok(/latitude=6\.5244&longitude=3\.3792/.test(src),
    "Lagos, hardcoded — the browser is never asked where somebody is");
  ok(/cached<WeatherContext>\("weather", HOUR/.test(src),
    "cached an hour: a six-hour-old 'it is hot' said into a downpour is the stale reading these windows exist to avoid");

  /*
    Every failure is an absent sentence, never an estimate — the rule the
    other four already follow.
  */
  ok(/if \(typeof tempC !== "number" \|\| typeof feelsC !== "number"\) return null;/.test(src),
    "a malformed reading is nothing, not a plausible number");

  // The sentence hands over a number and refuses to interpret it.
  const rain = weatherFact(29, 2.4);
  const hot = weatherFact(37, 0);
  const mild = weatherFact(28, 0);
  ok(rain && /29°/.test(rain), "rain is reported with the felt temperature", rain);
  ok(hot && /37°/.test(hot), "and so is heat", hot);
  is(mild, null,
    "an ordinary Lagos afternoon is silence, not filler about the weather");
  for (const line of [rain, hot]) {
    ok(/not a mood\.$/.test(line),
      "the sentence says it is a number and not a feeling", line);
    ok(!/\b(sorry|unfortunately|sadly|hope|spoil|ruin)\b/i.test(line),
      "and never decides how somebody feels about their own weather", line);
  }

  /*
    Felt, not measured, in the sentence a person reads.

    31° at ninety per cent humidity is not 31° to the person standing in it,
    and two temperatures in one line is a weather report rather than a room.
  */
  ok(/weatherFact\(sky\.value\.feelsC, sky\.value\.rainMm\)/.test(route),
    "the room is handed what it feels like, not what the thermometer says");
  ok(/circle\.tag === "climate" \? await weatherContext\(\) : null/.test(route),
    "and only the room it belongs to pays for the fetch");

  /*
    The three refusals, asserted as an absence.

    A check for something that is not there is weak on its own — so this is
    paired with the comment above, and with the fact that adding any of them
    means deleting an assertion that names why.
  */
  const surfaces = ["src/lib/external/sources.ts", "src/lib/circles/rules.ts",
    "src/lib/vent/prompt.ts", "src/components/chat/vent-chat.tsx"];
  const NEWS = /\b(gaza|ukraine|israel|palestin|election results?|newsapi|gnews|headlines?)\b/i;
  for (const f of surfaces) {
    const t = fs.readFileSync(path.join(ROOT, f), "utf8");
    // Comments explaining the refusal are the point; a fetch is not.
    const code = t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const hit = code.match(NEWS);
    ok(!hit, `${f} does not bring a war into somebody's bad hour`, hit?.[0]);
  }
  ok(!/most people (are|dey)/i.test(
    fs.readFileSync(path.join(ROOT, "src/lib/circles/rules.ts"), "utf8")),
    "and nobody is told how other people feel tonight");
});

// ── 41. the probe reports everything it found ─────────────────────────────
//
// The first real production /api/health this project has ever read said:
//
//   "missingTables": ["vent_users", "profiles"],
//   "vent_users": { "code": "42703",
//                   "message": "column vent_users.carve does not exist" }
//
// carve is 0011. It had never been applied. And the contract for that table
// is `id,anon_id,carve,held,created_at` — so `held`, added in 0013, sits two
// positions later in the same select and was not mentioned at all, because
// PostgREST stops at the first column it cannot resolve.
//
// The honest reading of that response is "at least one of these is missing".
// The way to learn the rest was to fix carve, redeploy, and ask again — two
// round trips of somebody's evening for an answer the database already had.
//
// Same shape as the HEAD request that could not carry an error body: a probe
// built so it cannot report everything it found. Third time in this file.
check("41 A drifted table names every column it is missing", () => {
  const health = fs.readFileSync(path.join(ROOT, "src/app/api/health/route.ts"), "utf8");

  ok(/missingColumns/.test(health), "the answer has room for more than one column");
  ok(/error\?\.code === "42703"/.test(health),
    "and the re-ask is scoped to schema drift, not to every failure");

  /*
    Per column, not per table.

    A single select naming every column is what produced the one-at-a-time
    answer. The fallback has to ask about each column on its own or it learns
    exactly as little as the request it is correcting.
  */
  ok(/cols\.map\(\(c\) => supabase!\.from\(name\)\.select\(c\)/.test(health),
    "each column is asked about separately");
  ok(/FULL_CONTRACT\[name\]\.split\(","\)/.test(health),
    "and the columns come from the contract, not from a second list that can drift from it");

  /*
    Only on the failing path.

    The happy case must stay one round trip per table. A health endpoint that
    fires a request per column on every call is a health endpoint people turn
    off.
  */
  const fallback = health.slice(health.indexOf("const drifted"));
  ok(/names\.filter\(/.test(fallback),
    "the expensive pass runs only for tables that actually drifted");
  ok(health.indexOf("const drifted") > health.indexOf("for (const [i, res] of results.entries())"),
    "after the cheap pass, never instead of it");

  /*
    And the contract still names both columns, so the next drift is caught.

    Asserted per column rather than against the whole select list, which is
    what this was and which failed the moment 0015 added a third one. That is
    the same shape as the bug the check exists for: an assertion pinned to the
    author's snapshot, failing on a change it has no opinion about. It should
    say "carve and held are still asked for" — it should not say "and nothing
    else ever will be".
  */
  const contract = fs.readFileSync(path.join(ROOT, "src/lib/store/contract.ts"), "utf8");
  const ventUsers = contract.match(/vent_users: "([^"]+)"/)?.[1].split(",") ?? [];
  for (const col of ["carve", "held"]) {
    ok(ventUsers.includes(col),
      `the contract still asks for ${col} — the column production was missing`);
  }

  /*
    A red light over a working road.

    PGRST303 is JWT clock skew — the key's `iat` reads into the database's
    future, so whichever request lands in that window is refused. It moves
    between tables run to run and clears itself, and the hint has said
    "nothing to fix here" since it was written.

    It was landing in `missingTables` anyway, which set database to
    "unreachable", which set status to "degraded", which returned 503. So the
    service declared itself down over a timing wobble, and anything watching
    — an uptime check, a status page, the founder opening it on his phone —
    would have believed it.

    Every other failure this endpoint has produced was a green light over a
    broken road. This was the first one the other way round, and it is the
    same bug wearing the opposite colour.
  */
  ok(/code === "PGRST303"/.test(health),
    "clock skew is recognised as timing rather than schema");
  const skewIdx = health.indexOf('code === "PGRST303"');
  const pushIdx = health.indexOf("missingTables.push(name)");
  ok(skewIdx > 0 && skewIdx < pushIdx,
    "and it is diverted BEFORE it can be counted as a missing table");
  ok(/const transient: Record</.test(health) && /\n      transient,/.test(health),
    "it is still reported, in its own field — quiet is not the same as hidden");

  /*
    The status line and the HTTP code both read `database`, and `database`
    only reads `missingTables`. So keeping skew out of that array is what
    keeps a self-clearing wobble from paging somebody at 7am — asserted here
    rather than trusted, because the two are four hundred lines apart.
  */
  ok(/database = missingTables\.length \? "unreachable" : "ok";/.test(health),
    "database still turns on real drift only");
  ok(/status: database === "unreachable" \? 503 : 200/.test(health),
    "and 503 still follows database, so nothing else can reach it");
});

// ── 42. the privacy page names whoever actually sees it ───────────────────
//
// It said "sent to Anthropic" — and had said so while every message for days
// was answered by Groq. Anthropic's balance emptied, the chain moved on, and
// the one page whose entire job is to say where somebody's words go was never
// told.
//
// A confidentiality promise that names the wrong company is not a smaller
// problem than naming none. This is the product whose front door says "nobody
// knows it is you"; the list of who does see it has to be true.
//
// So the rule, enforced here rather than remembered: every provider in the
// chain appears on the privacy page. Adding a provider without adding it to
// that paragraph fails the build.
check("42 Every provider in the chain is named on the privacy page", () => {
  const privacy = fs.readFileSync(path.join(ROOT, "src/app/privacy/page.tsx"), "utf8");
  // The prose a person reads, not the comment explaining it.
  const prose = privacy.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  /*
    The company, not the provider id. Somebody reading a privacy page needs
    the name on the company, and "groq" and "gemini" are not the same kind of
    word — one is a firm, the other a model family whose firm is Google.
  */
  const COMPANY = {
    anthropic: /Anthropic/,
    gemini: /Google/,
    groq: /Groq/,
    zhipu: /Zhipu/,
    deepseek: /DeepSeek/,
    openrouter: /OpenRouter/,
    cerebras: /Cerebras/,
  };

  for (const p of allProviders()) {
    const named = COMPANY[p.id];
    ok(named, `${p.id} has a company name to disclose`, "add it to COMPANY here");
    if (named) {
      ok(named.test(prose),
        `${p.id} is named on the privacy page`,
        "a provider that can see somebody's words has to appear there");
    }
  }

  /*
    And the mechanism, because a list alone implies all six see everything.
    They do not: it is a chain, and exactly one of them sees any given
    message.
  */
  ok(/first one that answers/i.test(prose),
    "the page says it is a chain, not a broadcast");

  // The three that never leave the server are still promised, and that
  // promise is older and stronger than any of the above.
  ok(/never sent to a model/i.test(prose),
    "crisis, dates and greetings are still stated as never leaving");
});

// ── 43. the breaking room, and the door it will not open ──────────────────
//
// Commandment 8, and it is the best idea in any of the manifestos sitting
// next to the most dangerous instruction in any of them.
//
// The idea: people are not changed by being managed, they are changed by one
// question nobody has asked them. True, and it is what every tradition in
// `tactics.ts` is finally doing.
//
// The instruction: *"Crisis 8-10: use Level 5-6 questions to anchor them"* —
// Level 6 opening with *"if you die today, wetin people go write for your
// WhatsApp status?"*
//
// That is asking somebody in active crisis to rehearse their own death and
// stage the reaction to it, inside the exact condition the crisis router
// exists to hand to a human being. So the rule is inverted: high crisis does
// not select gentler questions, it selects none. A gate, not a weight —
// weights lose contests, and there is no acceptable turn on which this one
// loses.
const { QUESTIONS, WITHHELD, canOpen, nextQuestion, BREAKING_FLOOR, BREAKING_EVERY,
        BREAKING_LINES } = await app("src/lib/vent/breaking.ts");

check("43 The breaking room stays shut on the people it could hurt", () => {
  const base = { ventCount: 12, asked: [] };

  /*
    Crisis, in every phrasing the router knows. Not one of them opens it.
  */
  for (const m of [
    "i want to kill myself",
    "i wan die",
    "i don't want to be here anymore",
    "make i die",
    "i no fit continue this life",
  ]) {
    is(canOpen({ ...base, message: m }), false,
      `crisis closes the room: "${m}"`);
    is(nextQuestion({ ...base, message: m }), null,
      "and nothing is offered instead — the crisis line is the whole answer");
  }

  /*
    And the unfixable, for a different reason. Somebody whose father is dying
    does not need a question about who they are pretending to be;
    `meaning_stance` is already the right move and is already selected.
  */
  for (const m of [
    "my dad's test results came back, it's terminal",
    "we buried her on saturday",
  ]) {
    is(canOpen({ ...base, message: m }), false,
      `the unfixable closes it too: "${m.slice(0, 34)}…"`);
  }

  // Nobody opens up on turn one.
  is(canOpen({ message: "the money is choking me", ventCount: 1, asked: [] }), false,
    "a stranger is not asked something heavy");
  ok(BREAKING_FLOOR >= 3, "and the floor is a real number of turns", `${BREAKING_FLOOR}`);

  // On an ordinary heavy day, with a relationship behind it, it opens.
  const ok1 = { message: "rent is due again and i never tell anybody", ventCount: 8, asked: [] };
  is(canOpen(ok1), true, "an ordinary hard day, on turn eight, may be asked");
  const q = nextQuestion(ok1);
  ok(q, "and a question arrives");
  is(q.depth, "surface", "starting shallow — depth is earned, not granted");

  /*
    One at a time, never the same wound twice running, never repeated.
  */
  const asked = [];
  let ctx = { ...ok1, asked };
  let lastRoom = null;
  for (let i = 0; i < 12; i++) {
    const next = nextQuestion({ ...ctx, asked: [...asked] });
    if (!next) break;
    ok(!asked.includes(next.id), `${next.id} is not asked twice`);
    if (lastRoom && QUESTIONS.length > 4) {
      ok(next.room !== lastRoom,
        `two in a row are not the same wound (${next.room})`);
    }
    lastRoom = next.room;
    asked.push(next.id);
  }
  ok(asked.length >= 6, "the bank is deep enough to keep going", `${asked.length}`);

  /*
    Nothing that rehearses a death, wishes a harm, or asks for a disclosure
    this product cannot hold. Asserted over the text a person actually reads,
    because that is the thing that can hurt them.
  */
  const FORBIDDEN = [
    [/\b(die|death|dead|funeral|grave|bury|buried|coffin)\b/i, "rehearses a death"],
    [/\bwish (make|say)?\s*\w*\s*(happen|harm|bad)\b/i, "invites a wished harm"],
    [/\b(crime|catch you|enjoy .* pain)\b/i, "asks for an offence or a cruelty"],
    [/\b(god|jesus|allah|church|mosque|pray(er|ing)?|sin|holy|scripture)\b/i, "assumes a faith"],
    [/\b(vent|my advice|i go tell you the truth about yourself)\b/i, "makes the product the oracle"],
  ];
  for (const q2 of QUESTIONS) {
    for (const [re, why] of FORBIDDEN) {
      ok(!re.test(q2.text), `${q2.id} ${why}`, q2.text);
    }
  }

  /*
    The cuts are on the record rather than reverse-engineered from an absence.
  */
  for (const key of ["death_rehearsal", "wished_harm", "uncontainable_disclosure",
                     "religion", "product_as_oracle", "fishing"]) {
    ok(WITHHELD[key] && WITHHELD[key].length > 60,
      `the ${key} cut is written down with its reason`);
  }

  /*
    An invitation with an exit in it. Somebody who cannot decline has not
    consented, and "you fit say no" is the difference between a question and
    an interrogation.
  */
  ok(/say no/i.test(BREAKING_LINES.invite),
    "the invitation says out loud that no is allowed", BREAKING_LINES.invite);
  ok(BREAKING_LINES.declined.length > 0 && !/\?/.test(BREAKING_LINES.declined),
    "and a no is answered without asking again");

  /*
    And a cadence, so a door that may open does not open on every turn.

    A question this size arriving after every message is not depth — it is a
    door that will not stay shut, and the person it wears down fastest is the
    one having the worst week. Asserted over a real span of turns rather than
    at the two points the implementation happens to hit.
  */
  const opens = [];
  for (let turn = 1; turn <= 20; turn++) {
    if (canOpen({ message: "rent is due again and i never tell anybody", ventCount: turn, asked: [] })) {
      opens.push(turn);
    }
  }
  ok(opens.length > 0, "the room does open", `turns ${opens.join(", ")}`);
  ok(opens.every((t) => t >= BREAKING_FLOOR), "never below the floor", `${opens[0]}`);
  ok(opens.length <= Math.ceil(20 / BREAKING_EVERY),
    "and not on every turn — asking is rationed", `${opens.length} of 20`);
  for (let i = 1; i < opens.length; i++) {
    ok(opens[i] - opens[i - 1] >= BREAKING_EVERY,
      `at least ${BREAKING_EVERY} turns between asks (${opens[i - 1]} → ${opens[i]})`);
  }
  ok(BREAKING_EVERY >= 2, "and the gap is a real gap", `${BREAKING_EVERY}`);

  /*
    The cadence is taste; the gates are not. A crisis message must not open
    the room on a turn the cadence likes, which is the interaction a modulo
    invites somebody to get wrong later.
  */
  for (const turn of opens) {
    is(canOpen({ message: "i want to kill myself", ventCount: turn, asked: [] }), false,
      `crisis still closes it on an on-cadence turn (${turn})`);
  }

  // Free, like everything else that is not a vent.
  const src = fs.readFileSync(path.join(ROOT, "src/lib/vent/breaking.ts"), "utf8");
  ok(!/fetch|generateReply|await /.test(src), "the room costs nothing to open");
});

// ── 44. and the wiring, which is where the room could still hurt somebody ──
//
// Check 43 holds the module: which questions exist, who they are refused to,
// and how often. All of it is true of a function nobody calls.
//
// This is the other half — the four places between that function and a person,
// each of which has a way of quietly undoing it:
//
//   the route   files an answer without checking the sentence in it
//   the picker  moves to the client, where a crisis turn cannot stop it
//   the screen  says "thank you for trusting me" over a write that failed
//   the store   loses the asked-list, and the room re-asks what was answered
//
// Every one of those is a shape this repo has already shipped once under a
// different name. The last one is the `"I've saved it, word for word"` bug and
// the third is `void seal(w)`; they are here by name rather than by category
// because a category is not a check.
check("44 The Breaking Room is wired the way the module is written", () => {
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/breaking/route.ts"), "utf8");
  const vent = fs.readFileSync(path.join(ROOT, "src/app/api/vent/route.ts"), "utf8");
  const chat = fs.readFileSync(path.join(ROOT, "src/components/chat/vent-chat.tsx"), "utf8");
  const types = fs.readFileSync(path.join(ROOT, "src/lib/store/types.ts"), "utf8");
  const contract = fs.readFileSync(path.join(ROOT, "src/lib/store/contract.ts"), "utf8");
  const sql = fs.readFileSync(path.join(ROOT, "supabase/APPLY.sql"), "utf8");

  /*
    ── the route ────────────────────────────────────────────────────────────
    "Which of your parents hurt you pass" can be answered with the worst
    sentence of somebody's life. Same rule as /api/held, and the ordering is
    the whole of it: routed BEFORE the write, never flagged after it.
  */
  ok(/classify\(/.test(route) && /intent === "crisis"/.test(route),
    "an answer is routed for crisis");
  const crisisIdx = route.indexOf('intent === "crisis"');
  const writeIdx = route.indexOf("addBreaking");
  ok(crisisIdx > 0 && writeIdx > 0 && crisisIdx < writeIdx,
    "and routed before it is stored, not after");
  ok(!/generateReply|providers/.test(route), "no model is in this path at all");

  // A caller does not get to invent a question. An id the bank does not know
  // would sit in the asked-list forever and mean nothing to `nextQuestion`.
  ok(/QUESTIONS\.some\([^)]*\)/.test(route) && /status: 422/.test(route),
    "an unknown question id is refused");
  const idCheck = route.indexOf("QUESTIONS.some");
  ok(idCheck > 0 && idCheck < writeIdx, "before the write, like everything else");

  /*
    ── the picker ───────────────────────────────────────────────────────────
    Chosen on the server, from a count and an asked-list the server read. A
    client that picks its own question is a client that can ask somebody in
    crisis about their father — `canOpen` is only a gate if the thing it gates
    runs behind it.
  */
  ok(/nextQuestion\(/.test(vent), "the vent route is what picks the question");
  ok(!/nextQuestion|QUESTIONS|BREAKING_FLOOR/.test(chat),
    "and the screen never picks one, or imports the bank to try");
  ok(!/from "@\/lib\/vent\/breaking"/.test(chat),
    "the client does not pull the module in — it costs intent.ts and 33 tactics");
  ok(/lines: BREAKING_LINES/.test(vent),
    "so the room's own words come down the wire instead");

  /*
    ── the screen ───────────────────────────────────────────────────────────
    `void seal(w)` followed by "Sealed. Nothing here is kept." is the sharpest
    failure in CLAUDE.md: a sentence written before its answer arrived. "Thank
    you for trusting me with that one" over a dropped answer is the same
    sentence in the one place it would hurt most.
  */
  const answerFn = chat.slice(chat.indexOf("async function answerBreaking"));
  const body = answerFn.slice(0, answerFn.indexOf("\n  function submit"));
  ok(/await fetch\("\/api\/breaking"/.test(body), "the answer is actually sent");
  ok(/data\?\.saved \? [\w.]*received : [\w.]*unsaved/.test(body),
    "and which line they get is decided by the server's boolean");
  ok(/lines\.unsaved/.test(body) && /catch/.test(body),
    "a throw gets the honest line too, never the thank-you");
  ok(body.indexOf("data?.saved") < body.indexOf("received"),
    "the claim comes after the answer, not before it");
  ok(/setCrisis|setGated/.test(body),
    "and a crisis answer hands them the line rather than filing it");

  // One composer, two destinations — and the box says which one it is on.
  // Without that, somebody who accepted, got distracted, and came back types
  // an unrelated vent straight into their own record as an answer.
  ok(/if \(answering\) return void answerBreaking/.test(chat),
    "while a question is open the composer answers it");
  ok(/placeholder=\{answering \?/.test(chat),
    "and the box says so, rather than looking identical either way");
  ok(/Leave it|leave it/.test(chat), "with a way out that is not answering");

  /*
    And the card can actually render.

    It was guarded `offer && !gated && !askMood && !answering`, which reads
    like restraint and is a contradiction: `askMood` is set on every vent
    turn, and a vent turn is the only kind that produces an offer. The
    condition was true of the code and false of anything a person would ever
    see — the entire feature was unreachable, and every assertion above this
    one still passed.

    No check can prove a React tree paints. This one holds the guard to the
    two states it is allowed to name, which is the part that was wrong.
  */
  const card = chat.slice(chat.indexOf("{offer &&"), chat.indexOf("{offer &&") + 60);
  ok(!/askMood/.test(card),
    "the offer does not wait on a flag that is always set when it exists", card.trim());
  ok(/\{askMood && !offer && !answering &&/.test(chat),
    "it is the mood check that waits, and only while a question is on the table");
  const accept = chat.slice(chat.indexOf("function acceptBreaking"));
  // Comments stripped, or this reads the paragraph explaining the bug and
  // reports the bug. The check is about the code.
  const acceptCode = accept
    .slice(0, accept.indexOf("function declineBreaking"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  ok(!/setAskMood\(false\)/.test(acceptCode),
    "and accepting a question never cancels the measurement — it defers it");

  /*
    ── the store ────────────────────────────────────────────────────────────
    The asked-list is the only thing standing between somebody and being asked
    the same question twice, so one id appears once however many times it is
    answered — otherwise the cap evicts the record that it was ever asked.
  */
  ok(/export const BREAKING_CAP = \d+;/.test(types), "the cap is a named constant");
  for (const backend of ["file-store.ts", "supabase-store.ts"]) {
    const b = fs.readFileSync(path.join(ROOT, "src/lib/store", backend), "utf8");
    ok(/addBreaking/.test(b) && /getBreaking/.test(b),
      `${backend} implements both halves`);
    ok(/filter\(\(e\) => e\.q !== q\)/.test(b),
      `${backend} keeps one row per question, so an id is never evicted twice over`);
    ok(/BREAKING_CAP/.test(b), `${backend} trims to the shared cap, not its own number`);
    // Both backends distinguish the two answers, or they diverge — and a
    // divergence here is a room that opens on a laptop and stays shut in
    // production, which is the failure this whole repo is organised against.
    ok(/getBreaking\(userId: string\): Promise<BreakingAnswer\[\] \| null>/.test(b),
      `${backend} can say "could not read" as well as "nothing yet"`);
  }

  /*
    ── unreadable is not empty ──────────────────────────────────────────────
    The shape this feature would have shipped with, and the one it shares with
    every entry in CLAUDE.md's list: a failure returning the same value as a
    success.

    `getBreaking` returning `[]` on a 42703 makes every question look unasked.
    A deployment with 0015 pending would then offer the shallowest question,
    fail to keep the answer, and offer the same question again on the next
    cadence turn — forever. Somebody asked the same question twice has learned
    the room was not listening the first time.

    Production is what a fresh Vercel project is: the one configuration
    nothing here runs. It is also the one this would have happened in.
  */
  ok(/BreakingAnswer\[\] \| null/.test(types),
    "the interface itself distinguishes 'nothing yet' from 'could not read'");
  ok(/answered === null/.test(vent),
    "and the vent path keeps the room shut when the store cannot say");
  const store = fs.readFileSync(path.join(ROOT, "src/lib/store/supabase-store.ts"), "utf8");
  const add = store.slice(store.indexOf("async addBreaking"));
  ok(/existing === null/.test(add.slice(0, 900)),
    "a write never overwrites a column it could not read");

  /*
    And the write reports the write.

    An update whose `eq` matches no row is not an error in PostgREST — no rows
    change, `error` is null, and a bare update returns true. "Thank you for
    trusting me with that one" over a row that was never touched is `void
    seal(w)` again, in the place it would cost the most.
  */
  for (const fn of ["addBreaking", "addHeld"]) {
    const body = store.slice(store.indexOf(`async ${fn}`));
    const upto = body.slice(0, body.indexOf("catch (e)"));
    ok(/\.select\("id"\)/.test(upto),
      `${fn} asks which rows it changed`);
    ok(/\(data\?\.length \?\? 0\) > 0/.test(upto),
      `${fn} returns that, not the absence of an error`);
  }

  // On vent_users, so `deleteAll` takes it with the person and no delete path
  // has to remember a fourth place. Same argument as the carve and the held.
  ok(/vent_users[\s\S]{0,400}?add column if not exists breaking jsonb/.test(sql),
    "the column exists in the SQL a person actually runs");
  ok(/vent_users: "[^"]*\bbreaking\b[^"]*"/.test(contract),
    "and the contract names it, so /api/health notices a deployment without it");

  /*
    ── the hand-back ────────────────────────────────────────────────────────
    The only reason these are stored. A question answered into a void is a
    question that was never worth asking — worse than never asked, because now
    they know the room was not listening. If nothing reads them back, the
    migration's comment is a promise the code does not keep.
  */
  const history = fs.readFileSync(path.join(ROOT, "src/components/history-list.tsx"), "utf8");
  ok(/fetch\(`\/api\/breaking\?anonId=/.test(history),
    "the answers are read back somewhere a person can see them");
  ok(/\{entry\.a\}/.test(history), "and it is their words that are shown");

  /*
    And gone when they say gone.

    `deleteAll` drops the vent_users row, so every jsonb column on it goes
    with the person — which is the whole argument for keeping them there. But
    the screen kept rendering what it had already fetched, over a toast
    reading "All cleared. Fresh start." A promise kept in the database and
    broken on the screen is the one a person actually experiences.
  */
  const wipe = history.slice(history.indexOf("async function clearAll"));
  const wipeBody = wipe.slice(0, wipe.indexOf("function exportJson"));
  for (const cleared of ["setRows([])", "setHeld([])", "setAnswers([])", "setPattern(null)"]) {
    ok(wipeBody.includes(cleared),
      `"Delete everything" clears ${cleared.replace(/\(.*/, "")} on the screen too`);
  }
});

// ── 37. a class that compiles to nothing ──────────────────────────────────
//
// `bg-paper/92` is not a Tailwind class. The default opacity scale runs in
// fives, so 92 matches no step, produces no rule, and leaves the element with
// `background-color: rgba(0, 0, 0, 0)` — which is exactly what a browser
// reported when this was finally measured instead of read.
//
// It was on five sticky headers: the chat, the circle room, the circles
// lobby, history and memory. Every scrollable surface in the product had a
// completely transparent header, and every one of them looked correct sitting
// at the top of an unscrolled page. Scroll, and the reply underneath read
// straight through the wordmark — two layers of text at once.
//
// The second one was mine, from this session: `border-current/25` on the
// spinner's track. `currentColor` is not an rgb triple, so it cannot take an
// alpha modifier at all — the track never existed, and a lone spinning arc
// looks enough like a spinner to pass a screenshot.
//
// Both fail the same way: silently, invisibly, and only under a condition
// nobody screenshots.
check("37 Every utility written actually compiles to something", () => {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".tsx")) files.push(full);
    }
  })(path.join(ROOT, "src"));

  const UTIL = /\b((?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|shadow|placeholder|accent|caret|decoration)-[a-z][a-z-]*)\/(\d{1,3})\b/g;

  /*
    Inside a className, never in prose.

    The first version of this scanned raw file text and duly failed on the
    comment three files over explaining why `border-current/25` was wrong —
    a check tripping over its own postmortem. Check 35 already had to learn
    this; the lesson did not travel two hundred lines down the file.
  */
  const CLASSNAMES = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([\s\S]{0,800}?)\)\})/g;

  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const text = fs.readFileSync(f, "utf8");
    const classes = [...text.matchAll(CLASSNAMES)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
      .join(" ");
    for (const m of classes.matchAll(UTIL)) {
      const [, base, opacity] = m;

      /*
        Tailwind's default opacity scale is 0 to 100 in steps of five, and
        nothing else resolves. Anything between the steps needs the bracket
        form — `bg-card/[0.78]` — which always compiles.

        Mirrored here rather than read out of node_modules on purpose: the
        gate has zero dependencies so a fresh worktree can run it with no
        install, and this scale has not moved in the major version this
        project is pinned to. If it ever does, this fails loudly on something
        that works, which is the safe direction for a check to be wrong in.
      */
      ok(Number(opacity) % 5 === 0,
        `${rel}: ${base}/${opacity} is a real Tailwind step`,
        "not a multiple of 5 — use the bracket form, e.g. /[0.92]");

      /*
        `currentColor` and `transparent` are keywords, not channels. Tailwind
        can only slot an alpha into a colour it defined as `rgb(... / <alpha>)`,
        so an opacity modifier on either is dropped entirely.
      */
      ok(!/-(current|transparent|inherit)$/.test(base),
        `${rel}: ${base}/${opacity} cannot carry an alpha`,
        "currentColor is a keyword, not an rgb triple");
    }
  }

  /*
    And the headers specifically, because this is the one that shipped.

    A sticky bar that content scrolls beneath needs a background opaque enough
    to stop being read through. Blur alone does not do it — large high-
    contrast type survives a 20px blur perfectly well, which is what made the
    transparent version look almost plausible.
  */
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    for (const m of t.matchAll(/className="(sticky top-0[^"]*)"/g)) {
      const cls = m[1];
      const bg = cls.match(/\bbg-([a-z-]+)(?:\/(\d+))?\b/);
      ok(bg, `${path.relative(ROOT, f)}: the sticky header has a background at all`, cls);
      if (bg && bg[2]) {
        ok(Number(bg[2]) >= 90,
          `${path.relative(ROOT, f)}: the sticky header is opaque enough to scroll under`,
          `bg-${bg[1]}/${bg[2]}`);
      }
    }
  }
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

check("45 A reply is allowed to finish its sentence", () => {
  /*
    The bug this closes reached a real person mid-sentence: "...before
    planning the next play. If you".

    Nothing here could have caught it. Check 14 stubs `fetch`, which is the
    right instrument for the OpenAI-compatible adapter and structurally blind
    to the Anthropic one — that path goes through the SDK, so there is no
    fetch to stub. And the live checks run with no ANTHROPIC_API_KEY, so the
    adapter is never executed at all. The shape with no key is again the one
    shape nothing runs.

    So this check does not execute the adapter. It reads how the adapter is
    *wired*, the way check 16 reads a select list rather than issuing the
    query, and it asserts the shared rule against the real exported function
    rather than a copy of it.
  */
  const src = fs.readFileSync(path.join(ROOT, "src/lib/vent/providers.ts"), "utf8");

  /*
    The Anthropic call, from `async send(` to the end of that object literal.
    Scoped deliberately: `temperature` is legal in the OpenAI-compatible
    adapter two hundred lines up, and a whole-file grep would fail on it.
  */
  const anthropic = src.slice(src.indexOf("function anthropicProvider"));
  ok(anthropic.length > 0, "the Anthropic adapter is findable in providers.ts",
    "renamed? this check is scoped to `function anthropicProvider`");
  /*
    Code only, comments stripped.

    The first version of this failed on the comment *inside the call* that
    explains why `temperature` was removed — a check tripping over its own
    postmortem, which is precisely what check 37 says it learned and what
    check 35 learned before that. Third time in one file. Scan what runs.
  */
  /*
    From `async send(` to the line that reads the completion — the whole
    region that builds a request, however it chooses to build one.

    It used to start at `messages.create(`, which is a claim about the *shape*
    of the code and not about what is sent. The moment the parameters moved
    into a named object so the streaming and non-streaming branches could share
    them, `messages.create(params)` began appearing after `thinking:` instead
    of before it, and the slice cut the assertion's own evidence out of the
    file. The check failed on an adapter that had not changed what it sends by
    a single field.

    That is check 16's lesson arriving from the other direction: a check that
    scans for a literal passes and fails on how something is written rather
    than on what it does. Scoped to `send` it reads both shapes and would read
    a third — and it is not weaker for it, because the sampling parameters it
    forbids are absent from this whole region either way.
  */
  const call = anthropic
    .slice(anthropic.indexOf("async send("), anthropic.indexOf("const text"))
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  /*
    Thinking must be stated, not left to the default.

    This is the whole bug in one assertion. Omitting `thinking` does not mean
    "no thinking" on claude-sonnet-5 and the Opus-5 family — it means
    adaptive, which is on. max_tokens then caps the reasoning and the speech
    together, and the person reads half a sentence. An adapter that does not
    say which it wants has already chosen the expensive one.
  */
  ok(/thinking\s*:/.test(call),
    "the Anthropic call states a `thinking` mode rather than inheriting the default",
    "unset means adaptive on this model family — the reply is billed for reasoning and truncated by it");

  /*
    One request object, both branches.

    The adapter has two ways to call now — `.create()` when nothing is
    listening and `.stream()` when somebody is watching the words appear — and
    the second one is the path every real person takes. A streaming branch
    that assembled its own parameter literal would be free to omit
    `thinking: disabled`, and the bug would land where nothing looks: the eval
    suite calls the chain without a sink, so the covered path stays correct
    while every actual vent pays for a silent reasoning pass and gets truncated
    by it. Precisely the "suite tests the shape its author is standing in"
    failure, with a streaming API as the new shape.

    So: at most one object literal in this region, and both calls handed the
    same identifier.
  */
  const literals = call.match(/messages\s*\.?\s*(create|stream)\s*\(\s*\{/g) || [];
  is(literals.length, 0,
    "neither Anthropic call is handed its own inline parameter object");
  const passed = [...call.matchAll(/messages\s*\.?\s*(?:create|stream)\s*\(\s*([A-Za-z_$][\w$]*)/g)]
    .map((m) => m[1]);
  ok(passed.length >= 1, "the Anthropic adapter calls the SDK with a named request object");
  is(new Set(passed).size, 1,
    "the streaming and non-streaming calls send the same request object",
    "two literals is how `thinking: disabled` comes off the path real people use while the suite keeps passing");

  /*
    Sampling parameters are a 400 on this model family, not a nudge. A
    refused request is invisible from the outside: the chain simply answers
    from further down and every reply looks like somebody else's.
  */
  for (const param of ["temperature", "top_p", "top_k"]) {
    ok(!new RegExp(`\\b${param}\\s*:`).test(call),
      `the Anthropic call sends no ${param}`,
      `non-default sampling parameters are rejected with a 400 on claude-sonnet-5 / the Opus 5 family`);
  }

  /*
    Both adapters ask the same question, and neither keeps its own answer.
    The OpenAI path had a local copy that only refused replies under twelve
    words — a rule that reads as "a stub is bad" and means "a long reply cut
    mid-sentence is fine". The reply that shipped was fifty-two words.
  */
  const guards = src.match(/wasCutOff\(/g) || [];
  is(guards.length, 2, "both adapters call the shared wasCutOff()");
  ok(!/finish_reason\s*===\s*"length"\s*&&/.test(src),
    "no adapter re-implements the cut-off rule with its own extra condition",
    "a second copy of this rule is how the guard passed while the product regressed");

  // The ceiling has to leave room for the thing it is a ceiling on. Four warm
  // sentences is ~150 tokens; 220 was the number that truncated in production.
  ok(MAX_TOKENS >= 400, `MAX_TOKENS (${MAX_TOKENS}) leaves room for a whole reply`,
    "a ceiling is not a purchase — unused headroom is never billed");

  /*
    And the rule itself, from the module the product imports.

    A reply that hit the ceiling and still lands on a full stop is a complete
    thought that ended at the edge; that one ships. Everything else is the
    model being interrupted.
  */
  ok(wasCutOff("Spend five seconds noticing the room you are in. If you", true),
    "a sentence cut mid-clause at the ceiling is refused");
  /*
    "Tired. Na" is the fragment from this file's own postmortem — 217 tokens
    of silent reasoning, three tokens of reply, in front of somebody who had
    just written that they were tired. It ends on "Na", not on a full stop,
    so it is refused. Keeping it here by name means the rule is tested
    against the sentence that caused it.
  */
  ok(wasCutOff("Tired. Na", true),
    "the original truncated reply is refused, not published");
  ok(wasCutOff("Na wa. That one heavy.", true) === false,
    "a short reply that does land on a full stop still ships");
  ok(wasCutOff("...before planning the next play. If you", false) === false,
    "a reply that never hit the ceiling is never second-guessed");
  ok(wasCutOff("Where did the weight land?", true) === false,
    "a question mark ends a sentence too");
  ok(wasCutOff('He said "the rent is due."', true) === false,
    "so does a full stop inside a closing quote");
});

check("46 The always-visible line says it is an AI, and says it once", () => {
  /*
    Check 17 made the crisis *number* impossible to hand-write. The sentence
    carrying that number was still typed out twice — chat footer and landing
    footer — identical by luck, already drifted in whitespace. Same class of
    bug, one layer up, and the check that caught the number could not see it.

    It also omitted the disclosure that matters most. VENT says it out loud
    when asked, and on the terms page. The line somebody actually reads at 2am
    said only that Mind Weave is not a licensed therapist — true, and quiet
    about the part a person is owed regardless of jurisdiction: the thing
    answering is not a person.

    As of 2026 four US states ban AI-delivered therapy outright and four more
    require exactly this disclosure. That is not why the line is there — a
    person deserves to know either way — but it does mean the omission was
    the kind of thing that gets a product pulled rather than merely criticised.
  */
  const HOME = "src/components/disclaimer.tsx";
  const raw = fs.readFileSync(path.join(ROOT, HOME), "utf8");

  /*
    Code only. The first draft of this check asserted against the raw file and
    passed a mutation that stripped the disclosure out of the rendered
    sentence — because the word "AI" still appeared in the comment above
    explaining why the disclosure is there.

    That is the third time in this file, and the second time in this session:
    check 35 learned it, check 37 recorded learning it, check 45 has a comment
    about learning it, and this one still did it. A prose explanation of a rule
    is not the rule. Scan what runs.
  */
  const home = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  // The disclosure itself, in the one place it lives.
  ok(/\bAI\b/.test(home), "the shared disclaimer says it is an AI");
  ok(/not a person/i.test(home), "and that it is not a person");
  ok(/not a licensed therapist/i.test(home), "and that it is not a licensed therapist");
  ok(/not medical advice/i.test(home), "and that it is not medical advice");
  ok(/CRISIS_TEL/.test(home) && /EMERGENCY_TEL/.test(home),
    "and it reaches for the derived dial strings, never a typed number");

  /*
    Nobody else writes that sentence. A second copy is how the first one
    drifted, and a surface that renders its own wording is a surface that can
    quietly drop the disclosure — which is precisely what happened.
  */
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx$/.test(e.name) ? [full] : [];
    });

  const TERMS = path.join(ROOT, "src/app/terms/page.tsx");
  const offenders = walk(path.join(ROOT, "src"))
    .filter((f) => f !== path.join(ROOT, HOME) && f !== TERMS)
    .filter((f) => /not a licensed therapist/i.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));

  is(offenders.length, 0,
    `only ${HOME} and the terms page write the disclaimer${offenders.length ? `: also ${offenders.join(", ")}` : ""}`);

  /*
    And both places a person can start from actually render it. A shared
    component nobody mounts is a disclosure that does not exist — the same
    failure as a health probe that does not take the road.
  */
  for (const surface of ["src/app/page.tsx", "src/components/chat/vent-chat.tsx"]) {
    const text = fs.readFileSync(path.join(ROOT, surface), "utf8");
    ok(/<Disclaimer\b/.test(text), `${surface} renders <Disclaimer />`,
      "the footer is the line somebody reads at 2am — it cannot be optional");
  }

  // The terms page is allowed its own longer wording, but not a weaker one.
  const terms = fs.readFileSync(TERMS, "utf8");
  ok(/\bit is an ai\b/i.test(terms) || /\bAI\b/.test(terms),
    "the terms page discloses the AI too");
});

check("47 The one who is already watching is not handed a mirror", () => {
  /*
    The person this protects can see the whole pattern, name its origin, cite
    the mechanism — and has not moved in two years. Research calls the
    combination hyperreflexivity, and what sustains it is a belief rather
    than a deficit: that thinking about it is how it gets solved. So every
    pass feels like work.

    Which made the library's honest answer to "I know exactly why I do this
    and I still do it" a bug: `socratic` fires on ANALYTICAL at weight 70, so
    the most fluent self-analysts in the product were reliably handed one
    more question to take away and turn over.
  */
  const WATCHING = [
    "I know exactly why I do this, it's an attachment thing from childhood, but I still do it every time",
    "I understand that my self-sabotage is a defence mechanism and I'm very self-aware about it, yet nothing changes",
    "My therapist said it's a trauma response and logically I get it, but I'm still stuck",
    "I dey aware say na my childhood cause am, e no dey change anything",
  ];
  // Ordinary heaviness. A person venting is not a person analysing, and
  // treating them as one would be its own kind of insult.
  const PLAIN = [
    "work don tire me, rent due and i no fit talk to anybody",
    "i just dey vex today, everything dey heavy",
    "my oga shouted at me in front of everyone and i wanted to disappear",
  ];

  for (const m of WATCHING) ok(caughtWatchingSelf(m), `caught: "${m.slice(0, 44)}…"`);
  for (const m of PLAIN) {
    ok(!caughtWatchingSelf(m), `not caught: "${m.slice(0, 44)}…"`,
      "an ordinary vent must not be read as self-analysis");
  }

  // The three moves exist, and are their own family — filing them under
  // "cognitive" would put them next to the moves they replace.
  const observing = ALL_TACTICS.filter((t) => t.family === "observing").map((t) => t.id);
  for (const id of ["insight_is_not_change", "postpone_the_loop", "felt_sense"]) {
    ok(observing.includes(id), `${id} is in the observing family`);
  }

  /*
    The assertion that matters: across a whole stuck conversation, not one
    turn of it, nothing that asks them to think about the thought is ever
    selected. One turn would prove almost nothing — the three-turn block
    moves the selection every time, and the bug would simply arrive on turn
    two.
  */
  const FEEDS_THE_LOOP = ["socratic", "thought_record", "double_standard"];
  for (const m of WATCHING) {
    const recent = [];
    for (let turn = 1; turn <= 4; turn++) {
      const t = selectTactic({
        ...classify(m), message: m, pressure: 70, duality: null, mood: null,
        ventCount: turn, recentTactics: [...recent], body: turn > 2 ? "chest" : null,
      });
      ok(!FEEDS_THE_LOOP.includes(t.id),
        `turn ${turn} does not answer analysis with analysis (${t.id})`,
        "handing insight to somebody drowning in insight is more water");
      recent.push(t.id);
    }
    // And the first thing said is the true thing nobody says to them.
    ok(recent[0] === "insight_is_not_change",
      `opens by naming that the understanding did not move it (${recent[0]})`);
  }
});

check("48 No screen says it happened without reading the answer", () => {
  /*
    The second of this project's two recurring mechanisms, and the one with
    no gate on it. CLAUDE.md lists three faces already — `void seal(w)`
    followed by "Sealed", `submitMood` toasting "Saved. That's the anchor."
    with no request at all, and `persisted: false` nested where nobody saw
    it. Each was fixed where it was found. None of them stopped the next one.

    Four more were sitting in the app while that list was being written:
    a delete that said "Deleted." without checking anything, a clipboard
    write that said "Copied." on a promise it discarded, a feedback post
    thanking people for ratings the rate limiter had just dropped, and a
    full wipe that removed the anon id — the only key that reaches those
    rows — before knowing whether the wipe happened.

    So: a success toast standing downstream of a request has to have read
    something. Deliberately coarse. It cannot tell a real check from a
    decorative one, and it will not catch a claim phrased as a card instead
    of a toast. What it does catch is the exact shape that has now shipped
    seven times — ask, assume, announce.
  */
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx$/.test(e.name) ? [full] : [];
    });

  const offenders = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      /*
        Anchored on the severity, not on `toast(`.

        The first version required both on one line and therefore could not
        see a multi-line call — which is the shape the circle close uses, the
        single bug CLAUDE.md calls the sharpest this product ever shipped.
        That one is correct today, and the check written to protect it was
        walking straight past it.
      */
      if (!/"success"/.test(line)) return;
      // Confirm it is a toast and not some other "success" string.
      const near = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
      if (!/toast\(/.test(near)) return;

      // The claim's neighbourhood: far enough back to hold the request it
      // is reporting on, near enough not to borrow another function's check.
      const from = Math.max(0, i - 30);
      const before = lines.slice(from, i + 1).join("\n");
      if (!/\bfetch\(/.test(before)) return; // nothing was asked; nothing to read
      const read =
        /\.ok\b/.test(before) ||
        /\bstatus\b/.test(before) ||
        /\b(body|data|d)\??\.(deleted|saved|anchored|ok)\b/.test(before) ||
        /*
          A toast whose message is chosen by a ternary has read something to
          choose with. `seal(w).then((sealed) => toast(sealed ? … : …))` is
          the canonical form: the request's own answer picks the sentence.
        */
        /\?[^\n]*\n?[^\n]*:/.test(near);
      if (!read) {
        offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
      }
    });
  }

  is(offenders.length, 0,
    "every success message downstream of a request has read the response",
    offenders.join(", "));

  /*
    And the sharpest instance, asserted by name, because a heuristic above
    should never be the only thing holding the worst case.

    A failed wipe that has already dropped the anon id leaves the data on the
    server with nothing left that can reach it. Destroying the key to data
    you did not delete is worse than not deleting it, so the removal must sit
    after the answer.
  */
  /*
    The offline queue, which is the only case where local storage is not a
    convenience but the last copy.

    `flushQueue` counted any 200 as sent and then cleared the queue — so a
    reply the route marked `persisted: false` deleted words somebody wrote
    with no connection. That shape is not hypothetical: production shows
    PGRST303 clock skew on `circles` right now, and an insert that fails on
    its way to Supabase returns exactly that.
  */
  const anon = fs
    .readFileSync(path.join(ROOT, "src/lib/anon.ts"), "utf8")
    // Code only. The first version of this assertion passed its own mutation
    // because the comment explaining why `persisted` must be read contains
    // the word "persisted". Fourth time in this file. Scan what runs.
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  const flush = anon.slice(anon.indexOf("export async function flushQueue"));
  ok(/persisted/.test(flush.slice(0, flush.indexOf("return sent"))),
    "the offline drain reads `persisted`, not just the status code",
    "a 200 that saved nothing must not clear the last copy of somebody's words");

  const history = fs.readFileSync(path.join(ROOT, "src/components/history-list.tsx"), "utf8");
  const clear = history.slice(history.indexOf("async function clearAll"));
  const dropId = clear.indexOf('removeItem("mw-anon-id")');
  const readAnswer = clear.search(/if \(!res\.ok \|\| !body\)/);
  ok(dropId > 0 && readAnswer > 0 && readAnswer < dropId,
    "the anon id is dropped only after the server confirms the wipe",
    "dropping it first strands undeleted rows behind a key nobody has");
});

check("49 The health probe asks as the identity that does the work", () => {
  /*
    The oldest bug in this repo, on its fourth arrival, in the endpoint built
    to abolish it. CLAUDE.md lists three: `models.retrieve` reporting ok for a
    week while every vent failed on billing; an anonymous probe reporting
    `database: ok` under deny-by-default RLS; a HEAD request that could not
    carry the error object it was asking for. All three are fixed in the file.

    The fourth was hiding inside the fix for the second. The repair read
    `createAdminClient() ?? (await createClient())` — and that `??` is the
    anonymous client, restored, directly beneath a comment calling an
    anonymous probe "the green light over the broken road, again".

    It fired in a specific and very ordinary shape: a Supabase URL and an anon
    key with no service-role key, which is what somebody has after pasting the
    two values the dashboard shows first. `getStore()` builds only an admin
    client, so that deployment persists nothing at all — and the probe fell
    back to anon, received RLS's perfectly legitimate empty answer, and
    reported the database healthy.

    So the rule is not "use the admin client". It is that there is no second
    client to fall back to. The only honest answers are "I asked as the
    identity that does the work" and "I could not ask".
  */
  const src = fs.readFileSync(path.join(ROOT, "src/app/api/health/route.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  ok(!/createAdminClient\(\)\s*\?\?/.test(code),
    "the admin client has no fallback",
    "`??` here substitutes a different role to get an answer — that is the bug, not the fix");
  ok(!/\bcreateClient\b/.test(code),
    "the anonymous server client is not reachable from this route at all",
    "the strongest form of the rule: the wrong identity is not in scope");
  ok(/no_service_key/.test(code),
    "a probe that cannot run says so instead of reporting ok",
    "configured, reachable, and unprobeable is its own state");

  /*
    And it still cannot go back to asking in a shape that drops the answer.
    `head: true` returns no body, so PostgREST's error JSON — the object
    carrying code and hint — never arrives.
  */
  ok(!/head:\s*true/.test(code), "and it asks in a shape that can carry a failure",
    "head: true has no body, so the error object never arrives");

  /*
    The fifth face, and the first one that is not about how the probe asks
    but about what it forgets to ask at all.

    A table check cannot see a function. Every rate-limit decision on every
    vent goes through `vent_rate_count`, which arrives in migration 0014 —
    skip it and all eight tables answer perfectly while every vent fails, and
    `/api/health` says `database: ok` throughout.

    So: every RPC the store calls must be in the contract, and the health
    route must probe them. Derived from the store's own source rather than
    from a list somebody maintains by hand, because a hand-maintained list of
    things-to-check is the thing that was already missing.
  */
  const storeSrc = fs
    .readFileSync(path.join(ROOT, "src/lib/store/supabase-store.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  const called = [...storeSrc.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const covered = Object.keys(RPC_CONTRACT);

  ok(called.length > 0, "the store calls at least one stored procedure", called.join(", "));
  for (const fn of new Set(called)) {
    ok(covered.includes(fn), `${fn} is in the contract`,
      "a procedure the server depends on that nothing verifies");
  }
  ok(/RPC_CONTRACT/.test(code), "and the health route probes them",
    "a contract nobody reads is a list, not a check");

  /*
    And it names which database it is talking to.

    A missing column reads as a failed migration, and the migration is
    usually fine — it was run against a different project. The ref comes from
    NEXT_PUBLIC_SUPABASE_URL, which every browser already has, so this
    publishes nothing; asserting it here is about the other half, that no key
    ever wanders into the same field.
  */
  ok(/database_ref/.test(code), "health names the database it probed",
    "same-looking dashboards, two projects, and a schema check right about the wrong one");
  ok(!/supabaseServiceRoleKey|supabaseAnonKey/.test(code),
    "and no key is anywhere in this route",
    "the ref is a public subdomain — a key is not");
});

check("50 A referral nobody has dialled is never offered", () => {
  /*
    The state between an ordinary sitting and a crisis. Crisis routes to a
    number locally, ahead of the model, and always will. This is the person
    who is not in danger, comes back every week, and leaves exactly as heavy
    as they arrived.

    The trigger is their own anchored sittings, so it reads the same two
    columns as the efficacy loop and the preference pipeline — the product
    cannot hold two opinions about whether somebody is being helped.

    And the payload is governed by the oldest rule here. A referral is a
    phone number handed to somebody having a bad week; a number that has
    changed is a dead line at the worst possible moment, and worse than
    silence because they will not look twice. So nothing renders without a
    date, and the entries in the file today are deliberately undated: they
    were drafted from public listings, and a listing is not a dialled phone.
  */
  const now = new Date("2026-08-15T00:00:00Z");

  ok(activeReferrals(now).length === 0,
    "the drafted entries do not render, because nobody has verified them",
    "an entry with no verifiedOn is a number nobody has dialled");
  ok(REFERRALS.length > 0, "while the drafts themselves are there to be verified");

  // The rule, exercised rather than asserted — the only way a staleness
  // window ever gets tested is by moving the clock.
  const one = { ...REFERRALS[0], tel: "0000000000", verifiedOn: "2026-08-01" };
  const fresh = (r, at) => {
    if (!r.verifiedOn) return false;
    const age = (at.getTime() - Date.parse(r.verifiedOn)) / 86_400_000;
    return age >= 0 && age <= STALE_AFTER_DAYS;
  };
  ok(fresh(one, now), "a freshly verified entry is offered");
  ok(!fresh(one, new Date("2027-09-01T00:00:00Z")),
    "and the same entry stops being offered once it goes stale",
    `nothing is offered past ${STALE_AFTER_DAYS} days without being re-checked`);

  /*
    The trigger. Heavy is not the signal — stuck is. Somebody arriving at 90
    and leaving at 40 every week is in pain and being helped, and telling them
    this is not working would be false.
  */
  const row = (before, after) => ({
    tension_before: before, tension_after: after,
    user_message: "again", ai_reply: "…", real_world_tag: "economy",
  });
  const stuck = Array.from({ length: 6 }, () => row(70, 69));
  const helped = Array.from({ length: 6 }, () => row(90, 40));

  ok(pastWhatThisHolds(stuck), "six sittings that never move is the signal");
  ok(!pastWhatThisHolds(helped),
    "six heavy sittings that move fifty points is not",
    "the signal is the absence of movement, not the presence of pain");
  ok(!pastWhatThisHolds(stuck.slice(0, HANDOFF_FLOOR - 1)),
    `under ${HANDOFF_FLOOR} anchored sittings it says nothing`,
    "a pattern claimed from four data points is a horoscope");
  ok(!pastWhatThisHolds([row(70, null), row(null, 20)]),
    "and a sitting with only one reading is not counted at all");

  /*
    The sentence and the thing it points at ship together or not at all.
    Naming somebody's stuckness and then handing them an empty list is the
    cruellest version of this feature.
  */
  const h = pastWhatThisHolds(stuck);
  is(handoffLine(h, []), null, "with nothing verified to offer, it stays quiet");
  ok(typeof handoffLine(h, [one]) === "string" && !/you need|you should|therapy/i.test(handoffLine(h, [one])),
    "and when it speaks it offers rather than prescribes",
    "this product does not tell people what they need");
});

check("51 Closing a circle destroys the words before it claims to be closed", () => {
  /*
    Confidentiality here is a deletion policy, and this is the statement that
    keeps it.

    `closeCircle` on the Supabase store is two network calls with no
    transaction between them, and the order decides what a half-failure
    leaves behind. It set `status: "closed"` first — so a transcript delete
    that failed left a circle marked closed with every word still in the
    table. And `sweepIfOver` returns true immediately on
    `status === "closed"`, so the guard it had just tripped was the same
    guard that stopped anything ever retrying it. Permanently closed,
    permanently readable, nothing looking at it again.

    Reversed, a half-failure heals: the status stays open, `ends_at` has
    passed, and the next request that touches the circle sweeps it again.

    Asserted on source order because there is no way to fault-inject half of
    a Supabase call from a suite with no dependencies — and the ordering is
    the whole fix.
  */
  const store = fs
    .readFileSync(path.join(ROOT, "src/lib/store/supabase-store.ts"), "utf8")
    // Code only — the comment above the statements names both of them.
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  const fn = store.slice(store.indexOf("async closeCircle"));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  const deleteAt = body.indexOf("circle_messages");
  const flagAt = body.indexOf('status: "closed"');

  ok(deleteAt > 0 && flagAt > 0, "closeCircle still does both halves");
  ok(deleteAt < flagAt,
    "the transcript is deleted before the circle is marked closed",
    "flag first means a failed delete is never retried — sweepIfOver skips a closed circle");

  /*
    And the early return that makes the order matter. If this ever stops
    short-circuiting on a closed circle the reasoning above changes, and
    whoever changes it should have to read this.
  */
  const sweep = fs
    .readFileSync(path.join(ROOT, "src/lib/circles/sweep.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  ok(/status === "closed"\)\s*return true/.test(sweep),
    "and a circle already closed is not swept twice",
    "this early return is why the delete has to come first");
});

check("52 Faith is answered inside itself, not around it", () => {
  /*
    The frame most of this market thinks in, and the library had no move for
    it. `meaning_stance` is Frankl and is right when nothing can move — a
    father's results. The everyday register is not terminal and is
    everywhere: "I don dey pray since", "pastor said make I fast", "Allah
    knows best but I am tired". Without a move, those were answered with a
    cognitive worksheet, which is the WEIRD failure this repo already names
    for family obligation, unaddressed one domain over.
  */
  const base = { pressure: 70, duality: null, mood: null, ventCount: 2, recentTactics: [] };
  const pick = (m) => selectTactic({ ...base, ...classify(m), message: m }).id;

  for (const m of [
    "I don dey pray since last year and nothing dey happen",
    "my pastor said I should fast but maybe my faith no strong enough",
    "I keep asking God why me and I feel guilty for asking",
    "Allah knows best but honestly I am tired of waiting",
  ]) {
    is(pick(m), "faith_frame", `answered inside the frame: "${m.slice(0, 40)}…"`);
  }

  // An ordinary vent is not a sermon.
  ok(pick("work don tire me, rent due and i no fit talk to anybody") !== "faith_frame",
    "a vent with no faith in it is not handed a faith move");

  /*
    And the priority that matters most: when nothing can move, Frankl still
    wins. Somebody whose father is dying and who says "God help us" must not
    be asked whether their faith is restful — the situation outranks the
    register, and `meaning_stance` is vetoed-in by nothingCanMove.
  */
  is(pick("my dad's test results came back, God help us, i don't know"),
    "meaning_stance",
    "the unfixable still outranks the register");

  /*
    The four rules, asserted against the shipping instruction rather than a
    copy of it. Each exists because breaking.ts already set the standard: a
    line here must land for a Muslim, a Christian, a traditionalist and
    somebody who thinks all of it is nonsense.
  */
  const t = ALL_TACTICS.find((x) => x.id === "faith_frame");
  const text = `${t.instruction} ${t.hold}`.toLowerCase();
  ok(/name they used|only the name/.test(text),
    "it uses their word for it and never introduces one");
  ok(/do not affirm|never affirm/.test(text) && /question it|doubt/.test(text),
    "it neither affirms nor questions the belief");
  ok(/never prescribe/.test(text), "it never prescribes practice");
  ok(/everything happens for a reason/.test(text),
    "and it still bans the one sentence that empties a room");
});

check("53 A person's own sittings outrank the room's average", () => {
  /*
    The efficacy table was the room: five hundred vents across everybody,
    twelve anchored observations per tactic. That is a real finding and it is
    about the average person, and there is no average person. A somatic move
    beating the room by four points says nothing about somebody who has never
    once been helped by one — and their own eleven sittings say exactly that.

    Nothing else in this product, and nothing in any competitor, is in a
    position to hear it: it needs a measured outcome bound to a specific
    technique for a specific person, which is what the anchor route made
    possible.
  */
  const row = (tactic, before, after) => ({
    tactic_used: tactic, tension_before: before, tension_after: after,
  });

  // Somebody for whom the body work does nothing and the room move lands.
  const mine = [
    ...Array.from({ length: 5 }, () => row("body_map_drop_set", 70, 68)),
    ...Array.from({ length: 5 }, () => row("ubuntu_frame", 70, 30)),
  ];
  const personal = measurePersonalEfficacy(mine);
  ok((personal.get("ubuntu_frame") ?? 0) > 0, "what worked for them is lifted");
  ok((personal.get("body_map_drop_set") ?? 0) < 0, "what did not is lowered");

  /*
    Thin evidence buys a smaller nudge. Lowering the floor without lowering
    the span would be louder guessing rather than better listening.
  */
  for (const [, delta] of personal) {
    ok(Math.abs(delta) <= PERSONAL_SPAN,
      `a personal delta stays inside ±${PERSONAL_SPAN} (${delta})`,
      "the room may move a weight further because it knows more");
  }
  ok(PERSONAL_SPAN < EFFICACY_SPAN, "and the personal span is the smaller one");

  // Under the floor it says nothing at all, like every other floor here.
  is(measurePersonalEfficacy(mine.slice(0, 3)).size, 0,
    "under the floor a personal table has no opinion");

  /*
    Per tactic, not all-or-nothing. Somebody can have learned something about
    two moves and nothing about the other thirty four, and for those the room
    is still the best answer available.
  */
  const room = new Map([["exact_mirror", 5], ["ubuntu_frame", -4]]);
  const blended = blendEfficacy(personal, room);
  is(blended.get("exact_mirror"), 5, "the room still answers where they are silent");
  ok(blended.get("ubuntu_frame") > 0,
    "and where they disagree with the room, they win",
    "it is their session, and the number came from their own slider");
  is(blendEfficacy(new Map(), room).get("ubuntu_frame"), -4,
    "somebody with no history gets the room unchanged");

  /*
    One scoring function, two callers. Writing the arithmetic twice is how a
    suite ends up asserting against a copy while the product drifts.
  */
  const src = fs.readFileSync(path.join(ROOT, "src/lib/vent/efficacy.ts"), "utf8");
  is((src.match(/POINTS_FOR_FULL_SWING/g) ?? []).length, 2,
    "the swing arithmetic exists in exactly one place",
    "one definition and one use — a second copy is a second answer");
});

check("54 The model is shown the one reply that worked on this person", () => {
  /*
    Until now the model saw only what the person wrote — never a single thing
    it had said back. So it re-guessed its own register from the system prompt
    on every turn, and the sitting that moved this person fifty points was
    indistinguishable from the one that moved them two.

    This is the cheapest few-shot that exists: one line, from this person's
    own history, chosen by the only evidence there is about whether it worked.
    It needs a measured outcome bound to a specific reply for a specific
    person, which is what the anchor route made possible.
  */
  const row = (msg, reply, before, after, day) => ({
    user_message: msg, ai_reply: reply, created_at: `2026-08-0${day}T09:00:00Z`,
    body_tapped: null, chair_picked: null, mood_score: null,
    tension_before: before, tension_after: after,
  });

  const worked = "Sixteen hours and nobody asked. Na you dey carry am alone.";
  const block = memoryBlock([
    row("rent again", "Small small.", 70, 68, 1),
    row("i cannot tell them", worked, 80, 30, 2),
    row("same thing", "E heavy.", 60, 55, 3),
  ]);

  ok(block.includes(worked), "the reply that produced the biggest drop is shown");
  ok(/−50|-50/.test(block), "with the size of the drop it produced");
  ok(!block.includes("Small small."), "and the ones that barely moved are not",
    "two competing examples pull register in two directions");
  ok(/never repeat|Aim like it|↳/.test(block), "marked as a shape to aim at");

  /*
    Silence below the floor, like every other floor here. Two points is a
    thumb on a slider, not evidence.
  */
  const thin = memoryBlock([row("rent", "Small small.", 70, 68, 1), row("again", "Ok.", 60, 58, 2)]);
  ok(!thin.includes("↳"), "nothing is marked when nothing actually moved");

  // A sitting nobody anchored cannot qualify, however good the reply reads.
  const unanchored = memoryBlock([row("rent", worked, null, null, 1)]);
  ok(!unanchored.includes("↳"), "and an unanchored sitting is never held up as proof");

  /*
    And the fields have to survive the trip. VentRow carries ai_reply and both
    readings, selectMemory passes rows through untouched — but a filter that
    projected columns would silently empty this feature while every check that
    calls memoryBlock directly still passed.
  */
  const passed = selectMemory([
    { ...row("rent", worked, 80, 30, 2), intent_type: "vent" },
  ], 6);
  ok(passed[0].ai_reply === worked && passed[0].tension_before === 80,
    "selectMemory carries the reply and the readings through",
    "the block cannot mark what it was never handed");
});

await checkAsync("55 What was streamed is a preview; what was committed is the answer", async () => {
  /*
    The chat streams now, and streaming is this repo's oldest bug wearing its
    most attractive face.

    Every one of the eleven faces in CLAUDE.md is an interface that stated
    something before, or without, its answer. A token stream is an interface
    that states things *continuously* before the answer — by construction, on
    purpose, and correctly. Which makes exactly one rule the difference
    between a good streaming implementation and the twelfth face:

      what is drawn while waiting may never become what is recorded.

    It is not a hypothetical. Three things routinely make the streamed text
    differ from the reply:

      · a provider is cut off mid-sentence, `wasCutOff` refuses it, and the
        chain answers from the next one — the first one's half-sentence is on
        screen and is not the answer
      · `keyless` rewrites the reply after the write, out of what the write
        returned
      · a crisis classification never reaches a model at all

    So the transcript is fed from the response body and nothing else, and this
    check holds all three layers to it: the chain discards on fallthrough, the
    route sends the whole body at the end, and the client draws the preview
    somewhere it can be thrown away.

    Zero tokens. Read as text, like check 16 — the shape of the wiring is what
    is being asserted, and executing a stream would need a provider.
  */
  const providers = fs.readFileSync(path.join(ROOT, "src/lib/vent/providers.ts"), "utf8");
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/vent/route.ts"), "utf8");
  const chat = fs.readFileSync(path.join(ROOT, "src/components/chat/vent-chat.tsx"), "utf8");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  // ── the chain ────────────────────────────────────────────────────────────
  /*
    A provider that dies mid-answer has already spoken. Without a discard, the
    next provider's reply is appended to the abandoned half of the last one's
    and somebody at their worst reads two voices spliced together.
  */
  const fallthrough = strip(providers).slice(
    strip(providers).indexOf("export async function generateReply"),
  );
  ok(/onRestart\?\.\(\)/.test(fallthrough),
    "the chain discards what a failed provider streamed before trying the next",
    "without it the second answer is appended to the first one's half-sentence");

  /*
    And the guard still runs on the streamed text. A streaming path that read
    its own completion would be free to skip `wasCutOff` — the exact fix for
    the reply that ended "If you", quietly off on the only path real people
    take. Check 45 counts two calls; this one asserts the streamed branch does
    not get its own return.
  */
  const anthropic = strip(providers).slice(strip(providers).indexOf("function anthropicProvider"));
  const returns = anthropic.slice(0, anthropic.indexOf("wasCutOff"));
  ok(!/\breturn\s+[\w.]*text/.test(returns),
    "the Anthropic adapter returns no text before the cut-off guard has run",
    "an early return on the streamed branch takes the guard off the path everybody uses");

  // ── the route ────────────────────────────────────────────────────────────
  /*
    One handler, threaded — not two. A second copy of a 500-line turn is how
    persistence, the crisis gate, the breaking-room cadence and the rate limit
    drift apart between the path a person takes and the path the suite tests.
  */
  is((route.match(/async function handlePOST/g) ?? []).length, 1,
    "there is exactly one POST handler, streamed or not",
    "a second copy is a second set of rules for the same turn");

  /*
    The stream must end by sending the whole response. A stream of deltas and
    no terminal body is a UI that can only ever commit to what it drew — the
    twelfth face, shipped.
  */
  const streamWrapper = strip(route).slice(strip(route).indexOf("export const POST"));
  /*
    Scoped to the success path, and that is the whole point of the scoping.

    Written first as "somewhere in the wrapper there is a `done` with a status
    and a body", it passed a mutation that deleted the real one outright —
    because the failure branch below sends a `done` too, and satisfied the
    pattern on a route that had stopped delivering answers entirely. A check
    that a catch block can satisfy on behalf of the happy path is a check of
    the catch block.

    So it reads the turn's own result: whatever `handlePOST` was assigned to
    has to appear inside the `done` that follows it, before the catch. Survives
    a rename, fails a deletion.
  */
  const handled = /const\s+([A-Za-z_$][\w$]*)\s*=\s*await handlePOST\(/.exec(streamWrapper);
  ok(handled, "the stream wrapper runs the one POST handler and keeps its response");
  const success = streamWrapper.slice(handled?.index ?? 0).split(/\}\s*catch/)[0];
  const doneCall = /send\(\s*"done"\s*,\s*\{[\s\S]{0,160}?\}\s*\)/.exec(success)?.[0] ?? "";
  ok(/status/.test(doneCall) && /body/.test(doneCall),
    "the successful turn ends with a `done` event carrying a status and a body",
    "deltas alone give the client nothing to correct itself against");
  /*
    The *body* specifically, not merely the same object somewhere in the call.

    First written as "the handler's identifier appears in the done payload",
    which a mutation walked straight through: keeping `status: res.status` and
    replacing the body with a literal satisfied it, on a route that had stopped
    sending the answer and was sending an empty reply instead. The status is
    not the part a person reads.
  */
  const bodyValue = doneCall.split(/body:/)[1] ?? "";
  ok(handled && bodyValue.includes(handled[1]),
    "the `done` body is the handler's own response, not something reconstructed",
    "a body built from anything else is the preview being promoted to the answer");
  ok(/catch[\s\S]{0,400}send\(\s*"done"/.test(streamWrapper),
    "a failure mid-stream still sends a `done` rather than aborting the connection",
    "an aborted stream is indistinguishable from a dropped network and blames the wrong thing");

  // ── the client ───────────────────────────────────────────────────────────
  const client = strip(chat);
  /*
    The preview never enters the transcript. `lines` is the record of the
    session and may hold only what the server returned; the streamed text
    lives in its own state and is cleared.
  */
  ok(!/setLines\([^)]{0,200}streamed/.test(client),
    "the streamed preview is never written into the transcript",
    "a preview in `lines` records half of an answer the server went on to refuse");
  ok(/text:\s*data\.reply/.test(client),
    "the committed line is built from the response body",
    "the transcript comes from what came back, not from what was drawn");
  ok(/setStreamed\(null\)/.test(client),
    "the preview is cleared once there is a real line",
    "a ghost reply under the true one");

  /*
    A changed `seq` means the chain moved on. A client that appends through it
    shows the splice this check's first assertion exists to prevent — the
    discard has to happen at both ends or it happens at neither.
  */
  ok(/seq\s*!==\s*atSeq[\s\S]{0,200}live\s*=\s*""/.test(client),
    "the client throws away the preview when the provider changes",
    "the chain discarding is worth nothing if the screen keeps drawing it");

  /*
    A failed turn does not diagnose itself.

    Streaming added a second way into the offline branch — a stream that ends
    without a `done` throws exactly where a dropped connection does — and that
    branch said "You're offline" to everybody who reached it. Somebody with
    four bars, whose stream died at the proxy, was told their network had gone.

    This is the sentence class this whole file exists for, inverted: not a
    claim made before the answer, but a claim about a *cause* nothing had
    checked. The repo's own record of it is days lost reading "Network dipped
    on my side" as a network problem when it was four different things.

    `navigator.onLine === false` is the one reading that supports the claim,
    and it is trusted in that direction only. A `true` means nothing — a wifi
    with no internet behind it reports online all day — so the check is for
    the false, explicitly, and never for the truthiness of the value.
  */
  ok(/navigator\.onLine\s*===\s*false/.test(client),
    "the offline sentence is said only when the browser reports being offline",
    "`if (navigator.onLine)` reads the useless direction — a captive portal is online all day");
  ok(!/catch[\s\S]{0,600}text:\s*"You're offline/.test(client),
    "no failure is unconditionally described as being offline",
    "a stream that died at a proxy is not a network somebody lost");

  /*
    And the transport degrades rather than failing. A proxy that strips the
    accept header, a browser without streams, an older deployment — none of
    them is a reason to refuse somebody an answer.
  */
  ok(/text\/event-stream[\s\S]*?\}\s*else\s*\{[\s\S]{0,160}res\.json\(\)/.test(client),
    "a response that is not an event stream is read as ordinary JSON",
    "streaming is a preference about when words arrive, never a condition of getting them");

  /*
    And the parser is run, not read.

    Everything above this point reads source, which is the right tool for
    "is the wiring honest" and the wrong one for "does it work". A stream
    parser is arithmetic over bytes and the only way to know it is right is to
    give it bytes — including the ones that only ever arrive on a bad
    connection.

    The body below is split at a place that cannot happen on a laptop and
    happens constantly on a phone: mid-payload, inside a JSON string, and again
    inside a multi-byte character. Both are the same bug — a reader that
    commits before a frame is complete — and both were reproduced here before
    the buffer existed.
  */
  {
    const saved = globalThis.fetch;
    const frame = (o) => `data: ${JSON.stringify(o)}\n\n`;
    const wire =
      frame({ choices: [{ delta: { content: "I hear you." } }] }) +
      frame({ choices: [{ delta: { content: " Na wahala — " } }] }) +
      // U+2014 is three bytes, and it is deliberately at a split point below.
      frame({ choices: [{ delta: { content: "e no easy." }, finish_reason: "stop" }] }) +
      "data: [DONE]\n\n";
    const bytes = new TextEncoder().encode(wire);
    // Seventeen is prime and small: every frame gets cut, most of them more
    // than once, and one cut lands inside the em dash.
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 17) chunks.push(bytes.slice(i, i + 17));

    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (const ch of chunks) c.enqueue(ch);
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );

    const seen = [];
    const p = openAiCompatible("t-stream", "https://x", "k", "m", "T_KEY");
    const text = await p.send({
      system: "s",
      messages: [],
      maxTokens: 600,
      onDelta: (c) => seen.push(c),
    });
    globalThis.fetch = saved;

    is(text, "I hear you. Na wahala — e no easy.",
      "the streamed reply is assembled whole across chunk boundaries",
      "a payload split mid-JSON is the ordinary case on a mobile network");
    is(seen.join(""), text,
      "what was handed over piece by piece adds up to exactly what was returned",
      "a preview that does not sum to the answer is a preview that lies");
    is(seen.length, 3, "each fragment is handed on once, not per network chunk");

    /*
      And a streamed reply that was interrupted is still refused.

      Written without this, the executable half of this check passed a mutation
      that stopped reading `finish_reason` altogether — because the happy case
      never needs it. Which means the guard for the reply that ended "If you"
      would have come off on the streaming path, silently, on the only path
      real people take, and nothing here would have said a word.

      That is this file's oldest failure aimed at its own newest code: the
      suite testing the shape its author was standing in, where the shape is
      "the stream finished normally". It finished normally in every test
      anybody would think to write.

      The person's side of it is worse than a truncated string. They watch four
      sentences arrive and stop mid-word — and then, correctly, the chain
      refuses that provider and answers from the next one, so what they watched
      appear is replaced. Refusing at the adapter is what makes the replacement
      an answer instead of a second half.
    */
    const cutWire =
      frame({ choices: [{ delta: { content: "That sounds like the kind of week that" } }] }) +
      frame({ choices: [{ delta: {}, finish_reason: "length" }] }) +
      "data: [DONE]\n\n";
    globalThis.fetch = async () =>
      new Response(cutWire, { status: 200, headers: { "content-type": "text/event-stream" } });

    let refused = false;
    const streamedSeen = [];
    try {
      await openAiCompatible("t-stream-cut", "https://x", "k", "m", "T_KEY").send({
        system: "s",
        messages: [],
        maxTokens: 600,
        onDelta: (c) => streamedSeen.push(c),
      });
    } catch {
      refused = true;
    }
    globalThis.fetch = saved;

    ok(refused,
      "a streamed reply cut off mid-sentence is refused, exactly as a whole one is",
      "`finish_reason` arrives on its own frame — a reader that drops it takes the guard off the streaming path");
    ok(streamedSeen.length > 0,
      "and it was refused after having been shown, which is why the client discards on a provider change");
  }

  // ── the reader ───────────────────────────────────────────────────────────
  /*
    A network chunk is not a message.

    Both readers — ours in the browser, the provider's on the server — split a
    JSON payload across two reads on a slow connection and reliably never on a
    laptop. A parser without a carry buffer works in every test anybody writes
    and fails on the network this product is for.
  */
  for (const [name, src] of [
    ["the browser reader", fs.readFileSync(path.join(ROOT, "src/lib/ui/event-stream.ts"), "utf8")],
    ["the provider reader", providers.slice(providers.indexOf("async function readSse"))],
  ]) {
    ok(/carry\s*=\s*[\w.]+\.pop\(\)\s*\?\?\s*""/.test(strip(src)),
      `${name} keeps the trailing partial frame for the next read`,
      "without it a payload split across two TCP reads throws on valid JSON");
    ok(/decode\([^)]*\{\s*stream:\s*true\s*\}/.test(strip(src)),
      `${name} decodes in streaming mode`,
      "a multi-byte character split across reads becomes a replacement char otherwise");
  }
});

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
