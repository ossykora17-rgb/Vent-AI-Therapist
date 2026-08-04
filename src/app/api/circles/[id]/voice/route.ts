import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { mintVoiceToken } from "@/lib/voice/livekit";
import { isLivekitConfigured } from "@/lib/env";
import { sweepIfOver } from "@/lib/circles/sweep";
import { withStore } from "@/lib/http/with-store";

export const dynamic = "force-dynamic";

/**
 * Next 15 made route params a promise — the request store is resolved rather
 * than ambient — so every handler awaits its own id before using it.
 */
type Params = { params: Promise<{ id: string }> };

const schema = z.object({ anonId: z.string().min(8).max(64) });

/**
 * Phase 1 voice, server half. Mints a seat-scoped LiveKit token for a member
 * of a live circle — and nothing else, because the browser half needs
 * `livekit-client` and that is a dependency decision, not a detail.
 *
 * 501 rather than 500 when the keys are absent: not broken, not built yet.
 */
async function handlePOST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!isLivekitConfigured) {
    return NextResponse.json(
      {
        error: "voice_not_configured",
        message: "Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to open the room's voice.",
      },
      { status: 501 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const circle = await store.getCircle(id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (await sweepIfOver(store, circle)) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  // Members only, and the seat number is derived here rather than sent — a
  // client that could name its own seat could name somebody else's.
  const members = await store.listMembers(id);
  const index = members.findIndex((m) => m.anon_id === parsed.data.anonId);
  if (index < 0) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  /**
   * The token expires with the circle, not fifty minutes from whenever it was
   * asked for. It used to be the latter, which meant a seat taken at minute
   * forty-four held a credential good until minute ninety-four — long after
   * the transcript was deleted and every other surface answered 404.
   *
   * That mattered more than an unused credential usually does: deleting a
   * LiveKit room is not revoking a token, and LiveKit recreates a room on
   * join, so two people with live tokens could reconvene the voice of a
   * circle the product had told everyone was over — no Keeper, no phases, no
   * Guardian, and a third person who left believing it had ended.
   *
   * One minute of grace, so a token minted in the last second of a session is
   * still usable for the walk out rather than being born expired.
   */
  const msLeft = new Date(circle.ends_at).getTime() - Date.now();
  const token = mintVoiceToken({
    circleId: id,
    seat: index + 1,
    keeper: members[index].role === "keeper",
    ttlSeconds: Math.max(60, Math.ceil(msLeft / 1000) + 60),
  });

  return NextResponse.json(token, { headers: { "cache-control": "no-store" } });
}

// A store that stops answering is a 503 here, not a 404 and not a 500.
export const POST = withStore(handlePOST);
