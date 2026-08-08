"use client";

import { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL } from "@/lib/vent/intent";
import * as React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { FeedbackFab } from "@/components/feedback-fab";
import { Onboarding, hasOnboarded, type OnboardingResult } from "@/components/onboarding";
import { Breathing, Journaling, ToolRow, shouldOfferBreathing } from "@/components/tools";
import { anonId, queueVent } from "@/lib/anon";
import { cn } from "@/lib/utils";

type Body = "head" | "throat" | "chest";

interface Line {
  id: number;
  speaker: "you" | "vent";
  text: string;
  crisis?: boolean;
}

interface VentResponse {
  intent: "vent" | "factual" | "greeting" | "meta" | "crisis";
  reply: string;
  tactic?: string | null;
  realWorldTag?: string | null;
  grounding?: { date: string; time: string };
  crisis?: { nigeria: string; emergency: string };
  memoryUsed?: number;
  tokensSpent?: boolean;
  persisted?: boolean;
  /** Why the model did not answer, when it did not. Shown, not swallowed. */
  reason?: string;
  detail?: string | null;
}

export function VentChat() {
  const { toast } = useToast();
  const [lines, setLines] = React.useState<Line[]>([]);
  const [draft, setDraft] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [pressure, setPressure] = React.useState(50);
  const [body, setBody] = React.useState<Body | null>(null);
  const [mood, setMood] = React.useState<number | null>(null);
  const [askMood, setAskMood] = React.useState(false);
  const [tensionBefore, setTensionBefore] = React.useState<number | null>(null);
  const [tensionAfter, setTensionAfter] = React.useState<number | null>(null);
  const [crisis, setCrisis] = React.useState<VentResponse["crisis"] | null>(null);
  const [gated, setGated] = React.useState(false);
  const [memoryCount, setMemoryCount] = React.useState(0);
  const [persisted, setPersisted] = React.useState<boolean | null>(null);
  const [tag, setTag] = React.useState<string | null>(null);
  const [tool, setTool] = React.useState<"breathing" | "journaling" | null>(null);
  const [showOnboarding, setShowOnboarding] = React.useState(false);

  React.useEffect(() => {
    if (!hasOnboarded()) setShowOnboarding(true);
  }, []);

  function completeOnboarding(r: OnboardingResult) {
    setShowOnboarding(false);
    // The chair is their opening tension reading — the drop is measured from it.
    setPressure(r.tension);
    setTensionBefore(r.tension);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const nextId = React.useRef(0);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const footerRef = React.useRef<HTMLElement>(null);

  /**
   * Publish the composer's real height, so nothing has to guess it.
   *
   * The feedback button was pinned 232px from the bottom — a number somebody
   * measured once. At 360px the disclaimer wraps to three lines and the
   * footer is taller than that, so the button sat on top of the CHEST
   * control: the thing you tap to say where it hurts, covered by a survey.
   *
   * A ResizeObserver rather than a one-off measurement, because this footer
   * changes height on its own — the textarea grows to 32 lines, the crisis
   * gate appears, the disclaimer rewraps on rotation.
   */
  React.useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty("--composer-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--composer-h");
    };
  }, []);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, thinking, askMood]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || thinking || gated) return;

    setLines((l) => [...l, { id: nextId.current++, speaker: "you", text: message }]);
    setDraft("");
    setThinking(true);
    setAskMood(false);

    try {
      const res = await fetch("/api/vent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          anonId: anonId(),
          message,
          pressure,
          bodyTapped: body,
          mood,
        }),
      });

      const data: VentResponse & { error?: string } = await res.json();

      if (res.status === 429) {
        toast(data.reply ?? "Slow down small.", "info");
        return;
      }
      if (!res.ok && !data.reply) throw new Error(data.error ?? `HTTP ${res.status}`);

      // When the model does not answer, the reply alone names one cause out of
      // four and the real one is only in the JSON. Days were lost reading
      // "Network dipped" as a network problem. If the server said why, show it.
      const why =
        !res.ok && data.reason
          ? `\n\n[${data.reason}${data.detail ? ` — ${data.detail}` : ""}]`
          : "";

      setLines((l) => [
        ...l,
        {
          id: nextId.current++,
          speaker: "vent",
          text: data.reply + why,
          crisis: data.intent === "crisis",
        },
      ]);

      if (data.intent === "crisis") {
        setCrisis(data.crisis ?? CRISIS_LINES);
        setGated(true);
      } else if (data.intent === "vent") {
        // Only a real vent earns the mood check — greetings don't.
        if (tensionBefore === null) setTensionBefore(pressure);
        setAskMood(true);
      }

      setTag(data.realWorldTag ?? null);
      if (typeof data.memoryUsed === "number") setMemoryCount(data.memoryUsed);
      if (typeof data.persisted === "boolean") setPersisted(data.persisted);
    } catch {
      // Offline: hold it locally rather than losing what they just said.
      queueVent({
        message,
        pressure,
        bodyTapped: body,
        queuedAt: new Date().toISOString(),
      });
      setLines((l) => [
        ...l,
        {
          id: nextId.current++,
          speaker: "vent",
          text: "You're offline — your truth still saved locally. It goes up the moment you're back.",
        },
      ]);
      toast("Saved offline.", "info");
    } finally {
      setThinking(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function submitMood(value: number) {
    setMood(value);
    setAskMood(false);
    // Shown immediately — the drop is theirs to see whether or not a database
    // agrees. Only the *claim* about saving waits for the server.
    const after = Math.round((10 - value) * 10);
    setTensionAfter(after);

    /*
      Whether the card below is about to speak for this.

      A screenshot of the moment: the drop card rendering "35 points lighter
      than when you sat down", and a toast parked across its last line saying
      "Anchored." Two confirmations of one event, the smaller one covering
      part of the larger, and the smaller one is the app talking about its
      own database at the single moment this product has something to say
      about the person.

      So the card gets the moment when there is a card. The toast is kept for
      the two cases where nothing else will speak: a rating that produced no
      drop to show, and a write that did not land — that one always speaks,
      even over the card, because it is the only place they would learn it.
    */
    const cardWillSpeak = tensionBefore !== null && tensionBefore - after > 0;

    // This said "Saved. That's the anchor." and made no request at all. The
    // rating lived in React state and died with the tab, which is why
    // production reported zero anchored sessions and the efficacy loop had
    // nothing to learn from.
    try {
      const res = await fetch("/api/vent", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: anonId(), mood: value }),
      });
      const d = await res.json();
      if (!d.anchored) toast("Noted here — not saved.", "info");
      else if (!cardWillSpeak) toast("Anchored.", "success");
    } catch {
      toast("Noted here — not saved.", "info");
    }
  }

  const drop =
    tensionBefore !== null && tensionAfter !== null ? tensionBefore - tensionAfter : null;

  return (
    <div className="flex min-h-dvh flex-col">
      {showOnboarding && <Onboarding onDone={completeOnboarding} />}
      <FeedbackFab />

      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/92 backdrop-blur-glass">
        <div className="mx-auto flex h-16 max-w-[640px] items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            {/* nowrap: at 360px this wrapped to two lines and shoved the
                title down, because the nav takes the rest of the row. */}
            <p className="label-mono whitespace-nowrap leading-none">Mind Weave</p>
            <h1 className="truncate font-display text-2xl font-bold leading-tight tracking-[-0.02em]">
              VENT
            </h1>
          </div>
          {/*
            Three doors, visible on a phone.

            These were pill buttons, and two of the three were `sm:` hidden —
            so on the device almost everybody here is holding, History and
            Memory did not exist. The most distinctive thing in the product and
            the page where you take your words back, both unreachable from the
            screen you actually sit on.

            The pill chrome was what ate the width: borders and 16px of padding
            each, three times over, at 360px. Dropping to plain text fits all
            three with room to spare — and reads better anyway. A door in a
            quiet room is a word on a wall, not a button.
          */}
          <nav aria-label="Sections" className="flex items-center gap-3 sm:gap-4">
            {[
              ["/circles", "Circles"],
              ["/history", "History"],
              ["/memory", "Memory"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="label-mono flex h-11 items-center text-ink/70 underline-offset-[6px] transition-colors duration-300 hover:text-ink hover:underline hover:decoration-gold"
              >
                {label}
              </Link>
            ))}
            <ThemeToggle />
          </nav>
        </div>

        {/*
          Two separate facts, and they were one line.

          "not saved yet" was nested inside `memoryCount > 0`, so it could only
          ever appear to somebody who already had history. A first-time user
          whose very first message failed to persist saw nothing at all — no
          mark, no notice, their words quietly dropped — and they are the
          person it matters most to, because they have no reason yet to doubt
          any of this.

          That is "I've saved it, word for word" wearing a new coat: the app
          failing to keep a promise, invisibly, to the person least able to
          tell. It is the oldest bug in this repo and it was still here.

          Stated calmly rather than as an alarm. Nothing is broken from where
          they sit — the session works, the reply is real — and the only thing
          that is not true is the part about it still being here tomorrow.
        */}
        {(memoryCount > 0 || persisted === false) && (
          <div className="mx-auto flex max-w-[640px] flex-wrap items-center gap-x-2 px-4 pb-3">
            {memoryCount > 0 && (
              <p className="label-mono">
                Remembers · {memoryCount} earlier{" "}
                {memoryCount === 1 ? "carve" : "carves"}
              </p>
            )}
            {persisted === false && (
              <p className="label-mono text-gold">
                Not saved — this session only
              </p>
            )}
          </div>
        )}
      </header>

      {/* pb, not py: the feedback pill floats 12px above the composer and is
          44px tall, so the last 56px of any transcript sits under it at full
          scroll. Empty space there instead of the end of somebody's sentence. */}
      <main id="main" className="mx-auto w-full max-w-[640px] flex-1 px-4 pt-6 pb-[92px]">
        {/*
          An empty room should look empty.

          This was a centred glass card — the same plate VENT's replies sit on,
          so the greeting read as an answer to something nobody had said, and
          the only centred element in a product that is otherwise all one
          margin. Bold display at xl fought the VENT in the header for the
          same job.

          No plate now. Left, on the spine everything else uses, with air above
          it. The room is waiting; that should feel like waiting rather than
          like a notice.

          And the second line does the one thing that actually helps somebody
          who cannot start. The barrier is almost never courage — it is the
          belief that this has to be composed first. So: it does not have to be
          tidy, or finished, or true yet. Start in the middle. That sentence
          costs nothing and is the difference between typing and closing the
          tab.
        */}
        {lines.length === 0 && !thinking && (
          <div className="py-6">
            <p className="font-display text-[22px] leading-[1.3] tracking-[-0.01em]">
              Come in. Say small. Hear plenty.
            </p>
            <p className="mt-3 max-w-[48ch] text-[15px] leading-[1.7] text-ash">
              Nobody reads this but you and the machine. It does not have to be
              tidy, or finished, or even true yet — start in the middle if that
              is where you are.
            </p>
          </div>
        )}

        {/*
          Two voices, built differently — not two bubbles in two colours.

          They were the same plate: `glass` both sides, separated by a border
          at thirty percent opacity. Which is to say they were the same, and
          reading back a session you could not tell at a glance who had
          spoken. A chat app solves this with a blue bubble and a grey one.
          This is not a chat app; it is a transcript of a session, and the two
          voices in a session are not symmetrical.

          What you said is already out of you. It is handed over — so it sits
          to the right, off the spine, narrower, lighter, with no plate under
          it at all. Something written in the margin.

          What the room says back is the thing you sit with. It keeps the
          plate, the full measure, the slow leading, and a gold spine down its
          left edge — one vertical line, the only ornament on the screen, so
          the eye knows where the answer starts before it reads a word.

          The asymmetry is the whole design. Restraint on one side, weight on
          the other, and silence in between.
        */}
        <ol className="space-y-6">
          {lines.map((line) =>
            line.speaker === "you" ? (
              <li key={line.id} className="settle flex justify-end">
                <div className="max-w-[85%] border-r-2 border-gold/40 pr-4 text-right sm:max-w-[75%]">
                  <p className="label-mono mb-1.5">You</p>
                  {/* Their words, exactly as typed — line breaks and all. */}
                  <p className="whitespace-pre-wrap text-[15px] leading-[1.65] text-ink/70">
                    {line.text}
                  </p>
                </div>
              </li>
            ) : (
              <li key={line.id}>
                <div
                  className={cn(
                    "glass settle border-l-2 border-l-gold p-5 sm:p-6",
                    line.crisis && "border-gold/60 border-l-gold",
                  )}
                >
                  <p className="label-mono mb-3">Vent</p>
                  <p className="reply whitespace-pre-wrap">{line.text}</p>
                </div>
              </li>
            ),
          )}

          {thinking && (
            <li>
              <div className="glass border-l-2 border-l-gold/50 p-5">
                <p className="label-mono mb-2">Vent</p>
                <p aria-live="polite" className="text-sm text-ash">
                  Thinking<span className="animate-pulse">…</span>
                </p>
              </div>
            </li>
          )}
        </ol>

        {/* Crisis gate — soft, never alarming, and it stops the session. */}
        {crisis && (
          <div className="glass mt-4 border-gold/60 p-4">
            <p className="label-mono mb-3">You are not alone</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={`tel:${crisis.nigeria.replace(/\s/g, "")}`}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-card bg-gold px-4 text-sm font-semibold text-ink"
              >
                Call {crisis.nigeria}
              </a>
              <a
                href={`tel:${crisis.emergency}`}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-card border border-line/20 px-4 text-sm font-semibold"
              >
                Emergency {crisis.emergency}
              </a>
            </div>
            <button
              type="button"
              onClick={() => {
                setGated(false);
                setCrisis(null);
              }}
              className="mt-3 min-h-[44px] w-full text-sm text-ash underline underline-offset-4"
            >
              I am safe now — continue venting
            </button>
          </div>
        )}

        {/* Mood check, asked inside the flow rather than as a popup. */}
        {/*
          The closing question, asked the way the room asks things.

          It read "How are you feeling now? 1–10" over ten identical circles —
          a survey, in the middle of a session. Production says `anchored: 0`:
          people were answering the vent and skipping this, which means the
          one outcome this product claims was going unmeasured on every
          session that happened.

          Three things were wrong. It never said why it was asking, so it read
          as data collection by a company. "How are you feeling" is the exact
          phrase `VOICE` forbids the model from using, printed by the
          interface instead. And ten unlabelled circles is a lottery ticket —
          nothing tells you which end is which, so 6 and 4 are a coin toss.

          Now: it says what it is for in one clause, it asks where the weight
          went rather than how they feel, and the row is anchored at both ends
          so a number means something. The skip stays, plainly — a person who
          does not want to be measured tonight must not be held for it, and
          a forced rating is a worse number than no number.
        */}
        {askMood && (
          <div className="mt-6 border-l-2 border-gold pl-5">
            <p className="label-mono mb-2">Before you go</p>
            <p className="max-w-[42ch] text-[15px] leading-[1.7]">
              Where did the weight land? Not how the day was — just this, now,
              against how you came in.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => submitMood(n)}
                  aria-label={`${n} out of 10, where 1 is heaviest`}
                  className="tabular h-11 w-11 rounded-full border border-line/15 text-sm font-semibold transition-colors duration-300 hover:border-gold hover:bg-gold hover:text-ink"
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="label-mono mt-2 flex justify-between max-w-[26rem]">
              <span>1 · still heavy</span>
              <span>10 · lighter</span>
            </p>
          </div>
        )}

        {/*
          Tools appear when the moment calls for them — which is not the same
          as "after they have spoken", and that is what this said.

          `lines.length > 0` meant somebody could arrive, drag the pressure
          slider to ninety, tap "chest", and be offered nothing at all until
          they managed a sentence. The person who cannot find words yet is
          precisely the person the 4·2·6 is for. Sixty seconds of breathing is
          often what makes the first sentence possible.

          The condition is gone rather than widened: `ToolRow` already returns
          null when there is neither a breathing reason nor a journal prompt,
          so it was the second opinion on a question it was better placed to
          answer. Fresh load at pressure 50 with no body named still shows
          nothing, because nothing has been signalled.
        */}
        {!thinking && !gated && tool === null && (
          <ToolRow
            showBreathing={shouldOfferBreathing(tag, pressure, body)}
            tag={tag}
            onBreathe={() => setTool("breathing")}
            onJournal={() => setTool("journaling")}
          />
        )}

        {tool === "breathing" && <Breathing onClose={() => setTool(null)} />}

        {tool === "journaling" && tag && (
          <Journaling
            tag={tag}
            onClose={() => setTool(null)}
            onSubmit={(text) => {
              setTool(null);
              void send(text);
            }}
          />
        )}

        {/*
          The one moment in this product that has earned an arrival.

          Everything else here is deliberately quiet, and it should be — a room
          that shouts at somebody mid-sentence is a room they leave. But
          restraint applied everywhere flattens the one place a person actually
          gets something back. This is the payoff: they walked in carrying a
          number and they are walking out carrying a smaller one, and it was
          read as "How your stress is dropping" in 14px grey.

          A number that large is not decoration. It is the only evidence this
          product produces that any of it worked, and it should land like
          evidence. `.closing` is borrowed from the circle — 900ms, slow enough
          that the eye waits for it — because this is the private version of
          the same moment.
        */}
        {drop !== null && drop > 0 && (
          <div className="glass closing mt-6 border-l-2 border-l-gold p-5 sm:p-6">
            <p className="label-mono mb-3">What you put down</p>
            <p className="flex items-baseline gap-3">
              <span className="tabular font-display text-[56px] font-bold leading-[0.9] tracking-[-0.03em]">
                {drop}
              </span>
              <span className="text-[15px] leading-[1.5] text-ash">
                points lighter
                <br />
                than when you sat down
              </span>
            </p>
            {/* scaleX, not width. Animating width is layout on every frame,
                and this is the one number in the product that is a claim about
                whether any of it worked — it should not stutter on the phone
                it is being read on. */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line/10">
              <div
                className="h-full w-full origin-left rounded-full bg-gold transition-transform duration-1000 ease-out"
                style={{
                  transform: `scaleX(${(100 - (tensionAfter ?? 0)) / 100})`,
                }}
              />
            </div>
            {/* The journey, not a row of stats. Two readings and the
                distance between them, in their order. */}
            <p className="label-mono mt-3">
              Came in at {tensionBefore} · leaving at {tensionAfter}
            </p>
          </div>
        )}

        {/*
          The scroll sentinel, and why it carries a margin.

          `scrollIntoView({block: "end"})` puts this element's bottom edge at
          the bottom of the viewport. The footer is `sticky bottom-0`, so at
          any scroll position short of the document's end it pins itself over
          exactly that spot — which means the auto-scroll after every reply
          landed the tail of the conversation *underneath the composer*, every
          single time, by construction.

          A screenshot of one ordinary session is what showed it: "Before you
          go" — the closing question — rendering half-eaten by the composer's
          top edge. Production reports `anchored: 0`, and I had been reading
          that as a copy problem and rewriting the question. The question was
          fine. Almost nobody was ever shown it.

          `scroll-margin-bottom` is the mechanism for this: the browser scrolls
          as though this element extended that much further down, so it comes
          to rest at the composer's top edge instead of behind it. The extra
          68px clears the feedback pill floating above the footer, and the
          matching `pb` on `<main>` gives the document the room to do it.
        */}
        <div
          ref={endRef}
          className="scroll-mb-[calc(var(--composer-h,232px)+68px)]"
        />
      </main>

      <footer ref={footerRef} className="sticky bottom-0 border-t border-line/10 bg-paper/95 backdrop-blur-glass">
        <div className="mx-auto max-w-[640px] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          {/* Where it sits + how tight. Both feed the tactic choice. */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["head", "throat", "chest"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBody(body === b ? null : b)}
                aria-pressed={body === b}
                className={cn(
                  "min-h-[44px] rounded-full border px-4 text-xs font-mono uppercase tracking-[0.1em] transition-colors duration-300",
                  body === b
                    ? "border-gold bg-gold text-ink"
                    : "border-line/15 text-ash",
                )}
              >
                {b}
              </button>
            ))}
            {/* "Mid" sat immediately right of HEAD / THROAT / CHEST and read
                as a fourth body part — and MID is a real somatic region in
                `lib/vent/scan.ts`, so the collision was not only visual. It
                is the pressure reading, so it says a pressure word. */}
            <label className="ml-auto flex min-w-[140px] flex-1 items-center gap-2">
              <span className="label-mono shrink-0">
                {pressure > 66 ? "Tight" : pressure > 33 ? "Some" : "Loose"}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={pressure}
                onChange={(e) => setPressure(Number(e.target.value))}
                aria-label="Pressure, 0 loose to 100 tight"
                // The track reads as weight, not as a form control. See
                // input[type="range"] in globals.css.
                style={{ "--fill": `${pressure}%` } as React.CSSProperties}
                className="h-2 w-full accent-gold"
              />
            </label>
          </div>

          <div className="flex items-end gap-2">
            <label htmlFor="vent-input" className="sr-only">
              Carve your truth
            </label>
            <textarea
              id="vent-input"
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  (e.key === "Enter" && !e.shiftKey) ||
                  (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                ) {
                  e.preventDefault();
                  void send(draft);
                }
                if (e.key === "Escape") setDraft("");
              }}
              placeholder="Carve your truth…"
              disabled={gated}
              className="max-h-32 min-h-[48px] flex-1 resize-none rounded-card border border-line/15 bg-card/60 px-4 py-3 leading-[1.6] shadow-glass-sm backdrop-blur-glass placeholder:text-ash disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void send(draft)}
              disabled={!draft.trim() || thinking || gated}
              aria-label="Send"
              className="flex h-12 min-w-[64px] items-center justify-center rounded-card bg-gold px-4 text-sm font-semibold text-ink transition-opacity duration-300 disabled:opacity-40"
            >
              {thinking ? "…" : "Send"}
            </button>
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-ash">
            Mind Weave is not a licensed therapist. VENT is for emotional
            support only, not medical advice. In crisis, call Nigeria{" "}
            <a href={`tel:${CRISIS_TEL}`} className="underline underline-offset-2">
              {CRISIS_LINES.nigeria}
            </a>{" "}
            or emergency{" "}
            <a href={`tel:${EMERGENCY_TEL}`} className="underline underline-offset-2">
              {CRISIS_LINES.emergency}
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
