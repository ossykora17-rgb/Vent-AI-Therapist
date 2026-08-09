import type { VentRow } from "@/lib/store";

/**
 * Whether it has actually been working, counted from their own numbers.
 *
 * `pattern.ts` answers "is this the same thing again". This answers the other
 * half, and the one nobody has ever been shown: *did I leave lighter than I
 * arrived, and how often?*
 *
 * The product has measured this since the day the mood check shipped. Every
 * anchored sitting stores a `tension_before` the person set on the slider and
 * a `tension_after` derived from the mood they gave on the way out. That is
 * the efficacy loop, it feeds the tactic selector, and until now it was
 * visible only to the machine. The one who supplied both numbers never saw
 * what they added up to.
 *
 * ## Why this shape and not the other one
 *
 * The obvious version of this feature quotes the person back to themselves:
 * "last month you said you wanted to die, today you are laughing." It is
 * moving, it is the version everybody reaches for, and it is dangerous — a
 * crisis sentence returned without warning to somebody who is not braced for
 * it is a re-exposure, delivered by a product they trusted not to do that.
 * `pattern.ts` already quotes openings back, deliberately, and deliberately
 * only ordinary ones.
 *
 * So this quotes nothing. It counts. A number a person supplied themselves,
 * added up and handed back, is the strongest honest claim this product can
 * make, and it needs no adjectives:
 *
 *     Nine of your last eleven sittings, you left lighter than you came in.
 *
 * ## What it refuses to do
 *
 * It does not claim cause. It says the drop happened, never that VENT caused
 * it — the person may simply have had a better evening, and saying otherwise
 * would be the product taking credit for somebody's own week.
 *
 * It says nothing below the floor, and nothing when the news is thin, because
 * a "you are improving!" banner over four data points is a horoscope with a
 * progress bar. Silence beats a guess.
 */

/**
 * Below this many anchored sittings, there is nothing to say.
 *
 * Higher than `PATTERN_FLOOR` (5) on purpose. A recurrence is visible in five
 * rows; a *trend* is not, and this one is read as a verdict on whether the
 * thing is working — so it costs more evidence to say it.
 */
export const TESTIMONY_FLOOR = 8;

/** A drop smaller than this is the slider moving, not the weight. */
const MEANINGFUL_DROP = 5;

export interface Testimony {
  /** Sittings where both ends were recorded. Only these can be counted. */
  anchored: number;
  /** How many of those ended lighter by more than the noise floor. */
  lighter: number;
  /** The middle drop across the lighter ones — median, not mean. */
  typicalDrop: number;
  /** Days from the earliest anchored sitting to the most recent. */
  spanDays: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function findTestimony(vents: readonly VentRow[]): Testimony | null {
  const anchored = vents.filter(
    (v) => v.tension_before !== null && v.tension_after !== null,
  );
  if (anchored.length < TESTIMONY_FLOOR) return null;

  const drops = anchored.map(
    (v) => (v.tension_before as number) - (v.tension_after as number),
  );
  const lighterDrops = drops.filter((d) => d >= MEANINGFUL_DROP);

  /*
    Nothing to say when it is not going well.

    Not because the truth is inconvenient — because "three of your eleven
    sittings ended lighter" is a verdict delivered by a machine to somebody
    who is already having a hard month, and it is a verdict this product is
    not qualified to give. The count is real and the reason for it is not
    knowable from two sliders: a person going through a bereavement will show
    small drops for months and there is nothing wrong with them or with the
    room. So the panel appears when there is something true and good to say
    and is absent otherwise, which is the same rule the exchange rate follows.
  */
  if (lighterDrops.length * 2 < anchored.length) return null;

  const times = anchored
    .map((v) => new Date(v.created_at).getTime())
    .filter(Number.isFinite);
  const spanDays = times.length
    ? Math.max(
        1,
        Math.round((Math.max(...times) - Math.min(...times)) / 86_400_000),
      )
    : 1;

  return {
    anchored: anchored.length,
    lighter: lighterDrops.length,
    typicalDrop: median(lighterDrops),
    spanDays,
  };
}

/**
 * The sentence, built from the counts and nothing else.
 *
 * Second person, past tense, no adjectives, no exclamation. The numbers are
 * doing the work; anything added to them is the product congratulating itself
 * for somebody else's week.
 */
export function testimonySentence(t: Testimony): string {
  const window =
    t.spanDays >= 60
      ? `${Math.round(t.spanDays / 30)} months`
      : t.spanDays >= 14
        ? `${Math.round(t.spanDays / 7)} weeks`
        : `${t.spanDays} days`;

  return (
    `${t.lighter} of your ${t.anchored} anchored sittings over the last ` +
    `${window}, you left lighter than you came in. The middle one moved ` +
    `${t.typicalDrop} points.`
  );
}
