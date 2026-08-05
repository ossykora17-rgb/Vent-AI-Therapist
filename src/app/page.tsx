import { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL } from "@/lib/vent/intent";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { isSupabaseConfigured } from "@/lib/env";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[640px] items-center justify-between px-4">
        <p className="label-mono">Mind Weave</p>
        <ThemeToggle />
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-4 py-10"
      >
        <h1 className="font-display text-[clamp(3.5rem,18vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.02em]">
          VENT
        </h1>
        <p className="mt-3 font-display text-xl italic text-ash">
          Carve your truth.
        </p>

        <p className="mt-6 max-w-[46ch] text-[16px] leading-[1.6] text-ash">
          Somewhere to put the thing you can&apos;t say out loud yet. It knows
          what day it is, it remembers what you said last time, and it will not
          tell you to drop your shoulders three times in a row.
        </p>

        <Link
          href="/chat"
          className="mt-8 flex min-h-[52px] w-full max-w-[280px] items-center justify-center rounded-card bg-gold px-6 text-[15px] font-semibold text-ink shadow-glass transition-opacity duration-300 hover:opacity-90"
        >
          Come in
        </Link>

        <p className="label-mono mt-3">Free · No account · Nothing to install</p>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            ["Grounded", "It knows the real date, time and place — like you do."],
            ["Remembers", "Your exact words come back, not a summary of them."],
            ["Critical", "Warm, but it will call a TED talk a TED talk."],
          ].map(([title, body]) => (
            <div key={title} className="glass p-4">
              <p className="label-mono mb-2">{title}</p>
              <p className="text-sm leading-[1.6]">{body}</p>
            </div>
          ))}
        </div>

        {!isSupabaseConfigured && (
          <p className="glass mt-6 p-4 text-sm leading-relaxed">
            <span className="label-mono">Setup pending</span>
            <br />
            Supabase keys aren&apos;t set on this deployment, so sessions
            won&apos;t persist between visits yet. Everything else works.
          </p>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[640px] px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <p className="text-[12px] leading-relaxed text-ash">
          Mind Weave is not a licensed therapist. VENT is for emotional support
          only, not medical advice. In crisis, call Nigeria{" "}
          <a href={`tel:${CRISIS_TEL}`} className="underline underline-offset-2">
            {CRISIS_LINES.nigeria}
          </a>{" "}
          or emergency{" "}
          <a href={`tel:${EMERGENCY_TEL}`} className="underline underline-offset-2">
            {CRISIS_LINES.emergency}
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
