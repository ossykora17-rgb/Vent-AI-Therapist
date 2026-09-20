import type { Probe } from "./probes";
import { ALLIANCE_AT } from "./intake";

/**
 * The shape of a sitting, and the one moment the room asks for a number.
 *
 * WHAT THIS REPLACES, AND WHY A CARD COULD NEVER BE THE ANSWER
 *
 * "BEFORE YOU GO" was a full-width card with ten buttons. It became the
 * teaching state for two sittings and a hairline track after that, and the
 * card was still the wrong object: it appears *beside* the conversation, in
 * its own box, with its own heading, announcing that the room wants something.
 * Shrinking it and fading it made it quieter. It did not make it part of the
 * room. A person reading it knows they are being measured, because a thing
 * that pops up to ask is a form however small it is drawn.
 *
 * So the question moves into the only place it can be invisible: **the room's
 * own last question.** Every vent reply already ends on a question — that is
 * the reply contract in `voice.ts`, and `probeBlock` is the slot it fills. On
 * the turn the room decides a sitting is landing, the question that fills that
 * slot *is* the weight question. Same sentence count, same voice, same place on
 * the screen as every other thing the room has said. Nothing pops, nothing is
 * headed, nothing announces an agenda.
 *
 * The measurement is then a side-effect of the room doing what it was already
 * doing, which is the whole design brief: extraction as a consequence of
 * self-reflection, never as a product demand.
 *
 * **It costs nothing in the prompt.** Check 24 measures the heaviest assembly
 * at exactly 3,600 tokens against a 3,600 ceiling, and its own comment says
 * whoever raises that number should have deleted something. This module adds
 * no block and no sentence: it swaps which probe fills a slot that is already
 * there and already paid for. An arc that needed a paragraph would have had to
 * take one, and the honest version of that change is a different commit.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not touch tactic selection. The obvious next move is to filter the
 * 45 tactics by phase, and it is not made here: this file's own neighbours
 * record what happens when a selector is tuned without counting — `exact_mirror`
 * at 90 shipped a template as the product's first reply, and `earned_worth` was
 * weighted on a sample of three. Phase-filtering the library is a real idea and
 * it needs a count behind it, on the real corpus, before it decides anybody's
 * reply. Stated here rather than left as a silent absence.
 */

/**
 * Where a sitting is.
 *
 * Derived every turn from what the request already carries — no model call, no
 * stored state, no extra query. A phase that had to be remembered would be a
 * sixth thing this product keeps about somebody, and it would be wrong the
 * first time a tab was closed.
 */
export type Phase = "opening" | "widening" | "naming" | "landing";

export interface ArcState {
  /** Exchanges this sitting, counting the one being answered. */
  exchanges: number;
  /** Words in the message being answered. */
  words: number;
  /** What they have typically written this sitting, in words. */
  typicalWords: number;
  /** They have already put a number on it this sitting. */
  moodGiven: boolean;
  /** The room has already asked, this sitting. */
  asked: boolean;
  /** Their words are winding the sitting down. */
  closingWords: boolean;
  /**
   * Something heavy is open — a crisis turn, or a question the room has put on
   * the table and not had answered yet.
   *
   * The card's crime in its subtlest form is winding up a sitting while
   * somebody is still mid-disclosure. A room that starts closing while a person
   * is opening has stopped listening, and it reads worse than the card did
   * because it is wearing the room's own voice while doing it.
   */
  heavy: boolean;
}

/**
 * A sitting with enough shape to have a middle.
 *
 * `ALLIANCE_AT` is where `intake.ts` already says a sitting has stopped being
 * an opening, so the arc borrows that rather than introducing a second opinion
 * about the same moment. One more exchange on top, because landing on the turn
 * the alliance is spoken would put two pieces of room-furniture in one reply.
 */
export const LAND_NOT_BEFORE = ALLIANCE_AT + 1;

/**
 * Enough habit to have a taper at all.
 *
 * THE ABSOLUTE THRESHOLD WAS INVENTED AND THE DATA KILLED IT
 *
 * This was `SHORT_TAIL_WORDS = 12` — "a message short enough to be a goodbye
 * rather than a thought" — and it reached **62 of 72** messages in the authored
 * corpus. The reason is one measurement nobody had taken: **the median message
 * in this product is eleven words.** Twelve was not a short tail, it was the
 * typical thing a person writes here. A detector that fires on the median is
 * `exact_mirror` at weight 90, wearing the room's voice so that nobody can
 * even tell they are being asked.
 *
 * So there is no absolute ceiling any more. Tapering is relative to *their*
 * habit and nothing else, and this constant only says when there is a habit to
 * be relative to. Somebody whose every message is four words has no taper, and
 * reading one would ask a terse person for a number on turn four.
 */
export const MIN_HABIT_WORDS = 6;

/**
 * How much shorter than their own habit counts as tapering.
 *
 * Half. Measured rather than imagined this time: against the corpus's own
 * median habit it reaches 5 of 72 messages, where a third reaches 3 and the
 * old absolute threshold reached 62.
 *
 * The corpus is 72 *opening* messages, so this is a floor on the real rate
 * rather than an estimate of it — a message at the tail of a sitting is far
 * more likely to be short than one that starts it. Stated rather than smoothed
 * over, and no check asserts the value.
 */
export const TAPER_RATIO = 2;

/**
 * Words that end a conversation in either language this room speaks.
 *
 * English and Naija together, in one list, for the reason `PIDGIN_GRAMMAR` and
 * the crisis list are in one place: two detectors of the same thing disagree
 * eventually, and the disagreement is invisible until something reads both.
 *
 * Every entry has to be a *closing* move and not merely a casual word.
 * `anyway` is in and `ok` is not: "ok so my boss called me" opens a vent, and a
 * room that reads that as leaving would ask for a number on the first sentence
 * of the worst thing somebody has to say. Same reason `fine` is out — this
 * repo's own probe list keeps it under `PERFORM`, where it means the opposite
 * of finished.
 */
const CLOSING = /\b(anyway|thanks|thank you|goodnight|good night|later|that'?s all|that is all|i'?m done|i am done|going to bed|make i go|i dey go|i go rest|e don do|na so|abeg make i go)\b/i;

/** Do their words end the sitting rather than continue it? */
export function saysClosing(message: string): boolean {
  return CLOSING.test(message);
}

/** Is this message short against their own habit this sitting? */
export function tapering(words: number, typicalWords: number): boolean {
  if (typicalWords < MIN_HABIT_WORDS) return false;
  return words <= typicalWords / TAPER_RATIO;
}

/**
 * Is the room landing this sitting?
 *
 * Detected, never scheduled. A fixed turn number would be the card again with
 * a timer on it — the same demand, arriving on somebody else's clock, which is
 * the thing being removed. Every refusal below is a sitting the room stays in.
 */
export function isLanding(s: ArcState): boolean {
  if (s.heavy) return false;
  if (s.asked) return false;
  if (s.moodGiven) return false;
  if (s.exchanges < LAND_NOT_BEFORE) return false;
  return s.closingWords || tapering(s.words, s.typicalWords);
}

/**
 * Where the sitting is, for anything that wants to know.
 *
 * `naming` is the phase where the room's most valuable move is available — the
 * mechanism, in their words. It needs enough of their material to be about
 * them rather than about people in general, which is why it waits for the
 * alliance the same way landing does.
 */
export function phaseOf(s: ArcState): Phase {
  if (isLanding(s)) return "landing";
  if (s.exchanges < ALLIANCE_AT) return "opening";
  if (s.words >= s.typicalWords) return "naming";
  return "widening";
}

/**
 * The question the room asks when it is landing.
 *
 * MI's scaling ruler, which is where the 1–10 in this product comes from in the
 * first place — so this is the room using the instrument it already has rather
 * than a new ask wearing a therapy word.
 *
 * It is `process: true` because it is safe for somebody in the loop: it asks
 * where they *are*, which cannot be answered by thinking harder about the thing
 * they came in thinking too hard about.
 *
 * `fits` is false on purpose and it is the guard, not a formality. This probe
 * lives outside `PROBES` so `selectProbe` cannot reach it, and a future hand
 * that moves it into that array would make the weight question an ordinary
 * candidate on every turn — the card again, asked at random. Belt and braces,
 * because the failure is silent.
 */
export const LANDING_PROBE: Probe = {
  id: "arc_landing",
  school: "mi",
  ask: "Where does it sit now, against how you walked in?",
  process: true,
  opens: "the reading the whole sitting is measured by, asked as the room's own last question",
  fits: () => false,
  weight: 0,
};

/**
 * The question this turn goes after.
 *
 * One function so the route does not grow a second opinion about when the
 * landing question wins — `countsAsSpend` is the precedent, and the reason is
 * the same: a predicate re-implemented at a call site is a predicate no check
 * is grading.
 */
export function arcProbe(landing: boolean, chosen: Probe | null): Probe | null {
  return landing ? LANDING_PROBE : chosen;
}

/**
 * What they have typically written this sitting.
 *
 * The median rather than the mean, because one very long message is exactly
 * what a hard sitting looks like and a mean would let it drag the baseline up
 * until every later message read as tapering.
 */
export function typicalWords(messages: readonly string[]): number {
  const counts = messages
    .map((m) => m.trim().split(/\s+/).filter(Boolean).length)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (counts.length === 0) return 0;
  const mid = Math.floor(counts.length / 2);
  return counts.length % 2 ? counts[mid] : Math.round((counts[mid - 1] + counts[mid]) / 2);
}
