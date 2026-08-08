import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { whatIsCarried } from "@/lib/community/carrying";

export const dynamic = "force-dynamic";

/**
 * What the house is carrying, for the lobby.
 *
 * **Counts only. Never content.** Nothing anybody wrote is read back out of
 * here, quoted, or returned — the same rule `/api/heartbeat` follows, and the
 * reason both can be left open without a secret. There is nothing in this
 * response a stranger could not have guessed.
 *
 * Cached for five minutes. It is a public endpoint that scans a window of
 * rows, and a number describing a week does not change meaningfully inside
 * one — refusing to re-scan on every lobby poll is the whole difference
 * between this being free and this being a cost per visitor.
 *
 * Degrades to `null` on absolutely everything: no store, a store that throws,
 * too few rows. The lobby then says nothing at all rather than "0 people",
 * which is the one sentence a lonely screen must never print.
 */

interface Cached {
  body: unknown;
  at: number;
}

const TTL_MS = 5 * 60_000;
let cache: Cached | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.body, {
      headers: { "cache-control": "no-store" },
    });
  }

  let carrying = null;
  const store = getStore();
  if (store) {
    try {
      // A window, not everything. The question is "what is happening lately",
      // and scanning all history to answer it gets slower every day.
      // The limit is passed in, not just applied — otherwise `total` silently
      // becomes the limit and the page states it as a fact.
      const WINDOW = 500;
      carrying = whatIsCarried(await store.recentVentsAcross(WINDOW), Date.now(), WINDOW);
    } catch {
      // A database that is down is not a community that is empty. Both say
      // nothing here, and neither says zero.
      carrying = null;
    }
  }

  const body = { carrying };
  cache = { body, at: Date.now() };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
