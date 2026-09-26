import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { sweepIfOver } from "@/lib/circles/sweep";
import { withStore } from "@/lib/http/with-store";
import { KEEPER_TOOK_DOWN, NOTE_TAKEN_DOWN } from "@/lib/circles/rules";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; noteId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
  One voice note's sound, for somebody with a seat in the room it was left in.

  The same three doors as the rest of the circle, in the same order, and a
  closed circle answers 410 here like every surface that is not the room
  itself: close means close, and a note is a transcript line said out loud.

  Scoped by circle as well as by note id, so an id carried out of one room
  answers nothing in another. `private, no-store`, because a masked voice is
  still somebody's voice and no cache between here and the phone has any
  business keeping it past the room.
*/
async function handleGET(request: Request, { params }: Params) {
  const { id, noteId } = await params;
  const anonId = request.headers.get("x-anon-id") ?? "";
  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const circle = await store.getCircle(id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (await sweepIfOver(store, circle)) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const members = await store.listMembers(id);
  if (!members.some((m) => m.anon_id === anonId)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  // An id that is not a uuid would be a Postgres cast error, reported as the
  // store being down. It is simply not a note.
  if (!UUID.test(noteId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const note = await store.getVoiceNoteAudio(id, noteId);
  if (!note) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const bytes = Buffer.from(note.audio, "base64");
  return new NextResponse(bytes, {
    headers: {
      "content-type": "audio/wav",
      "content-length": String(bytes.length),
      "cache-control": "private, no-store",
      // Served as exactly what it says it is, and never guessed at.
      "x-content-type-options": "nosniff",
    },
  });
}

export const GET = withStore(handleGET);

/*
  Take a note out of the room: your own, or — for the Keeper — anybody's.

  A typed share is screened before it lands; a voice cannot be, so this is the
  moderation a note gets, after the fact, by the one seat that holds the room.
  The Keeper's takedown is said in the thread, because a note vanishing with no
  sentence reads to its author as a glitch. Taking back your own is not
  announced — it is unsaying something, and it is yours to unsay.

  Same doors in the same order as every handler under `[id]`.
*/
async function handleDELETE(request: Request, { params }: Params) {
  const { id, noteId } = await params;
  const anonId = request.headers.get("x-anon-id") ?? "";
  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const circle = await store.getCircle(id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (await sweepIfOver(store, circle)) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const members = await store.listMembers(id);
  const me = members.find((m) => m.anon_id === anonId);
  if (!me) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  if (!UUID.test(noteId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const note = (await store.listVoiceNotes(id)).find((n) => n.id === noteId);
  if (!note) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const mine = note.anon_id === anonId;
  if (!mine && me.role !== "keeper") {
    return NextResponse.json(
      { error: "not_yours", message: "Only the Keeper can take down somebody else's voice note." },
      { status: 403 },
    );
  }

  // The answer is read: a note somebody else removed a moment ago is not
  // reported as removed by this request.
  if (!(await store.deleteVoiceNote(id, noteId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!mine) {
    await store.addCircleMessage({
      circle_id: id,
      anon_id: KEEPER_TOOK_DOWN,
      content: NOTE_TAKEN_DOWN,
      kind: "keeper_prompt",
      flagged: false,
    });
  }
  return NextResponse.json({ deleted: true }, { headers: { "cache-control": "no-store" } });
}

export const DELETE = withStore(handleDELETE);
