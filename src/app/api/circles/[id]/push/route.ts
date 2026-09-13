import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { isPushConfigured } from "@/lib/push/send";
import { sweepIfOver } from "@/lib/circles/sweep";
import { withStore } from "@/lib/http/with-store";

export const dynamic = "force-dynamic";

/**
 * Ask to be woken when somebody sits down in this room.
 *
 * The one notification this product sends. Of the first sixteen circles,
 * fourteen held exactly one person: somebody opens a room, sits alone, closes
 * the tab, and the person who arrives twenty minutes later is now correctly
 * steered into that same room with nobody in it. This is the only thing that
 * can tell the first person the second one came.
 *
 * Whether this build can wake a phone at all is `GET /api/push` — a question
 * about the deployment rather than about a circle, so it lives outside this
 * prefix where every handler must sweep and wrap.
 */

const subscribeSchema = z.object({
  anonId: z.string().min(8).max(64),
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(16).max(200),
  auth: z.string().min(8).max(100),
});

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  const input = parsed.data;

  if (!isPushConfigured) {
    // 501 rather than 503: nothing is broken, the capability is not built into
    // this deployment. The client never asks unless GET said configured, so
    // reaching here means somebody used curl.
    return NextResponse.json({ error: "no_push" }, { status: 501 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  /*
    Does this room exist, is it over, are they in it — in that order.

    True for everybody before true for only some, which is the ordering check
    95 sweeps over every handler under `[id]`. "You are not a member" about a
    room that does not exist, or one that ended, is the false-refusal this
    repository is a monument to.
  */
  const circle = await store.getCircle(id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (await sweepIfOver(store, circle)) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const members = await store.listMembers(id);
  if (!members.some((m) => m.anon_id === input.anonId)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  /*
    Read what came back. `savePush` reports by returning rather than throwing,
    like `setCarve` and `addMember`, and check 87 sweeps every such method for
    a caller that drops the answer — which is the bug where two correct fixes
    faced each other across one line that ignored both.

    "Saved" here is a promise that a phone will ring. It is not one to make on
    a write nobody confirmed.
  */
  const saved = await store.savePush({
    circleId: id,
    anonId: input.anonId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
  });

  return NextResponse.json(
    saved ? { subscribed: true } : { subscribed: false },
    { status: saved ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

export const POST = withStore(handlePOST);
