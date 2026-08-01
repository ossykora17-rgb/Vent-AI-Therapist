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

    // Disconnects every participant and drops the room. There is no gentler
    // call here, and there should not be — the circle is over.
    await svc.deleteRoom(roomNameFor(circleId));
  } catch (error) {
    // A room that never opened returns an error, and so does an unreachable
    // SFU. Neither may fail the close.
    console.error("[voice] could not close the voice room", error);
  }
}
