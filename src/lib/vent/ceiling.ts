/**
 * The brake that does not depend on the wheel.
 *
 * `/api/vent` already rate-limits per person, carefully: `RATE_PER_MINUTE`,
 * `RATE_PER_DAY`, a higher day cap at the edge, and a refusal that hands
 * somebody a human rather than "try again in a minute". That limiter is good
 * and this does not replace it.
 *
 * It has two gaps, and both only matter at scale.
 *
 * **It lives inside `if (store)`.** The route degrades to the no-store shape
 * when the database is unreachable — deliberately, and the comment beside it
 * is right: *"the reply is worth more than the record"*. But `userId` stays
 * null on that path, so the counting never happens and the model is called
 * anyway. The limiter is a dependent of the thing most likely to fail under
 * load. Production answered `Gateway Timeout` on two tables five days ago; in
 * that window every vent was unlimited, and nothing anywhere said so.
 *
 * **`anonId` comes from the client.** It is the whole credential and it is
 * also self-asserted, so a per-person limit bounds an honest person and
 * nobody else. Rotating the id resets the count.
 *
 * So this counts what neither of those can dodge: model calls made by *this
 * instance*, in a rolling minute, with no identity and no database.
 *
 * WHAT IT IS NOT, STATED RATHER THAN DISCOVERED
 *
 * It is **per-instance**, exactly like `cached()` one file over, and for the
 * same reason — serverless has no shared memory. On a product where almost
 * every request is a cold start this catches nothing, which is worth writing
 * down instead of implying a guarantee. What it does bound is the shape that
 * actually costs money: one warm instance taking a sustained flood, which is
 * what a script looks like and what an incident looks like. A cold-start
 * flood is bounded by the platform, not by this, and the honest answer there
 * is Vercel's own rate limiting — infrastructure, not code.
 *
 * Defence in depth, named as the shallow half.
 */

/**
 * Model calls one instance may make in a rolling minute.
 *
 * Arithmetic rather than a feeling. Production took 178 vents in a month —
 * about six a day. At a hundred times that traffic it is 600 a day, roughly
 * 25 an hour, and a single instance sees a fraction of those. Sixty in one
 * minute on one instance is far above anything organic at that scale and far
 * below what an unattended script would do, which is the window this is for.
 *
 * Raising it is cheap and safe. Lowering it is a product decision, because
 * the refusal it produces is one a real person could meet.
 */
export const CALLS_PER_INSTANCE_MINUTE = 60;

const WINDOW_MS = 60_000;

/** Timestamps of calls this instance has made, oldest first. */
let calls: number[] = [];

/**
 * May this instance make another model call?
 *
 * Records the call when it answers true, so the caller cannot ask twice and
 * spend once — `countsAsSpend` is the precedent for one function that both
 * decides and is graded directly, rather than a predicate somebody
 * reimplements two lines above their assertions.
 */
export function allowModelCall(now = Date.now()): boolean {
  const cutoff = now - WINDOW_MS;
  // Rebuilt rather than shifted: the array is bounded by the ceiling itself,
  // so this is at most sixty entries and never grows with traffic.
  calls = calls.filter((t) => t > cutoff);
  if (calls.length >= CALLS_PER_INSTANCE_MINUTE) return false;
  calls.push(now);
  return true;
}

/** How many calls this instance has made in the current window. Counts only. */
export function callsInWindow(now = Date.now()): number {
  return calls.filter((t) => t > now - WINDOW_MS).length;
}

/** Test seam. The suite needs a clean instance; production never calls this. */
export function resetCeiling(): void {
  calls = [];
}
