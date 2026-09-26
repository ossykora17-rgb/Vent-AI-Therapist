import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { sweepIfOver } from "@/lib/circles/sweep";
import { withStore } from "@/lib/http/with-store";
import {
  checkWav, NOTE_MAX_BYTES, NOTE_TOO_SHORT, NOTES_PER_CIRCLE, NOTES_PER_SEAT, readNote, type WavVerdict,
} from "@/lib/voice/note";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/*
  Leave a voice note in a circle.

  The body is the WAV itself, not JSON around base64 of it: a third bigger on
  the way up is a third longer on a Lagos 3G connection, for nothing. The seat
  travels in a header rather than in the URL so it stays out of every request
  log a URL ends up in — an anon id here is the whole credential.

  What the server believes about the note it works out itself. `checkWav` reads
  the format and the length off the bytes; the phone is never asked how long
  its own recording is, because a number the client typed is a number the
  client chose.

  Same doors as every other handler under `[id]`, in the same order — the room
  exists, the room is not over, you have a seat — because "this room is over"
  is true of any caller and "you are not a member" of only some.

  And every door, and both caps, before a byte of the body is read. A note is
  up to two megabytes; a stranger, a closed room or a full one is refused for
  the price of a header, and the body that is read is read to a hard cap
  rather than to whatever `content-length` claimed.
*/

const REFUSED: Record<Exclude<WavVerdict, { ok: true }>["why"], string> = {
  too_big: "That voice note is too long to send. Keep it under a minute.",
  not_wav: "That didn't arrive as a voice note. Try recording it again.",
  not_the_note_format: "That didn't arrive as a voice note. Try recording it again.",
  too_short: NOTE_TOO_SHORT,
};

/** A deployment without 0022, or a store that refused the row. */
const NO_NOTES_HERE = "Voice notes aren't switched on in this room. Type it instead — it still counts.";

async function handlePOST(request: Request, { params }: Params) {
  const { id } = await params;
  const anonId = request.headers.get("x-anon-id") ?? "";
  if (anonId.length < 8 || anonId.length > 64) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  // The sender's own word for its size, when it gives one: the cheapest refusal.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > NOTE_MAX_BYTES) {
    return NextResponse.json({ error: "too_big", message: REFUSED.too_big }, { status: 413 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage", message: NO_NOTES_HERE }, { status: 503 });

  const circle = await store.getCircle(id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (await sweepIfOver(store, circle)) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const members = await store.listMembers(id);
  if (!members.some((m) => m.anon_id === anonId)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  let said;
  try {
    said = await store.listVoiceNotes(id);
  } catch {
    // The table is not there (0022 pending) or the read was refused: either
    // way there is nowhere to keep a note, and the person is told in words.
    return NextResponse.json({ error: "notes_off", message: NO_NOTES_HERE }, { status: 503 });
  }
  if (said.length >= NOTES_PER_CIRCLE) {
    return NextResponse.json(
      { error: "room_full", message: "This room has heard a lot of voice notes. Type the rest — it still counts." },
      { status: 429 },
    );
  }
  if (said.filter((n) => n.anon_id === anonId).length >= NOTES_PER_SEAT) {
    return NextResponse.json(
      { error: "seat_full", message: "That's as many voice notes as one seat can leave here. Type the rest — it still counts." },
      { status: 429 },
    );
  }

  const bytes = await readNote(request.body);
  if (!bytes) {
    return NextResponse.json({ error: "too_big", message: REFUSED.too_big }, { status: 413 });
  }
  const verdict = checkWav(bytes);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.why, message: REFUSED[verdict.why] },
      { status: verdict.why === "too_big" ? 413 : 422 },
    );
  }

  const noteId = await store.addVoiceNote({
    circleId: id,
    anonId,
    durationMs: verdict.durationMs,
    // What `checkWav` wrote, never what arrived — see its doc comment.
    audio: Buffer.from(verdict.wav).toString("base64"),
  });
  if (!noteId) {
    return NextResponse.json({ error: "notes_off", message: NO_NOTES_HERE }, { status: 503 });
  }

  return NextResponse.json(
    { id: noteId, durationMs: verdict.durationMs },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}

// A store that stops answering is a 503 here, not a 404 and not a 500.
export const POST = withStore(handlePOST);
