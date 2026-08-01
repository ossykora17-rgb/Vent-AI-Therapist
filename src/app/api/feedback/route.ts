import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const schema = z.object({
  anonId: z.string().min(8).max(64),
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().max(2000).optional(),
});

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

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ persisted: false });

  // Five ratings an hour is plenty of feedback from one person.
  const { count } = await supabase
    .from("vent_feedback")
    .select("id", { count: "exact", head: true })
    .eq("anon_id", parsed.data.anonId)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());

  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: "rate_limited", message: "Thanks — we've got plenty from you for now." },
      { status: 429 },
    );
  }

  const { data: user } = await supabase
    .from("vent_users")
    .select("id")
    .eq("anon_id", parsed.data.anonId)
    .maybeSingle();

  const { error } = await supabase.from("vent_feedback").insert({
    user_id: user?.id ?? null,
    anon_id: parsed.data.anonId,
    rating: parsed.data.rating,
    message: parsed.data.message ?? null,
  });

  if (error) {
    console.error("[feedback] insert failed", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ persisted: true }, { headers: { "cache-control": "no-store" } });
}
