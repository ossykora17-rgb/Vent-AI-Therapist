import { MAX_SEATS } from "./rules";
import { roomName } from "./naming";

/**
 * What the front door can truthfully say about the rooms, right now.
 *
 * The landing page never mentioned circles. Not once. Every line on it is
 * about the private box, so a person who lands at 2am — alone, which is one of
 * the nine pressures this product names — is told about somewhere to put the
 * thing, and never told that five other people are awake in a room called
 * Night Owls. The half of the product with human beings in it was reachable
 * only by going into the chat first and noticing a nav link.
 *
 * ## Why this is a function and not a sentence
 *
 * "Sit with five other people" is a promise, and at 4pm on a Tuesday it may be
 * a lie. The page needed something that is checked rather than claimed, so
 * this returns the count and the real names, or `null` — and `null` renders
 * nothing at all rather than an empty boast.
 *
 * The three shapes, and none of them says something false:
 *
 *   no store          → null. Circles genuinely do not work here, so the door
 *                       is not painted on. This is production with no Supabase
 *                       env vars, which is what a fresh Vercel project is.
 *   store, no rooms   → `count: 0`. The page says nobody is sitting and offers
 *                       to open one, which is true and is still a door.
 *   store, rooms open → the number, and the names people would actually walk
 *                       toward.
 */
export interface OpenNow {
  /** Rooms genuinely joinable this second. */
  count: number;
  /** Their names, most-full first — the room nearest to being a room. */
  names: string[];
  /** Total free seats across them. */
  seatsOpen: number;
}

interface OpenRow {
  tag: string | null;
  created_at: string;
  ends_at: string;
  status: string;
  seats: number;
}

/**
 * Pure, so the eval can hold it to the three shapes without a database.
 *
 * `ends_at` is re-checked here even though `listOpenCircles` filters. A circle
 * that has run out but has not been swept yet is still a row, and the one
 * thing the front door must never do is name a room that is over by the time
 * somebody taps it — the "your turn comes" bug wearing a doorway.
 */
export function summariseOpen(
  rows: readonly OpenRow[] | null | undefined,
  now = Date.now(),
): OpenNow | null {
  if (!rows) return null;

  const live = rows.filter(
    (c) =>
      c.status !== "closed" &&
      c.seats < MAX_SEATS &&
      new Date(c.ends_at).getTime() > now,
  );

  const ordered = [...live].sort((a, b) => b.seats - a.seats);

  return {
    count: ordered.length,
    // Two. A third name turns a doorway into a directory, and the lobby is
    // one tap away for anybody who wants the whole list.
    names: ordered.slice(0, 2).map((c) => roomName(c.tag, c.created_at)),
    seatsOpen: ordered.reduce((n, c) => n + (MAX_SEATS - c.seats), 0),
  };
}
