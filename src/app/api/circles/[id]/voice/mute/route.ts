import { NextResponse } from "next/server";
import { z } from "zod";
import { RoomServiceClient, TrackSource, TwirpError } from "livekit-server-sdk";
import { getStore } from "@/lib/store";
import { env, isLivekitConfigured } from "@/lib/env";
import { roomNameFor } from "@/lib/voice/livekit";
import { withHold } from "@/lib/voice/hold";
import { sweepIfOver } from "@/lib/circles/sweep";
import { withStore } from "@/lib/http/with-store";

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

/*
  Whole, every time. The SFU replaces every field of a permission it is sent
  (`UpdateFromPermission` in livekit/protocol), so a hold written as
  `{ canPublish: false }` alone would also turn off `canSubscribe` — deafening
  the person it was meant to quiet — and a release written as
  `{ canPublish: true }` alone would drop `canPublishSources`, which the SFU
  reads as "any source": a camera, in a room that is audio by promise. Both
  halves match what the join token grants, apart from the one field a hold is.
*/
const seatPermission = (canPublish: boolean) => ({
  canPublish,
  canSubscribe: true,
  canPublishData: false,
  canPublishSources: [TrackSource.MICROPHONE],
  canUpdateMetadata: false,
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
 * - It is **never silent**. The hold is written into the room's metadata,
 *   which every seat in the call receives, and every call bar says it. A
 *   circle whose whole promise is being heard cannot take a voice away
 *   without saying so — a quiet mute would be the worst lie in here.
 */
async function handlePOST(request: Request, { params }: Params) {
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

  // Authority does not outlive the thing it was granted for. Every sibling
  // route gates on the circle's state; this one did not, so a former Keeper
  // could still reach for the volume of a session that ended hours ago.
  const circle = await store.getCircle(id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (await sweepIfOver(store, circle)) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

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

    /*
      A hold is a permission, not a request.

      It was `mutePublishedTrack` — the SFU asking the seat's own browser to
      mute, which that browser could undo from its console and which a new
      connection never heard of. Then a mark in the seat's metadata, which
      lived on the connection: leaving voice and rejoining — one reload —
      came back free. Now the SFU takes away the seat's right to publish. It
      removes the track itself and refuses a new one, whatever the browser
      does, and the room's metadata records the hold so the token route mints
      a held seat back held (`hold.ts`).

      Releasing gives the right back and touches nothing else: the seat's
      microphone stays off until they tap. No microphone is ever opened from
      here — not theirs, not anybody's.

      The permission moves first and the record second, in both directions:
      the room is told a seat is muted once it is, never before.
    */
    try {
      await svc.updateParticipant(room, identity, { permission: seatPermission(!muted) });
    } catch (error) {
      if (!(error instanceof TwirpError && error.status === 404)) throw error;
      // Not in voice. Letting go of somebody who left still has to clear the
      // record, or their next join comes back held; holding somebody who is
      // not there is a mute nobody would hear being made.
      if (muted) {
        return NextResponse.json(
          { error: "not_in_voice", message: `Seat ${seat} isn't in voice right now.` },
          { status: 409 },
        );
      }
    }

    const [current] = await svc.listRooms([room]);
    // No room is no call, and nobody is held in a call that is not happening.
    if (current) await svc.updateRoomMetadata(room, withHold(current.metadata, identity, muted));

    return NextResponse.json(
      { ok: true, seat, muted, identity },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    /*
      Say what failed, and not in the SFU's words.

      The intent below was right and is kept: a Keeper who pressed mute and saw
      nothing happen needs to know whether the room ignored them or the voice
      server did, and 502 with this sentence says the second. What was wrong was
      the mechanism — the raw `Error.message` was interpolated into a `message`
      field, and every component in this product prints `message` verbatim to a
      person. That is how three environment variable names reached somebody
      tapping the microphone one route over.

      A LiveKit error is worse than a hostname here. `updateParticipant` is
      called with the room name and an identity, and its failures quote them —
      the room name is derived from the circle id and the identity is a seat.
      A circle's whole promise is that the room is sealed; the error path was
      the one surface that would read part of it back.

      The kind is logged instead, per the rule that stdout gets names and never
      contents.
    */
    console.warn("[mute] upstream refused:", error instanceof Error ? error.constructor.name : typeof error);
    return NextResponse.json(
      {
        error: "upstream",
        message: "The voice server didn't take that. The room heard you — try again in a moment.",
      },
      { status: 502 },
    );
  }
}

// A store that stops answering is a 503 here, not a 404 and not a 500.
export const POST = withStore(handlePOST);
