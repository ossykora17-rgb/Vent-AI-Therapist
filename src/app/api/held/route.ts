import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { withStore } from "@/lib/http/with-store";
import { classify } from "@/lib/vent/intent";

export const dynamic = "force-dynamic";

/**
 * What held — written by the person, never by a model.
 *
 * Zero tokens by construction. The only classifier here is the crisis router,
 * which is local regex and free, and it is here for one reason: the prompt
 * asks a gentle question, and people answer gentle questions with whatever is
 * actually on them.
 */
const schema = z.object({
  anonId: z.string().min(8).max(64),
  text: z.string().min(1).max(200),
});

async function handlePOST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }
  const { anonId, text } = parsed.data;

  /*
    "What held this week?" can be answered "nothing, I want to die."

    Filing that away as a gratitude note — silently, with a checkmark — would
    be the single worst thing this product could do with a sentence. The
    crisis router runs on the server, where the message is written, for the
    same reason `checkMessage` does: a curl walks around any client check.
  */
  const verdict = classify(text);
  if (verdict.intent === "crisis") {
    return NextResponse.json({ saved: false, crisis: true }, { status: 200 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ saved: false }, { status: 200 });

  const userId = await store.findUserId(anonId);
  if (!userId) return NextResponse.json({ saved: false }, { status: 200 });

  // The outcome, never the intention. Nothing upstream may say "kept" on the
  // strength of having asked.
  const saved = await store.addHeld(userId, text);
  return NextResponse.json({ saved }, { status: 200 });
}

async function handleGET(request: Request) {
  const anonId = new URL(request.url).searchParams.get("anonId");
  if (!anonId) {
    return NextResponse.json({ error: "anonId required" }, { status: 422 });
  }
  const store = getStore();
  if (!store) return NextResponse.json({ held: [] });
  const userId = await store.findUserId(anonId);
  if (!userId) return NextResponse.json({ held: [] });
  return NextResponse.json(
    { held: await store.getHeld(userId) },
    { headers: { "cache-control": "no-store" } },
  );
}

export const GET = withStore(handleGET);
export const POST = withStore(handlePOST);
