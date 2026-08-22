import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { containsAdvice } from "@/lib/circles/rules";
import { supabaseUrlPath } from "@/lib/env";
import { efficacyNote, measureEfficacy, PRE_FIX_DEFAULT } from "@/lib/vent/efficacy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The loop, run where production actually lives.
 *
 * `npm run heartbeat` reads `.data`, which is a local JSON file. In production
 * the store is Supabase, so the loop that was supposed to watch real usage has
 * been watching an empty directory in CI — the daily schedule fires, finds
 * nothing, and reports green. A loop that cannot see users is a loop in name.
 *
 * This runs the same questions against the real store, from inside the
 * deployment that has the credentials.
 *
 * **Counts only. Never content.** Nothing a person wrote is read back out of
 * here, quoted, or returned — the same rule the data pipeline follows for
 * circles. That is what makes it safe to leave open: there is nothing in the
 * response that a stranger could not have guessed, and requiring a secret
 * would have meant one more variable somebody has to set before the loop
 * works at all, which is exactly how a loop stops running.
 */

interface Finding {
  kind: string;
  count: number;
  why: string;
  skill: string;
}

export async function GET() {
  const store = getStore();
  if (!store) {
    return NextResponse.json(
      { findings: [], vents: 0, storage: "none", note: "no store — nothing to watch" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  let vents;
  try {
    // A wide window rather than everything: the loop asks "what is happening
    // lately", and scanning all history to answer that gets slower every day.
    vents = await store.recentVentsAcross(500);
  } catch (error) {
    return NextResponse.json(
      {
        error: "storage_unavailable",
        detail: (error as Error).message,
        // The path and nothing else. A PostgREST path error names a path and
        // the eye reads it as a table, so the shape that would cause one is
        // reported next to it. "/" is correct for every hosted project.
        restPath: supabaseUrlPath,
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const findings: Finding[] = [];

  // 1. Advice that reached somebody.
  //    imported rather than reimplemented, so this cannot drift from what the
  //    product enforces.
  /*
    `containsAdvice`, not `checkMessage`.

    This measured VENT's replies with circle governance, which bundles three
    rules and only one of them is about advice. The other two are wrong about
    a reply by construction:

      CROSSTALK forbids addressing a person instead of the room — and a vent
      reply addresses one person, because there is nobody else in it.
      "That one no be your fault" trips `\b(you|your) (problem|fault|issue)\b`
      and is one of the most useful sentences available to somebody carrying
      something they did not begin.

      SHARE_MAX_CHARS caps a member's share at 900 and has nothing to say
      about a reply.

    `containsAdvice` exists in that file precisely because this distinction
    had already been learned once — its own comment records the quality
    graders flagging that exact line in an authored reply — and this endpoint
    went on measuring with the bundled version anyway.

    Production reported `advice_in_reply: 2`. On this rule some or all of that
    is a reply correctly telling somebody a thing was not their fault, counted
    as the product breaking its own core rule. A false finding is worse than a
    missed one here: it is a metric that would have had somebody rewriting a
    prompt to stop producing good sentences.

    "Anything the eval suite asserts must be imported from the module the
    product actually uses" — the same rule, applied to the thing that watches
    the product rather than to the suite.
  */
  const advice = vents.filter((v) => v.ai_reply && containsAdvice(v.ai_reply)).length;
  if (advice > 0) {
    findings.push({
      kind: "advice_in_reply",
      count: advice,
      why: "a reply told somebody what to do — the prompt let it through",
      skill: "data-quality",
    });
  }

  // 2. A vent answered with no tactic means the selector was bypassed.
  const untactful = vents.filter((v) => v.intent_type === "vent" && !v.tactic_used).length;
  if (untactful > 0) {
    findings.push({
      kind: "no_tactic",
      count: untactful,
      why: "a vent was answered without a selected move",
      skill: "data-quality",
    });
  }

  // 3. Replies that never landed. The failure vocabulary is on the response,
  //    but nothing was counting how often people actually hit one.
  const failed = vents.filter(
    (v) => v.ai_reply && /out of credit|set up wrong|Network dipped|took too long/.test(v.ai_reply),
  ).length;
  if (failed > 0) {
    findings.push({
      kind: "model_failures_reached_people",
      count: failed,
      why: "somebody was told the model could not answer",
      skill: "data-quality",
    });
  }

  // 4. The tension drop is the only outcome this product claims. A drop that
  //    is not happening is the finding that matters more than any of the above.
  /*
    The same exclusion the selector makes, or this cannot see its own fix.

    `tension_before` was the pressure slider's untouched default of fifty for
    every returning visitor, which is what produced a reported mean drop of
    −28.3 — fabricated arrivals sitting under honest departures. The client
    sends null now and the selector drops the old rows, but this endpoint is
    the surface used to *check* whether that worked. Left as it was, it would
    have gone on reporting −28.3 out of the same poisoned rows and the fix
    would have looked like it did nothing.

    `PRE_FIX_DEFAULT` is imported rather than written as 50 here, for the
    reason this file already learned about `checkMessage` ten lines up: a
    second copy of a rule is a rule that drifts. Three consumers now — the
    selector, the preference pipeline and this — one definition.
  */
  const withDrop = vents.filter(
    (v) =>
      v.tension_before !== null &&
      v.tension_after !== null &&
      v.tension_before !== PRE_FIX_DEFAULT,
  );
  const meanDrop = withDrop.length
    ? withDrop.reduce((a, v) => a + (v.tension_before! - v.tension_after!), 0) / withDrop.length
    : null;
  if (meanDrop !== null && withDrop.length >= 10 && meanDrop < 10) {
    findings.push({
      kind: "drop_is_flat",
      count: withDrop.length,
      why: `mean drop is ${meanDrop.toFixed(1)} points over ${withDrop.length} anchored vents`,
      skill: "data-quality",
    });
  }

  return NextResponse.json(
    {
      vents: vents.length,
      anchored: withDrop.length,
      meanDrop: meanDrop === null ? null : Number(meanDrop.toFixed(1)),
      findings,
      // What the selector has learned from this same window, as a sentence.
      // Names tactic ids and counts — never anything anybody wrote.
      learned: efficacyNote(measureEfficacy(vents)),
      storage: store.kind,
      timestamp: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
