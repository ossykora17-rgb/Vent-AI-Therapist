import { REAL_WORLD_TACTIC } from "@/lib/vent/tactics";

/**
 * Circle governance, enforced on the server.
 *
 * AA works because the rules are not suggestions. A UI that merely greys out
 * a button is bypassed with curl, so every rule below is checked where the
 * message is written. The UI mirrors these rules for kindness, not safety.
 */

export type CircleRole = "keeper" | "sharer" | "witness";
export type MessageKind = "share" | "witness" | "keeper_prompt" | "guardian";

export const MAX_SEATS = 6;
export const CIRCLE_MINUTES = 45;
export const SHARE_MAX_CHARS = 900;
/** A witness reflects one line. Not a paragraph, not a rescue. */
export const WITNESS_MAX_CHARS = 140;
/** Nothing is kept longer than a day. Confidentiality is a deletion policy. */
export const TRANSCRIPT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Advice and cross-talk. The single most corrosive thing in a peer circle is
 * someone fixing someone else, so this is checked before anything is stored.
 */
const ADVICE = [
  /\byou should\b/i,
  /\byou need to\b/i,
  /\byou have to\b/i,
  /\byou must\b/i,
  /\byou ought to\b/i,
  /\bhave you tried\b/i,
  /\bwhy don'?t you\b/i,
  /\bwhat you should do\b/i,
  /\bjust (do|try|stop|leave|tell)\b/i,
  /\bmy advice\b/i,
  /\bif i were you\b/i,
  /\byou'?re wrong\b/i,
];

/** Addressing a person instead of the circle. */
const CROSSTALK = [
  /\b(you|your) (problem|fault|issue)\b/i,
  /^@/,
  /\bshut up\b/i,
];

/**
 * The advice half, on its own.
 *
 * `checkMessage` is circle governance and bundles two rules that are not the
 * same rule. Advice is banned everywhere in this product — the private room
 * and the circle both refuse to fix people. Cross-talk is circle-only: it
 * exists because five other people are listening, and "your fault" there is
 * one member blaming another.
 *
 * In a one-to-one session "you" is the entire voice, and "that one no be your
 * fault" is one of the most useful sentences available to somebody carrying
 * something they did not begin. The quality graders learned that by flagging
 * exactly that line in an authored reply, so they take this and leave the
 * cross-talk rule where it belongs.
 */
export function containsAdvice(text: string): boolean {
  return ADVICE.some((r) => r.test(text.trim()));
}

export interface RuleVerdict {
  ok: boolean;
  /** Shown to the person verbatim — it has to teach, not scold. */
  reason?: string;
}

/**
 * Purely content-based. There is no seat parameter any more: the rules that
 * protect people — no advice, no cross-talk, a reflection is one line — apply
 * to everyone in the room identically, and the one rule that did depend on a
 * seat was the one making a promise it could not keep.
 */
export function checkMessage(content: string, kind: MessageKind): RuleVerdict {
  const text = content.trim();

  if (text.length === 0) return { ok: false, reason: "Nothing to say yet." };

  // Content first, seat second. Advice is the rule that actually protects
  // people, and checking a role before it meant a sharer's "you should…" was
  // refused for the wrong reason — or, in the wrong seat, not refused at all.
  if (ADVICE.some((r) => r.test(text))) {
    return {
      ok: false,
      // The room's own line first. A refusal that sounds like a content
      // policy makes somebody feel caught; this one makes them feel corrected
      // by the circle they joined, which is what actually happened.
      reason:
        `${MYCELIUM.noFixing} Say what you heard, or what it moved in you — an I-statement, not a you-statement.`,
    };
  }

  if (CROSSTALK.some((r) => r.test(text))) {
    return { ok: false, reason: "Speak to the circle, not at a person." };
  }

  if (kind === "share" && text.length > SHARE_MAX_CHARS) {
    return {
      ok: false,
      reason: `A share is ${SHARE_MAX_CHARS} characters or fewer. Say the heaviest part.`,
    };
  }

  // Reflecting is open to every seat — witnessing is a way of speaking, not a
  // rank. What it is not is a second share, so the one-line cap holds for all.
  if (kind === "witness" && text.length > WITNESS_MAX_CHARS) {
    return {
      ok: false,
      reason: "A witness reflects one line. Say what you heard, not what you'd do.",
    };
  }

  // No seat rule. There was one — later arrivals were witnesses who could
  // never share — and it refused them with "Your turn comes." The turn never
  // came, because roles were fixed at join. A circle must not promise what it
  // cannot give. Everyone can share; the one-line cap on a reflection is what
  // actually stops anyone dominating, and it applies to every seat equally.
  return { ok: true };
}

/**
 * Whoever opens the circle holds it. Everyone else shares. "Witness" survives
 * as a way of speaking — a one-line reflection anybody can choose — not as a
 * seat that locks someone out of their own turn.
 */
export function roleForSeat(seatIndex: number): CircleRole {
  return seatIndex === 0 ? "keeper" : "sharer";
}

const OPENING: Record<string, string> = {
  economy: "Today we hold the money choke.",
  japa: "Today we hold leaving, and being left.",
  ai_job: "Today we hold the fear that the work goes away.",
  social: "Today we hold the comparing.",
  family: "Today we hold what the family expects.",
  lonely: "Today we hold being on your own with it.",
  traffic: "Today we hold the hours the road takes.",
  climate: "Today we hold the heat and what it wears down.",
  health: "Today we hold the body and the waiting.",
  // No verb that implies anybody here is working on it. The room is for
  // saying the person's name out loud, which is the whole of the task.
  grief: "Today we hold somebody who is gone.",
};

/**
 * One fetched number, said plainly. Never estimated, never rounded to a
 * feeling — the caller passes it only when a real rate came back, and passes
 * nothing at all when it did not.
 */
export function economyFact(usdNgn: number): string {
  return `The dollar is ₦${usdNgn.toLocaleString("en-NG")} today — that is the number, not a mood.`;
}

/**
 * What the Keeper reads at minute three. The second sentence is the tactic
 * library's own tool for that pressure, in its room-facing phrasing — so the
 * open is drawn from the same place as a private session's, rather than a
 * second table that drifts away from it. Selected, never generated.
 *
 * `counted` is an optional fact that was actually fetched — today's rate, and
 * nothing else. It sits between the opening and the tool because that is the
 * order a person needs it in: here is the room, here is the real number, here
 * is the one thing you can still do about it. When the fetch failed the
 * sentence is simply absent; the Keeper has never once guessed a number and
 * this is not where it starts.
 */
/**
 * MYCELIUM — the campfire, not the therapist.
 *
 * These are authored, and that is the whole point. A facilitator whose lines
 * come from a model is a facilitator who costs money per circle, drifts
 * between rooms, and can be talked out of the rules by whoever is in the
 * room. A campfire says the same thing every night.
 *
 * The first line is fixed on purpose. Six anonymous people staring at an
 * empty box need somebody to go first, and "who carry wetin for chest" asks
 * for the load rather than the story — which is the difference between a
 * circle and a queue of monologues.
 */
export const MYCELIUM = {
  /** How every circle starts. Same words, every time. */
  open: "We start. Who carry wetin for chest?",
  /** What the room says to anybody reaching for a fix. */
  noFixing: "We no dey fix here. We dey witness.",
  /** The confidentiality line, said out loud rather than buried in terms. */
  ephemeral: "Wetin talk for here, dey die for here.",
} as const;

export function keeperIntention(tag: string | null, counted?: string | null): string {
  const opening = OPENING[tag ?? ""] ?? "Today we hold whatever is heaviest.";

  const tool =
    tag && tag in REAL_WORLD_TACTIC
      ? REAL_WORLD_TACTIC[tag as keyof typeof REAL_WORLD_TACTIC].hold
      : null;

  return [
    MYCELIUM.open,
    opening,
    counted || null,
    tool,
    MYCELIUM.ephemeral,
  ]
    .filter(Boolean)
    .join(" ");
}

export function isExpired(createdAt: string, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() > TRANSCRIPT_TTL_MS;
}

/** The shape of the 45 minutes. Minute markers, from the end. */
export type CirclePhase = "breathe" | "intention" | "shares" | "reflect" | "close";

export function phaseFor(msRemaining: number): CirclePhase {
  const elapsed = CIRCLE_MINUTES * 60_000 - msRemaining;
  const min = elapsed / 60_000;
  if (min < 3) return "breathe";
  if (min < 8) return "intention";
  if (min < 38) return "shares";
  if (min < 43) return "reflect";
  return "close";
}

export const PHASE_LABEL: Record<CirclePhase, string> = {
  breathe: "Breathing",
  intention: "Opening",
  shares: "Sharing",
  reflect: "Reflection",
  close: "Closing",
};

/** Words worth counting back. Body first — that is what people miss saying. */
const PATTERN_WORDS = [
  "chest", "throat", "head", "belly", "stomach", "shoulders",
  "tight", "choke", "heavy", "small", "tired", "stuck", "alone",
  "shame", "angry", "scared", "numb", "guilt",
];

/**
 * The Keeper's one real move: DeepSearch, run over what the room actually
 * said. Counted, not generated — no model call, and it cannot invent a
 * pattern that nobody voiced.
 */
export function keeperReflection(contents: string[]): string | null {
  if (contents.length === 0) return null;

  const text = contents.join(" \n ").toLowerCase();
  const counts = PATTERN_WORDS.map((w) => [
    w,
    (text.match(new RegExp(`\\b${w}\\b`, "g")) ?? []).length,
  ] as const)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (counts.length === 0) {
    return `${contents.length} ${contents.length === 1 ? "person" : "people"} spoke. Nobody fixed anybody. That is the whole job — sit with what you heard.`;
  }

  const heard = counts.map(([w, n]) => `${w} ${n} times`).join(", ");
  return `I heard ${heard}. Same room, same word, different lives. Nothing to fix — just notice you are not the only one carrying it.`;
}
