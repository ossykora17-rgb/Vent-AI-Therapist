import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

/** Shared shell for /privacy and /terms so both stay in the design system. */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[640px] items-center justify-between px-4">
        <Link href="/" className="flex min-h-[44px] items-center">
          <span className="label-mono">Mind Weave</span>
        </Link>
        <ThemeToggle />
      </header>

      <main id="main" className="mx-auto w-full max-w-[640px] flex-1 px-4 py-6">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em]">
          {title}
        </h1>

        <div
          className={[
            "mt-6 space-y-4 text-[15px] leading-[1.6]",
            "[&_h2]:mt-7 [&_h2]:font-mono [&_h2]:text-[13px] [&_h2]:uppercase",
            "[&_h2]:tracking-[0.1em] [&_h2]:text-ash",
            "[&_a]:underline [&_a]:underline-offset-2",
            "[&_strong]:font-semibold",
          ].join(" ")}
        >
          {children}
        </div>

        <p className="label-mono mt-10">
          Last updated {new Date().getFullYear()}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/chat"
            className="flex min-h-[48px] items-center rounded-card bg-gold px-6 text-sm font-semibold text-on-gold"
          >
            Come in
          </Link>
          <Link
            href={title === "Privacy" ? "/terms" : "/privacy"}
            className="flex min-h-[48px] items-center rounded-card border border-line/15 px-6 text-sm"
          >
            {title === "Privacy" ? "Terms" : "Privacy"}
          </Link>
        </div>
      </main>
    </div>
  );
}
