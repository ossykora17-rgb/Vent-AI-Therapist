import { NextResponse } from "next/server";
import { z } from "zod";
import { RoomServiceClient, TrackSource, TrackType } from "livekit-server-sdk";
import { getStore } from "@/lib/store";
import { env, isLivekitConfigured } from "@/lib/env";
import { roomNameFor } from "@/lib/voice/livekit";

export const dynamic = "force-dynamic";

/**
 * Next 15 made route params a promise — the request store is resolved rather
 * than ambient — so every handler awaits its own id before using it.
 */
type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  anonId: z.string().min(8).max(64),
  /** 1–6. The Keeper names a seat, never a person — there are no people here. */
  seat: z.number().int().min(1).max(6),
  /** Unmuting is the same authority as muting, and must be as easy. */
  muted: z.boolean().default(true),
});

/**
 * The Keeper's hand on the room's volume.
 *
 * Every other rule in a circle refuses a *message* — advice, cross-talk, a
 * threat — and the person can try again in better words. Voice has no such
 * gate: by the time a sentence is wrong it has already been heard. So the
 * Keeper gets one control, and it is bounded on purpose:
 *
 * - It mutes, it does not remove. `removeParticipant` exists in this SDK and
 *   is deliberately not called. Ejecting somebody from a room they came to
 *   for support is not a moderation action, it is an abandonment.
 * - It is reversible by the same person, in the same request shape.
 * - It is **never silent**. The SFU tells the muted client, and the room is
 *   told too. A circle whose whole promise is being heard cannot take a voice
 *   away without saying so — a quiet mute would be the worst lie in here.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!isLivekitConfigured) {
    return NextResponse.json({ error: "voice_not_configured" }, { status: 501 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  const { anonId, seat, muted } = parsed.data;

  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const members = await store.listMembers(id);
  const meIndex = members.findIndex((m) => m.anon_id === anonId);
  if (meIndex < 0) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  // `roomAdmin` is in the Keeper's token, but a token is a claim the client
  // holds. The authority is checked here, against the store, every time.
  if (members[meIndex].role !== "keeper") {
    return NextResponse.json({ error: "not_keeper" }, { status: 403 });
  }
  if (seat === meIndex + 1) {
    return NextResponse.json(
      { error: "self", message: "Your own microphone is the Mute button." },
      { status: 422 },
    );
  }
  if (seat > members.length) {
    return NextResponse.json({ error: "no_such_seat" }, { status: 404 });
  }

  const room = roomNameFor(id);
  const identity = `seat-${seat}`;

  try {
    const svc = new RoomServiceClient(
      env.livekitUrl.replace(/^ws/, "http"),
      env.livekitApiKey,
      env.livekitApiSecret,
    );

    // A seat can only publish a microphone, so there is exactly one track to
    // find. Muting by SID rather than blanket-muting keeps this honest if the
    // grant ever widens: it would mute what it named, not everything.
    const participant = await svc.getParticipant(room, identity);
    // The SDK's own enums, never the numbers. `TrackType.AUDIO` is 0 and
    // `VIDEO` is 1, so a hand-written `=== 1` here would have muted the one
    // thing this room can never publish and left the microphone running.
    const audio = participant.tracks.find(
      (t) => t.type === TrackType.AUDIO || t.source === TrackSource.MICROPHONE,
    );

    if (!audio) {
      return NextResponse.json(
        { error: "no_track", message: `Seat ${seat} is not speaking right now.` },
        { status: 409 },
      );
    }

    await svc.mutePublishedTrack(room, identity, audio.sid, muted);

    return NextResponse.json(
      { ok: true, seat, muted, identity },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // Say what failed. A Keeper who pressed mute and saw nothing happen needs
    // to know whether the room ignored them or the SFU did.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "upstream", message: `The voice server did not accept that: ${message}` },
      { status: 502 },
    );
  }
}
