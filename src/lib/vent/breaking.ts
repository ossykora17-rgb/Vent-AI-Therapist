import { classify } from "./intent";
import { nothingCanMove } from "./tactics";

/**
 * THE BREAKING ROOM — questions that open somebody, and the rules that keep
 * that from being a thing done *to* them.
 *
 * The instinct behind this is right and it is the reason the product exists.
 * People are not changed by being managed. They are changed by one question
 * nobody has ever asked them, arriving at a moment they can hold it. Every
 * tradition in `tactics.ts` — MI, Gestalt, IFS, existential — is in the end a
 * way of asking a better question.
 *
 * So this is built. With three inversions of the spec, and they are the whole
 * safety model.
 *
 * ## 1. The crisis rule is inverted, and this is the important one
 *
 * The spec says: *"Crisis 8-10: use Level 5-6 questions to anchor them"* —
 * Level 6 being THE GRAVE, opening with *"if you die today, wetin people go
 * write for your WhatsApp status?"*
 *
 * That is asking a person in active crisis to rehearse their own death and
 * imagine the reaction to it. It is contraindicated in every guideline
 * written on the subject, and it would run *inside the exact condition* the
 * crisis router exists to hand to a human being instead.
 *
 * So: high crisis does not select gentler questions here. It selects none.
 * `canOpen` returns false and the room stays shut. This is a hard gate rather
 * than a weight, for the same reason the deathbed veto is: a weight loses a
 * contest eventually, and there is no acceptable turn on which this one loses.
 *
 * ## 2. It is a room somebody walks into
 *
 * Never an ambush mid-vent. It is offered, and an offer can be declined
 * without explaining — which is the same rule the circles use, and the reason
 * `rupture_repair` exists at all. A question this size arriving unrequested
 * is not depth, it is an interrogation with a warm voice.
 *
 * ## 3. Twenty-four of the fifty are not here
 *
 * Named in `WITHHELD` below with the reason for each, so this is a decision
 * on the record rather than a quiet edit. The short version: nothing that
 * rehearses death, nothing that invites somebody to describe harm they wish
 * on a person, nothing that asks for a disclosure this product cannot hold,
 * and nothing that makes VENT the one who knows them better than they know
 * themselves.
 *
 * Two of these were caught by the check rather than by me: a dream somebody
 * "buries" and a "thank God I passed through that". Both metaphors, neither
 * meant as written — and the rule cannot read intent, which is the point of
 * having one. The words changed; the rule did not.
 *
 * And no religion, in either direction. The founder's own correction: it has
 * to land for a Muslim, a Christian, a traditionalist and somebody who thinks
 * all of it is nonsense. Six of the fifty were premised on being angry at God
 * or on what church people would think. The good ones underneath them —
 * forgiveness, the thing you pray to lose that may be building you — are here
 * in words that belong to everybody.
 */

export type Depth = "surface" | "middle" | "deep";

export interface Question {
  id: string;
  /** How far in. `surface` opens, `deep` costs something to answer. */
  depth: Depth;
  /** What it is about, so two in a row are never the same wound. */
  room: string;
  text: string;
}

/**
 * The bank. Nigerian in register because the product is, and because "wetin
 * dey make you feel like fraud" lands where "what triggers your impostor
 * syndrome" does not.
 */
export const QUESTIONS: readonly Question[] = [
  // ── who you are, with nobody watching ────────────────────────────────────
  { id: "free_morning", depth: "surface", room: "self",
    text: "If nobody dey watch and money no be problem, wetin you go do tomorrow morning?" },
  { id: "own_lie", depth: "middle", room: "self",
    text: "When last you lie to yourself? Wetin be that lie?" },
  { id: "three_am_anger", depth: "middle", room: "self",
    text: "Wetin dey make you vex for 3am wey you dey laugh about for daylight?" },
  { id: "stripped", depth: "deep", room: "self",
    text: "If I remove your job, your money and your followers — who remain?" },
  { id: "fraud", depth: "deep", room: "self",
    text: "Wetin dey make you feel like fraud?" },
  { id: "praised_lie", depth: "deep", room: "self",
    text: "Wetin people dey praise you for wey you sabi say no be true?" },
  { id: "feed_gap", depth: "surface", room: "self",
    text: "The version of you for the feed — how far e be from the one typing this?" },

  // ── the house you came from ──────────────────────────────────────────────
  { id: "fifteen", depth: "middle", room: "family",
    text: "If you fit tell your 15-year-old self one thing, wetin be that thing?" },
  { id: "your_pikin", depth: "deep", room: "family",
    text: "If your pikin grow up be exactly like you now — you go proud, or you go cry?" },
  { id: "unforgiven_parent", depth: "deep", room: "family",
    text: "Which of your parents hurt you pass, wey you never forgive? No need to say why yet." },
  { id: "quiet_jealousy", depth: "deep", room: "family",
    text: "Who for your family you dey secretly envy?" },
  { id: "whose_life", depth: "deep", room: "family",
    text: "You dey live your own life, or you dey live the one wey your people planned for you?" },
  { id: "learned_strong", depth: "deep", room: "family",
    text: "When you first learn say you suppose be strong and you no fit cry — how old you be?" },

  // ── money, the way it is actually carried here ───────────────────────────
  { id: "peace_figure", depth: "middle", room: "money",
    text: "How much money dey between you and peace of mind right now? The real figure." },
  { id: "hustle_stay", depth: "middle", room: "money",
    text: "The hustle wey never work — why you never leave am? Na fear or na faith?" },
  { id: "buried_dream", depth: "deep", room: "money",
    text: "Which dream you drop because you tell yourself say e no fit happen for here?" },
  { id: "for_who", depth: "middle", room: "money",
    text: "You dey do all this for yourself, or to prove something to somebody?" },
  { id: "run_or_chase", depth: "deep", room: "money",
    text: "You dey chase success, or you dey run from failure?" },

  // ── being known ──────────────────────────────────────────────────────────
  { id: "last_loved", depth: "middle", room: "love",
    text: "When last you feel truly loved? Not liked. Loved." },
  { id: "alone_or_known", depth: "deep", room: "love",
    text: "You fear being alone pass, or you fear being fully known pass?" },
  { id: "denied_trait", depth: "deep", room: "love",
    text: "Wetin be your own toxic trait for relationship wey you dey deny?" },
  { id: "still_checking", depth: "middle", room: "love",
    text: "The person wey break you — you still dey check their status? Wetin you dey look for?" },

  // ── the long view, without a graveyard in it ─────────────────────────────
  { id: "forgive_to_breathe", depth: "deep", room: "meaning",
    text: "Who you need to forgive so that YOU fit breathe? Not for them. For you." },
  { id: "asking_not_starting", depth: "middle", room: "meaning",
    text: "Wetin you dey ask for every night wey you never start the work for?" },
  { id: "what_builds_you", depth: "deep", room: "meaning",
    text: "The thing you dey beg make e comot from your life — wetin if na the thing dey build you?" },
  { id: "cringe_scene", depth: "middle", room: "meaning",
    text: "If your life na film, which scene you dey skip when you watch am back?" },
  { id: "thank_god_hell", depth: "deep", room: "meaning",
    text: "Wetin go make you look back and talk say — e hard, but I glad I pass through am?" },
  { id: "enemies_three", depth: "deep", room: "meaning",
    text: "If I ask the people wey no like you to describe you for three words, wetin dem go talk?" },
];

/**
 * The ones that are not here, and why. On the record.
 *
 * A curated list with the cuts invisible is an edit somebody has to reverse-
 * engineer. These are the twenty-four, grouped by the reason.
 */
export const WITHHELD: Readonly<Record<string, string>> = {
  death_rehearsal:
    "'If you die in 90 days, who you go call' and 'if you die today, wetin people go write' — " +
    "asking somebody to rehearse their own death and stage the reaction to it. The spec routes " +
    "these to crisis 8-10 specifically, which is the one population every guideline says not to.",
  wished_harm:
    "'Wetin you wish make happen to the person wey wound you' and 'when last you enjoy somebody " +
    "pain' — rehearsing harm and then shame, with no repair move on the other side and nobody in " +
    "the room to offer one.",
  uncontainable_disclosure:
    "'The family secret nobody talk about', 'the thought wey go make people call you mad', 'if " +
    "you fit commit one crime' — these invite a disclosure of abuse, intrusive thought or " +
    "offence that an anonymous app with a 24-hour deletion policy cannot hold, follow up, or " +
    "protect anybody over.",
  third_party:
    "'If your partner read your DMs, relationship go scatter' — turns a private session into " +
    "evidence about somebody who never agreed to be in it.",
  religion:
    "The whole God/church level. It has to land for a Muslim, a Christian, a traditionalist and " +
    "somebody who thinks all of it is nonsense. 'You dey angry with God?' assumes one of those. " +
    "The good questions underneath — forgiveness, the thing you pray to lose that may be " +
    "building you — are kept, in words that belong to everybody.",
  product_as_oracle:
    "'I go tell you the truth about yourself wey go free you' and 'are you ready to meet the " +
    "real you' — VENT claiming to know somebody better than they know themselves. It is an AI " +
    "and it never pretends otherwise.",
  fishing:
    "'If VENT disappear tomorrow, which advice of mine go save you' — the product asking to be " +
    "praised, inside a session that belongs to the person paying for it with their attention.",
};

export interface BreakingContext {
  message: string;
  /** Turns in this sitting. A room this size is not offered to a stranger. */
  ventCount: number;
  /** Questions already asked, ever. Never repeated. */
  asked: readonly string[];
}

/** Below this, the room is not offered. Nobody opens up on turn one. */
export const BREAKING_FLOOR = 4;

/**
 * And then at most once every this many turns.
 *
 * Enforced on the server rather than by the screen remembering it declined,
 * because a question this size arriving on every turn is not depth — it is a
 * door that will not stay shut, and the person it wears down fastest is the
 * one having the worst week.
 *
 * A cadence is taste, not safety, and it is deliberately the last clause in
 * `canOpen` for that reason: the gates above it are the ones that must never
 * be relaxed by somebody tuning a number.
 */
export const BREAKING_EVERY = 4;

/**
 * Whether the room may open at all.
 *
 * This is the safety model, and it is a gate rather than a weight. There is
 * no turn on which a crisis message should be answered with "who do you need
 * to forgive" — the crisis router hands that person a human being, and this
 * must never compete with it.
 *
 * The unfixable is the second refusal, and for a different reason: somebody
 * whose father is dying does not need a question about who they are pretending
 * to be. `meaning_stance` is already the right move there and it is already
 * selected.
 */
export function canOpen(ctx: BreakingContext): boolean {
  // ── the gates. None of these is a weight, and none of them is tuneable. ──
  if (ctx.ventCount < BREAKING_FLOOR) return false;
  if (classify(ctx.message).intent === "crisis") return false;
  if (nothingCanMove(ctx.message)) return false;
  if (!QUESTIONS.some((q) => !ctx.asked.includes(q.id))) return false;

  // ── and the cadence, which is taste. See `BREAKING_EVERY`. ───────────────
  return (ctx.ventCount - BREAKING_FLOOR) % BREAKING_EVERY === 0;
}

/**
 * One question. Never two.
 *
 * Starts shallow and goes deeper as somebody keeps coming back, because depth
 * is earned by the relationship rather than granted by a slider. Deterministic
 * given the same inputs — no model, no tokens, nothing invented.
 */
export function nextQuestion(ctx: BreakingContext): Question | null {
  if (!canOpen(ctx)) return null;

  const answered = ctx.asked.length;
  const wanted: Depth = answered < 2 ? "surface" : answered < 5 ? "middle" : "deep";

  const fresh = QUESTIONS.filter((q) => !ctx.asked.includes(q.id));
  // Never the same room twice running — two questions about the same wound
  // back to back is an interrogation, not a conversation.
  const lastRoom = QUESTIONS.find((q) => q.id === ctx.asked.at(-1))?.room;
  const pool = fresh.filter((q) => q.room !== lastRoom);
  const usable = pool.length ? pool : fresh;

  return (
    usable.find((q) => q.depth === wanted) ??
    usable.find((q) => q.depth === "middle") ??
    usable[0] ??
    null
  );
}

/**
 * What the room says when it opens, and after they answer.
 *
 * Asked with an exit in it. "You fit say no" is not politeness — it is the
 * difference between an invitation and a demand, and somebody who cannot
 * decline has not consented.
 */
export const BREAKING_LINES = {
  invite:
    "I fit ask you something heavy? You fit say no, and we go just continue.",
  waiting: "Take your time. I dey here.",
  received: "I see you. Thank you for trusting me with that one.",
  declined: "No wahala. E dey there when you ready.",
  /*
    When the answer did not land.

    Separate from `received` and never softened into it. Somebody has just
    written the hardest sentence of their week; being thanked for trusting the
    room with something the room then dropped is the `"I've saved it, word for
    word"` bug wearing its best clothes. It says what happened, and it says
    the part that is still true — they said it, and saying it was the point.
  */
  unsaved: "I no fit keep that one — but you talk am, and that one still count.",
} as const;
