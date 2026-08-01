import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { logPreference } from "@/lib/rlhf/log";

export const dynamic = "force-dynamic";

const FEEDBACK_PER_HOUR = 5;

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
  const { anonId, rating, message } = parsed.data;

  const store = getStore();
  if (!store) return NextResponse.json({ persisted: false, storage: "none" });

  // Five ratings an hour is plenty of feedback from one person.
  const recent = await store.countFeedbackSince(anonId, new Date(Date.now() - 3_600_000));
  if (recent >= FEEDBACK_PER_HOUR) {
    return NextResponse.json(
      { error: "rate_limited", message: "Thanks — we've got plenty from you for now." },
      { status: 429 },
    );
  }

  await store.insertFeedback({
    userId: await store.findUserId(anonId),
    anonId,
    rating,
    message: message ?? null,
  });

  // The same rating, into the preference log. The table is the product's
  // record; the log is training data, and the pipeline pairs it back to the
  // reply that was on screen when they pressed the number.
  await logPreference({ kind: "vent_rating", anon_id: anonId, rating, note: message ?? null });

  return NextResponse.json(
    { persisted: true, storage: store.kind },
    { headers: { "cache-control": "no-store" } },
  );
}
