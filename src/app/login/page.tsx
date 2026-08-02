import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";
import { signIn } from "@/app/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  missing_code: "That confirmation link was incomplete. Try logging in.",
  invalid_code: "That link expired. Request a new one by logging in.",
  not_configured: "Auth is not configured on this deployment yet.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const notice = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1 px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-[420px]">
          <h1 className="text-4xl font-black leading-tight tracking-tight">
            Welcome back.
          </h1>
          <p className="mb-8 mt-3 text-sm leading-relaxed text-ash">
            Pick up where you left off.
          </p>

          {notice && (
            <p className="mb-6 border-3 border-ink bg-paper p-3 text-sm font-medium shadow-brut-sm">
              {notice}
            </p>
          )}

          {!isSupabaseConfigured && (
            <p className="mb-6 border-3 border-ink bg-ink p-3 text-sm text-paper">
              Auth is disabled until Supabase keys are added to this deployment.
            </p>
          )}

          <AuthForm mode="login" action={signIn} next={searchParams.next} />

          <p className="mt-8 flex flex-wrap items-center gap-x-2 border-t-3 border-ink pt-6 text-sm">
            No account?
            <Link
              href="/signup"
              className="inline-flex min-h-[44px] items-center font-bold underline underline-offset-4"
            >
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
