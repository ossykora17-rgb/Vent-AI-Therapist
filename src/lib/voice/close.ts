import "server-only";
import { isLivekitConfigured, env } from "@/lib/env";
import { roomNameFor } from "./livekit";

/**
 * Close means close, including the part nobody can read back.
 *
 * Deleting a circle deletes its transcript — that has been true since the
 * clock-end fix. But the voice room was never told. A Keeper could end a
 * circle, the words would vanish, the UI would say "That circle has closed",
 * and six people would still be sitting in an SFU room talking to each other
 * with no Keeper, no phases, no governance and no end. The most dangerous
 * version of that is the one where somebody leaves believing the room is over.
 *
 * So closing the circle closes the room. Best-effort by design: if the SFU is
 * unreachable the *text* close must still succeed, because the transcript
 * deletion is the promise that actually matters and it cannot be held hostage
 * to a third party being up.
 */
/**
 * The longest this is allowed to hold anybody up.
 *
 * The paragraph above says the transcript deletion "cannot be held hostage to
 * a third party being up", and then this function awaited an SDK call with no
 * bound on it — so the *close* could not be held hostage but the request doing
 * the closing could be, indefinitely.
 *
 * That was survivable while it was theoretical. It stopped being theoretical
 * the hour LiveKit keys were added: before that `isLivekitConfigured` was
 * false and this returned instantly, and the lobby sweep added the same day
 * calls it once per stale circle. Five unbounded round trips to a third party,
 * in series, inside a page load — on a deployment shape that had never once
 * executed this line.
 *
 * Six seconds is generous for an API call that deletes a room and irrelevant
 * to correctness: the words are already gone by the time this runs, and a
 * room that outlives its circle by a few minutes is tidied by the next sweep.
 * Nothing downstream reads the result.
 */
const SFU_DEADLINE_MS = 6_000;

export async function closeVoiceRoom(circleId: string): Promise<void> {
  if (!isLivekitConfigured) return;

  try {
    // Imported here, not at module scope: this runs on a path that must work
    // when voice was never configured, and the SDK has no business loading
    // for a circle that only ever used text.
    const { RoomServiceClient } = await import("livekit-server-sdk");

    const svc = new RoomServiceClient(
      env.livekitUrl.replace(/^ws/, "http"),
      env.livekitApiKey,
      env.livekitApiSecret,
    );

    /*
      Disconnects every participant and drops the room. There is no gentler
      call here, and there should not be — the circle is over.

      Raced rather than given a signal, because the SDK's client does not take
      one. Losing the race throws, which lands in the catch below and is
      logged exactly like an unreachable SFU — the same outcome it already
      handles, reached a few seconds sooner.
    */
    await Promise.race([
      svc.deleteRoom(roomNameFor(circleId)),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`SFU did not answer in ${SFU_DEADLINE_MS}ms`)),
          SFU_DEADLINE_MS,
        ),
      ),
    ]);
  } catch (error) {
    // A room that never opened returns an error, and so does an unreachable
    // SFU. Neither may fail the close.
    console.error("[voice] could not close the voice room", error);
  }
}
