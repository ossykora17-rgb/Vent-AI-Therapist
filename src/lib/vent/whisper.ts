/**
 * The ambient weight scale — when it may speak, and when it must stop.
 *
 * WHAT THIS REPLACES, AND WHY THE OLD ONE WAS WRONG
 *
 * "BEFORE YOU GO" was a full-width card with ten 44px buttons, rendered after
 * every vent turn. It is the right question — *"Where did the weight land?"* —
 * asked in the shape of a form. It announced the product's agenda at the end
 * of every exchange, it broke the transcript in half, and it made somebody who
 * had just written the worst sentence of their week feel managed.
 *
 * The measurement matters: `tension_before - tension_after` is the only
 * efficacy signal this product has. So the question stays and the *demand*
 * goes. The scale moves into the periphery of the composer at rest, and only
 * steps forward when there is a reason.
 *
 * WHAT IS NOT NEGOTIABLE HERE
 *
 * **The 1–10 contract is untouched.** `PATCH /api/vent` takes `mood` 1–10 and
 * `submitMood` computes `tension_after` as `(10 - value) * 10`. Every stored
 * anchor, the heartbeat's mean drop and `drop_is_flat` are in that space. A
 * prettier five-dot track would have silently re-scaled a year of rows against
 * a column that cannot say which scale it was written in. The presentation
 * changed; the number did not.
 *
 * **Refusal is a real answer.** Three invitations ignored and this goes quiet
 * for the rest of the sitting. That is a real cost — a sitting that goes quiet
 * records no anchor, and the efficacy loop learns nothing from it. It is worth
 * paying and it is stated rather than hidden: a room that keeps asking after
 * three noes is not ambient, it is nagging with a lower opacity.
 *
 * **The teaching card is why the whisper can be this quiet.** Nobody discovers
 * a 0.15-opacity track on their own. The full card still renders for the first
 * `TEACHING_SITTINGS` anchored sittings, so the gesture is learnt once in the
 * open and ambient forever after. Delete that and this becomes a control with
 * no discovery path — which is the same failure as a refusal nobody can read,
 * wearing an interaction instead of a sentence.
 *
 * The policy lives here rather than inside the component because a rule the
 * suite asserts must be imported from the module the product runs — a suite
 * that checks its own copy passes while the product regresses.
 */

/**
 * Positions on the track, and the server's scale.
 *
 * Read by the component to build the ticks and by the suite to prove the
 * contract did not move. 1 is heaviest; 10 is lighter.
 */
export const WHISPER_MIN = 1;
export const WHISPER_MAX = 10;

/**
 * Anchored sittings that still get the full card.
 *
 * Two, not one: the first is a surprise and the second is the one somebody
 * recognises. Three would be a form again.
 */
export const TEACHING_SITTINGS = 2;

/**
 * A pause long enough to mean something, short enough to still be this turn.
 *
 * The brief's band is 8–12 seconds and this sits in the middle of it. Below
 * eight it fires while somebody is still reading the reply, which is an
 * interrupt with a fade on it; above twelve they have gone.
 */
export const WHISPER_IDLE_MS = 10_000;

/**
 * Words after which a message counts as heavy enough to have cost something.
 *
 * Measured rather than guessed: the median vent in this product's own corpus
 * runs short, and the ones that run long are the ones that took effort to
 * write. This is the cheap client-side stand-in for that — no model call, no
 * round trip, and it is only choosing *when to become visible*, never what the
 * reply says.
 */
export const WHISPER_LONG_WORDS = 40;

/**
 * Invitations ignored before this goes quiet for the sitting.
 *
 * Three. Not a number to tune upward: the fourth ask is the one that turns
 * accompaniment back into extraction.
 */
export const IGNORES_BEFORE_SILENT = 3;

/**
 * How long the settle runs, and how long the track stays legible after it.
 *
 * One home for both, because the CSS transition and the JS timer have to agree
 * or the track fades while it is still moving. Under the brief's 400ms for the
 * motion; inside its 1–2s for the fade back.
 */
export const SETTLE_MS = 280;
export const LINGER_MS = 1_200;

/** The only sentence this control ever says, and it only says it when asked. */
export const WHISPER_PROMPT = "How does it sit in you now?";

/**
 * Why the track is being offered, or null for "stay in the periphery".
 *
 * A named reason rather than a boolean because the component renders the same
 * control either way and only the *reason* decides whether it has earned a
 * moment of opacity. Keeping the reason also makes the suite's job possible:
 * a rule that returns true is untestable past "it returned true".
 */
export type WhisperReason = "long" | "idle" | "closing";

export interface WhisperState {
  /** A vent turn has happened and has not been answered on the scale yet. */
  pending: boolean;
  /** Words in the message that produced this turn. */
  words: number;
  /** Milliseconds since the reply landed. */
  idleMs: number;
  /** Invitations this sitting that came and went unanswered. */
  ignored: number;
  /** They are leaving — tab hidden, or the session is being closed. */
  closing: boolean;
}

/**
 * Should the track step forward right now?
 *
 * Order matters and it is not arbitrary. `closing` wins because it is the last
 * moment there is, and a person on their way out is not going to be
 * interrupted by an answer they chose to give. `long` beats `idle` because a
 * long message is a reason that came from *them*; an idle timer is a reason
 * that came from us, and this file's whole argument is that those are not the
 * same kind of invitation.
 *
 * Returns null on anything else, including every case where it has already
 * been ignored enough times. Null means the control is still there, still at
 * rest, still tappable — silence here is about *asking*, never about removing
 * the way to answer. A control that vanishes when it stops asking would take
 * the agency away in the name of giving it.
 */
export function shouldInvite(s: WhisperState): WhisperReason | null {
  if (!s.pending) return null;
  if (s.ignored >= IGNORES_BEFORE_SILENT) return null;
  if (s.closing) return "closing";
  if (s.words >= WHISPER_LONG_WORDS) return "long";
  if (s.idleMs >= WHISPER_IDLE_MS) return "idle";
  return null;
}

/**
 * Has this sitting used up its invitations?
 *
 * Its own function rather than a comparison written out at the call site, for
 * the reason `countsAsSpend` is one function: a predicate re-implemented two
 * lines above an assertion is a predicate the check no longer grades.
 */
export function inviteSpent(ignored: number): boolean {
  return ignored >= IGNORES_BEFORE_SILENT;
}

/**
 * Does this sitting still get the full card?
 *
 * `anchored` is how many times this device has answered the scale, ever. It is
 * a count on the device and never a row: what it gates is whether a card is
 * drawn, and a product that phoned home to decide how to draw a card would be
 * keeping something about somebody in order to be subtle at them.
 */
export function stillTeaching(anchored: number): boolean {
  return anchored < TEACHING_SITTINGS;
}
