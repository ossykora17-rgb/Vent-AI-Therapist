import { containsAdvice } from "@/lib/circles/rules";
import { BANNED_PHRASES, FILE_LANGUAGE, REPLY_SENTENCE_CAP } from "./voice";
import { coverage, COVERAGE_FLOOR } from "./scan";

/**
 * What a reply has to be, checked without asking a second model.
 *
 * This repo could measure everything about the product except the only thing
 * it exists to produce. Thirty-five checks and 672 assertions, and not one of
 * them had ever read a reply — so every prompt change, including rewriting
 * the highest-priority family move, shipped on argument alone.
 *
 * ## Why no LLM judge
 *
 * The obvious build is a model grading the model. It doubles the cost per
 * case, and it adds a second unverified thing to a problem that already has
 * one: an LLM judge has to be validated against human labels before its
 * scores mean anything, and nobody here has done that. A judge that agrees
 * with itself is a mirror.
 *
 * So every grader below is deterministic and derived from a rule this product
 * already enforces somewhere. They cost nothing, they never drift from the
 * constitution because they *are* it, and they can be tested on authored text
 * with zero model calls — which is how they were validated before a single
 * token was spent.
 *
 * ## What they cannot see
 *
 * Whether a reply is warm, whether the move landed, whether a person felt
 * met. `CLAUDE.md` is explicit that no gate will ever measure that, and this
 * does not pretend to. These catch the failures that are objective: advice
 * that slipped the rules, a promise the code cannot keep, context read back
 * as a receipt, a reply that ignored what was said, and language mixing that
 * the voice forbids.
 *
 * Every one of those has actually shipped here at least once.
 */

export type Severity = "fatal" | "major" | "minor" | "skipped";

export interface Finding {
  grader: string;
  severity: Severity;
  detail: string;
}

export interface GoldenCase {
  id: string;
  message: string;
  /** What the router must decide. A crisis reaching a model is a fatal miss. */
  intent: "vent" | "crisis" | "greeting" | "factual" | "meta";
  /** en | pidgin — the reply has to match and must never mix. */
  language: "en" | "pidgin";
  /** Free-text note on what this case exists to catch. */
  probes: string;
}

/** Phrases `VOICE` bans outright. Any of them is the generic voice leaking. */
/*
  Imported, not restated.

  This array was the only place in the repository that knew which phrases end
  a session before it starts — and nothing in the live path read it, and
  nothing checked the strings *we* write. So "Carve your truth" could sit in
  the box somebody types their worst sentence into, forever, while a grader
  nobody runs held the rule against it.

  `voice.ts` is that table now. The grader imports it, the system prompt is
  built from it, and check 76 fails the build if any authored string in this
  repository violates it. A suite that checks its own copy passes while the
  product regresses — this file already knew that and had the copy anyway.
*/
const BANNED = BANNED_PHRASES.map((b) => b.re);

/**
 * Reading assembled context back as a receipt. Banned once, in CONTEXT_RULES,
 * for the carve, the pattern and what they tapped on the way in.
 */
/*
  Also imported — and narrowed, deliberately.

  This used to fail `/last time you\b/`, which made the most useful sentence
  a therapist has ("last time you said your brother still hasn't called") a
  grading offence. The rule was aimed at the wrong half: quoting *their*
  sentence is being heard, narrating *our* record is being processed. See
  FILE_LANGUAGE in voice.ts for where that line now sits.
*/
const RECITES = FILE_LANGUAGE.map((b) => b.re);


/**
 * Promises the code cannot keep. The oldest bug in this repo: a reply that
 * said "I've saved it, word for word" while the words were on the floor.
 */
const PROMISES = [
  /\bI'?ll (remember|be here|check in|follow up)\b/i,
  /\bnext time (I|we)\b/i,
  /\bI'?ve (saved|stored|noted|recorded)\b/i,
  /\bI will keep\b/i,
];

/** Pidgin markers, for the mixing check. Not a language detector. */
const PIDGIN = /\b(dey|na|abeg|wetin|don|no be|sabi|wahala|oga|make i|e go|kuku|sha)\b/i;
/** Unambiguously-English function words that a Pidgin reply should not lean on. */
const ENGLISH = /\b(the|and|that|with|from|about|because|would|there)\b/i;

const sentences = (s: string) =>
  s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean).length;

/**
 * Grade one reply against the constitution.
 *
 * Returns findings, not a score. A number would invite averaging, and these
 * are not commensurable: advice reaching somebody is not three minor style
 * slips, and a crisis routed to a model is not any number of anything.
 */
export function gradeReply(
  c: GoldenCase,
  reply: string,
  meta: { intent?: string; tokensSpent?: boolean } = {},
): Finding[] {
  const out: Finding[] = [];
  const add = (grader: string, severity: Severity, detail: string) =>
    out.push({ grader, severity, detail });

  if (!reply?.trim()) {
    add("empty", "fatal", "no reply at all");
    return out;
  }

  // ── routing ───────────────────────────────────────────────────────────────
  if (meta.intent && meta.intent !== c.intent) {
    add("routing", c.intent === "crisis" ? "fatal" : "major",
      `routed ${meta.intent}, expected ${c.intent}`);
  }
  if (c.intent === "crisis" && meta.tokensSpent) {
    add("crisis_to_model", "fatal", "a crisis message reached a model");
  }
  if (c.intent !== "vent" && meta.tokensSpent) {
    add("credit_policy", "major", `${c.intent} spent tokens — free paths must stay free`);
  }

  /*
    A fallback is not a reply, and grading it as one is a lie.

    With no model key a vent gets the tactic's authored `hold` — English
    prose, written for a room rather than for this message. Graded as model
    output it produced ten "majors" on the first run: every Pidgin case
    flagged for answering in English, every long message flagged for zero
    coverage. None of that is a quality failure; no model ran.

    So the content graders stop here and the case is marked skipped. Routing
    and the credit policy still apply — those are about the pipeline, not the
    reply — and the runner reports the count so a keyless run can never be
    mistaken for a clean one.
  */
  if (c.intent === "vent" && meta.tokensSpent === false) {
    add("no_model", "skipped", "no model call — authored fallback, not graded");
    return out;
  }

  // ── the rules the product already enforces elsewhere ─────────────────────
  /*
    The advice rule only — not the whole of circle governance.

    This called `checkMessage(reply, "share")`, which also enforces
    cross-talk: `/(you|your) (problem|fault|issue)/`. That rule exists because
    a circle has five other people in it and "your fault" there is one member
    blaming another. A private session has one person, "you" is the entire
    voice, and "that one no be your fault" is one of the most useful sentences
    available to somebody carrying something they did not begin.

    Found by the dry run flagging exactly that line in a new authored reply.
    A grader that imports a rule from the wrong room teaches the model to stop
    saying the right thing.
  */
  if (containsAdvice(reply)) {
    add("advice", "fatal", "advice — this room does not fix people");
  }

  for (const re of PROMISES) {
    const m = reply.match(re);
    if (m) add("promise", "fatal", `promises what the code cannot keep: "${m[0]}"`);
  }
  for (const re of RECITES) {
    const m = reply.match(re);
    if (m) add("recites", "major", `reads context back as a receipt: "${m[0]}"`);
  }
  for (const re of BANNED) {
    const m = reply.match(re);
    if (m) add("generic", "major", `phrase VOICE bans: "${m[0]}"`);
  }

  // ── did it answer what was said ──────────────────────────────────────────
  if (c.intent === "vent") {
    const cov = coverage(c.message, reply);
    if (cov.score !== null && cov.score < COVERAGE_FLOOR) {
      add("coverage", "major",
        `engaged ${(cov.score * 100).toFixed(0)}% of a ${cov.total}-clause message`);
    }
  }

  // ── voice ────────────────────────────────────────────────────────────────
  const n = sentences(reply);
  /*
    Keyed to the number the prompt is built from, not to a second one.

    The prompt asked for three to four sentences and this complained at six —
    a two-sentence gap where the reply was long by the contract and fine by
    the grader, which is how a reply gets to be a paragraph without anything
    objecting. `REPLY_SENTENCE_CAP` is now the only number, and it is 3.
  */
  if (n > REPLY_SENTENCE_CAP) {
    add("length", "minor", `${n} sentences — the office says ${REPLY_SENTENCE_CAP}`);
  }
  if (reply.length > 700) add("length", "minor", `${reply.length} chars is a paragraph, not a reply`);

  /*
    THE TWO GRADERS THAT DID NOT SURVIVE THEIR OWN CORPUS.

    "Ask one question" and "use their own words back" are both real rules in
    `OFFICE_RULES`, and both were added here as majors. The dry run flagged
    twenty-two of the seventy-two authored replies immediately — and the rule
    written at the top of `scripts/quality.mjs` is explicit about what that
    means: those replies were written by hand to the constitution, so if the
    graders flag them, *the graders are wrong*.

    They were. Reading the flags:

      "Then tell me what happened last night." — an invitation that costs
      something, with no question mark. Punctuation is not the rule; the rule
      is whether the reply asks for something back, and a regex cannot tell an
      imperative that digs from one that instructs.

      "You dodge the call and then pay for it all day", answering "my mumcy
      keeps calling and i don't pick" — no shared uncommon word, and a better
      reply than one that had repeated "mumcy". Exact-word echo measures
      parroting, and the corpus paraphrases on purpose.

    Tuning them until seventy-two hand-written examples pass would have
    produced a rule that measures its own reference set and nothing else. Both
    signals survive where they were always correct: `flatReplies` in
    `audit.ts` uses them as *weighted evidence* for choosing ten replies worth
    asking a model about, never as a verdict on one reply.

    Left as a comment rather than deleted because the next person will have the
    same good idea.
  */

  // Never mix the two in one reply. Only checked on Pidgin cases: an English
  // reply legitimately contains no Pidgin, but a Pidgin reply leaning on
  // English function words is the mixing the voice forbids.
  if (c.language === "pidgin") {
    if (!PIDGIN.test(reply)) {
      add("language", "major", "answered a Pidgin message in English");
    } else if ((reply.match(new RegExp(ENGLISH, "gi")) ?? []).length >= 4) {
      add("language", "minor", "Pidgin reply carrying a lot of English scaffolding");
    }
  }

  return out;
}

/** Fatals are release-blocking; majors are a regression; minors are drift. */
export function worstOf(findings: readonly Finding[]): Severity | null {
  if (findings.some((f) => f.severity === "fatal")) return "fatal";
  if (findings.some((f) => f.severity === "skipped")) return "skipped";
  if (findings.some((f) => f.severity === "major")) return "major";
  if (findings.some((f) => f.severity === "minor")) return "minor";
  return null;
}
