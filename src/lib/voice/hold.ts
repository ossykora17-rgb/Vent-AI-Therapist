/**
 * The Keeper's hold on a seat, and where it lives.
 *
 * It lived on the participant, and a participant is a connection: leaving
 * voice and coming back made a new one with nothing on it, so a person the
 * Keeper had muted could reload the page and talk. It lives on the **room**
 * now — LiveKit's room metadata, which every seat in the call receives and
 * which the token route can read before it mints — and it dies with the room,
 * which `closeCircle` deletes. Nothing new is kept about anybody: a seat
 * number, for as long as the call it was made in.
 *
 * The record is not the enforcement. The SFU is: a held seat has no
 * permission to publish, so its track is removed and a new one is refused,
 * whatever its browser does. This is what every screen reads to say so.
 *
 * Pure, and free of any SDK, because the call bar reads it as well as the
 * routes that write it — one parser, so the Keeper's buttons and the held
 * seat's own screen cannot disagree about who is held.
 */

const SEAT = /^seat-[1-6]$/;

function parse(metadata: string | null | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(metadata ?? "") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Seats held by the Keeper. Anything that does not parse holds nobody. */
export function heldSeats(metadata: string | null | undefined): string[] {
  const held = parse(metadata).held;
  return Array.isArray(held)
    ? [...new Set(held.filter((s): s is string => typeof s === "string" && SEAT.test(s)))]
    : [];
}

/**
 * The room's metadata with one seat held or let go. Merges rather than
 * replaces, so a key written by anything else survives the Keeper's tap.
 */
export function withHold(metadata: string | null | undefined, identity: string, held: boolean): string {
  const rest = heldSeats(metadata).filter((s) => s !== identity);
  return JSON.stringify({ ...parse(metadata), held: held ? [...rest, identity].sort() : rest });
}
