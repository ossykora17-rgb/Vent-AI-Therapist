import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { FULL_CONTRACT, explainDbCode } from "@/lib/store/contract";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A copy of everything worth keeping, for the one failure nothing else covers.
 *
 * Supabase Hobby keeps no automated backups. Every carve, every held note,
 * every vent is one incident away from gone — in a product whose first
 * sentence to a returning person is "I kept what you left here". Every other
 * promise in here can be repaired by shipping a fix. That one cannot.
 *
 * WHAT IS NOT IN IT, AND WHY THAT IS THE IMPORTANT PART
 *
 * `circle_messages` is excluded, deliberately and permanently. A circle's
 * transcript is destroyed when the circle closes, and that deletion is the
 * whole promise the room is built on — "confidentiality is a deletion policy
 * and a training set is its opposite". A nightly job that copies transcripts
 * somewhere durable would quietly turn a room that forgets into a room that
 * remembers forever, off-site, past the moment the people in it were told
 * their words were gone. A backup of something whose value is its deletion is
 * not a backup, it is a leak on a schedule.
 *
 * So this copies what a person would want restored and nothing they were
 * promised would be destroyed.
 *
 * WHY IT IS SHUT UNTIL A SECRET EXISTS
 *
 * Unauthenticated, this is a full database dump served to whoever guesses the
 * path — worse than having no backup at all, because it converts a missing
 * safety net into an open door. Absent token means 501: the route does not
 * exist yet. There is no configuration of this file that serves a row without
 * one.
 */

/** Rows per table. A cap that is reported when it bites — see `truncated`. */
const LIMIT = 5000;

/**
 * Tables whose contents may leave this database.
 *
 * Derived from the contract rather than listed, so a table added there is
 * backed up without anybody remembering to come here — with one subtraction
 * that must never become automatic. If a future table holds something the
 * product promises to destroy, it belongs on this list and not in the dump.
 */
const NEVER_EXPORT = new Set(["circle_messages"]);

/**
 * Compare without leaking length or position through timing.
 *
 * Overkill for a nightly cron and correct anyway: this is the only string in
 * the product that stands between a stranger and everybody's history.
 */
function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!env.backupToken) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Backups are off. Set VENT_BACKUP_TOKEN to turn this on; there is no unauthenticated mode.",
      },
      { status: 501, headers: { "cache-control": "no-store" } },
    );
  }

  const offered = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!tokenMatches(offered, env.backupToken)) {
    // Never says which part was wrong, and never echoes what was sent.
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "no_database", message: "Nothing to export — this deployment has no store." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const tables = Object.keys(FULL_CONTRACT).filter((t) => !NEVER_EXPORT.has(t));
  const data: Record<string, unknown[]> = {};
  const errors: Record<string, { code?: string; hint?: string }> = {};
  /** Tables that hit the cap, named — a silent truncation is a lost backup. */
  const truncated: string[] = [];

  for (const table of tables) {
    const res = await supabase.from(table).select("*").limit(LIMIT);
    if (res.error) {
      errors[table] = {
        code: res.error.code ?? undefined,
        hint: res.error.hint ?? explainDbCode(res.error.code) ?? undefined,
      };
      continue;
    }
    data[table] = res.data ?? [];
    if ((res.data?.length ?? 0) >= LIMIT) truncated.push(table);
  }

  /*
    `complete` is the field the caller acts on, and it is the whole reason
    this route reports rather than just returns. A backup that silently
    dropped a table is the shape of every other bug in this repo: an artifact
    that looks exactly like a good one until the day it is needed.
  */
  const complete = Object.keys(errors).length === 0 && truncated.length === 0;

  return NextResponse.json(
    {
      complete,
      takenAt: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      tables: Object.fromEntries(Object.entries(data).map(([t, rows]) => [t, rows.length])),
      excluded: [...NEVER_EXPORT],
      truncated,
      errors,
      data,
    },
    {
      status: complete ? 200 : 207,
      headers: { "cache-control": "no-store" },
    },
  );
}
