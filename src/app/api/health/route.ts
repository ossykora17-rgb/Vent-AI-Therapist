import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isAnthropicConfigured,
  isPaystackConfigured,
  isSupabaseConfigured,
} from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Deployment smoke test. Reports which integrations are wired and whether the
 * database actually answers — not just whether the keys are present.
 */
export async function GET() {
  let database: "ok" | "unreachable" | "not_configured" = "not_configured";

  if (isSupabaseConfigured) {
    try {
      const supabase = createClient();
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

  const services = {
    supabase: isSupabaseConfigured,
    anthropic: isAnthropicConfigured,
    paystack: isPaystackConfigured,
  };

  return NextResponse.json(
    {
      status: database === "unreachable" ? "degraded" : "ok",
      database,
      services,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      timestamp: new Date().toISOString(),
    },
    {
      status: database === "unreachable" ? 503 : 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
