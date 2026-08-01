import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const schema = z.object({
  anonId: z.string().min(8).max(64),
  chairPicked: z.enum(["tight_edge", "sunk", "half_off"]).nullish(),
  objectPicked: z
    .enum(["heavy_stone", "tight_knot", "buzzing_wire", "empty_bowl", "spinning_top", "cold_block"])
    .nullish(),
  onboardingDone: z.boolean().optional(),
});

/** Saves what the onboarding learned. Degrades silently without Supabase. */
export async function POST(request: Request) {
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
  const { anonId, chairPicked, objectPicked, onboardingDone } = parsed.data;

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ persisted: false });

  const { error } = await supabase.from("vent_users").upsert(
    {
      anon_id: anonId,
      ...(chairPicked ? { chair_picked: chairPicked } : {}),
      ...(objectPicked ? { object_picked: objectPicked } : {}),
      ...(onboardingDone !== undefined ? { onboarding_done: onboardingDone } : {}),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "anon_id" },
  );

  if (error) {
    console.error("[profile] upsert failed", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ persisted: true }, { headers: { "cache-control": "no-store" } });
}
