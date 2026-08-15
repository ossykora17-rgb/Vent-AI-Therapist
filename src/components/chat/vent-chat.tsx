"use client";

import { CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { Disclaimer } from "@/components/disclaimer";
import * as React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { FeedbackFab } from "@/components/feedback-fab";
import { Onboarding, hasOnboarded, type OnboardingResult } from "@/components/onboarding";
import { Breathing, Journaling, ToolRow, shouldOfferBreathing } from "@/components/tools";
import { anonId, queueVent } from "@/lib/anon";
import { cn } from "@/lib/utils";
import { carryingWord } from "@/lib/community/carrying";
import { useComposerHeight } from "@/lib/ui/use-composer-height";

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
  /**
   * A real open circle, assembled server-side from rows it actually read.
   * Never prose: a model told that circles exist can invent one, and arriving
   * at a room that was never there is worse than never being offered it.
   */
  circleInvite?: {
    id: string;
    tag: string | null;
    seatsOpen: number;
    minutesLeft: number;
  } | null;
  /**
   * One heavy question the server chose, or nothing.
   *
   * Chosen there and never here. `canOpen` refuses on a crisis turn, on the
   * unfixable, to a stranger and off-cadence — and a screen that picked its
   * own question would be a screen that can ask somebody whose father is
   * dying who they are pretending to be. The wording comes down with it so
   * this file imports nothing from the room's module.
   */
  breaking?: {
    id: string;
    text: string;
    lines: {
      invite: string;
      waiting: string;
      received: string;
      declined: string;
      unsaved: string;
    };
  } | null;
}

type BreakingOffer = NonNullable<VentResponse["breaking"]>;

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
  const [invite, setInvite] = React.useState<VentResponse["circleInvite"]>(null);
  /* Thanksgiving: asked on the way out, every seventh anchored sitting. */
  const [askHeld, setAskHeld] = React.useState(false);
  const [heldDraft, setHeldDraft] = React.useState("");
  const [heldSaving, setHeldSaving] = React.useState(false);
  /*
    The Breaking Room, in three states and no more.

    `offer`     the server chose a question and is asking permission
    `answering` they said yes, and the composer now belongs to that question
    `shut`      they said no, and nothing asks again this sitting

    `shut` is per-sitting and lives in state rather than in localStorage,
    deliberately. A no tonight is a no tonight — carrying it forward for weeks
    would quietly retire the whole room on the strength of one bad evening,
    which is the opposite of what a no means. The server's own cadence is what
    stops it becoming a nag across sessions.
  */
  const [offer, setOffer] = React.useState<BreakingOffer | null>(null);
  const [answering, setAnswering] = React.useState<BreakingOffer | null>(null);
  const [shut, setShut] = React.useState(false);
  const [opening, setOpening] = React.useState<{
    object: string | null;
    carrying: string | null;
    putDown: string | null;
  } | null>(null);

  React.useEffect(() => {
    if (!hasOnboarded()) setShowOnboarding(true);
  }, []);

  function completeOnboarding(r: OnboardingResult) {
    setShowOnboarding(false);
    // The chair is their opening tension reading — the drop is measured from it.
    setPressure(r.tension);
    setTensionBefore(r.tension);

    /*
      The other three answers, which used to end here.

      This function read `r.tension` and let `object`, `carry` and `drop` fall
      out of scope — so a person picked the shape of the thing, named what
      they were carrying and what they came to put down, and the room opened
      as though nobody had spoken. Thirty seconds of the least-defended things
      anybody says here, collected and discarded in the same breath.

      Held in state, not in localStorage, and that is deliberate. It is true
      for this sitting. A word somebody tapped three weeks ago is not what
      they are carrying tonight, and asserting it would be the same class of
      wrong as a stale exchange rate: better to know nothing than to state
      something that has quietly stopped being true.
    */
    setOpening({ object: r.object, carrying: r.carry, putDown: r.drop });

    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const nextId = React.useRef(0);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const footerRef = React.useRef<HTMLElement>(null);

  // One implementation, shared with the circle room — see the hook.
  useComposerHeight(footerRef);

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
          openingObject: opening?.object ?? null,
          openingCarrying: opening?.carrying ?? null,
          openingPutDown: opening?.putDown ?? null,
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
      // Null clears it. A room that has filled or closed since the last turn
      // must stop being offered — an invitation to a full circle is the
      // "your turn comes" bug wearing a doorway.
      setInvite(data.circleInvite ?? null);
      // Same rule, and one more on top of it: a no ends the asking for this
      // sitting, whatever the server offers next.
      setOffer(shut ? null : data.breaking ?? null);
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
      Every seventh anchored sitting, and only then.

      Weekly-ish for somebody who comes most days, rare for somebody who comes
      once. Asking every time turns a question into a form field, and the one
      thing that would kill this is it becoming something to get past.
    */
    if (memoryCount > 0 && (memoryCount + 1) % 7 === 0) setAskHeld(true);

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

    /*
      The carve, fired and forgotten.

      Rating the mood is the one unambiguous "this session is over" signal
      this product gets, and it is the only moment there is something whole
      enough to compress. Its own request rather than part of the PATCH
      above, because that one is a person tapping a number and watching for
      the drop — a model call hung off it would put five seconds between the
      tap and the answer.

      Deliberately unawaited and deliberately silent. Nothing on this screen
      changes whether it succeeds or fails, nobody is told it happened, and
      the server refuses it outright below three exchanges or anywhere near a
      crisis turn. A carve that never happens costs nothing; a carve
      announced would be the product promising to remember, which is the one
      thing `WHAT YOU NEVER PROMISE` forbids.
    */
    void fetch("/api/carve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anonId: anonId() }),
    }).catch(() => {});
  }

  const drop =
    tensionBefore !== null && tensionAfter !== null ? tensionBefore - tensionAfter : null;

  /*
    What held — the counterweight to the carve, and the only thing in this
    product safe to quote back at somebody later, because they wrote it on
    purpose while they were alright.

    Asked after the mood, never instead of it: the mood is the measurement and
    this is the question, and putting a text box in front of the slider would
    cost the measurement for a sentence somebody can always skip.

    Deliberately not "what did VENT do for you". A product asking what it did
    for you is fishing, and the answer belongs to their week, not to us.

    No religion in it, in either direction. This has to land the same for a
    Muslim, a Christian, a traditionalist and somebody who thinks all of it is
    nonsense — so: what held. Everybody has an answer to that and nobody is
    being addressed in somebody else's language.
  */
  async function submitHeld() {
    const text = heldDraft.trim();
    if (!text || heldSaving) return;
    setHeldSaving(true);
    try {
      const res = await fetch("/api/held", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonId: anonId(), text }),
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      // Waited for the answer, and read it. "Kept" is never said on the
      // strength of having asked.
      if (data?.crisis) {
        setCrisis(CRISIS_LINES);
        setGated(true);
        setAskHeld(false);
        return;
      }
      if (data?.saved) {
        toast("Kept.", "success");
        setAskHeld(false);
        setHeldDraft("");
      } else {
        toast("Could not keep that one. Nothing else changed.", "info");
      }
    } catch {
      toast("Could not keep that one. Nothing else changed.", "info");
    } finally {
      setHeldSaving(false);
    }
  }

  /*
    THE BREAKING ROOM — accepted, declined, and answered.

    The question arrives as a line in the conversation rather than a modal,
    because it *is* the conversation at that moment. A dialog would make it an
    interruption to dismiss; a line makes it something the room said.
  */
  function acceptBreaking() {
    if (!offer) return;
    setAnswering(offer);
    setOffer(null);
    /*
      The mood check is not cleared here, only hidden while this is open.

      Clearing it read as tidy and cost the one number this product claims:
      `askMood` is set on the turn that produced the offer, so `setAskMood(false)`
      meant accepting a question silently cancelled the measurement for that
      session. It comes back the moment the question is answered or left.
    */
    setLines((l) => [
      ...l,
      { id: nextId.current++, speaker: "vent", text: offer.text },
    ]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  /*
    A no, answered once and never asked again tonight.

    `declined` has no question mark in it and check 43 holds it to that: "you
    sure?" after a no is the room refusing to hear the answer it just asked
    for, and it is how a consent gesture becomes a pressure tactic.
  */
  function declineBreaking() {
    if (!offer) return;
    setLines((l) => [
      ...l,
      { id: nextId.current++, speaker: "vent", text: offer.lines.declined },
    ]);
    setOffer(null);
    setShut(true);
  }

  /**
   * Their answer, filed — or not, and said so either way.
   *
   * Zero tokens. Nothing here reaches a model: the question was hand-written,
   * the reply is one of two fixed lines, and which of the two it is comes from
   * the server's own boolean rather than from the request having been made.
   */
  async function answerBreaking(text: string) {
    const answer = text.trim();
    const question = answering;
    if (!answer || !question || thinking) return;

    setLines((l) => [...l, { id: nextId.current++, speaker: "you", text: answer }]);
    setDraft("");
    setThinking(true);
    try {
      const res = await fetch("/api/breaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonId: anonId(), q: question.id, a: answer }),
      });
      const data = res.ok ? await res.json().catch(() => null) : null;

      /*
        The crisis check runs on the server, where the write is, and this is
        the branch that proves why. A question about the parent who hurt you
        can be answered with the worst sentence of somebody's life, and the
        answer to that sentence is a phone number — never a thank-you and a
        checkmark over a record quietly filed.
      */
      if (data?.crisis) {
        setCrisis(CRISIS_LINES);
        setGated(true);
        setLines((l) => [
          ...l,
          { id: nextId.current++, speaker: "vent", text: CRISIS_RESPONSE, crisis: true },
        ]);
        return;
      }

      // Read what came back. "Thank you for trusting me with that" over a
      // write that failed is the same sentence as "I've saved it, word for
      // word" from a deployment with no store.
      setLines((l) => [
        ...l,
        {
          id: nextId.current++,
          speaker: "vent",
          text: data?.saved ? question.lines.received : question.lines.unsaved,
        },
      ]);
    } catch {
      setLines((l) => [
        ...l,
        { id: nextId.current++, speaker: "vent", text: question.lines.unsaved },
      ]);
    } finally {
      setAnswering(null);
      setThinking(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  /**
   * One composer, two destinations.
   *
   * While a heavy question is open the box belongs to that question, and what
   * they type goes to `/api/breaking` rather than becoming a vent. It is not a
   * vent: it is an answer to something the room asked, it costs no tokens, and
   * routing it through the model would spend money to reply to a sentence that
   * already has its reply written.
   */
  function submit(text: string) {
    if (answering) return void answerBreaking(text);
    return void send(text);
  }

  /* The room's first words in this sitting — the one reply that gets the
     illuminated capital. */
  const firstReplyId = lines.find((l) => l.speaker === "vent")?.id ?? null;

  return (
    <div className="flex min-h-dvh flex-col">
      {showOnboarding && <Onboarding onDone={completeOnboarding} />}
      <FeedbackFab />

      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/95 backdrop-blur-glass">
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
              <p className="label-mono">
                Not saved — this session only
              </p>
            )}
          </div>
        )}
      </header>

      {/* pb, not py: the feedback pill floats 12px above the composer and is
          44px tall, so the last 56px of any transcript sits under it at full
          scroll. Empty space there instead of the end of somebody's sentence. */}
      <main
        id="main"
        className={cn(
          "mx-auto w-full max-w-[640px] flex-1 px-4 pt-6 pb-[92px]",
          // An empty room should look empty — but empty is a proportion, not a
          // pile at the top. Measured at 360px: the invitation ended at y=280
          // and the composer began at y=565, so a third of the screen was a
          // void *below* the only thing on it. That does not read as a room
          // waiting; it reads as a page that failed to finish loading.
          //
          // Nothing is added to fill it. The same two sentences, sat in the
          // middle of the space they have, so the air falls on both sides of
          // them. Silence beats a guess applies to layout too: when there is
          // nothing true to put somewhere, arrange what you have and leave it.
          //
          // Only while the room is empty. The moment there is a transcript it
          // flows from the top like any conversation.
          lines.length === 0 && !thinking && "flex flex-col justify-center",
        )}
      >
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
        <ol className="thread space-y-6 pl-0">
          {lines.map((line) =>
            line.speaker === "you" ? (
              /*
                A visitor's note, in the margin of somebody else's room.

                Narrower than it was (70%, not 85%) and set closer to the
                edge, so the centre of the page belongs to the answer. The
                colour is untouched — recession here is scale and position,
                never legibility, because the person still has to be able to
                read what they wrote.
              */
              <li key={line.id} className="settle flex justify-end">
                <div className="max-w-[70%] border-r border-gold/30 pr-4 text-right">
                  <p className="label-mono mb-1.5 text-[11px] tracking-[0.14em]">You</p>
                  {/* Their words, exactly as typed — line breaks and all. */}
                  <p className="said">{line.text}</p>
                </div>
              </li>
            ) : (
              <li key={line.id}>
                <div
                  className={cn(
                    "presence arrive p-6 sm:p-8",
                    line.crisis && "ring-1 ring-gold/40",
                  )}
                >
                  {/* Engraved, not labelled — and gold where yours is ash,
                      for a glance too quick to register a letterform. */}
                  <p className="nameplate mb-4">Vent</p>
                  {/*
                    Illuminated on the room's first words only, and only when
                    there is a paragraph for the capital to sit in. A drop cap
                    on every reply is a gimmick; a drop cap on "Tired. Na" is
                    a joke at somebody's expense.
                  */}
                  <p
                    className={cn(
                      "reply whitespace-pre-wrap",
                      line.id === firstReplyId &&
                        line.text.length >= 90 &&
                        /^[A-Za-z]/.test(line.text) &&
                        "illuminate",
                    )}
                  >
                    {line.text}
                  </p>
                </div>
              </li>
            ),
          )}

          {thinking && (
            <li>
              {/* The room, about to speak. Same plate, dimmed — so the
                  answer lands in the space that was already holding it,
                  rather than shoving a placeholder aside. */}
              <div className="presence p-6 opacity-70 sm:p-8">
                <p className="nameplate mb-4">Vent</p>
                <p aria-live="polite" className="text-sm text-ash">
                  Thinking<span className="animate-pulse">…</span>
                </p>
              </div>
            </li>
          )}
        </ol>

        {/* Crisis gate — soft, never alarming, and it stops the session. */}
        {crisis && (
          <div className="presence arrive mt-4 p-6">
            <p className="nameplate mb-4">You are not alone</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={`tel:${crisis.nigeria.replace(/\s/g, "")}`}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-card bg-gold px-4 text-sm font-semibold text-on-gold"
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
        {/*
          The door to the other room, and only when there is one.

          This product had two surfaces and nothing between them: somebody
          writing "nobody knows this, i'm alone with it" got a real answer and
          was never told a circle was open with free seats on the other side of
          the same app. The loneliest sentence anybody types here, answered
          well, and the person left exactly as alone as they arrived.

          Everything in it is a fact the server read — the seats, the minutes,
          the room. Nothing is generated, so nothing can be invented. It
          disappears the moment the room fills or the store goes quiet.

          An offer, not a prescription. "You should join a circle" is advice,
          and this room does not fix people.
        */}
        {invite && !gated && (
          <a
            href={`/circles/${invite.id}`}
            className="presence arrive mt-6 block p-6 transition-opacity duration-300 hover:opacity-90 sm:p-8"
          >
            <p className="nameplate mb-4">Somewhere to say it out loud</p>
            <p className="reply max-w-[46ch]">
              {invite.tag
                ? `A circle is sitting with ${carryingWord(invite.tag)} right now.`
                : "A circle is sitting right now."}{" "}
              {invite.seatsOpen === 1 ? "One seat" : `${invite.seatsOpen} seats`} open,{" "}
              {invite.minutesLeft} minutes left. Nobody has to know who you are.
            </p>
            <p className="label-mono mt-3">Take a seat →</p>
          </a>
        )}

        {/*
          THE BREAKING ROOM — asked with the door held open.

          The no is a real button — same size, same weight, same row, with the
          same hit target — and not a dismissible X in a corner. It says "Not
          tonight" rather than "No thanks", because that is what the code
          actually does: `shut` is per-sitting and lives in state, so a no
          tonight is a no tonight and nothing carries it forward for weeks.

          The gold is a lean, and it is named here rather than denied. This
          said "neither one styled as the answer the room wants" over a filled
          gold primary against a plain outline, which was a claim about a
          screen nobody had looked at. Looking at it is what found this, and
          the wording changed rather than the claim being kept.

          It renders only when nothing else is competing. A heavy question
          stacked under a circle invitation and a mood slider is a menu, and
          the point of this room is that one question arrives on its own.

          That last rule was written as `!askMood` and it meant this card
          could never render at all: `askMood` is set on every vent turn, and
          a vent turn is the only kind that produces an offer. The condition
          was true of the code and false of anything a person would ever see —
          which is why it went in the browser before it went in a commit. It
          is the mood card that waits now, and it waits rather than being
          cancelled.
        */}
        {offer && !gated && !answering && (
          <div className="presence arrive mt-6 p-6 sm:p-8">
            <p className="nameplate mb-4">The room asks</p>
            <p className="reply max-w-[42ch]">{offer.lines.invite}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={acceptBreaking}
                className="pressable focusable min-h-[48px] rounded-card bg-gold px-5 text-[15px] font-semibold text-on-gold"
              >
                Ask me
              </button>
              <button
                type="button"
                onClick={declineBreaking}
                className="pressable focusable min-h-[48px] rounded-card border border-line/15 px-5 text-[15px] font-semibold"
              >
                Not tonight
              </button>
            </div>
          </div>
        )}

        {/* Waits while a heavy question is on the table, and returns after.
            Never cleared by it — see `acceptBreaking`. */}
        {askMood && !offer && !answering && (
          <div className="presence mt-6 p-6 sm:p-8">
            <p className="nameplate mb-4">Before you go</p>
            {/* The room asking, so the room's voice. This is not chrome —
                it is the last thing VENT says before somebody leaves. */}
            <p className="reply max-w-[42ch]">
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
                  className="tabular h-11 w-11 rounded-full border border-line/15 text-sm font-semibold transition-colors duration-300 hover:border-gold hover:bg-gold hover:text-on-gold"
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

        {askHeld && (
          <div className="presence arrive mt-6 p-6 sm:p-8">
            <p className="nameplate mb-4">One more thing</p>
            <p className="reply max-w-[42ch]">
              What held this week? Not the big thing — the small one that
              carried you further than it should have.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label htmlFor="held-note" className="sr-only">
                What held this week
              </label>
              <input
                id="held-note"
                value={heldDraft}
                onChange={(e) => setHeldDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitHeld();
                }}
                maxLength={200}
                placeholder="My sister called and I no need explain…"
                className="well focusable min-h-[48px] flex-1 px-4 placeholder:text-ash/70"
              />
              <button
                type="button"
                onClick={() => void submitHeld()}
                disabled={!heldDraft.trim() || heldSaving}
                className="pressable focusable min-h-[48px] rounded-card bg-gold px-5 text-[15px] font-semibold text-on-gold disabled:opacity-40"
              >
                Keep it
              </button>
            </div>
            {/* Skipping is a real answer and costs nothing. A question you
                cannot decline is a form. */}
            <button
              type="button"
              onClick={() => setAskHeld(false)}
              className="focusable mt-3 min-h-[44px] text-[14px] text-ash underline underline-offset-4"
            >
              Nothing this week
            </button>
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
        {/* And not beside a heavy question. "Breathing 4·2·6" and
            "Journalling prompt" under "I fit ask you something heavy?" is
            three offers in one card's height — the menu this room exists not
            to be. Seen in a screenshot, not in the source. */}
        {!thinking && !gated && tool === null && !offer && !answering && (
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
          <div className="presence closing mt-6 p-6 sm:p-8">
            <p className="nameplate mb-4">What you put down</p>
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
                    ? "border-gold bg-gold text-on-gold"
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

          {/*
            While a heavy question is open, the box says whose it is.

            Without this the composer looks identical either way, and somebody
            who accepted a question, got distracted, and came back would type
            an unrelated vent straight into `/api/breaking` and have it filed
            as their answer. One line, and a way out that is not "answer it".
          */}
          {answering && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="label-mono">{answering.lines.waiting}</p>
              <button
                type="button"
                onClick={() => {
                  setAnswering(null);
                  setShut(true);
                  setLines((l) => [
                    ...l,
                    {
                      id: nextId.current++,
                      speaker: "vent",
                      text: answering.lines.declined,
                    },
                  ]);
                }}
                className="focusable min-h-[44px] text-[14px] text-ash underline underline-offset-4"
              >
                Leave it
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <label htmlFor="vent-input" className="sr-only">
              {answering ? "Your answer" : "Carve your truth"}
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
                  submit(draft);
                }
                if (e.key === "Escape") setDraft("");
              }}
              placeholder={answering ? "Answer am how e dey…" : "Carve your truth…"}
              disabled={gated}
              className="max-h-32 min-h-[48px] flex-1 resize-none rounded-card border border-line/15 bg-card/60 px-4 py-3 leading-[1.6] shadow-glass-sm backdrop-blur-glass placeholder:text-ash disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => submit(draft)}
              disabled={!draft.trim() || thinking || gated}
              aria-label={answering ? "Send your answer" : "Send"}
              className="flex h-12 min-w-[64px] items-center justify-center rounded-card bg-gold px-4 text-sm font-semibold text-on-gold transition-opacity duration-300 disabled:opacity-40"
            >
              {thinking ? "…" : "Send"}
            </button>
          </div>

          <Disclaimer className="mt-3" />
        </div>
      </footer>
    </div>
  );
}
