import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  // Why they did not answer. "Missing" and "not allowed to read" are different
  // problems with the same symptom, and calling both of them missing sent this
  // hunting for a table that existed. PostgREST puts the difference in `code`
  // — 42P01/PGRST205 is absent, 42501 is a grant — and the actionable half in
  // `hint`, which literally spells out the GRANT statement to run.
  const tableErrors: Record<string, { code?: string; hint?: string }> = {};

  // Distinct from "unreachable" on purpose. A URL that does not parse is a
  // typo you fix in the dashboard in ten seconds; an unreachable database is
  // an outage or a wrong key. Collapsing them sends you looking in the wrong
  // place, and this endpoint exists to stop exactly that.
  if (isSupabaseConfigured && !isSupabaseUrlValid) {
    database = "misconfigured";
  } else if (isSupabaseConfigured) {
    try {
      // The identity the product actually uses.
      //
      // This probed with the anonymous client, which is a different role with
      // different privileges — and under deny-by-default RLS an anonymous
      // caller legitimately gets a count of 0 with no error. So it reported
      // `ok` while every server read of `vents` was failing with `permission
      // denied`, because service_role had no GRANT. A health probe on a path
      // the product never takes is the green light over the broken road,
      // again: this file already learned it once with models.retrieve.
      const supabase = createAdminClient() ?? (await createClient());
      // head+count touches the table without transferring rows. Both tables,
      // because they come from different migrations and one being applied
      // never implied the other.
      const [a, b] = await Promise.all([
        supabase!.from("profiles").select("id", { count: "exact", head: true }),
        supabase!.from("vents").select("id", { count: "exact", head: true }),
      ]);
      database = a.error || b.error ? "unreachable" : "ok";
      missingTables = [a.error && "profiles", b.error && "vents"].filter(Boolean) as string[];
      for (const [name, res] of [["profiles", a], ["vents", b]] as const) {
        if (res.error) {
          tableErrors[name] = {
            code: res.error.code ?? undefined,
            hint: res.error.hint ?? undefined,
          };
        }
      }
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
      tableErrors,
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
