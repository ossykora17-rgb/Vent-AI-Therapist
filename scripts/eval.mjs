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
const { selectTactic, REAL_WORLD_TACTIC, ALL_TACTIC_IDS, ALL_TACTICS } =
  await app("src/lib/vent/tactics.ts");
const { buildFlavour } = await app("src/lib/flavour/profile.ts");
const { CONFIDENCE_FLOOR } = await app("src/lib/flavour/types.ts");
const { tensionDrop, tensionForChair, tensionNow, CHAIRS } = await app("src/lib/vent/chairs.ts");
const { selectMemory } = await app("src/lib/vent/memory.ts");
const { checkMessage, economyFact, keeperIntention, keeperReflection, roleForSeat } =
  await app("src/lib/circles/rules.ts");
const { PRESENCE_WINDOW_MS, TYPING_WINDOW_MS, isPresent, isTyping, presenceOf, shouldTouch } =
  await app("src/lib/circles/presence.ts");
const { guardianVerdict, THRESHOLD } = await app("src/lib/external/guardian.ts");
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
  ok(/no fixing here/i.test(advice.reason ?? ""), "and refused for the right reason", advice.reason);
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

  ok(/I've saved it, word for word/.test(kept),
    "with a store behind it, it may say the words were kept");
  ok(!/I've saved/.test(dropped),
    "with no store, it never claims they were", dropped);
  ok(/nothing here is being saved/.test(dropped),
    "it says so plainly instead of leaving them to assume");
  ok(kept.includes("Say the next part") && dropped.includes("Say the next part"),
    "either way the session keeps moving");

  // With no key at all, a real-world vent can still be answered with the room
  // phrasing its tactic already carries — authored, not generated. The saving
  // claim has to survive that path too.
  const hold = REAL_WORLD_TACTIC.economy.hold;
  const withHold = noModelKeyReply(false, hold);
  ok(withHold.includes(hold), "an authored hold is offered rather than a shrug");
  ok(!/I've saved/.test(withHold),
    "and it still does not claim a save it did not make", withHold);
  ok(noModelKeyReply(true, hold).includes("word for word"),
    "with a store behind it, the same reply may say the words were kept");
  ok(!noModelKeyReply(false, null).includes("That's the move"),
    "a tactic with no authored hold invents nothing to fill the space");
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
