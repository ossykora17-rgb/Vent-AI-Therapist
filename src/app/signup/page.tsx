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
          <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-[-0.02em]">
            Start venting.
          </h1>
          <p className="mb-8 mt-3 text-sm leading-relaxed text-ash">
            Free. No card. Delete it all whenever you want.
          </p>

          {!isSupabaseConfigured && (
            <p className="glass mb-6 p-3 text-[14px] leading-[1.6] text-ash">
              Accounts are not open yet. You do not need one — the whole
              product works without a name, and always will.
            </p>
          )}

          <AuthForm mode="signup" action={signUp} />

          <p className="mt-8 flex flex-wrap items-center gap-x-2 border-t border-line/10 pt-6 text-[14px]">
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
