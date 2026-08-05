import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { checkMessage } from "@/lib/circles/rules";

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
      { error: "storage_unavailable", detail: (error as Error).message },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const findings: Finding[] = [];

  // 1. Advice that reached somebody. checkMessage is the rule the circles use,
  //    imported rather than reimplemented, so this cannot drift from what the
  //    product enforces.
  const advice = vents.filter(
    // "share" is the kind a person's own words are checked as.
    (v) => v.ai_reply && checkMessage(v.ai_reply, "share").ok === false,
  ).length;
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
  const withDrop = vents.filter(
    (v) => v.tension_before !== null && v.tension_after !== null,
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
      storage: store.kind,
      timestamp: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
