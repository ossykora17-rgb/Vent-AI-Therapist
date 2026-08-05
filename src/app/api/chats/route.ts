import { NextResponse } from "next/server";
import { z } from "zod";
import { noStore, requireUser } from "@/lib/http/session";

export const dynamic = "force-dynamic";

/** A chat is a `sessions` row. The table predates the word and keeps its name. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("sessions")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "storage_unavailable", detail: error.message },
      { status: 503, headers: noStore });
  }
  return NextResponse.json({ chats: data ?? [] }, { headers: noStore });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = {};
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422, headers: noStore });
  }

  // user_id is written explicitly because the insert policy checks it against
  // auth.uid(); a row claiming somebody else is rejected by Postgres, not here.
  const { data, error } = await auth.supabase
    .from("sessions")
    .insert({ user_id: auth.user.id, title: parsed.data.title ?? "Untitled session" })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "storage_unavailable", detail: error.message },
      { status: 503, headers: noStore });
  }
  return NextResponse.json({ chat: data }, { status: 201, headers: noStore });
}
