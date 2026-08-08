"use client";

import { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL } from "@/lib/vent/intent";
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
   * said.
   *
   * Record the close, and say which of the two promises actually held.
   *
   * This swallowed everything — no `res.ok` check, a bare catch, and a
   * comment reasoning that "the seal already happened on their screen". It
   * had not. The caller then fired "Sealed. Nothing here is kept." without
   * awaiting this at all, so a 500 produced a success toast.
   *
   * Two separate promises live in that one sentence, and only one of them
   * depends on this request:
   *
   *   "Sealed"               your close was recorded. Needs this to succeed.
   *   "Nothing here is kept" the transcript is deleted on close by
   *                          sweepIfOver, server-side, whichever request
   *                          notices the transition first. True either way.
   *
   * So a failure here loses the mood and the carry/drop, and confidentiality
   * still holds. Saying both at once made a real guarantee share a fate with
   * one that had just failed.
   */
  async function seal(drop: string): Promise<boolean> {
    if (mood === null) return false;
    try {
      const r = await fetch(`/api/circles/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: me, mood, carry, drop }),
      });
      return r.ok;
    } catch {
      return false;
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
      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/92 backdrop-blur-glass">
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
              <a href={`tel:${CRISIS_TEL}`} className="flex min-h-[44px] flex-1 items-center justify-center rounded-card bg-gold px-4 text-sm font-semibold text-ink">
                Call {CRISIS_LINES.nigeria}
              </a>
              <a href={`tel:${EMERGENCY_TEL}`} className="flex min-h-[44px] flex-1 items-center justify-center rounded-card border border-line/20 px-4 text-sm font-semibold">
                Emergency {CRISIS_LINES.emergency}
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

            {/* When the Closing is up, everything said recedes. Not hidden —
                still there, just no longer what the room is about. */}
            {/* More air than before. The shapes now carry the difference
                between voices, and they need room around them to do it —
                twelve pixels between an inscription and a share reads as a
                list, which is what this was. */}
            <ol className={cn("mt-4 space-y-5", state.phase === "close" && "receding")}>
              {/*
                Four kinds of speech, four shapes.

                Every line in here was the same plate, separated by border
                tints at thirty and sixty percent. In a room of six anonymous
                strangers the single most important thing to know at a glance
                is which of these is mine — and mine looked exactly like a
                stranger's. The guardian had no treatment at all.

                  Keeper    the room itself, not a person. No plate, centred,
                            display face, letterspaced. An inscription.
                  You       right, off the spine, no plate — the same shape
                            your words take in /chat, so "you" reads the same
                            everywhere in the product.
                  Someone   the plate, left, seat number.
                  Witness   an echo, not a statement. Quieter than a share,
                            indented behind a gold mark.
                  Guardian  unmistakable, never alarming.

                The label line still names the speaker in every case, so none
                of this is load-bearing for a screen reader.
              */}
              {messages.map((m) => {
                if (m.kind === "keeper_prompt") {
                  return (
                    <li key={m.id} className="py-4 text-center">
                      <p className="label-mono mb-2 text-gold">Keeper · pattern</p>
                      <p className="mx-auto max-w-[46ch] font-display text-[17px] leading-[1.55] tracking-[0.01em]">
                        {m.content}
                      </p>
                    </li>
                  );
                }

                if (m.kind === "guardian") {
                  return (
                    <li key={m.id}>
                      <div className="rounded-card border border-gold/45 bg-gold/5 p-4">
                        <p className="label-mono mb-1 text-gold">Guardian</p>
                        <p className="text-[15px] leading-[1.6]">{m.content}</p>
                      </div>
                    </li>
                  );
                }

                if (m.kind === "witness") {
                  return (
                    <li key={m.id} className="border-l-2 border-gold/30 pl-4">
                      <p className="label-mono mb-1">
                        {m.mine ? "You" : `Seat ${m.seat}`} · heard
                      </p>
                      <p className="text-[14px] leading-[1.6] text-ink/70">{m.content}</p>
                    </li>
                  );
                }

                // A share — theirs on the plate, yours in the margin.
                return m.mine ? (
                  <li key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] border-r-2 border-gold/40 pr-4 text-right sm:max-w-[75%]">
                      <p className="label-mono mb-1">You · {m.role}</p>
                      <p className="text-[15px] leading-[1.6] text-ink/70">{m.content}</p>
                    </div>
                  </li>
                ) : (
                  <li key={m.id}>
                    <div className="glass border-l-2 border-l-gold/70 p-4">
                      <p className="label-mono mb-1">
                        Seat {m.seat} · {m.role}
                      </p>
                      <p className="text-[15px] leading-[1.6]">{m.content}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {state.phase === "close" && (
              <div className="glass closing mt-6 border-gold/50 p-6 sm:p-8">
                {/*
                  The one screen that earns display type.

                  This is the moment the circle exists for, and it was
                  announced in `label-mono` — the same 12px uppercase as
                  "Tension" and "Presence". A system label for the thing the
                  whole hour was building toward. `CLAUDE.md` already made this
                  arrive slower than everything else and dimmed the room behind
                  it; the words themselves were still furniture.
                */}
                <p className="label-mono mb-2 text-gold">Closing</p>
                <h2 className="mb-5 font-display text-[24px] leading-[1.2] tracking-[-0.01em]">
                  Where did you land?
                </h2>

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
                        {/* scaleX, not width — same reason as the breathing
                            circle. Animating width is layout on every frame,
                            and this bar runs for a full second on the screen
                            somebody is watching most closely. */}
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line/10">
                          <div
                            className="h-full w-full origin-left rounded-full bg-gold transition-transform duration-1000 ease-out"
                            style={{
                              transform: `scaleX(${(100 - tensionNow(mood)) / 100})`,
                            }}
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
                            void seal(w).then((sealed) =>
                              toast(
                                sealed
                                  ? "Sealed. Nothing here is kept."
                                  : "Your close didn't reach us. The room still ends and the transcript still goes.",
                                sealed ? "success" : "info",
                              ),
                            );
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
                        {/* The sentence somebody leaves with. It was set at
                            the same size as a form label. */}
                        <p className="reply mt-6">
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
        <footer className="sticky bottom-0 border-t border-line/10 bg-paper/95 backdrop-blur-glass">
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
