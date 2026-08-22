"use client";

import { CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { Disclaimer } from "@/components/disclaimer";
import * as React from "react";
import Link from "next/link";
import { RoomHeader } from "@/components/room-header";
import { useToast } from "@/components/ui/toast";
import { FeedbackFab } from "@/components/feedback-fab";
import { Onboarding, hasOnboarded, type OnboardingResult } from "@/components/onboarding";
import { Breathing, Journaling, ToolRow, shouldOfferBreathing } from "@/components/tools";
import { anonId, queueVent } from "@/lib/anon";
import { cn } from "@/lib/utils";
import { carryingWord } from "@/lib/community/carrying";
import { useComposerHeight } from "@/lib/ui/use-composer-height";
import { readEventStream } from "@/lib/ui/event-stream";

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
  /**
   * The reply as it is being written, or null.
   *
   * A preview and never a record. It is drawn on the same plate the finished
   * reply lands on and then replaced by it, so what a person watches appear is
   * in the place the answer will be — nothing slides, nothing is swapped out
   * from under them.
   *
   * It never enters `lines`. That is the difference between this and a chat
   * app: `lines` is the transcript, and a transcript may only contain what the
   * server actually committed to. A stream can be abandoned mid-sentence when
   * a provider dies, and a preview that had been written into the transcript
   * would leave the abandoned half of somebody else's answer sitting in the
   * record of a session.
   */
  const [streamed, setStreamed] = React.useState<string | null>(null);
  /**
   * Whether the body and pressure controls are showing.
   *
   * Closed by default, and that is the change. Three pills and a slider sat
   * permanently above the composer — measured at 360px, the header, the
   * controls, the box, the button and the disclaimer took 232px of a 640px
   * screen, so more than a third of this product was chrome asking somebody to
   * classify themselves before they had said a word.
   *
   * They are real inputs and they feed the tactic choice, so they stay. They
   * are just not the first thing anybody meets. Onboarding already set the
   * pressure, the current reading is legible in one line without opening
   * anything, and the person who wants to move it taps one word.
   */
  const [trayOpen, setTrayOpen] = React.useState(false);
  /**
   * The carve from the last session that had one, and whether it is showing.
   *
   * Held behind a tap, deliberately, and this is the only decision in the
   * feature that took any thinking.
   *
   * The carve is the wound in eight words — "pops sick / fear of being
   * useless son" — and it is written in the person's own language because the
   * Carver is told to keep their words. Printing that on the opening screen
   * would mean somebody who came here at 2am to get away from a thing reads an
   * inscription of the thing before they have typed a character. The most
   * memorable moment in the product and the cruellest, from one decision.
   *
   * So the room says it kept something, and they decide whether to look. The
   * claim is what proves memory; the contents belong to them and stay shut
   * until asked for. It is the same shape as the Breaking Room's visible no —
   * consent before the heavy part, not after.
   */
  const [kept, setKept] = React.useState<string | null>(null);
  const [keptOpen, setKeptOpen] = React.useState(false);
  const [pressure, setPressure] = React.useState(50);
  /**
   * Whether that 50 is a reading or a default.
   *
   * Production, today: `meanDrop: -28.3` across every anchored sitting. Read
   * as written, that says this product leaves people twenty-eight points
   * heavier than it found them. It does not. It says the arrival reading is
   * fiction.
   *
   * `pressure` starts at 50 and is only ever set by two things: onboarding,
   * which a returning visitor skips by construction, and this person dragging
   * the slider. Everybody else's first vent was written to `tension_before`
   * as 50 — a number nobody chose — and then they rated the sitting honestly
   * at three out of ten, which is `after: 70`, which is a drop of minus
   * twenty. The arithmetic was never wrong. The "before" was invented.
   *
   * Systematically negative, too, not noisy: 50 is the midpoint of a slider
   * and it is low for somebody who has opened a venting app at 2am, so the
   * fabricated before is nearly always under the honest after.
   *
   * This is the first rule in CLAUDE.md, broken at the one number this
   * product claims about itself — "if you are about to make something up to
   * fill a space, leave the space." A default is a guess wearing an integer.
   *
   * What it poisons is not one card. `measureEfficacy` ranks all 35 tactics
   * on these drops, `measurePersonalEfficacy` does it per person, and
   * `dpo-outcome.jsonl` orders the training pairs by them. Every one of those
   * has been learning from a number that mostly measured how many people
   * never touched a slider.
   */
  const [pressureSet, setPressureSet] = React.useState(false);
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

  /*
    What the room kept, asked for before they type.

    The carve has been written at the end of every real session for a while
    and only the model has ever seen it. So somebody who sat here on Tuesday
    about their father opened the app on Thursday to the same blank room a
    stranger gets. The product remembered and the screen did not, and the
    screen is the part a person lives in.

    Fetched, never assumed. `kept` stays null unless a row came back with
    something in it — a store that is down, a first visit, a session too short
    to carve and a wipe all leave it null, and the room then says nothing about
    remembering. That is the rule this whole codebase is built on: a claim
    about the past has to be able to produce the past.

    One request, on mount, on a page somebody is about to sit and type on for
    several minutes. It never blocks anything: the composer is live before it
    lands and the greeting simply changes underneath if it arrives.
  */
  React.useEffect(() => {
    let live = true;
    fetch(`/api/carve?anonId=${encodeURIComponent(anonId())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const carve = typeof d?.carve === "string" ? d.carve.trim() : "";
        if (live && carve) setKept(carve);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function completeOnboarding(r: OnboardingResult) {
    setShowOnboarding(false);
    // The chair is their opening tension reading — the drop is measured from it.
    setPressure(r.tension);
    setPressureSet(true);
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

  /*
    Following a reply as it is written, and knowing when not to.

    Two rules, and both of them exist because the obvious version is wrong.

    `behavior: "auto"`, not "smooth". A smooth scroll is a 300ms animation and
    tokens land every 30ms or so, which queues thirty overlapping animations
    that fight each other — the page shivers instead of scrolling. Instant is
    the right call precisely because it is happening constantly: continuous
    small jumps read as the page keeping up, which is what it is doing.

    And it stops the moment somebody scrolls away. A person reading back
    something said three turns ago, dragged to the bottom every 30ms by a
    reply arriving, cannot read anything — the scroll position is theirs while
    they are using it. 160px of slack, so it still follows for somebody sitting
    at the bottom whose viewport is a few pixels off.
  */
  React.useEffect(() => {
    if (streamed === null) return;
    const room = document.documentElement;
    const fromBottom = room.scrollHeight - room.scrollTop - room.clientHeight;
    if (fromBottom > 160) return;
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [streamed]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || thinking || gated) return;

    setLines((l) => [...l, { id: nextId.current++, speaker: "you", text: message }]);
    setDraft("");
    setThinking(true);
    setStreamed("");
    setAskMood(false);
    // Collapse the tray on send. It is a thing you reach for, not a thing you
    // sit in front of.
    setTrayOpen(false);

    try {
      const res = await fetch("/api/vent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Ask for it as it is written. A deployment, proxy or browser that
          // will not stream answers with ordinary JSON and the branch below
          // reads that instead — nobody is refused an answer over a transport
          // preference.
          accept: "text/event-stream",
        },
        body: JSON.stringify({
          anonId: anonId(),
          message,
          // Null, not 50, when nobody has said. `tension_before` is written
          // straight from this, and a row with a null before is simply not
          // measurable — which is the correct outcome, and infinitely better
          // than a measurable row that measures nothing.
          pressure: pressureSet ? pressure : null,
          bodyTapped: body,
          mood,
          openingObject: opening?.object ?? null,
          openingCarrying: opening?.carrying ?? null,
          openingPutDown: opening?.putDown ?? null,
        }),
      });

      /*
        Two shapes, one meaning.

        `status` and `data` below are the status and body of the turn, whether
        they arrived at once or at the end of a stream. Everything after this
        block is the code that was already here, unchanged, because the stream
        does not change what a turn *is* — only when its first words appear.
      */
      let status = res.status;
      let data: VentResponse & { error?: string };

      if (res.headers.get("content-type")?.includes("text/event-stream")) {
        let done: { status: number; body: VentResponse & { error?: string } } | null = null;
        let live = "";
        let atSeq = 0;

        await readEventStream(res, (e) => {
          if (e.event === "delta") {
            const d = e.data as { chunk: string; seq: number };
            /*
              A new `seq` means the provider that was speaking failed and the
              chain moved on. What is on screen is half a sentence from
              somebody who is not going to finish it, so it goes — appending
              would splice two voices into one reply and hand the result to
              somebody at their worst.
            */
            if (d.seq !== atSeq) {
              atSeq = d.seq;
              live = "";
            }
            live += d.chunk;
            setStreamed(live);
          } else if (e.event === "done") {
            done = e.data as typeof done;
          }
        });

        // A stream that ended without `done` never delivered an answer. What
        // is on screen is a fragment of one, and a fragment is not an answer —
        // so it is discarded and the offline path takes it, which is the one
        // branch here that does not lose what they said.
        if (!done) throw new Error("stream ended without an answer");
        ({ status, body: data } = done);
      } else {
        data = await res.json();
      }

      const ok = status >= 200 && status < 300;

      if (status === 429) {
        toast(data.reply ?? "Slow down small.", "info");
        return;
      }
      if (!ok && !data.reply) throw new Error(data.error ?? `HTTP ${status}`);

      // When the model does not answer, the reply alone names one cause out of
      // four and the real one is only in the JSON. Days were lost reading
      // "Network dipped" as a network problem. If the server said why, show it.
      const why =
        !ok && data.reason
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
        // Only from a reading. This fell back to `pressure` — the same
        // default — so the drop card drew a number out of the same fiction.
        if (tensionBefore === null && pressureSet) setTensionBefore(pressure);
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
      /*
        Their words are kept. What broke is not guessed at.

        This branch said "You're offline" for every failure that reached it,
        and streaming gave it a second way in: a stream that ends without a
        `done` throws here, and the room then told somebody with four bars that
        their network had gone. A confident wrong diagnosis, in the product
        whose own file records losing days to "Network dipped on my side"
        meaning four different things.

        One of the two sentences below is a fact this code can actually check
        and the other is what is true when it cannot. `navigator.onLine` is
        trusted in one direction only, and that asymmetry is the point: a
        `false` is reliable — the machine knows it has no route — while a
        `true` means nothing at all, since a wifi with no internet behind it
        reports online all day. So a claim about being offline is made only on
        the reading that supports it.

        The queue does not depend on knowing which. That is the part that is
        true either way, and it is the part that gets said first.
      */
      queueVent({
        message,
        pressure,
        bodyTapped: body,
        queuedAt: new Date().toISOString(),
      });
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setLines((l) => [
        ...l,
        {
          id: nextId.current++,
          speaker: "vent",
          text: offline
            ? "You're offline — your truth still saved locally. It goes up the moment you're back."
            : "That one no reach me. What you wrote is held here, and it goes up with your next message.",
        },
      ]);
      /*
        No toast. The room already said it, in the room's voice.

        There was one, and a screenshot showed it parked across "1 · still
        heavy / 10 · lighter" — the two anchors that are the only thing making
        a number on that row mean anything. Two confirmations of one event, the
        smaller one covering part of the larger, on the card this product
        exists to get an answer out of.

        That is the reasoning already written into `submitMood` twenty lines
        down, arriving late: the card gets the moment when there is a card, and
        a toast is for when nothing else will speak. Here something else
        speaks — a line in the transcript, scrolled to, in full measure.
      */
    } finally {
      setThinking(false);
      // Cleared here rather than beside each outcome, because every outcome
      // clears it: the preview's whole job ends the moment there is a real
      // line to replace it, and a `setStreamed(null)` missing from one branch
      // would leave a ghost reply under the true one.
      setStreamed(null);
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

  /* One word for the reading, used by the closed strip and by the open
     slider, so the two can never disagree about what 67 means. */
  const pressureWord = pressure > 66 ? "tight" : pressure > 33 ? "some" : "loose";

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
  /**
   * Make it forget, and only say so once it has.
   *
   * `?carve=1` has existed since the carve did and no screen ever offered it.
   * A memory a person cannot delete is a record kept about them, and this
   * product's whole argument is the opposite of that.
   *
   * The state is cleared from the response, not from the click. "Forgotten"
   * over a request that failed is `I've saved it, word for word` inverted —
   * the same sentence, the same lie, in the other direction, and worse here
   * because somebody would leave believing a thing about their own life had
   * been erased when it had not.
   */
  async function forgetCarve() {
    try {
      const res = await fetch(
        `/api/vent?anonId=${encodeURIComponent(anonId())}&carve=1`,
        { method: "DELETE" },
      );
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (data?.deleted === "carve") {
        setKept(null);
        setKeptOpen(false);
        toast("Forgotten.", "success");
      } else {
        toast("Could not clear that. It is still here.", "info");
      }
    } catch {
      toast("Could not clear that. It is still here.", "info");
    }
  }

  /** Put the grown box back to one line. Called wherever the draft is emptied. */
  function shrink() {
    const el = inputRef.current;
    if (el) el.style.height = "";
  }

  function submit(text: string) {
    if (!text.trim() || thinking || gated) return;
    shrink();
    /*
      A tap you can feel, on the one action in this product that costs
      something to take.

      Eight milliseconds — under the threshold where it reads as a buzz, over
      the one where it reads as nothing. Guarded because iOS Safari has no
      `vibrate` at all and desktops have no motor, and neither is a reason for
      an exception.
    */
    navigator.vibrate?.(8);
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

      <RoomHeader />

      <div className="sticky top-[68px] z-20 bg-paper/95 backdrop-blur-glass">
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
      </div>

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
              {kept ? "You're back." : "Come in. Say small. Hear plenty."}
            </p>
            <p className="mt-3 max-w-[48ch] text-[15px] leading-[1.7] text-ash">
              {kept
                ? "I kept what you left here. Pick it up or start somewhere else — both are fine."
                : "Nobody reads this but you and the machine. It does not have to be tidy, or finished, or even true yet — start in the middle if that is where you are."}
            </p>

            {/*
              Their own eight words, and only if they ask.

              Two things are true at once and the design has to hold both. A
              person is not remembered by a product that says "I remember" —
              they are remembered when it can produce the thing. And a person
              who opens this at 2am to get away from something must not be
              handed an inscription of it on arrival.

              So the sentence above makes the claim and this makes it good, on
              a tap. What comes out is a quote, in their language, because the
              Carver keeps their words — which is a different act from a system
              showing somebody its assessment of them.

              And the way out sits next to it, at the same weight. A room that
              can recite your worst week and has no visible way to make it stop
              is not a memory, it is a file. `?carve=1` already existed for
              exactly this and had no door on any screen.
            */}
            {kept && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setKeptOpen((o) => !o)}
                  aria-expanded={keptOpen}
                  className="focusable label-mono flex min-h-[44px] items-center gap-1.5 text-ash transition-colors duration-300 hover:text-ink"
                >
                  {keptOpen ? "Close it" : "What you left"}
                  <span
                    aria-hidden
                    className={cn(
                      "transition-transform duration-300",
                      keptOpen && "rotate-180",
                    )}
                  >
                    ⌄
                  </span>
                </button>

                {keptOpen && (
                  <div className="presence arrive mt-2 p-6 sm:p-8">
                    <p className="nameplate mb-4">Last time</p>
                    <p className="reply max-w-[42ch]">{kept}</p>
                    <button
                      type="button"
                      onClick={() => void forgetCarve()}
                      className="focusable mt-4 min-h-[44px] text-[14px] text-ash underline underline-offset-4"
                    >
                      Forget this
                    </button>
                  </div>
                )}
              </div>
            )}
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

          {/*
            The room, speaking.

            This was the word "Thinking" and a pulsing ellipsis, held for the
            two to eight seconds the chain takes — the longest single moment in
            this product, spent by somebody who has just typed the hardest
            sentence of their day, watching a machine word.

            Now the plate is the same plate, in the same place, and the answer
            writes itself into it. Nothing is swapped when it finishes: the
            finished line renders where the preview was, at the same measure
            and the same leading, so the transition is a caret going out.

            Before the first token there is still a wait and it is still
            honest about being one — but it says nothing rather than saying
            "Thinking", because a caret in an empty plate already means
            somebody is about to speak, and this product's first rule is that
            silence beats a guess. The full-stop of that rule applied to a
            loading state.
          */}
          {thinking && (
            <li>
              <div className="presence p-6 sm:p-8">
                <p className="nameplate mb-4">Vent</p>
                <p aria-live="polite" className="reply whitespace-pre-wrap">
                  {streamed}
                  <span
                    aria-hidden
                    className="caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.12em] bg-gold"
                  />
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
          {/*
            Where it sits and how tight, folded away until asked for.

            Both still feed the tactic choice and neither has changed. What
            changed is that they no longer stand between a person and the box.
            The current reading is stated in the strip — "chest · tight", or
            just the pressure word when they have not named a place — so
            nothing is hidden, only closed.

            One line, and it reads as a sentence rather than a control: the
            product's own voice describing what it currently believes, which is
            also an invitation to correct it. That is the honest framing, since
            correcting it is exactly what opening the tray does.
          */}
          {trayOpen && (
            <div id="body-tray" className="mb-3 flex flex-wrap items-center gap-2">
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
              {/*
                No word beside the slider, and that is not an omission.

                Open, this printed "SOME" next to the track and the strip
                twenty pixels below printed "SOME" again — the same reading,
                twice, stacked, in the same typeface. Seen in a screenshot, not
                in the source, where two components each rendering one label
                looks perfectly reasonable.

                The strip is the readout: it is visible whether this is open or
                shut, it sits directly above the box, and it updates live while
                the thumb is dragged. A second copy can only ever agree with it
                or be a bug. `aria-label` carries the meaning for anybody not
                reading the strip.
              */}
              <label className="ml-auto flex min-w-[160px] flex-1 items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pressure}
                  onChange={(e) => {
                    setPressure(Number(e.target.value));
                    // Touching it is the act that turns 50 from a default
                    // into an answer. Nothing else can.
                    setPressureSet(true);
                  }}
                  aria-label="Pressure, 0 loose to 100 tight"
                  // The track reads as weight, not as a form control. See
                  // input[type="range"] in globals.css.
                  style={{ "--fill": `${pressure}%` } as React.CSSProperties}
                  className="h-2 w-full accent-gold"
                />
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={() => setTrayOpen((o) => !o)}
            aria-expanded={trayOpen}
            aria-controls="body-tray"
            className="focusable label-mono mb-2 flex min-h-[32px] items-center gap-1.5 text-ash transition-colors duration-300 hover:text-ink"
          >
            {/*
              Hollow until it means something.

              The dot's opacity was driven by `pressure`, so an untouched
              slider drew a half-lit dot that reads as a reading. A ring is
              the honest shape for a number nobody has given — the same
              distinction the strip's own words now make.
            */}
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                pressureSet ? "bg-gold" : "border border-gold/50",
              )}
              style={pressureSet ? { opacity: 0.35 + (pressure / 100) * 0.65 } : undefined}
            />
            {!pressureSet
              ? "How tight is it?"
              : body
                ? `${body} · ${pressureWord}`
                : pressureWord}
            <span aria-hidden className={cn("transition-transform duration-300", trayOpen && "rotate-180")}>
              ⌄
            </span>
          </button>

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
              /*
                It grows with what you are writing, up to eight lines.

                `rows={1}` with `resize-none` and a max height is a box that
                looks like one line and stays one line — a long vent scrolled
                inside a 48px window, so somebody pouring out a paragraph could
                see the last eleven words of it and nothing else. A therapy
                product whose input hides what you are saying while you say it.

                Measured off `scrollHeight`, which needs the height reset first
                or the box can only ever get taller: `scrollHeight` includes
                the height already set, so without the reset a deleted line
                leaves the space it had. Capped at 176px — eight lines at this
                leading — after which it scrolls, because a composer that eats
                the transcript is its own problem.
              */
              onChange={(e) => {
                setDraft(e.target.value);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
              }}
              onKeyDown={(e) => {
                if (
                  (e.key === "Enter" && !e.shiftKey) ||
                  (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                ) {
                  e.preventDefault();
                  submit(draft);
                }
                if (e.key === "Escape") {
                  setDraft("");
                  shrink();
                }
              }}
              placeholder={answering ? "Answer am how e dey…" : "Carve your truth…"}
              disabled={gated}
              className="min-h-[48px] flex-1 resize-none overflow-y-auto rounded-card border border-line/15 bg-card/60 px-4 py-3 leading-[1.6] shadow-glass-sm backdrop-blur-glass placeholder:text-ash disabled:opacity-50"
            />
            {/*
              A stroke, not a word.

              "Send" in a 64px pill is the widest possible way to say the one
              thing the Return key already says, and at 360px it took the space
              the box needed. The arrow is round, gold, 48px — a full target —
              and it is the only filled shape in the composer, so the eye finds
              it without reading.

              It goes quiet rather than spinning while the room is answering:
              there is a caret writing a reply eight lines above it, and two
              things claiming to be busy is one too many.
            */}
            <button
              type="button"
              onClick={() => submit(draft)}
              disabled={!draft.trim() || thinking || gated}
              aria-label={answering ? "Send your answer" : "Send"}
              className="pressable focusable flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-on-gold transition-opacity duration-300 disabled:opacity-30"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>

          <Disclaimer className="mt-3" />
        </div>
      </footer>
    </div>
  );
}
