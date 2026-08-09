import { isExpired, MAX_SEATS, CIRCLE_MINUTES } from "@/lib/circles/rules";
import type { CircleRow } from "@/lib/store";

/**
 * The one bridge between the private room and the peer room.
 *
 * This product has two surfaces and, until now, no door between them. Somebody
 * types "nobody knows this, i'm alone with it" at 2am, gets a real answer, and
 * is never told that there is a circle open with five free seats on the other
 * side of the same app. The loneliest sentence in the corpus, answered well,
 * and then the person is left exactly as alone as they arrived.
 *
 * ## Why this is data and not prompt
 *
 * The model is never told circles exist, and that is deliberate. A model that
 * knows about rooms can invent one — a tag, a time, a number of seats — and
 * somebody arriving at a circle that was never there is a worse outcome than
 * never being offered one. The offer is assembled here from rows the server
 * actually read, attached to the response, and rendered as a real link.
 *
 * It also costs nothing in the prompt, which is now budgeted at 3,200 tokens
 * and already spending 3,035 of it.
 *
 * ## What makes it honest
 *
 * Null on everything: no store, no open circle, every circle full, every
 * circle expired, or the person is in crisis. Same discipline as a flavour
 * below its confidence floor and an exchange rate that did not fetch — when
 * there is nothing true to offer, nothing is offered.
 *
 * Never in crisis, and that one is not a threshold. Somebody who has just
 * been handed a helpline is not being redirected to peer support; the two
 * things answer different needs and confusing them is how a person in danger
 * ends up in a room of strangers instead of on a phone.
 */

/**
 * Loneliness in the words people use for it — including the ones that never
 * say the word.
 *
 * "Nobody knows" and "i never tell anybody" are the commonest shapes it takes
 * here, and neither contains "lonely". A matcher that waits for the word waits
 * for the version most people never write.
 */
const ALONE = [
  /\b(lonely|alone|isolat|by myself|on my own)\b/,
  /\bnobody (knows|understands|to talk to|dey)\b/,
  /\bno ?body to (talk|tell)\b/,
  /\bi (never|no dey) tell (anybody|anyone|nobody)\b/,
  /\b(keeping|holding) (it|am) (to myself|for mind|inside)\b/,
  /\bi don'?t have anyone\b/,
  /\bno friends?\b/,
  // Pidgin
  /\bi no get person\b/,
  /\bperson wey i fit talk to\b/,
  /\bi dey carry am alone\b/,
];

export interface CircleInvite {
  id: string;
  /** The room's pressure, for naming it in plain words. */
  tag: string | null;
  seatsOpen: number;
  minutesLeft: number;
}

export function soundsAlone(message: string): boolean {
  const t = message.toLowerCase();
  return ALONE.some((r) => r.test(t));
}

/**
 * A real room with a real seat, or null.
 *
 * Prefers a circle about the same pressure they are carrying — sitting with
 * people holding the same weight is the whole value — and falls back to any
 * open room, because at 2am the room that exists beats the room that matches.
 */
export function circleInvite(
  message: string,
  circles: ReadonlyArray<CircleRow & { seats: number }>,
  tag: string | null,
  now = Date.now(),
): CircleInvite | null {
  if (!soundsAlone(message)) return null;

  const open = circles.filter(
    (c) => !isExpired(c.created_at, now) && c.seats < MAX_SEATS && c.seats > 0,
  );
  if (open.length === 0) return null;

  // Same pressure first, then whichever has been going longest — a room that
  // has been sitting a while has already warmed up, and walking into one that
  // opened thirty seconds ago means being the first to speak.
  const elapsed = (c: CircleRow) => now - new Date(c.created_at).getTime();
  const pick =
    open.filter((c) => tag && c.tag === tag).sort((a, b) => elapsed(b) - elapsed(a))[0] ??
    open.sort((a, b) => elapsed(b) - elapsed(a))[0];

  const minutesLeft = Math.max(
    0,
    Math.round(CIRCLE_MINUTES - elapsed(pick) / 60_000),
  );
  // A room with two minutes left is not an invitation, it is a closing door.
  if (minutesLeft < 8) return null;

  return {
    id: pick.id,
    tag: pick.tag ?? null,
    seatsOpen: MAX_SEATS - pick.seats,
    minutesLeft,
  };
}
