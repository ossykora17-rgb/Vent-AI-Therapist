import type { VentRow } from "@/lib/store";

/**
 * What happens when this is bigger than a vent.
 *
 * The product had two states: an ordinary sitting, and crisis — which routes
 * to a phone number, locally, ahead of the model, and always will. Nothing
 * existed in between, and the person in between is real: not in danger,
 * coming back every week, leaving exactly as heavy as they arrived.
 *
 * Two rules govern this file, and both of them are about not lying.
 *
 * ── Nothing renders without a verification date ───────────────────────────
 * A referral is a phone number given to somebody having a bad week. A number
 * that has changed is a dead line at the worst possible moment, and it is
 * worse than saying nothing, because they will not look twice.
 *
 * So `verifiedOn` is required, `activeReferrals()` drops anything without it,
 * and anything past STALE_AFTER stops rendering on its own. An entry nobody
 * has confirmed does not appear — the same rule the outside world follows,
 * the same rule the flavour engine follows below its confidence floor.
 *
 * These entries were drafted from public listings and are deliberately left
 * unverified. They will not render until somebody who can dial the number has
 * dialled it and dated it. That is a person's job, not a search result's.
 *
 * ── It offers, and never prescribes ───────────────────────────────────────
 * "You need therapy" is a prescription and this product does not make them.
 * What it can do is say what the person's own numbers say, plainly, once,
 * and leave the decision where it belongs. Not a diagnosis, not advice — a
 * count they gave us, read back.
 */

export interface Referral {
  /** The organisation, named exactly as it names itself. */
  org: string;
  /** What they actually do, in the words a person needs to decide. */
  what: string;
  /** Digits only, as `tel:` takes them. Absent until verified. */
  tel?: string;
  /** What to show — a formatted number, or a site. */
  label?: string;
  url?: string;
  /** Free at point of use, which for most people is the deciding fact. */
  free: boolean;
  hours?: string;
  /**
   * ISO date somebody last confirmed this reaches a human. Undefined means
   * nobody has, and undefined never renders.
   */
  verifiedOn?: string;
}

/**
 * A year. Long enough not to be busywork, short enough that a number nobody
 * has checked since the last administration stops being offered.
 */
export const STALE_AFTER_DAYS = 365;

/*
  Drafted, unverified, and therefore invisible.

  Each of these is a real Nigerian service that appears in public listings.
  None carries a `verifiedOn`, so none of them renders. Filling that field is
  a phone call — and the phone call is the entire point of the field.
*/
export const REFERRALS: readonly Referral[] = [
  {
    org: "Mentally Aware Nigeria Initiative (MANI)",
    what: "Free, confidential support for young Nigerians. Anxiety, grief, self-harm, the lot.",
    free: true,
    hours: "24/7",
  },
  {
    org: "She Writes Woman",
    what: "24/7 toll-free line and free teletherapy. Women-led, and it does not charge.",
    free: true,
    hours: "24/7",
  },
  {
    org: "Suicide Research and Prevention Initiative (SURPIN)",
    what: "Lagos-based, clinician-run. Hausa line as well as English.",
    free: true,
  },
];

/**
 * The ones that may be shown, today.
 *
 * `now` is a parameter so this is testable without waiting a year, which is
 * the only way a staleness rule ever gets tested at all.
 */
export function activeReferrals(now: Date = new Date()): Referral[] {
  return REFERRALS.filter((r) => {
    if (!r.verifiedOn) return false;
    const at = Date.parse(r.verifiedOn);
    if (Number.isNaN(at)) return false;
    const age = (now.getTime() - at) / 86_400_000;
    return age >= 0 && age <= STALE_AFTER_DAYS;
  });
}

/** Below this, "it is not moving" is four data points and a horoscope. */
export const HANDOFF_FLOOR = 5;

export interface Handoff {
  /** Anchored sittings counted. Their number, not ours. */
  sittings: number;
  /** Mean points put down across them. At or below zero is the signal. */
  meanDrop: number;
}

/**
 * Is this person leaving as heavy as they arrive, consistently?
 *
 * Only sittings that carry both readings count, because a drop needs a
 * before. It reads the same two columns the efficacy loop and the preference
 * pipeline read, so the product cannot hold two opinions about whether
 * somebody is being helped.
 *
 * Deliberately not "is their mood low". Somebody can arrive at 90 every week
 * and leave at 40 every week — that is heavy, and it is working. The signal
 * is the absence of movement, not the presence of pain.
 */
export function pastWhatThisHolds(vents: VentRow[]): Handoff | null {
  const anchored = vents.filter(
    (v) => v.tension_before !== null && v.tension_after !== null,
  );
  if (anchored.length < HANDOFF_FLOOR) return null;

  const drops = anchored.map(
    (v) => (v.tension_before as number) - (v.tension_after as number),
  );
  const meanDrop = drops.reduce((a, b) => a + b, 0) / drops.length;

  // Two points of relief is inside the noise of a slider somebody dragged
  // with their thumb. Below that, nothing is moving.
  if (meanDrop > 2) return null;
  return { sittings: anchored.length, meanDrop: Number(meanDrop.toFixed(1)) };
}

/**
 * What to say, when there is anything to say.
 *
 * Returns null when there is nothing verified to offer — because naming the
 * problem and then handing somebody an empty list is worse than staying
 * quiet. The sentence and the thing it points at ship together or not at all.
 */
export function handoffLine(h: Handoff, available: Referral[]): string | null {
  if (available.length === 0) return null;
  return (
    `${h.sittings} times now you have come in heavy and left about the same. ` +
    `That is not you failing at this. It might just mean this is not the ` +
    `right tool for this particular thing, and there are people who do it ` +
    `properly and do not charge.`
  );
}
