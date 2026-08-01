import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStore } from "@/lib/store";
import {
  isAnthropicConfigured,
  isLivekitConfigured,
  isPaystackConfigured,
  isPerspectiveConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import { inventory } from "@/lib/external/cache";

export const dynamic = "force-dynamic";

/**
 * Deployment smoke test. Reports which integrations are wired and whether the
 * database actually answers — not just whether the keys are present.
 */
export async function GET() {
  let database: "ok" | "unreachable" | "not_configured" = "not_configured";

  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      // head+count touches the table without transferring rows. RLS means an
      // anonymous caller legitimately gets 0 — we only care that it responds.
      const { error } = await supabase!
        .from("profiles")
        .select("id", { count: "exact", head: true });
      database = error ? "unreachable" : "ok";
    } catch {
      database = "unreachable";
    }
  }

  const store = getStore();

  const services = {
    supabase: isSupabaseConfigured,
    anthropic: isAnthropicConfigured,
    paystack: isPaystackConfigured,
    perspective: isPerspectiveConfigured,
    livekit: isLivekitConfigured,
  };

  return NextResponse.json(
    {
      status: database === "unreachable" ? "degraded" : "ok",
      database,
      storage: store?.kind ?? "none",
      persisting: Boolean(store),
      services,
      // What the outside world last told us, and how long ago. Nothing is
      // served past its TTL, so an old entry here means "we asked and the
      // answer has expired", never "this is what we are showing people".
      external: inventory().map((e) => ({
        key: e.key,
        source: e.source,
        ageSeconds: Math.round(e.ageMs / 1000),
      })),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      timestamp: new Date().toISOString(),
    },
    {
      status: database === "unreachable" ? 503 : 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
