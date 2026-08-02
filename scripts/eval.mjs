/**
 * Stage 5 — the eval suite. MMLU, but for truth instead of trivia.
 *
 *   node scripts/eval.mjs                          # 12 checks, no server
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
const { selectTactic, REAL_WORLD_TACTIC, ALL_TACTIC_IDS } = await app("src/lib/vent/tactics.ts");
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
});

// ── live: the four things only a running room can prove ────────────────────
if (BASE) {
  const post = (p, body, method = "POST") =>
    fetch(`${BASE}${p}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  await checkAsync("13 A Keeper does not speak to an empty room", async () => {
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
