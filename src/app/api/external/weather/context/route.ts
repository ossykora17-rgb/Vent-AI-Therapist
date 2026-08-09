import { NextResponse } from "next/server";
import { weatherContext } from "@/lib/external/sources";

export const dynamic = "force-dynamic";

/**
 * Lagos, right now — or nothing. Cached an hour.
 *
 * `available: false` is a first-class answer. A room that cannot reach a
 * weather API says nothing about the weather; it does not guess, and it does
 * not 500.
 */
export async function GET() {
  const hit = await weatherContext();

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
