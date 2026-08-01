import "server-only";
import type { CircleRow, Store } from "@/lib/store";
import { closeVoiceRoom } from "@/lib/voice/close";

/**
 * Is this circle over, and if it just became over, end it properly.
 *
 * There was one copy of this check in the room `GET` and the clock-driven
 * close hung off it. That meant a circle nobody was polling never closed at
 * all — its row stayed `waiting`, its transcript stayed readable, and its
 * voice room stayed live on the SFU indefinitely. Meanwhile the mute route
 * had no check whatsoever, so a Keeper's authority outlived the circle it was
 * granted for.
 *
 * One predicate now, called by every route that touches a circle. The close
 * happens exactly once, on the transition, whichever request notices first.
 *
 * @returns `true` when the caller should refuse — closed, or the clock is up.
 */
export async function sweepIfOver(store: Store, circle: CircleRow): Promise<boolean> {
  const expired = new Date(circle.ends_at).getTime() <= Date.now();

  if (circle.status === "closed") return true;
  if (!expired) return false;

  // Whoever noticed first does the work: delete the transcript, then end the
  // voice room. Order matters — the words are the promise, and they go first
  // even if the SFU is unreachable and the second call fails.
  await store.closeCircle(circle.id);
  await closeVoiceRoom(circle.id);
  return true;
}
