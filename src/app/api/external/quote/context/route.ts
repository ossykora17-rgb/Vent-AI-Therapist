import { NextResponse } from "next/server";
import { stoicQuote } from "@/lib/external/sources";

export const dynamic = "force-dynamic";

/**
 * One Stoic line, cached a day, and the route says out loud where it may be
 * used. A quote in the middle of a vent is the wellness reflex this product
 * exists to avoid; at the door, next to "one thing you can control", it earns
 * its place.
 */
export async function GET() {
  const hit = await stoicQuote();

  if (!hit) {
    return NextResponse.json(
      { available: false, reason: "upstream unreachable and nothing fresh cached" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { available: true, ...hit.value, phase: "close", source: hit.source, fetchedAt: hit.fetched_at },
    { headers: { "cache-control": "no-store" } },
  );
}
