import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";
import { isAnthropicConfigured, isPaystackConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Dashboard" };

// Auth state is per-request; never statically cache this page.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  /*
    Single round trip for the two things this page shows — and the errors are
    kept now rather than destructured away, because the status panel below
    used to report `Database: Live` as a hardcoded literal.

    "A green light over a broken road is worse than no light" is the oldest
    line in CLAUDE.md, and it was being rendered here as an actual light. This
    is the one page in the product that draws status lamps, and two of the four
    were painted on. Both answers below now come from a request that was
    really made: the database says Live because it answered these two queries,
    and auth says Live because `getUser` returned a user or we would have been
    redirected to /login three lines up.
  */
  const [profileRes, sessionRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, plan")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const profile = profileRes.data;
  const sessionCount = sessionRes.count;
  const databaseOk = !profileRes.error && !sessionRes.error;

  const name = profile?.display_name ?? user.email?.split("@")[0] ?? "you";

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader>
        <SignOutButton />
      </SiteHeader>

      <main id="main" className="flex-1 px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <h1 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-4xl">
            Hello, {name}.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ash">
            {sessionCount
              ? `${sessionCount} session${sessionCount === 1 ? "" : "s"} saved.`
              : "Nothing saved yet."}
          </p>

          {/*
            The way in, which this page did not have.

            Signing up redirects here, so the moment of highest intent — a
            person who has just made an account — landed on their own email
            address and plan tier with no door to the product on it. The only
            exit was the logo in the header, back to the landing page, to
            start again. Two links, at the top, before the account admin.
          */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/chat"
              className="inline-flex min-h-[52px] items-center justify-center rounded-card bg-gold px-6 text-[15px] font-semibold text-on-gold shadow-glass transition-opacity duration-300 hover:opacity-90"
            >
              Carve something
            </Link>
            <Link
              href="/circles"
              className="inline-flex min-h-[52px] items-center justify-center rounded-card px-6 text-[15px] font-semibold text-ink underline underline-offset-4"
            >
              Sit with people
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardTitle>Account</CardTitle>
              <CardBody>
                <dl className="space-y-2">
                  <div className="flex justify-between gap-3 border-b border-line/10 pb-2">
                    <dt className="text-xs font-bold uppercase tracking-widest">
                      Email
                    </dt>
                    <dd className="break-all text-right">{user.email}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-xs font-bold uppercase tracking-widest">
                      Plan
                    </dt>
                    <dd className="font-bold uppercase">
                      {profile?.plan ?? "free"}
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardTitle>System</CardTitle>
              <CardBody>
                <ul className="space-y-2">
                  <StatusRow label="Database" ok={databaseOk} />
                  {/* We are rendering this page, so `getUser` returned a user
                      and the redirect above did not fire. Earned, not asserted. */}
                  <StatusRow label="Auth" ok />
                  <StatusRow label="AI" ok={isAnthropicConfigured} />
                  <StatusRow label="Payments" ok={isPaystackConfigured} />
                </ul>
              </CardBody>
            </Card>
          </div>

          {/*
            This said "The venting session itself is the next build."

            It was true on the day it was written and has been false for the
            entire life of the product. It sat on the page a person lands on
            the moment they finish signing up — so the single highest-intent
            visitor VENT has was told, by VENT, that VENT did not exist yet.
            Scaffolding copy outlives the scaffolding, and nothing in the suite
            could ever have caught a sentence that was merely out of date.
          */}
          <div className="glass mt-4 p-5 sm:p-6">
            <p className="label-mono">
              Your account changes nothing about the room
            </p>
            <p className="mt-2 max-w-xl leading-relaxed">
              Sessions still carry no name, circles still delete every word when
              they end, and you can still say the real thing. An account only
              means this device is not the only place your history lives.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line/10 pb-2 last:border-b-0 last:pb-0">
      <span className="label-mono">
        {label}
      </span>
      <span
        className={
          ok
            ? "rounded-full bg-gold/15 px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-[0.08em] text-ink"
            : "rounded-full bg-ink/[0.06] px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-[0.08em] text-ash"
        }
      >
        {ok ? "Live" : "Pending"}
      </span>
    </li>
  );
}
