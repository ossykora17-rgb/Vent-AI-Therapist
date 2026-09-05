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
  const risk: RiskLevel =
    classification.intent === "crisis"
      ? "crisis"
      : RISK_BY_REASON[depth.reason] ?? "none";

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
    because: classification.intent === "crisis" ? "crisis" : depth.reason,
    skill: tacticId,
    probe: probeId,
    handoff: handoff !== null,
  };
}
