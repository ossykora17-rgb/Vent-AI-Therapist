import type { Metadata } from "next";
import { redirect } from "next/navigation";
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

  // Single round trip for the two things this page shows.
  const [{ data: profile }, { count: sessionCount }] = await Promise.all([
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

  const name = profile?.display_name ?? user.email?.split("@")[0] ?? "you";

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader>
        <SignOutButton />
      </SiteHeader>

      <main id="main" className="flex-1 px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            Hello, {name}.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ash">
            {sessionCount
              ? `${sessionCount} session${sessionCount === 1 ? "" : "s"} saved.`
              : "Nothing saved yet."}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardTitle>Account</CardTitle>
              <CardBody>
                <dl className="space-y-2">
                  <div className="flex justify-between gap-3 border-b-3 border-ink pb-2">
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
                  <StatusRow label="Database" ok />
                  <StatusRow label="Auth" ok />
                  <StatusRow label="AI" ok={isAnthropicConfigured} />
                  <StatusRow label="Payments" ok={isPaystackConfigured} />
                </ul>
              </CardBody>
            </Card>
          </div>

          <div className="mt-4 border-3 border-ink bg-ink p-5 text-paper sm:p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-ash">
              Next up
            </p>
            <p className="mt-2 max-w-xl leading-relaxed">
              The foundation is live: auth, database, row-level security and the
              design system. The venting session itself is the next build.
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
    <li className="flex items-center justify-between gap-3 border-b-3 border-ink pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs font-bold uppercase tracking-widest">
        {label}
      </span>
      <span
        className={
          ok
            ? "border-3 border-ink bg-ink px-2 py-[2px] text-[11px] font-bold uppercase text-paper"
            : "border-3 border-ash px-2 py-[2px] text-[11px] font-bold uppercase text-ash"
        }
      >
        {ok ? "Live" : "Pending"}
      </span>
    </li>
  );
}
