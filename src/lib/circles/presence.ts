/**
 * Proof that somebody else is there.
 *
 * The room had a seat count and nothing else, so five people reading in
 * silence and an empty room rendered identically. In a text circle the fear
 * is not being judged — it is speaking into a void — and a number labelled
 * "6 seats" does not answer that fear, because it counts chairs, not people.
 *
 * Presence is derived, never stored as a boolean. A stored "online" flag is a
 * lie the moment a phone dies mid-session; a timestamp with a window can only
 * ever be a little stale, and it self-heals with no cleanup job.
 */

/** The room polls every 4s, so this tolerates two missed beats. */
export const PRESENCE_WINDOW_MS = 12_000;

/**
 * Long enough that a slow typist does not flicker, short enough that a
 * closed laptop stops claiming to be writing. Never extended by the server —
 * it is refreshed only by the next poll that still has text in the box.
 */
export const TYPING_WINDOW_MS = 8_000;

/** Do not write on every poll. A heartbeat this fine is noise on disk. */
export const TOUCH_INTERVAL_MS = 2_500;

export function isPresent(lastSeenAt: string | null, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  return now - new Date(lastSeenAt).getTime() < PRESENCE_WINDOW_MS;
}

export function isTyping(typingUntil: string | null, now = Date.now()): boolean {
  if (!typingUntil) return false;
  return new Date(typingUntil).getTime() > now;
}

export interface PresenceMember {
  anon_id: string;
  last_seen_at: string | null;
  typing_until: string | null;
}

export interface Presence {
  /**
   * Which seat is the caller's, or null.
   *
   * Null when they have not taken one — drawn as no seat highlighted rather
   * than as seat zero, because a room that marks the wrong chair as yours is
   * worse than one that marks none.
   */
  mySeat: number | null;
  /** How many of the seats have a person behind them right now. */
  present: number;
  /** Someone else is writing. Never "who" — a circle has no names. */
  typingOthers: number;
  /** One per seat, in join order, so the room can draw a row of dots. */
  seatsPresent: boolean[];
}

/**
 * `me` is excluded from the typing count and from nothing else. You are
 * present in your own room, and the dot for your seat should be lit — seeing
 * yourself in the row is what makes the row legible.
 */
/** −1 from `findIndex` is "not there", and not a seat. */
const indexOrNull = (i: number) => (i < 0 ? null : i);

export function presenceOf(
  members: PresenceMember[],
  me: string | null,
  now = Date.now(),
): Presence {
  const seatsPresent = members.map((m) => isPresent(m.last_seen_at, now));
  return {
    present: seatsPresent.filter(Boolean).length,
    /*
      Which seat is theirs, or null.

      `seatsPresent` has always been an array of six booleans with no way to
      tell which one is you — enough to draw a count, not enough to draw a
      room. Computed here rather than in the route because this is the one
      place presence is worked out, and a second implementation of "which
      member is the caller" is a second answer.

      Null for somebody who has not taken a seat, and null is drawn as no
      seat highlighted rather than as seat zero. A room that marks the wrong
      chair as yours is worse than one that marks none.
    */
    mySeat: me === null ? null : indexOrNull(members.findIndex((m) => m.anon_id === me)),
    typingOthers: members.filter(
      (m) => m.anon_id !== me && isTyping(m.typing_until, now) && isPresent(m.last_seen_at, now),
    ).length,
    seatsPresent,
  };
}

/** Skip the write when the last one is fresh and nothing changed. */
export function shouldTouch(
  member: PresenceMember,
  typing: boolean,
  now = Date.now(),
): boolean {
  if (isTyping(member.typing_until, now) !== typing) return true;
  if (!member.last_seen_at) return true;
  return now - new Date(member.last_seen_at).getTime() >= TOUCH_INTERVAL_MS;
}
