import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { isModelConfigured } from "@/lib/env";
import { withStore } from "@/lib/http/with-store";
import { generateReply } from "@/lib/vent/providers";
import {
  CARVE_FLOOR,
  CARVE_MAX_WORDS,
  CARVER_SYSTEM,
  carvePrompt,
  parseCarve,
  worthCarving,
} from "@/lib/vent/carve";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * THE CARVER — eight words for the wound, written once at the end of a
 * session and read at the start of the next one.
 *
 * ## Why this endpoint exists at all
 *
 * "No conversation memory" is the single most common complaint against every
 * product in this category, and the ones that do have memory sell it back as
 * a subscription and then lose it in a migration. Memory here is one line,
 * carved rather than summarised, and it is the difference between coming back
 * on Thursday to a stranger and coming back to a room that already knows what
 * this is about.
 *
 * ## Why it is its own route
 *
 * Not on the PATCH that anchors the mood. That request is a person tapping a
 * number and watching for the drop, and hanging a model call off it would put
 * five seconds between the tap and the answer. This is fired and forgotten by
 * the client at the same moment; the anchor stays instant, and a carve that
 * never happens is invisible, which is exactly what it should be.
 *
 * ## The bounds, which are the whole design
 *
 * - **Once per session close**, never per message. `MAX_COMPLETIONS_PER_MESSAGE`
 *   stays 1 and stays true: nothing here runs on a message.
 * - **Above `CARVE_FLOOR` exchanges.** Two lines and a greeting is not a wound,
 *   and carving it produces a confident sentence about nothing.
 * - **Never after a crisis turn.** Nothing is spent deciding how to phrase
 *   somebody's worst hour, and no line about it is kept.
 * - **Fails to null, everywhere.** No store, no key, no rows, a refusal, a
 *   provider outage, a carve over the word limit — all of them mean no carve.
 *   A missing carve costs nothing. A wrong one is a sentence about somebody's
 *   life that they did not say and cannot correct.
 *
 * It reads the session's messages from the store rather than taking them off
 * the wire, so nothing anybody typed is posted back to the server a second
 * time to be re-processed.
 *
 * The response says what happened and never more than happened — `carved`
 * comes from the write's own return value, not from the fact that a model
 * answered.
 */

const bodySchema = z.object({ anonId: z.string().min(8).max(64) });

/** Enough of the session to see the shape, bounded so a long day costs the same. */
const LOOKBACK = 8;

async function handlePOST(req: Request) {
  /*
    Validate before answering anything about how this deployment is set up.

    This checked `isModelConfigured` first, and a malformed body came back
    200 `{carved:false, reason:"no_key"}` — while the identical request to a
    deployment *with* a key returned 422. The status code depended on the
    environment rather than on the request, which is the failure this repo
    has now shipped twice: an eval expecting 410 that got 501 because the
    voice routes answered before they touched the store.
    A bad request is bad in every shape.
  */
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ carved: false, reason: "no_store" });
  if (!isModelConfigured) return NextResponse.json({ carved: false, reason: "no_key" });

  const userId = await store.findUserId(parsed.data.anonId);
  if (!userId) return NextResponse.json({ carved: false, reason: "no_user" });

  const rows = await store.recentVents(userId, LOOKBACK);

  // A crisis anywhere in the window stops this outright. The rule is not
  // "skip the crisis message" — it is that a session containing one is not
  // material to be compressed into a keepsake.
  const crisis = rows.some((r) => r.intent_type === "crisis" || r.safety_flagged);
  if (!worthCarving(rows.length, crisis)) {
    return NextResponse.json({ carved: false, reason: crisis ? "crisis" : "too_thin" });
  }

  // Oldest first, so the carve reads the session in the order it happened.
  const messages = [...rows].reverse().map((r) => r.user_message);
  const earlier = await store.getCarve(userId);

  let carve: string | null = null;
  try {
    const answered = await generateReply({
      system: CARVER_SYSTEM,
      // Eight words out. The ceiling is small because the job is small, and a
      // model given room to explain itself will write a case note instead.
      maxTokens: 120,
      messages: [{ role: "user", content: carvePrompt(messages, earlier) }],
    });
    carve = parseCarve(answered.text)?.carve ?? null;
  } catch (error) {
    // A provider outage at the end of a session is not something the person
    // needs to hear about. They already got their reply and their drop.
    console.warn("[carve] model call failed", error);
    return NextResponse.json({ carved: false, reason: "model_unavailable" });
  }

  if (!carve) return NextResponse.json({ carved: false, reason: "nothing_to_carve" });

  // The claim comes from the write, not from the model having answered.
  const kept = await store.setCarve(userId, carve);
  return NextResponse.json({
    carved: kept,
    // Their own line back to them, only when it was actually kept. The
    // Memory page reads what is stored; this is for the session that made it.
    carve: kept ? carve : null,
    words: CARVE_MAX_WORDS,
    floor: CARVE_FLOOR,
  });
}

/**
 * What the room kept, for the room to be able to say it kept something.
 *
 * The carve has existed for a while and only the model ever saw it. So
 * somebody who sat here on Tuesday about their father opened the app on
 * Thursday to "Come in. Say small. Hear plenty." — the identical blank room a
 * stranger gets. The product remembered them and the screen did not, and the
 * screen is the part a person experiences.
 *
 * Returned rather than rendered server-side because the chat is a client
 * component with the anon id in localStorage; there is no session on the
 * server to render it from.
 *
 * `carve: null` is the ordinary answer and the safe one. No store, no user,
 * no carve, a store that is down — all of them are null, and null means the
 * screen says nothing about remembering. A room that claims to remember and
 * cannot produce the thing is worse than one that never claimed it.
 */
async function handleGET(req: Request) {
  const anonId = new URL(req.url).searchParams.get("anonId");
  if (!anonId || anonId.length < 8) {
    return NextResponse.json({ error: "Invalid anonId" }, { status: 422 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ carve: null, storage: "none" });

  const userId = await store.findUserId(anonId);
  if (!userId) return NextResponse.json({ carve: null, storage: store.kind });

  return NextResponse.json(
    { carve: await store.getCarve(userId), storage: store.kind },
    { headers: { "cache-control": "no-store" } },
  );
}

export const GET = withStore(handleGET);
export const POST = withStore(handlePOST);
