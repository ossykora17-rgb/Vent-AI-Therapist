"use client";

import * as React from "react";
import Link from "next/link";
import { anonId } from "@/lib/anon";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  seat: number;
  mine: boolean;
  role: string;
  content: string;
  kind: string;
  created_at: string;
}

interface RoomState {
  circle: { id: string; tag: string | null; status: string; ends_at: string };
  seats: number;
  maxSeats: number;
  role: "keeper" | "sharer" | "witness" | null;
  joined: boolean;
  intention: string;
  msRemaining: number;
}

const AGREEMENT = [
  "No advice. No fixing. No cross-talk.",
  "Speak to the circle, not at a person. I-statements only.",
  "What's said here stays here. Nothing is recorded; everything is deleted within 24 hours.",
  "You can leave at any moment, without explaining.",
];

export function CircleRoom({ id }: { id: string }) {
  const { toast } = useToast();
  const [state, setState] = React.useState<RoomState | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [draft, setDraft] = React.useState("");
  const [ruleError, setRuleError] = React.useState<string | null>(null);
  const [crisis, setCrisis] = React.useState(false);
  const [consented, setConsented] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  const me = React.useMemo(() => (typeof window === "undefined" ? "" : anonId()), []);

  const load = React.useCallback(async () => {
    const r = await fetch(`/api/circles/${id}?anonId=${encodeURIComponent(me)}`);
    if (r.status === 404) { setNotFound(true); return; }
    const d: RoomState = await r.json();
    setState(d);
    if (d.joined) {
      const m = await fetch(`/api/circles/${id}/messages?anonId=${encodeURIComponent(me)}`);
      if (m.ok) setMessages((await m.json()).messages ?? []);
    }
  }, [id, me]);

  React.useEffect(() => {
    void load();
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [load]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function join() {
    setBusy(true);
    try {
      const r = await fetch(`/api/circles/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: me, consent: true }),
      });
      const d = await r.json();
      if (r.status === 409 && d.error === "crisis") { setCrisis(true); return; }
      if (!r.ok) { toast(d.error === "full" ? "That circle is full." : "Couldn't take a seat.", "error"); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content || busy || !state?.role) return;
    setBusy(true);
    setRuleError(null);
    try {
      const kind = state.role === "witness" ? "witness" : "share";
      const r = await fetch(`/api/circles/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: me, content, kind }),
      });
      const d = await r.json();
      if (r.status === 409 && d.error === "crisis") { setCrisis(true); return; }
      if (r.status === 422 && d.error === "rule") { setRuleError(d.message); return; }
      if (!r.ok) { toast("Couldn't send that.", "error"); return; }
      setDraft("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
        <p className="font-display text-2xl font-bold">That circle has closed.</p>
        <p className="mt-2 text-sm text-ash">The words are already gone. That&apos;s the deal.</p>
        <Link href="/circles" className="mt-6 flex min-h-[48px] items-center rounded-card bg-gold px-6 text-sm font-semibold text-ink">
          See open circles
        </Link>
      </main>
    );
  }

  const mins = state ? Math.max(0, Math.round(state.msRemaining / 60000)) : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/80 backdrop-blur-glass">
        <div className="mx-auto flex h-16 max-w-[640px] items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <p className="label-mono leading-none">
              Circle · {state?.seats ?? 0}/{state?.maxSeats ?? 6} · {mins} min
            </p>
            <h1 className="truncate font-display text-xl font-bold tracking-[-0.02em]">
              {state?.circle.tag ?? "Anything"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {state?.role && (
              <span className="label-mono rounded-full border border-gold/40 px-3 py-1">
                {state.role}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[640px] flex-1 px-4 py-5">
        {crisis && (
          <div className="glass mb-4 border-gold/60 p-4">
            <p className="label-mono mb-2">This isn&apos;t the room for that</p>
            <p className="text-[15px] leading-[1.6]">
              I&apos;m really concerned about you. A circle can&apos;t hold this —
              you need a person, now.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <a href="tel:08062106493" className="flex min-h-[44px] flex-1 items-center justify-center rounded-card bg-gold px-4 text-sm font-semibold text-ink">
                Call 0806 210 6493
              </a>
              <a href="tel:199" className="flex min-h-[44px] flex-1 items-center justify-center rounded-card border border-line/20 px-4 text-sm font-semibold">
                Emergency 199
              </a>
            </div>
            <Link href="/chat" className="mt-3 block min-h-[44px] text-center text-sm text-ash underline underline-offset-4">
              Take it to a private vent instead
            </Link>
          </div>
        )}

        {state && !state.joined && (
          <div className="glass p-5">
            <p className="label-mono mb-3">Before you sit</p>
            <ul className="space-y-2 text-[15px] leading-[1.6]">
              {AGREEMENT.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="text-gold">·</span>
                  {line}
                </li>
              ))}
            </ul>
            <label className="mt-4 flex min-h-[44px] items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                className="h-5 w-5 accent-gold"
              />
              I agree to hold this the way it&apos;s written.
            </label>
            <button
              type="button"
              onClick={() => void join()}
              disabled={!consented || busy}
              className="mt-4 min-h-[48px] w-full rounded-card bg-gold text-sm font-semibold text-ink disabled:opacity-40"
            >
              {busy ? "Taking a seat…" : "Take a seat"}
            </button>
          </div>
        )}

        {state?.joined && (
          <>
            <p className="glass p-4 text-[15px] leading-[1.6]">
              <span className="label-mono">Keeper</span>
              <br />
              {state.intention}
            </p>

            <ol className="mt-4 space-y-3">
              {messages.map((m) => (
                <li key={m.id} className={cn("glass p-4", m.kind === "witness" && "border-gold/30")}>
                  <p className="label-mono mb-1">
                    {m.mine ? "You" : `Seat ${m.seat}`} · {m.role}
                    {m.kind === "witness" && " · heard"}
                  </p>
                  <p className="text-[15px] leading-[1.6]">{m.content}</p>
                </li>
              ))}
            </ol>
            {messages.length === 0 && (
              <p className="mt-4 text-center text-sm text-ash">
                Nobody has spoken yet. Someone goes first.
              </p>
            )}
            <div ref={endRef} />
          </>
        )}
      </main>

      {state?.joined && (
        <footer className="sticky bottom-0 border-t border-line/10 bg-paper/85 backdrop-blur-glass">
          <div className="mx-auto max-w-[640px] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
            {ruleError && (
              <p role="alert" className="mb-2 rounded-card border border-gold/50 p-3 text-[13px] leading-relaxed">
                {ruleError}
              </p>
            )}
            <div className="flex items-end gap-2">
              <label htmlFor="circle-input" className="sr-only">
                {state.role === "witness" ? "Reflect one line" : "Your share"}
              </label>
              <textarea
                id="circle-input"
                rows={1}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setRuleError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
                }}
                placeholder={
                  state.role === "witness"
                    ? "One line — what you heard."
                    : "Say the heaviest part."
                }
                maxLength={state.role === "witness" ? 140 : 900}
                className="max-h-32 min-h-[48px] flex-1 resize-none rounded-card border border-line/15 bg-card/60 px-4 py-3 leading-[1.6] placeholder:text-ash"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!draft.trim() || busy}
                aria-label="Send"
                className="flex h-12 min-w-[64px] items-center justify-center rounded-card bg-gold px-4 text-sm font-semibold text-ink disabled:opacity-40"
              >
                {busy ? "…" : "Say"}
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ash">
              {state.role === "witness"
                ? "You reflect one line. No fixing, no advice."
                : "No advice, no you-statements. Speak to the circle."}
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
