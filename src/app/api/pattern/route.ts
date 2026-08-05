import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { findPattern, patternSentence, PATTERN_FLOOR } from "@/lib/vent/pattern";
import { withStore } from "@/lib/http/with-store";

export const dynamic = "force-dynamic";

/**
 * What keeps bringing them back, counted from their own rows.
 *
 * Anonymous like the rest of the vent surface — scoped by anonId, never
 * across people. Zero tokens: this is arithmetic, not a model call, which is
 * why it can run on every visit to History without costing anything.
 */
async function handleGET(request: Request) {
  const anonId = new URL(request.url).searchParams.get("anonId");
  if (!anonId) {
    return NextResponse.json({ error: "anonId required" }, { status: 422 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ pattern: null, floor: PATTERN_FLOOR });

  const userId = await store.findUserId(anonId);
  if (!userId) return NextResponse.json({ pattern: null, floor: PATTERN_FLOOR });

  const vents = await store.listVents(userId, 200);
  const pattern = findPattern(vents);

  return NextResponse.json(
    {
      pattern,
      sentence: pattern ? patternSentence(pattern) : null,
      floor: PATTERN_FLOOR,
      counted: vents.length,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

// A store that stops answering is a 503 here, not a 404 and not a 500.
export const GET = withStore(handleGET);
