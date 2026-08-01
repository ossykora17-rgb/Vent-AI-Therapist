"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { anonId } from "@/lib/anon";
import { CHAIRS, chairLabel, tensionForChair } from "@/lib/vent/chairs";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Circle {
  id: string;
  tag: string | null;
  chair_picked: string | null;
  pressure_seeded: number | null;
  status: string;
  ends_at: string;
  seats: number;
}

const TAGS = [
  ["economy", "Money"],
  ["japa", "Leaving"],
  ["ai_job", "Work / AI"],
  ["social", "Comparing"],
  ["family", "Family"],
  ["lonely", "Alone"],
  ["traffic", "The road"],
  ["climate", "Heat"],
  ["health", "Health"],
] as const;

export function CirclesList() {
  const { toast } = useToast();
  const router = useRouter();
  const [circles, setCircles] = React.useState<Circle[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [persisting, setPersisting] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [tag, setTag] = React.useState<string>("economy");
  const [chair, setChair] = React.useState<string>("tight_edge");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const d = await fetch("/api/circles").then((r) => r.json());
      setCircles(d.circles ?? []);
      setPersisting(d.persisting !== false);
    } catch {
      setPersisting(false);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    // Polling, not sockets — Phase 0 is proving the room is wanted at all.
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const pressure = tensionForChair(chair);
      const res = await fetch("/api/circles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: anonId(), tag, chairPicked: chair, pressure }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast(d.message ?? "Couldn't open the circle.", "error");
        return;
      }
      router.push(`/circles/${d.circle.id}`);
    } catch {
      toast("Network dipped.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/80 backdrop-blur-glass">
        <div className="mx-auto flex h-16 max-w-[640px] items-center justify-between gap-3 px-4">
          <div>
            <p className="label-mono leading-none">Mycelium</p>
            <h1 className="font-display text-2xl font-bold leading-tight tracking-[-0.02em]">
              Circles
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/chat"
              className="flex h-11 items-center rounded-full border border-line/10 px-4 text-sm"
            >
              Vent alone
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[640px] flex-1 px-4 py-5">
        <p className="label-mono flex items-center gap-2">
          {circles.length > 0 && (
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gold motion-safe:animate-pulse" />
          )}
          {loading
            ? "Looking…"
            : circles.length === 0
              ? "No circles carving now"
              : `${circles.length} ${circles.length === 1 ? "circle" : "circles"} carving now`}
        </p>

        {loading && (
          <div className="mt-4 space-y-3" aria-busy="true">
            {[0, 1].map((i) => <div key={i} className="glass h-28 animate-pulse p-4" />)}
          </div>
        )}

        {!loading && circles.length === 0 && !creating && (
          <div className="glass mt-4 p-6 text-center">
            <p className="font-display text-xl font-bold">Nobody is sitting yet.</p>
            <p className="mt-2 text-sm leading-relaxed text-ash">
              Six seats, forty-five minutes, no advice. Open one and someone
              carrying the same thing will find it.
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-5 min-h-[48px] w-full rounded-card bg-gold px-6 text-sm font-semibold text-ink"
            >
              Open a circle
            </button>
          </div>
        )}

        {creating && (
          <div className="glass mt-4 animate-slide-up p-4">
            <p className="label-mono mb-3">What is it about?</p>
            <div className="flex flex-wrap gap-2">
              {TAGS.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTag(v)}
                  aria-pressed={tag === v}
                  className={cn(
                    "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
                    tag === v ? "border-gold bg-gold text-ink" : "border-line/15",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="label-mono mb-2 mt-4">Which chair are you today?</p>
            <div className="flex flex-wrap gap-2">
              {CHAIRS.map((seat) => (
                <button
                  key={seat.id}
                  type="button"
                  onClick={() => setChair(seat.id)}
                  aria-pressed={chair === seat.id}
                  className={cn(
                    "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
                    chair === seat.id ? "border-gold bg-gold text-ink" : "border-line/15",
                  )}
                >
                  {seat.label}
                </button>
              ))}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy}
                className="min-h-[48px] flex-1 rounded-card bg-gold px-4 text-sm font-semibold text-ink disabled:opacity-40"
              >
                {busy ? "Opening…" : "Open it — 45 min"}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="min-h-[48px] rounded-card border border-line/15 px-4 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <ol className="mt-4 space-y-3">
          {circles.map((c) => {
            const mins = Math.max(0, Math.round((new Date(c.ends_at).getTime() - Date.now()) / 60000));
            return (
              <li key={c.id}>
                <Link href={`/circles/${c.id}`} className="glass block p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gold motion-safe:animate-pulse" />
                    <span className="label-mono">
                      {TAGS.find(([v]) => v === c.tag)?.[1] ?? "Anything"}
                    </span>
                    <span className="label-mono ml-auto">
                      {c.seats}/6 · {mins} min left
                    </span>
                  </div>
                  <p className="mt-2 text-[15px] leading-[1.6]">
                    {chairLabel(c.chair_picked)} ·
                    pressure {c.pressure_seeded ?? "—"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ol>

        {circles.length > 0 && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 min-h-[48px] w-full rounded-card border border-line/15 text-sm"
          >
            Open a different circle
          </button>
        )}

        {!persisting && (
          <p className="glass mt-4 p-4 text-sm leading-relaxed">
            <span className="label-mono">Storage off</span>
            <br />
            Circles need somewhere to live. Run locally with{" "}
            <code>npm run local</code>, or add Supabase keys.
          </p>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[640px] px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <p className="text-[12px] leading-relaxed text-ash">
          Mind Weave Circles is peer support, not licensed therapy, not medical
          advice, and not affiliated with AA. What&apos;s said in a circle stays
          in the circle — nothing is recorded and every word is deleted within
          24 hours. In crisis, call{" "}
          <a href="tel:08062106493" className="underline underline-offset-2">
            0806 210 6493
          </a>{" "}
          or{" "}
          <a href="tel:199" className="underline underline-offset-2">
            199
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
