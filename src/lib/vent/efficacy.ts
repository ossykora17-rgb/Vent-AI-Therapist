import type { VentRow } from "@/lib/store";

/**
 * The part that learns.
 *
 * "Would the LLMs train themselves?" — asked of this repo more than once, and
 * answered badly until now. There are two honest answers and one dishonest one.
 *
 * The dishonest one is a fine-tune loop: harvest what people wrote, run it
 * through a training job, ship a new checkpoint. It is dishonest here because
 * it needs somebody else's words in a training set, and because nothing in
 * this repo can afford it — `CLAUDE.md` requires the eval suite, both
 * pipelines and the heartbeat to make **zero** model calls by construction.
 * A learning loop that spends credit per turn is a learning loop that gets
 * switched off in week two.
 *
 * The honest ones are: a person reads real replies and rewrites the prompt
 * (that is the fifth question, and no gate will ever do it), and *this* — the
 * system changes what it does based on what measurably worked, using nothing
 * but numbers the people themselves gave.
 *
 * What it reads: `tactic_used`, `tension_before`, `tension_after`. Three
 * columns. No message text, no reply text, no identity, nothing that could be
 * quoted back. Two integers somebody moved a slider to, and the name of the
 * move that sat between them. That is the whole input, which is what makes it
 * safe to run across everybody's sessions at once.
 *
 * What it does: nudges the tactic selector toward moves that are followed by
 * larger drops and away from moves that are not. Bounded, floored, and
 * reversible — a tactic that stops working loses its nudge on the next window.
 *
 * What it refuses: to rank on thin data. Below the floor a tactic gets no
 * adjustment at all, because "silence beats a guess" applies to the machine
 * talking to itself exactly as it applies to the machine talking to a person.
 * A tactic that looks 8 points better over six sessions looks that way because
 * six people had six days, not because the tactic is better.
 */

/**
 * Anchored observations a tactic needs before its mean means anything.
 *
 * Both sliders have to have been moved for a row to count, so this is twelve
 * people who finished a session rather than twelve who started one. Set higher
 * than `PATTERN_FLOOR` (5) on purpose: that floor guards a sentence shown to
 * one person about their own life, this one guards a change to what everybody
 * gets offered.
 */
/**
 * The value the pressure slider held when nobody had touched it.
 *
 * Not a threshold and not a preference — the literal midpoint the client
 * defaulted to, and therefore the exact value that means "this person never
 * answered" in every row written before that was fixed. Named here so the
 * reason lives with the arithmetic that uses it.
 */
export const PRE_FIX_DEFAULT = 50;

export const EFFICACY_FLOOR = 12;

/** The most this can move a tactic's weight, in either direction. */
export const EFFICACY_SPAN = 6;

/**
 * A tactic this many points better than the room average earns the full span.
 *
 * Five points on a 0–100 tension slider is about the smallest difference a
 * person would describe as "that one helped more". Below that the adjustment
 * is fractional and rounds toward nothing, which is the correct amount of
 * confidence to have about a two-point difference.
 */
const POINTS_FOR_FULL_SWING = 5;

/** tacticId → weight delta, already bounded. Absent means "no opinion". */
export type EfficacyTable = ReadonlyMap<string, number>;

export const NO_EFFICACY: EfficacyTable = new Map();

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * What one person's own sittings say, and why its numbers are different.
 *
 * The table above is the room: five hundred vents across everybody, twelve
 * anchored observations per tactic before it may move a weight. Those floors
 * are right for a claim about everyone and unreachable for a claim about one
 * person — nobody has twelve anchored sittings on each of two tactics.
 *
 * So the personal floor is four, and because four is thinner evidence than
 * twelve, the personal span is half. Less evidence must mean a smaller nudge;
 * lowering the bar without lowering the influence would just be louder
 * guessing. It is the same trade the preference pipeline makes when it scores
 * somebody against their own baseline instead of the cohort's.
 *
 * Why bother: the room's opinion is about the average person, and there is no
 * average person. `body_map_drop_set` beating the room by four points is a
 * real finding and still says nothing about somebody who has never once been
 * helped by a somatic move. Their own eleven sittings say that, and nothing
 * else in this product — or in any competitor's — is in a position to hear it.
 */
export const PERSONAL_FLOOR = 4;
export const PERSONAL_SPAN = 3;

export function measurePersonalEfficacy(vents: readonly VentRow[]): EfficacyTable {
  return score(vents, PERSONAL_FLOOR, PERSONAL_SPAN);
}

/**
 * Their own opinion where they have one, the room's everywhere else.
 *
 * Per tactic rather than all-or-nothing: a person can have enough sittings to
 * have learned something about two moves and nothing about the other thirty
 * four, and the room is still the best available answer for those thirty four.
 */
export function blendEfficacy(
  personal: EfficacyTable,
  population: EfficacyTable,
): EfficacyTable {
  if (personal.size === 0) return population;
  const merged = new Map(population);
  for (const [id, delta] of personal) merged.set(id, delta);
  return merged;
}

/**
 * Per-tactic drop, compared against the room.
 *
 * Returns an empty table — meaning "carry on as before" — whenever there is
 * not enough to say. That includes the case of one tactic clearing the floor
 * on its own: a single tactic cannot be better than average when it *is* the
 * average, and computing a delta for it would be the selector agreeing with
 * itself in a mirror.
 */
export function measureEfficacy(vents: readonly VentRow[]): EfficacyTable {
  return score(vents, EFFICACY_FLOOR, EFFICACY_SPAN);
}

/*
  One scoring function, two callers.

  The room and the person differ only in how much evidence they demand and how
  far they may move a weight. Writing the arithmetic twice is how the eval
  suite ends up asserting against a copy while the product drifts — this file
  already carries that lesson about chair tensions living in four places.
*/
function score(
  vents: readonly VentRow[],
  floor: number,
  span: number,
): EfficacyTable {
  /*
    Rows written before the arrival reading was real are not evidence.

    Until the fix that stopped it, `tension_before` was whatever the pressure
    slider happened to hold, and for every returning visitor that was the
    untouched default of fifty. Production's mean drop was −28.3: not a
    product making people worse, a corpus of fabricated arrivals sitting under
    honest departures.

    Stopping the write does nothing to the rows already written. This function
    reads the last five hundred vents across everybody, so the poisoned ones
    stay in the window for as long as it takes five hundred new ones to push
    them out — and until then the selector, the per-person table and the
    outcome-weighted preference pairs all keep ranking thirty-five tactics on
    them. A fix that only stops new damage while the old damage keeps
    steering the product is half a fix.

    So the exact default is dropped. This is deliberately crude and
    deliberately over-inclusive: it also discards the genuine sittings of
    anybody who really did arrive at fifty and said so. That is the correct
    trade. A real reading lost is one observation; a fabricated one kept is a
    vote in every ranking this file produces, and there is no column recording
    which of the two a fifty was.

    It expires on its own. Once the corpus is rows written by a client that
    sends null instead of a default, `PRE_FIX_DEFAULT` matches only people who
    genuinely chose fifty — and by then they are a minority small enough that
    discarding them costs nothing measurable. No migration, no backfill, no
    flag to remember to remove.
  */
  const anchored = vents.filter(
    (v) =>
      v.tactic_used &&
      v.tension_before !== null &&
      v.tension_after !== null &&
      v.tension_before !== PRE_FIX_DEFAULT,
  );
  if (anchored.length < floor * 2) return NO_EFFICACY;

  const byTactic = new Map<string, number[]>();
  for (const v of anchored) {
    const id = v.tactic_used as string;
    const drop = (v.tension_before as number) - (v.tension_after as number);
    const seen = byTactic.get(id);
    if (seen) seen.push(drop);
    else byTactic.set(id, [drop]);
  }

  const qualifying = [...byTactic.entries()].filter(
    ([, drops]) => drops.length >= floor,
  );
  // One tactic over the floor has nothing to be compared with.
  if (qualifying.length < 2) return NO_EFFICACY;

  // The baseline is drawn from the qualifying tactics only. Including the thin
  // ones would let a tactic used four times drag the average that the
  // well-evidenced ones are then judged against.
  const pool = qualifying.flatMap(([, drops]) => drops);
  const baseline = pool.reduce((a, b) => a + b, 0) / pool.length;

  const table = new Map<string, number>();
  for (const [id, drops] of qualifying) {
    const mean = drops.reduce((a, b) => a + b, 0) / drops.length;
    const delta = clamp(
      Math.round(((mean - baseline) * span) / POINTS_FOR_FULL_SWING),
      -span,
      span,
    );
    if (delta !== 0) table.set(id, delta);
  }
  return table;
}

/**
 * What the loop learned, in a sentence, for the heartbeat.
 *
 * Names the move and the number of sessions behind it. It does not say the
 * tactic is "better" — it says it is followed by a larger drop, which is the
 * only thing the numbers support.
 */
export function efficacyNote(table: EfficacyTable): string | null {
  if (table.size === 0) return null;
  const ranked = [...table.entries()].sort((a, b) => b[1] - a[1]);
  const [bestId, bestDelta] = ranked[0];
  const [worstId, worstDelta] = ranked[ranked.length - 1];
  if (bestDelta <= 0) return `every measured move is at or below the room average; ${worstId} is furthest below`;
  if (worstDelta >= 0) return `${bestId} is followed by the largest drops`;
  return `${bestId} is followed by the largest drops, ${worstId} by the smallest`;
}

// ── The cache ────────────────────────────────────────────────────────────────
//
// Reading the window on every message would put a 500-row scan in front of
// somebody waiting to be answered. It is recomputed on a slow clock instead:
// this is a weighting, not a fact, and a weighting that is thirty minutes old
// is indistinguishable from a fresh one.
//
// Per-instance in serverless, which is fine — every instance converges on the
// same table because they are all reading the same rows.

const REFRESH_MS = 30 * 60_000;

interface Cached {
  table: EfficacyTable;
  at: number;
}

let cache: Cached | null = null;
let inFlight: Promise<EfficacyTable> | null = null;

/** For tests, and for anything that needs to prove the cold path. */
export function resetEfficacyCache() {
  cache = null;
  inFlight = null;
}

interface EfficacySource {
  recentVentsAcross(limit: number): Promise<VentRow[]>;
}

/**
 * The table, or an empty one.
 *
 * Never throws and never blocks a reply. A store that is down, a query that
 * fails, a window with nothing in it — all of them return "no opinion" and the
 * selector behaves exactly as it did before this file existed. This is the
 * second opinion, and the rule for a second opinion is fail open.
 */
export async function getEfficacy(store: EfficacySource | null): Promise<EfficacyTable> {
  if (!store) return NO_EFFICACY;
  if (cache && Date.now() - cache.at < REFRESH_MS) return cache.table;
  // A cold instance under load would otherwise fire one scan per concurrent
  // request; they all wait on the first one instead.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const table = measureEfficacy(await store.recentVentsAcross(500));
      cache = { table, at: Date.now() };
      return table;
    } catch {
      // Cache the miss too, so a store that is down is not re-asked on every
      // single message for the next half hour.
      cache = { table: NO_EFFICACY, at: Date.now() };
      return NO_EFFICACY;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
