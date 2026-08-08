"use client";

import { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL } from "@/lib/vent/intent";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { anonId } from "@/lib/anon";
import { CHAIRS, tensionForChair } from "@/lib/vent/chairs";
import { carryingWord } from "@/lib/community/carrying";
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
  /**
   * The clock, held in state rather than read during render. `Date.now()`
   * inside the map made render impure: the server rendered one number, the
   * client hydrated a different one, and the countdown then sat frozen until
   * the next poll happened to repaint it. Now it ticks with the poll.
   */
  const [now, setNow] = React.useState(0);

  /**
   * What the house is carrying, counted.
   *
   * Fetched once rather than on the ten-second poll: it describes a week, and
   * re-asking every ten seconds would be a scan per visitor per poll for a
   * number that cannot have moved.
   */
  const [carrying, setCarrying] = React.useState<{
    total: number;
    tags: Array<{ tag: string; count: number }>;
  } | null>(null);

  React.useEffect(() => {
    void fetch("/api/community")
      .then((r) => r.json())
      .then((d) => setCarrying(d.carrying ?? null))
      // Silence on failure. The lobby simply does not mention it.
      .catch(() => {});
  }, []);

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
    // The client's clock, read once here rather than during render, so the
    // first paint after hydration already has a real countdown.
    setNow(Date.now());
    // Polling, not sockets — Phase 0 is proving the room is wanted at all.
    const t = window.setInterval(() => {
      void load();
      setNow(Date.now());
    }, 10_000);
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

        {/*
          No plate, not centred — the same correction as the chat empty state.
          An empty lobby should look like an empty lobby.

          And it answers the question somebody actually has before sitting down
          with five strangers, which is not "what is a circle" but "will anyone
          know it was me". That answer belongs here, before the button, not
          inside the room after they have committed.
        */}
        {!loading && circles.length === 0 && !creating && (
          <div className="mt-6">
            <p className="font-display text-[22px] leading-[1.3]">
              Nobody is sitting yet.
            </p>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-[1.7] text-ash">
              Six seats, forty-five minutes, no advice. Open one and someone
              carrying the same thing will find it.
            </p>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-[1.7] text-ash">
              You are a seat number, never a name. If you speak, your voice is
              pitched down first — not recognisably yours. Nothing said in a
              circle is kept after it closes.
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

        {/*
          The house, when the room is empty.

          A circle keeps nothing — that is the rule and it is right — which
          leaves the lobby dead until somebody else happens to be awake. A
          person arriving at 2am gets a screen implying they are the only one
          who has ever felt this. They are not, and "am I the only one" is the
          loneliest question anybody brings here.

          So the room remembers nothing and the house remembers how many.
          Counts by pressure, over a week, across everybody: no text, no
          identity, nothing a stranger could not have guessed.

          It renders under the lobby state rather than instead of it, so a live
          circle is still the first thing you see. And it renders nothing at
          all below the floor — never "0 this week", which is the one sentence
          a lonely screen must not print.
        */}
        {carrying && !creating && (
          <div className="mt-6 border-l border-gold/25 pl-5">
            <p className="label-mono mb-2">This week, in the house</p>
            <p className="max-w-[44ch] text-[15px] leading-[1.7]">
              <span className="tabular font-semibold">{carrying.total}</span>{" "}
              people sat down with something. Mostly{" "}
              {carrying.tags.slice(0, 3).map((t, i, arr) => (
                <React.Fragment key={t.tag}>
                  {i > 0 && (i === arr.length - 1 ? " and " : ", ")}
                  {carryingWord(t.tag)}
                </React.Fragment>
              ))}
              .
            </p>
            <p className="mt-2 max-w-[44ch] text-[14px] leading-[1.6] text-ash">
              Counts only. Nothing anybody said is kept, here or anywhere.
            </p>
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
            const mins = now === 0
              ? null
              : Math.max(0, Math.round((new Date(c.ends_at).getTime() - now) / 60000));
            return (
              <li key={c.id}>
                {/*
                  What a person needs to decide whether to sit down, and
                  nothing about the stranger who opened it.

                  This showed the opener's chair and their pressure reading —
                  "Tight edge · pressure 72" — to everybody browsing the lobby.
                  That is one person's tension score, published to strangers,
                  in the product whose non-negotiable is anonymity. They chose
                  it to seed a room, not to be described by it.

                  It was not even useful: nobody picks a circle by another
                  person's slider. They pick by what it is about, whether there
                  is room, and how long is left.
                */}
                <Link href={`/circles/${c.id}`} className="glass block p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gold motion-safe:animate-pulse" />
                    <span className="label-mono">
                      {TAGS.find(([v]) => v === c.tag)?.[1] ?? "Anything"}
                    </span>
                    <span className="label-mono ml-auto">
                      {mins ?? "—"} min left
                    </span>
                  </div>

                  {/* Six seats drawn as six seats. "3/6" is a fraction; this
                      is a room you can see the shape of at a glance, and it
                      says the thing that matters — whether there is space. */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex gap-1.5" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1.5 w-6 rounded-full",
                            i < c.seats ? "bg-gold" : "bg-line/15",
                          )}
                        />
                      ))}
                    </span>
                    <span className="label-mono ml-auto">
                      {c.seats === 6
                        ? "full"
                        : `${6 - c.seats} ${6 - c.seats === 1 ? "seat" : "seats"} open`}
                    </span>
                  </div>
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
          <a href={`tel:${CRISIS_TEL}`} className="underline underline-offset-2">
            {CRISIS_LINES.nigeria}
          </a>{" "}
          or{" "}
          <a href={`tel:${EMERGENCY_TEL}`} className="underline underline-offset-2">
            {CRISIS_LINES.emergency}
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
