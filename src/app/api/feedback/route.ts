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

  /*
    A write that failed is a write that did not happen — and it must not take
    the rest of the turn down with it.

    This was a bare `await store.insertFeedback(...)`. `done()` throws, there
    is no boundary in this handler, and `export async function POST` has no
    wrapper — so any write error left the route as a 500, skipped the
    preference log two lines down, and gave the client no body to read. The
    client's honest branch, added under a comment about never thanking
    somebody for a rating that was dropped, had nothing to be honest with.

    Not hypothetical: production carries `vent_feedback_user_id_key UNIQUE
    (user_id)`, a constraint no migration in this repo declares. So a person's
    *second* rating raises 23505 — while the rate limiter eight lines up
    allows five an hour. The route's stated policy and the database's actual
    one disagree by a factor of five an hour against one for ever, and the
    disagreement surfaced as a server error.

    The two writes are also decoupled, because they are different promises.
    The table is the product's record; the log is training data with no such
    constraint, and losing it because a row was rejected is losing the one
    place this product learns what is failing.
  */
  let persisted = false;
  try {
    await store.insertFeedback({
      userId: await store.findUserId(anonId),
      anonId,
      rating,
      message: message ?? null,
    });
    persisted = true;
  } catch (error) {
    // Code and kind only. A rating's message is what somebody typed.
    console.warn("[feedback] rating not kept:", (error as { code?: string })?.code ?? "unknown");
  }

  // The same rating, into the preference log. The table is the product's
  // record; the log is training data, and the pipeline pairs it back to the
  // reply that was on screen when they pressed the number.
  try {
    await logPreference({ kind: "vent_rating", anon_id: anonId, rating, note: message ?? null });
  } catch {
    // The log is best-effort by construction. A rating that reached the table
    // and not the log is still a rating.
  }

  return NextResponse.json(
    { persisted, storage: store.kind },
    { headers: { "cache-control": "no-store" } },
  );
}
