import type { Classification } from "./intent";
import type { DepthVerdict } from "./depth";
import { pastWhatThisHolds, type Handoff } from "./referrals";
import type { VentRow } from "@/lib/store";

/**
 * What the room decided about this turn, as one object, computed before the
 * model is called.
 *
 * A clinical spec asked for a structured verdict on every reply — a risk
 * level, a short account of the reasoning, the skill selected, and a flag for
 * when a person needs a human. Every one of those is right, and every one of
 * them already existed here, scattered across four modules and visible to
 * nobody: `classify` knows the intent, `depthFor` knows the distress tier,
 * `selectTactic` knows the move, `selectProbe` knows the question, and
 * `pastWhatThisHolds` knows when the pattern has outgrown this room — that
 * last one wired only to `/api/pattern`, so the *turn* never knew.
 *
 * WHY THE MODEL IS NOT ASKED FOR ANY OF IT
 *
 * The obvious build is to have the model emit the verdict alongside the reply
 * — tags in the output, parsed out before display. It is worse in three ways
 * and the third is disqualifying.
 *
 * It costs output tokens on a budget that has already produced this
 * repository's sharpest bug: `max_tokens: 220`, correct for a model that
 * speaks immediately and wrong for one that thinks first, which spent 217
 * tokens reasoning and three saying "Tired. Na" to somebody who had just
 * written that they were tired. A hundred tokens of tags is that bug with a
 * schema on it.
 *
 * It adds a parse that can fail, and the failure mode is XML on screen at 2am.
 *
 * And it asks the thing being assessed to assess itself. **A model can be
 * argued out of its own risk rating by the message it is rating** — which is
 * not hypothetical here: two of the first hundred and thirty real turns were
 * injection attempts, and both came back as something that was not this
 * product. A local classifier that ran before the model saw anything cannot
 * be talked out of anything. The spec's own first principle is safety first,
 * and a safety field that depends on the thing it is watching is not one.
 *
 * So this is derived, free, deterministic, and identical in every deployment
 * shape — no store, no key, no network.
 */

/** The spec's five tiers. */
export type RiskLevel = "none" | "low" | "moderate" | "high" | "crisis";

export interface Assessment {
  risk: RiskLevel;
  /**
   * Why, in the router's own vocabulary rather than in prose.
   *
   * `crisis`, `edge`, `grave`, `irreversible`, `long_session` — the words the
   * depth router already uses. A sentence here would be a second description
   * of a decision that has one, and the two would drift.
   */
  because: string;
  /** The move selected for this turn, or null on a path that spends nothing. */
  skill: string | null;
  /** The question selected, or null when the message offered no handle. */
  probe: string | null;
  /**
   * Whether the pattern says this has outgrown the room.
   *
   * `pastWhatThisHolds` counts anchored sittings that did not move and is
   * deliberately conservative — it exists so the product can say "this needs
   * somebody with a licence" rather than quietly keeping somebody it is not
   * helping. It was computed on the Memory page and nowhere else.
   */
  handoff: boolean;
}

/**
 * The distress tiers, mapped honestly rather than flatteringly.
 *
 * `EDGE` is hopelessness, worthlessness, "can't go on", "give up" — the
 * language of someone whose safety is genuinely a question, so it is `high`.
 *
 * `GRAVE` is bereavement, illness, assault, eviction, panic. Severe, and
 * severity is not ideation: a person three weeks after a funeral is carrying
 * something enormous and is not by that fact at risk. Calling it `high` would
 * inflate every grief turn into a safety event, which is both wrong and the
 * fastest way to make a risk field that nobody reads. `moderate`.
 *
 * `irreversible` is `nothingCanMove` — a diagnosis arriving, a burial that
 * happened. It is a *stance* signal, telling the room not to offer fixes, and
 * it is not a risk signal at all. `low`, and the reason is carried in
 * `because` where it belongs.
 */
/**
 * Whether a reply carries the crisis lines beside it.
 *
 * The middle of the ladder: `crisis` never reaches a model and gets the lines
 * as its whole reply; `high` and `moderate` are answered, and the lines sit
 * under the answer as one quiet row — available at the heaviest moment rather
 * than only in the footer, never an alarm and never the room's own words.
 */
export function linesBeside(a: Pick<Assessment, "risk">): boolean {
  return a.risk === "high" || a.risk === "moderate";
}

/** How long a crisis turn keeps the room careful afterwards. */
export const CAREFUL_FOR_DAYS = 14;

/**
 * The risk history — and this product keeps none of its own.
 *
 * A crisis turn is already a row of theirs: stored like every vent, shown on
 * their history page, and gone with everything else in one tap. Reading it
 * back as a reason for care needs no new column, no new promise and no word in
 * the prompt. A recent crisis is the strongest signal there is that the next
 * ordinary-looking message is not ordinary, so for `CAREFUL_FOR_DAYS` the room
 * treats every turn as a heavy one: nothing asked to be rated or argued, and
 * the lines beside the reply. Never said to them. It changes what the room
 * will not ask, not what it says about them.
 */
export function carefulAfter(
  history: readonly Pick<VentRow, "intent_type" | "created_at">[],
  now = Date.now(),
): boolean {
  return recentCrises(history, now).length > 0;
}

/**
 * Their crisis turns inside the careful window — Layer 2's `risk_history`.
 *
 * One filter for both readers, so the room's care and the memory's record of
 * why cannot disagree about which turns count.
 */
export function recentCrises<T extends Pick<VentRow, "intent_type" | "created_at">>(
  history: readonly T[],
  now = Date.now(),
): T[] {
  // Defensive for the reason `assessTurn` catches `pastWhatThisHolds`: a
  // history that is not a list must not cost a turn its reply.
  if (!Array.isArray(history)) return [];
  return history.filter((r) =>
    r?.intent_type === "crisis" && now - Date.parse(r.created_at) < CAREFUL_FOR_DAYS * 86_400_000);
}

const RISK_BY_REASON: Record<string, RiskLevel> = {
  crisis: "crisis",
  edge: "high",
  grave: "moderate",
  irreversible: "low",
};

export function assessTurn(args: {
  classification: Classification;
  depth: DepthVerdict;
  tacticId: string | null;
  probeId: string | null;
  history: readonly VentRow[];
}): Assessment {
  const { classification, depth, tacticId, probeId, history } = args;

  /*
    Crisis is read from the classifier, not from the depth router.

    Both know about it and only one of them is the authority: `classify` runs
    first, on the message alone, and is what actually gates the model call.
    Reading the tier here would make this agree with the router while the
    product did something else.
  */
  const read: RiskLevel =
    classification.intent === "crisis"
      ? "crisis"
      : RISK_BY_REASON[depth.reason] ?? "none";
  // A recent crisis lifts an ordinary turn to `moderate`, never past what the
  // message itself says — see `carefulAfter`.
  const raised = (read === "none" || read === "low") && carefulAfter(history);
  const risk: RiskLevel = raised ? "moderate" : read;

  let handoff: Handoff | null = null;
  try {
    handoff = pastWhatThisHolds(history as VentRow[]);
  } catch {
    /*
      A verdict that throws is worse than a verdict that is missing a field.
      Nothing downstream may fail a turn over an assessment — the reply is the
      product and this is a description of it.
    */
    handoff = null;
  }

  return {
    risk,
    because: classification.intent === "crisis" ? "crisis" : raised ? "recent_crisis" : depth.reason,
    skill: tacticId,
    probe: probeId,
    /*
      Crisis is a handoff, whatever the pattern says.

      `pastWhatThisHolds` answers a slower question — has this person sat here
      five times without moving — and on a crisis turn it answers `false`,
      because there is no history to read yet and because that is not what it
      measures. Reporting `handoff: false` on the one turn that is definitively
      "this needs a human now" would be the field contradicting the reply
      beside it: the crisis path already stops, hands over the lines, and
      refuses to continue.

      The spec's own definition is "true only when clinical judgment or a human
      therapist is clearly needed". Nothing clears that bar more plainly.
    */
    handoff: risk === "crisis" || handoff !== null,
  };
}
