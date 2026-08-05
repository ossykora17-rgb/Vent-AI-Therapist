import { NextResponse } from "next/server";
import { z } from "zod";
import { noStore, requireUser } from "@/lib/http/session";
import { embed, toVectorLiteral } from "@/lib/vent/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { data, error } = await auth.supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "storage_unavailable", detail: error.message },
      { status: 503, headers: noStore });
  }
  // RLS returns an empty set for somebody else's chat, which is the same shape
  // as a chat with no messages. Say 404 rather than imply an empty room exists.
  return NextResponse.json({ messages: data ?? [] }, { headers: noStore });
}

const postSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(20000),
  /** Optional durable fact to remember from this message. */
  remember: z
    .object({ key: z.string().trim().min(1).max(200), value: z.string().trim().min(1).max(4000) })
    .optional(),
});

export async function POST(request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400, headers: noStore });
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422, headers: noStore });
  }

  const { data: message, error } = await auth.supabase
    .from("messages")
    .insert({
      session_id: id,
      user_id: auth.user.id,
      role: parsed.data.role,
      content: parsed.data.content,
    })
    .select("id, role, content, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "storage_unavailable", detail: error.message },
      { status: 503, headers: noStore });
  }

  // Memory is written only when the caller names something worth keeping.
  // Embedding every message would spend a call per turn and fill the table
  // with sentences nobody will ever want retrieved — recency already covers
  // the current conversation. This is for the handful of facts that outlive it.
  let remembered = false;
  if (parsed.data.remember) {
    const vector = await embed(`${parsed.data.remember.key}: ${parsed.data.remember.value}`);
    const { error: memErr } = await auth.supabase.from("memories").upsert(
      {
        user_id: auth.user.id,
        key: parsed.data.remember.key,
        value: parsed.data.remember.value,
        embedding: vector ? toVectorLiteral(vector) : null,
        source_message_id: message.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" },
    );
    // A memory that failed to save must not lose the message that is already
    // written. Report what happened rather than throwing the turn away.
    remembered = !memErr;
    if (memErr) console.error("[memories] upsert failed", memErr.message);
  }

  // Touch the chat so the list orders by real activity.
  await auth.supabase.from("sessions").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ message, remembered }, { status: 201, headers: noStore });
}
