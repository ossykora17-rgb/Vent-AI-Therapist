import { NextResponse } from "next/server";
import { economyContext } from "@/lib/external/sources";

export const dynamic = "force-dynamic";

/**
 * The real rate, or nothing. Cached an hour.
 *
 * `available: false` is a first-class answer, not an error — the caller's job
 * is to leave the sentence out, and a 500 here would turn "we don't know the
 * rate" into "the circle is broken".
 */
export async function GET() {
  const hit = await economyContext();

  if (!hit) {
    return NextResponse.json(
      { available: false, reason: "upstream unreachable and nothing fresh cached" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { available: true, ...hit.value, source: hit.source, fetchedAt: hit.fetched_at },
    { headers: { "cache-control": "no-store" } },
  );
}
