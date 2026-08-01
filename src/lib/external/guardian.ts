/**
 * The Guardian's thresholds, and what it does with them.
 *
 * Pure and dependency-free so the eval suite measures the real decision rather
 * than a copy of the numbers. The scoring itself lives in `sources.ts`.
 */

export interface ToxicityScores {
  toxicity: number;
  insult: number;
  threat: number;
}

/**
 * A threat is the lowest bar because it is the thing a room cannot survive.
 * Toxicity is the highest because the score is noisy on plain distress —
 * "I feel disgusting" reads as toxic to a classifier and is exactly what
 * somebody should be able to say here.
 */
export const THRESHOLD = { toxicity: 0.8, insult: 0.8, threat: 0.7 } as const;

export interface GuardianVerdict {
  /** Refuse the message: it never reaches the room and is never stored. */
  block: boolean;
  /** Which reading crossed, for the Keeper's flag. */
  reason: "toxicity" | "insult" | "threat" | null;
  score: number;
  /** Shown to the person verbatim. It has to teach, not scold. */
  message: string | null;
}

const PASS: GuardianVerdict = { block: false, reason: null, score: 0, message: null };

/**
 * `null` scores mean the classifier did not answer, and that is a pass.
 *
 * Fail-open, deliberately. Every message already passes the crisis check and
 * the no-advice / no-cross-talk rules, which are local, free and never down.
 * Perspective is a second opinion on top of those, and a second opinion that
 * is unreachable must not become a mute button — a network blip silencing a
 * room of people trying to speak is a worse failure than one rude line that
 * the Keeper can still mute by hand.
 */
export function guardianVerdict(scores: ToxicityScores | null): GuardianVerdict {
  if (!scores) return PASS;

  const crossed = (
    [
      ["threat", scores.threat, THRESHOLD.threat],
      ["insult", scores.insult, THRESHOLD.insult],
      ["toxicity", scores.toxicity, THRESHOLD.toxicity],
    ] as const
  ).find(([, value, limit]) => value >= limit);

  if (!crossed) return PASS;

  const [reason, score] = crossed;

  return {
    block: true,
    reason,
    score,
    message:
      reason === "threat"
        ? "That reads as a threat, and a circle cannot hold one. Say what it moved in you instead."
        : "That lands on a person, not on the thing. No fixing, no advice — say what you heard, or what it moved in you.",
  };
}
