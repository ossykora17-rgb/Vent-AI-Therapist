"use client";

import * as React from "react";
import Link from "next/link";
import { anonId } from "@/lib/anon";
import { CHAIRS, tensionDrop, tensionForChair, tensionNow } from "@/lib/vent/chairs";
import { CircleVoice } from "@/components/circle-voice";
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
  phase: string;
  phaseLabel: string;
  pressureSeeded: number | null;
  msRemaining: number;
  present: number;
  typingOthers: number;
  seatsPresent: boolean[];
  voice: boolean;
}

const WORDS = ["Guilt", "Proof", "Anger", "Hope", "Silence", "Tiredness"];

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
  const [chair, setChair] = React.useState<string>("sunk");
  const [reflecting, setReflecting] = React.useState(false);
  const [mood, setMood] = React.useState<number | null>(null);
  const [carry, setCarry] = React.useState<string | null>(null);
  const [dropped, setDropped] = React.useState<string | null>(null);
  const [quote, setQuote] = React.useState<{ text: string; author: string } | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  /**
   * Read by the poll, not by the render. Putting the draft in `load`'s deps
   * would tear down and rebuild the four-second interval on every keystroke.
   */
  const draftRef = React.useRef("");
  React.useEffect(() => { draftRef.current = draft; }, [draft]);

  const me = React.useMemo(() => (typeof window === "undefined" ? "" : anonId()), []);

  const load = React.useCallback(async () => {
    // The heartbeat that was already running now carries two more bits: I am
    // here, and there is text in my box. No new endpoint, no debounce timer,
    // no extra request per keystroke.
    const typing = draftRef.current.trim().length > 0 ? "&typing=1" : "";
    const r = await fetch(`/api/circles/${id}?anonId=${encodeURIComponent(me)}${typing}`);
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

  /**
   * One Stoic line, fetched once, and only at the door. A quote in the middle
   * of a vent is the wellness reflex this product exists to avoid; next to
   * "what do you carry" it rhymes with the tactic library's own move. If the
   * fetch fails there is simply no quote — never a stock one.
   */
  React.useEffect(() => {
    if (state?.phase !== "close" || quote) return;
    let live = true;
    void fetch("/api/external/quote/context")
      .then((r) => r.json())
      .then((d) => { if (live && d.available) setQuote({ text: d.text, author: d.author }); })
      .catch(() => {});
    return () => { live = false; };
  }, [state?.phase, quote]);

  async function join() {
    setBusy(true);
    try {
      const r = await fetch(`/api/circles/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          anonId: me,
          consent: true,
          pressure: tensionForChair(chair),
        }),
      });
      const d = await r.json();
      if (r.status === 409 && d.error === "crisis") { setCrisis(true); return; }
      if (!r.ok) { toast(d.error === "full" ? "That circle is full." : "Couldn't take a seat.", "error"); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }

  /**
   * The one thing worth keeping out of a circle: did the room work. The mood
   * reading, the drop, and the two words — no transcript, nothing anybody
   * said. Fire-and-forget: a failed preference log must never block a seal.
   */
  async function seal(drop: string) {
    if (mood === null) return;
    try {
      await fetch(`/api/circles/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: me, mood, carry, drop }),
      });
    } catch {
      /* The seal already happened on their screen. */
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content || busy || !state?.role) return;
    setBusy(true);
    setRuleError(null);
    try {
      const kind = reflecting ? "witness" : "share";
      const r = await fetch(`/api/circles/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: me, content, kind }),
      });
      const d = await r.json();
      if (r.status === 409 && d.error === "crisis") { setCrisis(true); return; }
      // A rule refusal and a Guardian refusal read the same to a person: the
      // line does not go in, and here is why, in words they can act on.
      if (r.status === 422 && (d.error === "rule" || d.error === "guardian")) {
        setRuleError(d.message);
        return;
      }
      if (!r.ok) { toast("Couldn't send that.", "error"); return; }
      setDraft("");
      setReflecting(false);
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
            <p className="label-mono flex flex-wrap items-center gap-x-2 gap-y-1 leading-none">
              <span>{state?.phaseLabel ?? "Circle"}</span>
              <span aria-hidden="true" className="flex items-center gap-1">
                {Array.from({ length: state?.maxSeats ?? 6 }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "block h-[7px] w-[7px] rounded-full border transition-colors duration-500",
                      i < (state?.seats ?? 0)
                        ? state?.seatsPresent?.[i]
                          ? "border-ink bg-ink"
                          : "border-line/40 bg-line/20"
                        : "border-line/25",
                    )}
                  />
                ))}
              </span>
              <span className="whitespace-nowrap">{state?.present ?? 0} here · {mins} min</span>
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
            <p className="label-mono mb-2 mt-5">Which chair are you today?</p>
            <div className="flex flex-wrap gap-2">
              {CHAIRS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChair(c.id)}
                  aria-pressed={chair === c.id}
                  className={cn(
                    "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
                    chair === c.id ? "border-gold bg-gold text-ink" : "border-line/15",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

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
            {/*
              The Keeper has not spoken yet, and this panel used to print its
              intention anyway — a line attributed to somebody who is still
              waiting for a second person. The server-side guard was right and
              the screen was quietly overriding it. Say what is actually true
              at each moment instead.
            */}
            <p className="glass p-4 text-[15px] leading-[1.6]">
              <span className="label-mono">
                {state.seats < 2 ? "Waiting" : state.phase === "breathe" ? "Breathing" : "Keeper"}
              </span>
              <br />
              {state.seats < 2
                ? "You are the first one here. The circle opens when somebody else sits down."
                : state.phase === "breathe"
                  ? "Three minutes before anybody speaks. In through the nose, longer on the way out."
                  : state.intention}
            </p>

            <ol className="mt-4 space-y-3">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "glass p-4",
                    m.kind === "witness" && "border-gold/30",
                    m.kind === "keeper_prompt" && "border-gold/60 bg-gold/5",
                  )}
                >
                  <p className="label-mono mb-1">
                    {m.kind === "keeper_prompt"
                      ? "Keeper · pattern"
                      : `${m.mine ? "You" : `Seat ${m.seat}`} · ${m.role}`}
                    {m.kind === "witness" && " · heard"}
                  </p>
                  <p className="text-[15px] leading-[1.6]">{m.content}</p>
                </li>
              ))}
            </ol>
            {state.phase === "close" && (
              <div className="glass mt-4 animate-slide-up border-gold/50 p-4">
                <p className="label-mono mb-3">Closing — where did you land?</p>

                {mood === null ? (
                  <>
                    <p className="text-[15px] leading-[1.6]">
                      You just heard your own word said back to you. Rate where
                      you are now, 1–10.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setMood(n)}
                          aria-label={`Feeling ${n} out of 10`}
                          className="h-11 w-11 rounded-full border border-line/15 text-sm font-semibold transition-colors duration-300 hover:bg-gold hover:text-ink"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {state.pressureSeeded !== null && (
                      <>
                        <p className="text-[15px] leading-[1.6]">
                          Down{" "}
                          <span className="font-semibold">
                            {tensionDrop(state.pressureSeeded, mood)} points
                          </span>{" "}
                          since you sat down.
                        </p>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line/10">
                          <div
                            className="h-full rounded-full bg-gold transition-[width] duration-1000 ease-out"
                            style={{ width: `${100 - tensionNow(mood)}%` }}
                          />
                        </div>
                        <p className="label-mono mt-2">
                          Earlier {state.pressureSeeded} · Now {tensionNow(mood)}
                        </p>
                      </>
                    )}

                    <p className="label-mono mt-5">
                      You&apos;re leaving. What do you carry?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {WORDS.map((w) => (
                        <button
                          key={`c-${w}`}
                          type="button"
                          onClick={() => setCarry(w)}
                          aria-pressed={carry === w}
                          className={cn(
                            "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
                            carry === w ? "border-gold bg-gold text-ink" : "border-line/15",
                          )}
                        >
                          {w}
                        </button>
                      ))}
                    </div>

                    <p className="label-mono mt-4">And what do you drop?</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {WORDS.filter((w) => w !== carry).map((w) => (
                        <button
                          key={`d-${w}`}
                          type="button"
                          onClick={() => {
                            setDropped(w);
                            void seal(w);
                            toast("Sealed. Nothing here is kept.", "success");
                          }}
                          aria-pressed={dropped === w}
                          className={cn(
                            "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
                            dropped === w ? "border-gold bg-gold text-ink" : "border-line/15",
                          )}
                        >
                          {w}
                        </button>
                      ))}
                    </div>

                    {dropped && (
                      <>
                        <p className="mt-4 text-[15px] leading-[1.6]">
                          You carry {carry ?? "what you came with"}. You drop{" "}
                          {dropped}. The words in this room go with it.
                        </p>
                        {quote && (
                          <figure className="mt-4 border-l-2 border-line/20 pl-3">
                            <blockquote className="text-[15px] italic leading-[1.6] text-ash">
                              {quote.text}
                            </blockquote>
                            <figcaption className="label-mono mt-1">{quote.author}</figcaption>
                          </figure>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Voice sits above the transcript, below the intention: it is a
                way of being in this room, not a feature bolted to the side. */}
            <CircleVoice
              circleId={id}
              anonId={me}
              enabled={Boolean(state.voice)}
              keeper={state.role === "keeper"}
            />

            {messages.length === 0 && (
              <p className="mt-4 text-center text-sm text-ash">
                {(state.present ?? 1) > 1
                  ? `Nobody has spoken yet. ${state.present} people are here, waiting with you.`
                  : "Nobody has spoken yet. Someone goes first."}
              </p>
            )}

            {/* The whole point of #5: silence with somebody in it reads
                differently from silence on its own. */}
            {state.typingOthers > 0 && (
              <p aria-live="polite" className="mt-4 flex items-center gap-2 text-sm text-ash">
                <span aria-hidden="true" className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ash [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ash [animation-delay:200ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ash [animation-delay:400ms]" />
                </span>
                {state.typingOthers === 1
                  ? "Someone is writing."
                  : `${state.typingOthers} people are writing.`}
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
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setReflecting(false)}
                aria-pressed={!reflecting}
                className={cn(
                  "min-h-[44px] flex-1 rounded-card border text-sm transition-colors duration-300",
                  !reflecting ? "border-gold bg-gold/15" : "border-line/15",
                )}
              >
                Share
              </button>
              <button
                type="button"
                onClick={() => setReflecting(true)}
                aria-pressed={reflecting}
                className={cn(
                  "min-h-[44px] flex-1 rounded-card border text-sm transition-colors duration-300",
                  reflecting ? "border-gold bg-gold/15" : "border-line/15",
                )}
              >
                Reflect one line
              </button>
            </div>

            <div className="flex items-end gap-2">
              <label htmlFor="circle-input" className="sr-only">
                {reflecting ? "Reflect one line" : "Your share"}
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
                  reflecting ? "One line — what you heard." : "Say the heaviest part."
                }
                maxLength={reflecting ? 140 : 900}
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
              {reflecting
                ? "One line only. What you heard — not what you'd do."
                : "No advice, no you-statements. Speak to the circle."}
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
