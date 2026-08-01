import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreToxicity } from "@/lib/external/sources";
import { guardianVerdict } from "@/lib/external/guardian";
import { isPerspectiveConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

const schema = z.object({ text: z.string().trim().min(1).max(3000) });

/**
 * The Guardian, on its own. The circle calls the same pair of functions
 * inline; this route exists so the decision can be inspected — by the eval
 * suite, by a Keeper wondering why a line was refused, and by whoever tunes
 * the thresholds next.
 *
 * The text goes out; nothing identifying it does. No `anon_id`, no circle id.
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

  const scores = await scoreToxicity(parsed.data.text);
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
