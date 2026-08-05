import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStore } from "@/lib/store";
import {
  isAnthropicConfigured,
  isLivekitConfigured,
  isPaystackConfigured,
  isPerspectiveConfigured,
  isSupabaseConfigured,
  isSupabaseUrlValid,
} from "@/lib/env";
import { cached, inventory } from "@/lib/external/cache";
import { classifyModelError } from "@/lib/vent/model";
import { allProviders, configuredProviders, probeChain, skipped } from "@/lib/vent/providers";

export const dynamic = "force-dynamic";

/**
 * Deployment smoke test. Reports which integrations are wired and whether the
 * database actually answers — not just whether the keys are present.
 */
export async function GET() {
  let database: "ok" | "unreachable" | "misconfigured" | "not_configured" =
    "not_configured";
  // Which tables answered and which did not — a migration that was never run
  // looks exactly like a wrong key unless the check says which.
  let missingTables: string[] = [];

  // Distinct from "unreachable" on purpose. A URL that does not parse is a
  // typo you fix in the dashboard in ten seconds; an unreachable database is
  // an outage or a wrong key. Collapsing them sends you looking in the wrong
  // place, and this endpoint exists to stop exactly that.
  if (isSupabaseConfigured && !isSupabaseUrlValid) {
    database = "misconfigured";
  } else if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      // head+count touches the table without transferring rows. RLS means an
      // anonymous caller legitimately gets 0 — we only care that it responds.
      // Both tables, because they come from different migrations and one
      // being applied never implied the other. This reported ok on profiles
      // alone while vents did not exist, so the store looked healthy and
      // every write was being swallowed. The product does not use profiles
      // for a vent; it uses vents.
      const [a, b] = await Promise.all([
        supabase!.from("profiles").select("id", { count: "exact", head: true }),
        supabase!.from("vents").select("id", { count: "exact", head: true }),
      ]);
      database = a.error || b.error ? "unreachable" : "ok";
      missingTables = [a.error && "profiles", b.error && "vents"].filter(Boolean) as string[];
    } catch {
      database = "unreachable";
    }
  }

  const store = getStore();

  // Present is not the same as working, and the first link is not the chain.
  // This probed only the first provider, so with Anthropic out of credit it
  // read "degraded" while the chatbot answered fine on Gemini. A vent walks
  // the chain; the check walks the chain. Cached a minute, because the probe
  // makes real calls and a public endpoint must not spend an account down.
  const probe =
    (await cached("model-probe", 60_000, "chain", probeChain))?.value ??
    (await probeChain());
  const model: { status: string; detail: string | null } = probe.answered
    ? { status: "ok", detail: null }
    : { ...classifyModelError(probe.lastError) };

  // The whole chain, so a build running on a free key can see that it is, and
  // a fallback that was never configured cannot be mistaken for one that is.
  const chain = allProviders().map((p) => ({
    provider: p.id,
    model: p.model,
    configured: p.configured,
  }));

  const services = {
    supabase: isSupabaseConfigured,
    anthropic: isAnthropicConfigured,
    providers: configuredProviders().length,
    paystack: isPaystackConfigured,
    perspective: isPerspectiveConfigured,
    livekit: isLivekitConfigured,
  };

  return NextResponse.json(
    {
      // Degraded means nobody can be answered — not that one link is down.
      status:
        database === "unreachable" ||
        (configuredProviders().length > 0 && model.status !== "ok")
          ? "degraded"
          : "ok",
      database,
      missingTables,
      // Which one actually answered, not which one is listed first.
      model: { id: probe.model ?? configuredProviders()[0]?.model ?? null, answeredBy: probe.answered, ...model },
      chain,
      tried: probe.tried,
      skipped: skipped(),
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
