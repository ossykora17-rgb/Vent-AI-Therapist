import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";
import { signUp } from "@/app/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1 px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-[420px]">
          <h1 className="text-4xl font-black leading-tight tracking-tight">
            Start venting.
          </h1>
          <p className="mb-8 mt-3 text-sm leading-relaxed text-ash">
            Free. No card. Delete it all whenever you want.
          </p>

          {!isSupabaseConfigured && (
            <p className="mb-6 border-3 border-ink bg-ink p-3 text-sm text-paper">
              Sign-up is disabled until Supabase keys are added to this
              deployment.
            </p>
          )}

          <AuthForm mode="signup" action={signUp} />

          <p className="mt-8 flex flex-wrap items-center gap-x-2 border-t-3 border-ink pt-6 text-sm">
            Already have one?
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center font-bold underline underline-offset-4"
            >
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
