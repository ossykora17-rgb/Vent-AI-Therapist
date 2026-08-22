import { CARRY_WORDS, OBJECTS } from "./chairs";

/**
 * The office rules, in one place.
 *
 * VENT runs a therapy office, not a motivational page. That sentence is the
 * whole of this file, and everything in it exists because the same instruction
 * had been written in four places in four wordings — the system prompt, the
 * offline grader's private `BANNED` array, the tactic library's authored
 * fallbacks, and the interface copy — with no way for any of them to disagree
 * out loud.
 *
 * `quality.ts` kept its own list of phrases to fail a reply for. Nothing in
 * the live path read it, and nothing anywhere checked the strings *we* wrote.
 * So the product could ship a scripted sentence in its own interface, forever,
 * while a grader nobody runs held the rule that forbade it.
 *
 * One table, one truth: the ban is defined here, the prompt is built from
 * here, the grader imports from here, and check 76 fails the build if any
 * authored string in the repository violates it.
 *
 * Which deployment shape makes this false? None. There is no store, no key and
 * no network in this file — it is a list and three pure functions, and it
 * behaves identically in production with nothing configured.
 */

export interface BannedPhrase {
  /**
   * The phrase in plain words.
   *
   * Here so the system prompt can be *generated* from this table rather than
   * carrying a hand-typed copy of it. `WHAT YOU NEVER SAY` in `prompt.ts` was
   * that copy: five of these phrases, typed again, in a file with no way to
   * know when this list changed. Check 76 asserts `re.test(say)` for every
   * row, so a regex that stops matching its own phrase fails the build.
   */
  say: string;
  /**
   * Ours, not the model's.
   *
   * "Carve your truth", "how tight is it" and "rattling the handle" are house
   * phrases: a model that has never seen this product cannot reach for them,
   * and listing them in the system prompt is ~40 tokens a turn spent
   * forbidding something that was never going to happen. They exist in this
   * table so the *build* fails when we write them — which is where they kept
   * appearing — so they are marked rather than removed, and the prompt is
   * generated from the ones a model actually reaches for.
   */
  ours?: true;
  re: RegExp;
  /** What it does to the person reading it, not what it is. */
  why: string;
}

/**
 * Phrases that end the session before it starts.
 *
 * Two kinds, and the second is the one this product kept writing.
 *
 * The first is self-help boilerplate: sentences that could be printed on a
 * mug and pasted into any conversation on earth. Somebody at 2am can tell
 * instantly, and the moment they can, nothing else you say is worth reading.
 *
 * The second is *our own house style, quoted back*. "Carve your truth" is the
 * product's tagline and it was also the placeholder in the box somebody types
 * their worst sentence into. A slogan at that exact moment is the room
 * advertising itself to a person who came in to say something. "How tight is
 * it" was the label above the pressure strip — a poetic reach for what is
 * plainly a number out of ten.
 *
 * A phrase we invented is not exempt for being ours. It is worse for being
 * ours, because it is everywhere.
 */
export const BANNED_PHRASES: readonly BannedPhrase[] = [
  { say: "rattling the handle", ours: true, re: /rattl\w*\s+the\s+handle/i, why: "our own metaphor, worn smooth" },
  { say: "carve your truth", ours: true, re: /carve\s+your\s+truth/i, why: "the tagline, said into somebody's worst hour" },
  { say: "how tight is it", ours: true, re: /how\s+tight\s+is\s+it/i, why: "a poem where a number out of ten was meant" },
  { say: "you've got this", re: /you'?ve?\s+got\s+this/i, why: "a cheer, and they did not come here to be cheered" },
  { say: "you are worthy", re: /you\s+are\s+worthy|you'?re\s+worthy/i, why: "a verdict nobody asked for" },
  { say: "step into your power", re: /step\s+into\s+your\s+power/i, why: "a poster, not a sentence" },

  /*
    Kept from the offline grader, which was the only place they lived.
    Every one is a sentence that can be pasted into any other conversation,
    which is the test.
  */
  { say: "I understand", re: /\bi understand\b/i, why: "claims a thing you cannot claim" },
  { say: "I'm here for you", re: /i'?m here for you/i, why: "a promise the code cannot keep" },
  { say: "that must be hard", re: /that must be (hard|difficult|tough)/i, why: "narrating their feeling at them" },
  { say: "tell me more", re: /tell me more/i, why: "a prompt, not a question" },
  { say: "how does that make you feel", re: /how does that make you feel/i, why: "the parody of this job" },
  { say: "as an AI", re: /\bas an ai\b/i, why: "a disclaimer in the middle of a sentence" },
  { say: "your journey", re: /\byour journey\b/i, why: "their life is not a journey" },
  { say: "hold space", re: /\bhold space\b/i, why: "workshop language" },
  { say: "sit with it", re: /\bsit with (?:it|that)\b/i, why: "the thing said when there is nothing to say" },
];

/**
 * Reading the file aloud — which is a different offence from recalling.
 *
 * The grader used to fail `/last time you\b/` as reciting, and the prompt's
 * context rules banned the phrase "last time you said…" by name. That was one
 * rule aimed at the wrong half of the problem, and it cost this product the
 * single thing that makes somebody feel known.
 *
 * The distinction that actually matters to a person: quoting *their* sentence
 * is being heard; narrating *our* record is being processed. "Last time you
 * said your brother still hasn't called" is a therapist. "You've brought this
 * up four times" is a system with a counter, and "based on our previous
 * sessions" is a system that wants you to know it has a database.
 *
 * So the recall is allowed and the bookkeeping is banned: counts, our word for
 * the container, and any sentence about where the information came from.
 */
/*
  The onboarding selection, read back by name.

  Generated from the chairs table rather than typed, so the grader and the
  screen cannot drift — the vocabulary is whatever the room actually offered.

  Narrow on purpose. It was once a bare `/you (chose|picked|selected)/`, and a
  dry run against the 51 authored replies flagged two of them: "What's the
  number she'd hear in your voice if you picked today?" and "You chose them
  and they spent it". Both are ordinary English about picking up a phone and
  trusting somebody, and a grader that fires on those teaches the model to
  avoid a common verb.
*/
const PICKED_BACK = new RegExp(
  `\\byou (?:chose|picked|selected) (?:the )?(?:${[
    ...OBJECTS.map((o) => o.label),
    ...CARRY_WORDS,
  ].join("|")})\\b`,
  "i",
);

export const FILE_LANGUAGE: readonly BannedPhrase[] = [
  { say: `you chose the ${OBJECTS[0].label}`, re: PICKED_BACK,
    why: "their tap off a list of six, quoted as if it were a confession" },
  { say: "four sessions ago", re: /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten) (?:of your )?sessions?\b/i,
    why: "a counter, read out" },
  { say: "you've brought this up", re: /\bbrought (?:this|that|it) up\b/i, why: "counting their repetitions at them" },
  { say: "our previous sessions", re: /\b(?:our|your) (?:previous|last|earlier) sessions?\b/i, why: "our word for the container" },
  { say: "your history", re: /\byour (?:history|file|record|profile|notes)\b/i, why: "they are not a file" },
  { say: "based on what you've told me", re: /\bbased on what you'?(?:ve| have)? (?:told|said|shared)/i, why: "citing a source at somebody" },
  { say: "I see from", re: /\bi see (?:from|that you'?ve)\b/i, why: "narrating the lookup" },
  { say: "my notes", re: /\b(?:my|our) notes\b/i, why: "there are no notes" },
  { say: "in our conversation history", re: /\bin (?:this|our) (?:chat|thread|conversation) history\b/i, why: "the interface talking about itself" },
];

/** The first banned phrase in a piece of text, or null. */
export function bannedPhrase(text: string): { match: string; why: string } | null {
  for (const { re, why } of BANNED_PHRASES) {
    const m = text.match(re);
    if (m) return { match: m[0], why };
  }
  return null;
}

/**
 * One to three sentences.
 *
 * The prompt said "three to four" and the grader complained at six, which is
 * a two-sentence gap where nobody was in charge. A tired therapist at 11am
 * does not produce four sentences; they produce one, and then a question.
 */
export const REPLY_SENTENCE_CAP = 3;

/** Terminal punctuation, ignoring the ellipsis somebody trails off with. */
export function sentenceCount(text: string): number {
  return text
    .replace(/\.{2,}/g, " ")
    .split(/[.!?]+(?:\s|$)/)
    .filter((s) => s.trim().length > 0).length;
}

/**
 * What the room says when it genuinely has nothing.
 *
 * The honest half of MEMORY FIRST, and it has to be a constant rather than an
 * instruction, because "say you don't remember" is the one sentence a model
 * will happily improvise a warmer version of. A first-time visitor being told
 * "I remember you mentioned…" is the worst failure available here.
 */
/*
  His words, not a paraphrase of them.

  This read "I don't have that from before yet." — close, and not the same
  sentence. The spec has now named the exact line twice, and a constant that
  approximates a specified string is the drift this file exists to stop.
*/
export const NO_MEMORY_LINE = "We haven't talked about this yet.";

/**
 * What this product says it is, in one place.
 *
 * "Carve your truth." was the tagline, the composer's placeholder, the input's
 * label, the share text, the manifest description, the page metadata and the
 * README — eight hand-typed copies of one slogan, one of which sat inside the
 * box somebody types their worst sentence into.
 *
 * The slogan is banned above, so the copies had to become something. They
 * became this: a sentence that says what the room is instead of what the
 * person should do. Everything that needs a description imports it.
 */
/**
 * The product's name, as a person sees it. Metadata in two files had its own
 * copy each.
 */
export const PRODUCT_TITLE = "Mind Weave Vent — Truth Anchor";

/**
 * What the room says when a deletion did not happen.
 *
 * The chat and the Memory page both offer "Forget this", both call the same
 * route, and both read the same field of the same answer — `kept-list.tsx`
 * says so in its own docstring: "a second implementation of 'is it gone' is a
 * second answer to the only question that matters on this page." It imported
 * the logic and then hand-typed the sentence twice.
 *
 * A sentence about a promise that was not kept is the last place two copies
 * should be allowed to drift.
 */
export const FORGET_FAILED = "Could not clear that. It is still here.";

export const PRODUCT_LINE =
  "Somewhere to put the thing you can't say out loud yet.";

/**
 * The reply contract, written once and injected into the system prompt.
 *
 * This is the founder's spec for the office, kept verbatim in intent and
 * compressed in wording, with one resolution made explicit rather than
 * silently picked — see MEMORY, below.
 */
export const OFFICE_RULES = `THE OFFICE
You run a therapy office. Not a motivational page, not a coach, not a friend
who cheers. A tired but good therapist at 11am: calm, blunt, "you" and "I".

EVERY REPLY
1. Connect to what they said before, in their own words if you have them.
2. React to what they just said.
3. Ask one question that digs. One.

${REPLY_SENTENCE_CAP} short sentences, maximum, and often one is right. No metaphor, no
lecture, no preamble. If a sentence could be printed on a mug, delete it.

Four parts reflecting what they actually said to one part asking, and zero
parts advice they did not ask for. If they ask for advice you may give it;
until then their sentence is the material and there is nothing to improve.

NEVER SAY, in any wording — each of these fits any conversation on earth,
which is exactly how somebody knows nobody is there:
${BANNED_PHRASES.filter((b) => !b.ours).map((b) => `"${b.say}"`).join(", ")}.
`;
