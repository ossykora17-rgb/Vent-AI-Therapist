import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { withStore } from "@/lib/http/with-store";

export const dynamic = "force-dynamic";

/**
 * What the room worked out about somebody, shown to them, and deletable.
 *
 * These are the only sentences in this product that are *about* a person
 * rather than *by* them, and until now they were the only ones nobody could
 * see. The Carver wrote them, `notesBlock` read them into every prompt, and
 * there was no surface anywhere that listed them and no way to take one back.
 *
 * The carve had both from the day it existed. `kept-list.tsx` says why in its
 * own docstring — "long-term memory without a delete button is not a feature"
 * — and then shipped exactly that for the notes, one section further down the
 * same page.
 *
 * WHY THIS IS NOT A NICETY
 *
 * Clark & Chalmers give four conditions for something outside your head to
 * count as genuinely part of your cognition, and the fourth is that the
 * content was *previously consciously endorsed*. A note nobody has seen fails
 * it by construction: it is a proposition about somebody, held by a machine,
 * read back into every conversation, that they never agreed to and could not
 * contest. `keepable()` already refuses the worst of them — no diagnoses, no
 * interpretations dressed as fact — but refusing to write a bad note is not
 * the same as letting somebody correct a wrong one.
 *
 * Zero tokens. No classifier, no model, no lookup — a read and a delete.
 */

async function handleGET(request: Request) {
  const anonId = new URL(request.url).searchParams.get("anonId");
  if (!anonId) {
    return NextResponse.json({ error: "anonId required" }, { status: 422 });
  }
  const store = getStore();
  // An empty list, not a refusal. No store and no user are the same answer to
  // the only question this endpoint is asked: what do you have about me.
  if (!store) return NextResponse.json({ notes: [], persisted: false });
  const userId = await store.findUserId(anonId);
  if (!userId) {
    return NextResponse.json(
      { notes: [], persisted: true, storage: store.kind },
      { headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { notes: await store.listNotes(userId), persisted: true, storage: store.kind },
    { headers: { "cache-control": "no-store" } },
  );
}

async function handleDELETE(request: Request) {
  const url = new URL(request.url);
  const anonId = url.searchParams.get("anonId");
  const id = url.searchParams.get("id");
  if (!anonId || anonId.length < 8 || !id) {
    return NextResponse.json({ error: "anonId and id required" }, { status: 422 });
  }

  const store = getStore();
  /*
    Nothing is kept, so nothing is held — and that is a deletion that holds.

    `deleted: false` here would be true about the row and wrong about the
    question. The person is asking "is it gone", and where nothing was ever
    stored the answer is yes. This is `?carve=1`'s lesson said forwards: a
    denial made without its answer is the same defect as a promise made
    without its answer, and in this product the false alarm is the worse half
    — somebody goes looking for a way to delete a thing that is already gone,
    finds none, and concludes deletion never works.
  */
  if (!store) return NextResponse.json({ deleted: true, persisted: false });

  const userId = await store.findUserId(anonId);
  if (!userId) {
    return NextResponse.json(
      { deleted: true, persisted: true, had: false, storage: store.kind },
      { headers: { "cache-control": "no-store" } },
    );
  }

  /*
    No boolean to drop. `deleteNote` throws when the delete could not be
    attempted — `withStore` turns that into a non-2xx — so there is no shape
    where this line reports a deletion that did not happen. That is the whole
    reason it was written to throw rather than to return: check 87 exists
    because the one store method that reports by returning had its answer
    dropped by the route between two correct halves.
  */
  await store.deleteNote(userId, id);
  return NextResponse.json(
    { deleted: true, persisted: true, had: true, storage: store.kind },
    { headers: { "cache-control": "no-store" } },
  );
}

export const GET = withStore(handleGET);
export const DELETE = withStore(handleDELETE);
