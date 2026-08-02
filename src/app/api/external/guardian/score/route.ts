import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { scoreToxicity } from "@/lib/external/sources";
import { guardianVerdict } from "@/lib/external/guardian";
import { isPerspectiveConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().trim().min(1).max(3000),
  /** Who is asking, and about which room. Both are checked. */
  anonId: z.string().min(8).max(64),
  circleId: z.string().min(8).max(64),
});

/**
 * The Guardian, on its own. The circle calls the same pair of functions
 * inline; this route exists so the decision can be inspected — by a Keeper
 * wondering why a line was refused, and by whoever tunes the thresholds next.
 *
 * **Members of a live circle only.** It was open to anybody, which made it a
 * free relay into a 1,000-request-a-day quota that the Guardian depends on:
 * one script could spend the whole day's budget before lunch and every circle
 * after that would fall back to keyword rules with nobody the wiser. An
 * inspection endpoint is not worth that, and membership is the same bar the
 * room itself uses.
 *
 * The text still goes out to Google with nothing attached — the `anonId` and
 * `circleId` are used here, to decide whether to ask at all, and are never
 * forwarded.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  const { text, anonId, circleId } = parsed.data;

  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const circle = await store.getCircle(circleId);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (circle.status === "closed" || new Date(circle.ends_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const members = await store.listMembers(circleId);
  if (!members.some((m) => m.anon_id === anonId)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const scores = await scoreToxicity(text);
  const verdict = guardianVerdict(scores);

  return NextResponse.json(
    {
      scores,
      ...verdict,
      // Say which it is. "block: false" from a classifier that answered and
      // one that never ran mean very different things to whoever reads this.
      configured: isPerspectiveConfigured,
      scored: scores !== null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
