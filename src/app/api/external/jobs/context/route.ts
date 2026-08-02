import { NextResponse } from "next/server";
import { jobsContext } from "@/lib/external/sources";

export const dynamic = "force-dynamic";

/**
 * Three real remote jobs, cached a day. What `rw_ai_job` asks for is three
 * things a machine cannot do; this is three people currently paying for them.
 */
export async function GET() {
  const hit = await jobsContext();

  if (!hit) {
    return NextResponse.json(
      { available: false, jobs: [], reason: "upstream unreachable and nothing fresh cached" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { available: true, jobs: hit.value, source: hit.source, fetchedAt: hit.fetched_at },
    { headers: { "cache-control": "no-store" } },
  );
}
