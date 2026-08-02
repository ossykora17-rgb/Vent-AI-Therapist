import Link from "next/link";

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b-3 border-ink bg-paper">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="-mx-2 flex min-h-[44px] items-center px-2 text-xl font-black uppercase tracking-tighter"
          aria-label="Vent — home"
        >
          VENT<span className="text-ash">.</span>
        </Link>
        <nav className="flex items-center gap-2">{children}</nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t-3 border-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p className="font-bold uppercase tracking-widest">
          Vent © {new Date().getFullYear()}
        </p>
        <p className="max-w-md leading-relaxed text-ash">
          Vent is not a medical service and does not provide diagnosis or crisis
          care. If you are in danger, contact your local emergency number.
        </p>
      </div>
    </footer>
  );
}
