"use client";

import { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL } from "@/lib/vent/intent";
import * as React from "react";
import Link from "next/link";
import { anonId } from "@/lib/anon";
import { CHAIRS, tensionDrop, tensionForChair, tensionNow, CHAIR_QUESTION } from "@/lib/vent/chairs";
import { CircleVoice } from "@/components/circle-voice";
import { CircleSeats } from "@/components/circle-seats";
import { ALONE_LINE, ALONE_DOOR } from "@/lib/circles/rules";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useComposerHeight } from "@/lib/ui/use-composer-height";
import { roomName } from "@/lib/circles/naming";

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
  // `created_at` was already on the wire — the route returns the whole row —
  // and only this type was narrow. The name needs the hour it opened, and
  // deriving that from `ends_at` would misname a room opened at 4:50am.
  circle: {
    id: string;
    tag: string | null;
    status: string;
    ends_at: string;
    created_at: string;
  };
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
  mySeat: number | null;
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
  /* Which seats are speaking, from the voice room, for the ring to draw. */
  const [speakingSeats, setSpeakingSeats] = React.useState<number[]>([]);
  const endRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLElement>(null);
  // The room had the bug the chat had already fixed. See the hook.
  useComposerHeight(footerRef);
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
        <p className="font-display text-heading font-bold">That circle has closed.</p>
        <p className="mt-2 text-body text-ash">The words are already gone. That&apos;s the deal.</p>
        <Link href="/circles" className="mt-6 flex min-h-[48px] items-center rounded-card bg-gold px-6 text-body font-semibold text-on-gold">
          See open circles
        </Link>
      </main>
    );
  }

  const mins = state ? Math.max(0, Math.round(state.msRemaining / 60000)) : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/95 backdrop-blur-glass">
        {/*
          The room's name first, and one quiet line under it.

          This was four things stacked in ninety pixels: a phase word, six
          seat dots, a count, a clock, the name, a bordered KEEPER pill and a
          theme toggle. Seven pieces of chrome above a room where somebody is
          about to say the hardest thing they have said this month — and none
          of them is the thing they came for.

          Screenshotted at 4:22am by the person who built it, and the word he
          used was "jam packed". He was right, and the diagnosis worth keeping
          is the second one: it looked machine-made. Not ugly — *anxious*.
          Every fact the system knew, laid out because it knew it.

          A person designing this puts the name where a name goes and says the
          rest in one sentence. The dots are gone: six borders to say a number
          that is already written in words two characters to the right. The
          KEEPER pill loses its border and becomes what it is, a word about
          who you are here.

          Nothing is hidden. Phase, count, clock and role are all still on
          screen — they are just one line instead of a dashboard.
        */}
        <div className="mx-auto flex h-16 max-w-[640px] items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <h1 className="truncate font-display text-heading font-bold leading-tight tracking-[-0.02em]">
              {state ? roomName(state.circle.tag, state.circle.created_at) : "…"}
            </h1>
            <p className="label-mono mt-0.5 truncate leading-none">
              {state?.phaseLabel ?? "Circle"} · {state?.present ?? 0} here · {mins}m
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {state?.role && <span className="label-mono text-ash">{state.role}</span>}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/*
        Bottom room for the composer, which is `sticky bottom-0`.

        The chat learned this and the room did not: without it the tail of the
        page sits underneath the footer, and the circle drawing pushed the
        "nobody has spoken yet" line straight behind it — the sentence naming
        who is in the room, hidden by the box you talk into.

        Measured, not guessed: `--composer-h` is published by the same hook
        this file already calls, so it stays correct when the mode switch, a
        rule refusal or the crisis gate changes the footer's height.
      */}
      <main
        id="main"
        className="mx-auto w-full max-w-[640px] flex-1 px-4 pt-5 pb-[calc(var(--composer-h,180px)+24px)]"
      >
        {crisis && (
          <div className="glass mb-4 border-gold/60 p-4">
            <p className="label-mono mb-2">This isn&apos;t the room for that</p>
            <p className="text-body leading-[1.6]">
              I&apos;m really concerned about you. A circle can&apos;t hold this —
              you need a person, now.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <a href={`tel:${CRISIS_TEL}`} className="flex min-h-[44px] flex-1 items-center justify-center rounded-card bg-gold px-4 text-body font-semibold text-on-gold">
                Call {CRISIS_LINES.nigeria}
              </a>
              <a href={`tel:${EMERGENCY_TEL}`} className="flex min-h-[44px] flex-1 items-center justify-center rounded-card border border-line/20 px-4 text-body font-semibold">
                Emergency {CRISIS_LINES.emergency}
              </a>
            </div>
            <Link href="/chat" className="mt-3 block min-h-[44px] text-center text-body text-ash underline underline-offset-4">
              Take it to a private vent instead
            </Link>
          </div>
        )}

        {state && !state.joined && (
          <div className="glass p-5">
            <p className="label-mono mb-3">Before you sit</p>
            <ul className="space-y-2 text-body leading-[1.6]">
              {AGREEMENT.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="text-gold">·</span>
                  {line}
                </li>
              ))}
            </ul>
            <p className="label-mono mb-2 mt-5">{CHAIR_QUESTION}</p>
            <div className="flex flex-wrap gap-2">
              {CHAIRS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChair(c.id)}
                  aria-pressed={chair === c.id}
                  className="chip"
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label className="mt-4 flex min-h-[44px] items-center gap-3 text-body">
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
              className="mt-4 min-h-[48px] w-full rounded-card bg-gold text-body font-semibold text-on-gold disabled:opacity-40"
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
            {/*
              No plate while nobody is here.

              Waiting alone in a room, this was a bordered card saying you
              were alone, sitting directly on top of a second bordered card
              explaining the voice feature — two framed panels and a floating
              feedback pill, stacked, in a room with one person in it.

              The plate is what a *voice* speaks from here. Nobody has spoken.
              Framing the fact that the room is empty makes the emptiness into
              an object, and it is not an object, it is a condition. Left on
              the spine with air around it, it reads as waiting; on a plate it
              read as a notice about waiting, which is a machine telling you
              about a state it is in.

              The plate comes back the moment there is a voice — the Keeper's
              intention and the breathing instruction are both somebody
              speaking, and both keep it.
            */}
            {state.seats < 2 ? (
              /*
                The sentence, and the door.

                This read "the circle opens when somebody else sits down" — a
                promise, in a product whose worst shipped bug was a refusal
                that promised a turn to people whose turn could never come.
                Fourteen of the first sixteen circles had one person in them.
                It was not true fourteen times.

                ALONE_LINE says the fact without the promise. The link is the
                other half: the room never offers a door onto a 501, and read
                the other way that means when this door is shut you point at
                the one that is open — /chat needs nobody else and works now.
              */
              <div className="flex flex-col items-center gap-3">
                <p className="max-w-[38ch] text-center text-body leading-[1.7] text-ash">
                  {ALONE_LINE}
                </p>
                <Link
                  href="/chat"
                  className="focusable min-h-[44px] text-body text-ink underline underline-offset-4"
                >
                  {ALONE_DOOR}
                </Link>
              </div>
            ) : (
              <p className="glass p-4 text-body leading-[1.6]">
                <span className="label-mono">
                  {state.phase === "breathe" ? "Breathing" : "Keeper"}
                </span>
                <br />
                {state.phase === "breathe"
                  ? "Three minutes before anybody speaks. In through the nose, longer on the way out."
                  : state.intention}
              </p>
            )}

            {/* When the Closing is up, everything said recedes. Not hidden —
                still there, just no longer what the room is about. */}
            {/* More air than before. The shapes now carry the difference
                between voices, and they need room around them to do it —
                twelve pixels between an inscription and a share reads as a
                list, which is what this was. */}
            {/*
              The room's transcript on the same spine as everything else.

              The chat hangs off it, the chronicle hangs off it, the lobby
              hangs off it — and this, the one place where six people are
              actually talking, was a plain stack. Here the thread means the
              forty-five minutes: one sitting, lit where the room spoke, and
              it recedes with the rest of the transcript at the close.
            */}
            <ol className={cn("thread mt-5 space-y-6 [&>li]:pl-5", state.phase === "close" && "receding")}>
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
                      <p className="label-mono mb-3 tracking-[0.22em]">
                        Keeper · pattern
                      </p>
                      {/* `.reply`, so the Keeper and VENT are audibly the same
                          thing in two rooms. Left unplated and centred: the
                          room speaking without walls around it, which is the
                          one place that reads as more present, not less. */}
                      <p className="reply mx-auto">{m.content}</p>
                    </li>
                  );
                }

                if (m.kind === "guardian") {
                  return (
                    <li key={m.id}>
                      <div className="presence arrive p-5 sm:p-6">
                        <p className="nameplate mb-3">Guardian</p>
                        <p className="reply">{m.content}</p>
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
                      <p className="said text-body">{m.content}</p>
                    </li>
                  );
                }

                // A share — theirs on the plate, yours in the margin.
                return m.mine ? (
                  <li key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] border-r-2 border-gold/40 pr-4 text-right sm:max-w-[75%]">
                      <p className="label-mono mb-1">You · {m.role}</p>
                      <p className="said">{m.content}</p>
                    </div>
                  </li>
                ) : (
                  <li key={m.id}>
                    <div className="glass border-l-2 border-l-gold/70 p-4">
                      <p className="label-mono mb-1">
                        Seat {m.seat} · {m.role}
                      </p>
                      <p className="text-body leading-[1.6]">{m.content}</p>
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
                <p className="label-mono mb-2">Closing</p>
                <h2 className="mb-5 font-display text-heading leading-[1.2] tracking-[-0.01em]">
                  Where did you land?
                </h2>

                {mood === null ? (
                  <>
                    <p className="text-body leading-[1.6]">
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
                          className="h-11 w-11 rounded-full border border-line/15 text-body font-semibold transition-colors duration-300 hover:bg-gold hover:text-on-gold"
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
                        <p className="text-body leading-[1.6]">
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
                          className="chip"
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
                          className="chip"
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
                            <blockquote className="text-body italic leading-[1.6] text-ash">
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
              onSpeaking={setSpeakingSeats}
            />

            {/*
              A room before anybody speaks, sat where a person is looking.

              Measured at 360px in a real two-person circle: this line sat
              directly under the breathing card and then roughly eight hundred
              pixels of nothing ran down to the composer. The silence a circle
              opens with is the point — but a line pinned to the top of a void
              reads as a page that stopped loading, not as a room holding its
              breath.

              Same treatment the chat empty state got, for the same reason and
              with nothing added to fill it: the air falls on both sides of the
              sentence instead of all of it underneath.
            */}
            {/*
              Said once, by whichever line is true.

              Alone in a room, this printed "Nobody has spoken yet. Someone
              goes first." directly under "You are the first one here" — two
              sentences about the same emptiness, forty percent of the
              viewport apart, with nothing between them. The same duplicate
              readout the chat composer had when "some" appeared twice, and
              found the same way: by looking at it.

              The line above owns the case where nobody else has arrived,
              because "somebody has to go first" is not true yet — there is
              nobody to go first in front of. This owns the case where people
              are here and quiet, which is the one worth naming, because
              silence with somebody in it is the whole feeling of a circle.
            */}
            {/*
              The room, before it is a conversation.

              Gated first on being alone, which was exactly backwards: three
              people sitting in silence is when a drawing of the room says the
              most, and that was the case where it disappeared and left the
              void back where it started.

              It belongs to the silence, not to the solitude. Whoever is in
              the room, until somebody speaks, this is what the screen is
              about — five hundred pixels that were doing no work in a product
              named after the shape it was not drawing.

              Everything in it came from the server: `seatsPresent` is the
              presence window, `mySeat` is the member list. A room that draws
              a person who is not there is "your turn comes" in a nicer shape.

              It goes the moment the room starts talking. A diagram competing
              with what somebody just said is decoration, and this is only
              worth its space while the space was empty anyway.
            */}
            {messages.length === 0 && (
              /*
                The sentence above the drawing, not below it.

                Below, it was the part that fell under the sticky composer —
                two cards, a circle and a line of text is more than a 740px
                phone holds, and whatever is last is what the footer covers.
                The line naming who is in the room, hidden by the box you talk
                into.

                Padding did not fix it and should not have: the content is
                genuinely taller than the viewport and the page scrolls. What
                was wrong was the order. Words cannot be missed; a drawing can
                be scrolled to. So the sentence is the thing that is always
                visible and the room is the thing you find under it.
              */
              <div className="flex flex-col items-center gap-6 py-6">
                {(state.present ?? 1) > 1 && (
                  <p className="max-w-[34ch] text-center text-body leading-[1.7] text-ash">
                    Nobody has spoken yet. {state.present} people are here,
                    waiting with you.
                  </p>
                )}
                <CircleSeats
                  seatsPresent={state.seatsPresent}
                  maxSeats={state.maxSeats}
                  mySeat={state.mySeat}
                  speaking={speakingSeats}
                />
              </div>
            )}

            {/* The whole point of #5: silence with somebody in it reads
                differently from silence on its own. */}
            {state.typingOthers > 0 && (
              <p aria-live="polite" className="mt-4 flex items-center gap-2 text-body text-ash">
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
            {/* scroll-margin, or `block: "end"` parks this exactly where the
                sticky footer pins itself and the last thing anybody said
                renders underneath the composer. Same fix as the chat. */}
            <div
              ref={endRef}
              className="scroll-mb-[calc(var(--composer-h,180px)+16px)]"
            />
          </>
        )}
      </main>

      {state?.joined && (
        <footer ref={footerRef} className="sticky bottom-0 border-t border-line/10 bg-paper/95 backdrop-blur-glass">
          <div className="mx-auto max-w-[640px] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
            {ruleError && (
              <p role="alert" className="mb-2 rounded-card border border-gold/50 p-3 text-fine leading-relaxed">
                {ruleError}
              </p>
            )}
            {/*
              Two words, not two slabs.

              These were full-width filled pills side by side, taking a whole
              44px row above the box — a segmented control, which is a shape
              from settings screens. Under them sat the input, and under that
              a line of rules: three stacked rows of chrome before anybody
              could say anything.

              The same fix the chat composer got. What you are doing is one
              word, what you could do instead is the other, and the one you
              are not doing recedes rather than competing. It is a sentence
              about the room — "you are sharing / you are reflecting" — rather
              than a pair of buttons asking you to configure a mode.

              Both stay full 44px targets. Recession here is weight and
              colour, never hit area: this is a phone at 4am.
            */}
            <div className="mb-1.5 flex items-center gap-4">
              {([false, true] as const).map((mode) => (
                <button
                  key={String(mode)}
                  type="button"
                  onClick={() => setReflecting(mode)}
                  aria-pressed={reflecting === mode}
                  className={cn(
                    "label-mono flex min-h-[44px] items-center underline-offset-[6px] transition-colors duration-300",
                    reflecting === mode
                      ? "text-ink underline decoration-gold"
                      : "text-ash hover:text-ink",
                  )}
                >
                  {mode ? "Reflect" : "Share"}
                </button>
              ))}
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
                /*
                  The name has to be the word on the button.

                  This said `aria-label="Send"` over a button that reads
                  "Say". Screen readers announce "Send"; voice control users
                  saying "click Say" hit nothing, because the accessible name
                  never contains the visible label — WCAG 2.5.3, and a real
                  dead end for somebody driving a phone by voice, which is not
                  a rare way to use an app you are crying into.

                  Kept as a label rather than deleted because the visible text
                  becomes "…" while a share is in flight, and "…" is not a
                  name. This way the name is stable and it is the right word.
                */
                aria-label="Say"
                className="flex h-12 min-w-[64px] items-center justify-center rounded-card bg-gold px-4 text-body font-semibold text-on-gold disabled:opacity-40"
              >
                {busy ? "…" : "Say"}
              </button>
            </div>
            {/*
              The rule, once, at the size of a rule.

              "No advice, no you-statements. Speak to the circle." sat under
              the box at the same weight as everything else, on every render,
              to somebody who had not broken it yet. A room that opens by
              listing what you must not do is a room you behave in rather than
              speak in — and the rule is enforced on the server anyway, with a
              refusal written to teach when it actually fires.

              So it is quieter and shorter. `ruleError` above is where this
              subject belongs when it is real; this is only the reminder.
            */}
            <p className="mt-2 text-label leading-snug text-ash/80">
              {reflecting
                ? "One line — what you heard, not what you'd do."
                : "No advice. Speak to the circle."}
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
