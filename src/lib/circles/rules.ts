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

export interface RuleVerdict {
  ok: boolean;
  /** Shown to the person verbatim — it has to teach, not scold. */
  reason?: string;
}

export function checkMessage(
  content: string,
  kind: MessageKind,
  role: CircleRole,
): RuleVerdict {
  const text = content.trim();

  if (text.length === 0) return { ok: false, reason: "Nothing to say yet." };

  // Content first, seat second. Advice is the rule that actually protects
  // people, and checking a role before it meant a sharer's "you should…" was
  // refused for the wrong reason — or, in the wrong seat, not refused at all.
  if (ADVICE.some((r) => r.test(text))) {
    return {
      ok: false,
      reason:
        "No fixing here. Say what you heard, or what it moved in you — an I-statement, not a you-statement.",
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

  // Only the seat rule remains: whoever is witnessing this round waits to share.
  if (kind === "share" && role === "witness") {
    return { ok: false, reason: "You're witnessing this round. Your turn comes." };
  }

  return { ok: true };
}

/** Roles rotate by seat: first in keeps, then sharers, later arrivals witness. */
export function roleForSeat(seatIndex: number): CircleRole {
  if (seatIndex === 0) return "keeper";
  return seatIndex <= 3 ? "sharer" : "witness";
}

/** Opening line the Keeper reads. Drawn from the tag, never invented. */
export function keeperIntention(tag: string | null): string {
  const lines: Record<string, string> = {
    economy: "Today we hold the money choke. No fixing. Just what it costs you.",
    japa: "Today we hold leaving, and being left. No fixing.",
    ai_job: "Today we hold the fear that the work goes away. No fixing.",
    social: "Today we hold the comparing. No fixing.",
    family: "Today we hold what the family expects. No fixing.",
    lonely: "Today we hold being on your own with it. No fixing.",
    traffic: "Today we hold the hours the road takes. No fixing.",
    climate: "Today we hold the heat and what it wears down. No fixing.",
    health: "Today we hold the body and the waiting. No fixing.",
  };
  return (
    lines[tag ?? ""] ??
    "Today we hold whatever is heaviest. No fixing, no advice. Just say it."
  );
}

export function isExpired(createdAt: string, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() > TRANSCRIPT_TTL_MS;
}
