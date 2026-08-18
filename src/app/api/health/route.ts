import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FULL_CONTRACT, RPC_CONTRACT, explainDbCode } from "@/lib/store/contract";
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
  let database:
    | "ok"
    | "unreachable"
    | "misconfigured"
    | "not_configured"
    /*
      Configured, reachable, and impossible to probe honestly.

      A URL and an anon key with no service-role key is the shape somebody
      lands in by pasting the two values the Supabase dashboard shows first.
      `getStore()` builds only an admin client, so in that shape there is no
      store and nothing is ever written — while the probe below used to fall
      back to the anonymous client, get RLS's perfectly legitimate empty
      answer, and report `ok`.

      Its own comment already said an anonymous probe is the green light over
      the broken road. The `??` put it back.
    */
    | "no_service_key" =
    "not_configured";
  // Which tables answered and which did not — a migration that was never run
  // looks exactly like a wrong key unless the check says which.
  const missingTables: string[] = [];
  // Why they did not answer. "Missing" and "not allowed to read" are different
  // problems with the same symptom, and calling both of them missing sent this
  // hunting for a table that existed. PostgREST puts the difference in `code`
  // — 42P01/PGRST205 is absent, 42501 is a grant — and the actionable half in
  // `hint`, which literally spells out the GRANT statement to run.
  const tableErrors: Record<
    string,
    { code?: string; hint?: string; message?: string; missingColumns?: string[] }
  > = {};
  /*
    Errors that are about the moment, not about the schema.

    PGRST303 is JWT clock skew: the key's `iat` reads a second or two into the
    database's future, so whichever request lands inside that window is
    refused. It moves table to table run to run and it clears on its own — the
    hint attached to it has said "nothing to fix here" since the day it was
    written.

    It was being pushed into `missingTables` anyway, which set database to
    "unreachable", which set status to "degraded", which returned **503**. So
    a self-clearing timing wobble made the health endpoint declare the service
    down — and anything watching it (an uptime check, a status page, a founder
    opening it on his phone at 7am) would read a red light over a road that
    was working perfectly.

    Every other failure in this endpoint has been a green light over a broken
    road. This is the first one the other way round, and it is the same bug:
    the light was not telling the truth about the road.
  */
  const transient: Record<string, { code?: string; hint?: string }> = {};
  /*
    Which contract was checked, so a green health cannot mean "checked two".

    Counts the stored procedures as well now. The number is the answer to
    "how much did you actually look at", and leaving the functions out of it
    would understate the check in exactly the direction that matters.
  */
  const tablesChecked =
    Object.keys(FULL_CONTRACT).length + Object.keys(RPC_CONTRACT).length;

  // Distinct from "unreachable" on purpose. A URL that does not parse is a
  // typo you fix in the dashboard in ten seconds; an unreachable database is
  // an outage or a wrong key. Collapsing them sends you looking in the wrong
  // place, and this endpoint exists to stop exactly that.
  /*
    Built once, and the probe refuses to run without it.

    There is no fallback client on purpose. The only honest answers here are
    "I asked as the identity that does the work" and "I could not ask at all".
    Substituting a different role to get an answer is how this endpoint
    reported a healthy database to deployments that were saving nothing.
  */
  const admin = createAdminClient();

  if (isSupabaseConfigured && !isSupabaseUrlValid) {
    database = "misconfigured";
  } else if (isSupabaseConfigured && !admin) {
    database = "no_service_key";
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
      const supabase = admin;
      // Every table the product touches, with the exact columns it selects.
      //
      // Two tables was a sample, and a sample is how `vents` looked healthy
      // while nine others were never checked at all. head:true means no rows
      // cross the wire — this costs a round trip each and nothing else — and
      // naming the columns means a renamed one is caught here rather than
      // inside a route that degrades quietly.
      const names = Object.keys(FULL_CONTRACT);
      const results = await Promise.all(
        // `limit(0)`, not `head: true`.
        //
        // A HEAD request has no body, so PostgREST's error JSON — the object
        // carrying `code`, `details` and `hint` — never arrives, and every
        // failing table reported `[?] no hint`. The loop printed seven tables
        // failing for an unstated reason, which is the failure bucket with
        // nothing in it all over again, in the endpoint built to prevent it.
        //
        // `limit(0)` is a GET that returns an empty array on success and the
        // full error object on failure. Still no rows over the wire.
        names.map((t) => supabase!.from(t).select(FULL_CONTRACT[t]).limit(0)),
      );

      for (const [i, res] of results.entries()) {
        if (!res.error) continue;
        const name = names[i];

        // Timing, not schema. Reported, never counted.
        if (res.error.code === "PGRST303") {
          transient[name] = {
            code: res.error.code,
            hint: res.error.hint ?? explainDbCode(res.error.code) ?? undefined,
          };
          continue;
        }

        missingTables.push(name);
        tableErrors[name] = {
          code: res.error.code ?? undefined,
          hint: res.error.hint ?? explainDbCode(res.error.code) ?? undefined,
          // 42703 says a column is missing and puts *which* column in the
          // message, with no hint at all. Reporting the code alone turns
          // "column pressure_seeded does not exist" into "the schema has
          // drifted" — true, useless, and one more round trip to find out
          // what everybody already knew.
          message: res.error.message ?? undefined,
        };
      }

      /*
        One missing column at a time is one deploy at a time.

        PostgREST stops at the first column it cannot resolve, so a select
        naming five columns reports exactly one of them however many are gone.
        Production said `column vent_users.carve does not exist` and said
        nothing whatsoever about `held`, which sits two positions later in the
        same list — so the honest reading of that response was "at least one
        of these is missing", and the way to find the rest was to fix carve,
        redeploy, and ask again. Two round trips of a person's evening for one
        answer the database already had.

        So on 42703 only, re-ask column by column. It costs one request per
        column of one broken table, on a path that is already reporting a
        fault, and it turns the answer into the whole list.

        This is the same failure the HEAD request was: a probe shaped so it
        cannot carry back everything it found.
      */
      const drifted = names.filter(
        (n, i) => results[i].error?.code === "42703",
      );
      for (const name of drifted) {
        const cols = FULL_CONTRACT[name].split(",");
        const per = await Promise.all(
          cols.map((c) => supabase!.from(name).select(c).limit(0)),
        );
        const missingColumns = cols.filter(
          (_, k) => per[k].error?.code === "42703",
        );
        if (missingColumns.length) {
          tableErrors[name] = { ...tableErrors[name], missingColumns };
        }
      }
      /*
        The functions, which a table check cannot see.

        Every rate-limit decision on every vent goes through
        `vent_rate_count`. Skip its migration and all eight tables still
        answer perfectly while every vent fails — a green light over a broken
        road, from a probe asking the right identity in the right shape about
        the wrong surface.

        Counted into `missingTables` on purpose rather than into a field of
        its own: everything downstream — the verdict, the status, the 503 —
        already reads that list, and a second list is a second thing to
        forget. The name is now the only inaccurate part, and an inaccurate
        name is cheaper than an unread field.
      */
      const rpcNames = Object.keys(RPC_CONTRACT);
      const rpcResults = await Promise.all(
        rpcNames.map((fn) => supabase!.rpc(fn, RPC_CONTRACT[fn])),
      );
      for (const [i, res] of rpcResults.entries()) {
        if (!res.error) continue;
        const name = rpcNames[i];
        if (res.error.code === "PGRST303") {
          transient[name] = { code: res.error.code, hint: explainDbCode(res.error.code) ?? undefined };
          continue;
        }
        missingTables.push(name);
        tableErrors[name] = {
          code: res.error.code ?? undefined,
          hint:
            res.error.hint ??
            explainDbCode(res.error.code) ??
            "a stored procedure the server calls is missing — check the migrations",
          message: res.error.message ?? undefined,
        };
      }

      database = missingTables.length ? "unreachable" : "ok";
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
    // Which flavour of "no", when it is no. missing = the variable is not in
    // this runtime at all; blank = it is there and empty, which is what saving
    // the field without pasting leaves behind. Never the value.
    keyState: p.keyState,
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
      // Present and self-clearing. Never affects `status` or the HTTP code.
      transient,
      tablesChecked,
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
