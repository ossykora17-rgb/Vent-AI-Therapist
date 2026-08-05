import { NextResponse } from "next/server";
import { z } from "zod";
import { noStore, requireUser } from "@/lib/http/session";
import { embed, isEmbeddingConfigured, toVectorLiteral } from "@/lib/vent/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/memories            — everything, newest first
 * GET /api/memories?q=...      — the five that actually relate to `q`
 *
 * The search path is the one a new chat uses: embed the opening line, ask for
 * the nearest few, and put those in front of the model instead of the last N
 * turns of an unrelated conversation.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 5, 1), 20);

  if (q) {
    const vector = await embed(q);
    // No embedding means no similarity — say so rather than silently handing
    // back the most recent rows dressed up as relevant ones.
    if (!vector) {
      return NextResponse.json(
        {
          memories: [],
          matched: false,
          reason: isEmbeddingConfigured() ? "embedding_failed" : "embeddings_not_configured",
        },
        { headers: noStore },
      );
    }

    const { data, error } = await auth.supabase.rpc("match_memories", {
      p_user_id: auth.user.id,
      p_embedding: toVectorLiteral(vector),
      p_limit: limit,
    });
    if (error) {
      return NextResponse.json({ error: "storage_unavailable", detail: error.message },
        { status: 503, headers: noStore });
    }
    return NextResponse.json({ memories: data ?? [], matched: true }, { headers: noStore });
  }

  const { data, error } = await auth.supabase
    .from("memories")
    .select("id, key, value, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: "storage_unavailable", detail: error.message },
      { status: 503, headers: noStore });
  }
  return NextResponse.json({ memories: data ?? [], matched: false }, { headers: noStore });
}

const upsertSchema = z.object({
  key: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400, headers: noStore });
  }
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422, headers: noStore });
  }

  const vector = await embed(`${parsed.data.key}: ${parsed.data.value}`);
  const { data, error } = await auth.supabase
    .from("memories")
    .upsert(
      {
        user_id: auth.user.id,
        key: parsed.data.key,
        value: parsed.data.value,
        embedding: vector ? toVectorLiteral(vector) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" },
    )
    .select("id, key, value, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "storage_unavailable", detail: error.message },
      { status: 503, headers: noStore });
  }
  // `embedded: false` is not a failure of the write — the memory is saved and
  // listable, it just will not be found by meaning until it is re-embedded.
  return NextResponse.json({ memory: data, embedded: Boolean(vector) },
    { status: 201, headers: noStore });
}

/** DELETE /api/memories?id=... — forgetting has to be as easy as remembering. */
export async function DELETE(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 422, headers: noStore });

  const { error } = await auth.supabase.from("memories").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "storage_unavailable", detail: error.message },
      { status: 503, headers: noStore });
  }
  return NextResponse.json({ deleted: 1 }, { headers: noStore });
}
