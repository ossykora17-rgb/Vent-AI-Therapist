"use client";

import { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL } from "@/lib/vent/intent";
import * as React from "react";
import Link from "next/link";
import { anonId } from "@/lib/anon";
import { tensionDrop, tensionNow } from "@/lib/vent/chairs";
import { CircleVoice, type Status as VoiceStatus, type VoiceHandle } from "@/components/circle-voice";
import { BackIcon, LockIcon, MicIcon, PauseIcon, PhoneIcon, PlayIcon, SendIcon, TrashIcon } from "@/components/icons";
import { audioContextInGesture, personaFor } from "@/lib/voice/mask";
import { startRecording, type Recording } from "@/lib/voice/recorder";
import { NOTE_MAX_MS, NOTE_MIN_MS, NOTE_TOO_SHORT, noteLength } from "@/lib/voice/note";
import { ALONE_LINE, ALONE_DOOR } from "@/lib/circles/rules";
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
  /** Voice notes only: the length the server measured off the recording. */
  durationMs?: number;
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

/** The room's one player, made on the first tap that plays anything. */
function makePlayer(onEnded: () => void, onTime: (ms: number) => void): HTMLAudioElement {
  const player = new Audio();
  player.onended = onEnded;
  player.ontimeupdate = () => onTime(player.currentTime * 1000);
  return player;
}

/** Point the player at a sound and start it. Called from inside a tap. */
function playOn(player: HTMLAudioElement, src: string, onFail: () => void) {
  player.src = src;
  void player.play().catch(onFail);
}

/** An empty WAV: what the player starts on inside the tap, before a note arrives. */
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

/*
  Three lines at the door, not four and a form.

  The door was a card with four rules, a chair question, a consent box and a
  gold button: five things to do before a person could read a word anybody had
  said. The founder's word for the room was "distracting", and his brief was a
  WhatsApp group — which you join with one tap, under the group's name.

  The rules survive, merged to three, and the tap on "Take a seat" is the
  agreement: it sits directly under them and the sentence beside it says so.
  The server still refuses a join without `consent: true`, so the promise is
  held where curl cannot walk around it. The chair question is gone from the
  door; it was an arrival reading a person had to give before they could come
  in, and the closing already asks where they landed.
*/
const AGREEMENT = [
  "No advice. No fixing. No cross-talk — speak to the circle.",
  "What's said here stays here. Messages and voice notes are deleted within 24 hours.",
  "You can leave at any moment, without explaining.",
];

/** "Nobody To Tell" → "NT". The group's picture is its name. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/** The time a message arrived, as a phone writes it under a bubble. */
function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function CircleRoom({ id }: { id: string }) {
  const { toast } = useToast();
  const [state, setState] = React.useState<RoomState | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [draft, setDraft] = React.useState("");
  const [ruleError, setRuleError] = React.useState<string | null>(null);
  /*
    The sentence the server computed, not a copy of it.

    This was a boolean. Both branches below did `setCrisis(true)` and dropped
    `d.reply` — the language-aware line `crisisReply(said.language)` had just
    produced — and the block rendered an English sentence written into this
    component. So a Pidgin speaker in crisis in a circle got English, with
    every server-side assertion green.

    Null when the server sent no sentence: the block still opens, because the
    numbers are the part somebody can act on, and an absent line is better than
    one this file invented in the wrong language.
  */
  const [crisis, setCrisis] = React.useState<{ reply: string | null } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  /** The room answered something that is not a room — a store that is absent
   *  or refusing. Distinct from `notFound`: that circle is gone for good, this
   *  one may be there and unreachable, and the two deserve different sentences. */
  const [unreachable, setUnreachable] = React.useState(false);
  /**
   * Whether this build can wake a phone, and whether they asked it to.
   *
   * "off" is the deployment answer — no VAPID keys — and renders nothing at
   * all rather than a switch that fails when tapped. The other four are this
   * person's state in this room.
   */
  const [notify, setNotify] =
    React.useState<"off" | "idle" | "asking" | "on" | "denied">("off");
  const [mood, setMood] = React.useState<number | null>(null);
  const [carry, setCarry] = React.useState<string | null>(null);
  const [dropped, setDropped] = React.useState<string | null>(null);
  /* Which seats are speaking in voice, said under the room's name. */
  const [speakingSeats, setSpeakingSeats] = React.useState<number[]>([]);
  const [voiceStatus, setVoiceStatus] = React.useState<VoiceStatus>("idle");
  const voiceRef = React.useRef<VoiceHandle>(null);
  /*
    Voice notes. `notesOn` is the server's answer, not an assumption: false on
    a deployment without the table, and then the room draws no microphone at
    all rather than one that fails when tapped.
  */
  const [notesOn, setNotesOn] = React.useState(false);
  /** `live` once the microphone is actually open — never before. */
  const [recording, setRecording] = React.useState<{ startedAt: number; live: boolean } | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [sendingNote, setSendingNote] = React.useState(false);
  const recRef = React.useRef<Recording | null>(null);
  /** Which start a result belongs to, so a cancel that beats the microphone
   *  prompt is not overtaken by the recording it cancelled. */
  const recToken = React.useRef(0);
  /** One player for the room, made inside the first tap that plays anything. */
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  /** Notes already downloaded, by id, as object URLs. */
  const blobs = React.useRef(new Map<string, string>());
  /** Downloads under way, so the four-second poll never starts a second one. */
  const inflight = React.useRef(new Map<string, Promise<string | null>>());
  const [playing, setPlaying] = React.useState<{ id: string; at: number } | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLElement>(null);
  // The room had the bug the chat had already fixed. See the hook.
  useComposerHeight(footerRef);
  /**
   * Read by the poll, not by the render. Putting the draft in `load`'s deps
   * would tear down and rebuild the four-second interval on every keystroke.
   */
  const draftRef = React.useRef("");
  /** The VAPID public key, once the build has said it has one. */
  const pushKey = React.useRef<string | null>(null);
  React.useEffect(() => { draftRef.current = draft; }, [draft]);

  const me = React.useMemo(() => (typeof window === "undefined" ? "" : anonId()), []);

  const load = React.useCallback(async () => {
    // The heartbeat that was already running now carries two more bits: I am
    // here, and there is text in my box. No new endpoint, no debounce timer,
    // no extra request per keystroke.
    const typing = draftRef.current.trim().length > 0 ? "&typing=1" : "";
    const r = await fetch(`/api/circles/${id}?anonId=${encodeURIComponent(me)}${typing}`);
    if (r.status === 404) { setNotFound(true); return; }
    /*
      A refusal is not a room.

      Every other status fell straight into `const d: RoomState = await
      r.json()` and `setState(d)` — so a 503 from a store that is absent or
      refusing became a room object whose every field was `undefined`, and the
      screen drew the whole agreement over it with a gold "Take a seat" on the
      bottom. That is the door onto a refusal again, reached by anybody holding
      a circle link while the database is down.

      The last good room is kept rather than overwritten, because this runs
      every four seconds and one blip must not empty a live circle somebody is
      sitting in. The sentence below is only for having never had one.
    */
    if (!r.ok) { setUnreachable(true); return; }
    const d: RoomState = await r.json();
    setUnreachable(false);
    setState(d);
    if (d.joined) {
      const m = await fetch(`/api/circles/${id}/messages?anonId=${encodeURIComponent(me)}`);
      if (m.ok) {
        const thread = await m.json();
        setMessages(thread.messages ?? []);
        setNotesOn(thread.voiceNotes === true);
      }
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

  /*
    Ask the build, once, whether it can do this at all.

    Read off the body rather than the status: a 200 that says
    `configured: false` is the ordinary answer on a deployment with no VAPID
    keys, and treating `res.ok` as the answer is the half-measure this
    repository already paid for once with a thank-you for a rating it dropped.
  */
  React.useEffect(() => {
    let live = true;
    void fetch("/api/push")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d?.configured || !d?.publicKey) return;
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
        if (!("PushManager" in window)) return;
        pushKey.current = d.publicKey as string;
        setNotify(Notification.permission === "denied" ? "denied" : "idle");
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  async function join() {
    setBusy(true);
    try {
      // No arrival reading: the chair question left the door with the form it
      // was part of. A seat with no reading is honest about having none — the
      // closing's drop line only renders when there was an arrival to drop from.
      const r = await fetch(`/api/circles/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: me, consent: true }),
      });
      const d = await r.json();
      if (r.status === 409 && d.error === "crisis") {
        setCrisis({ reply: typeof d.reply === "string" && d.reply.trim() ? d.reply : null });
        return;
      }
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
   * Record the close, and say which of the promises actually held.
   *
   *   "Sealed"               your close was recorded. Needs this to succeed.
   *   "Nothing here is kept" the transcript is deleted on close by
   *                          sweepIfOver, server-side, whichever request
   *                          notices the transition first. True either way.
   *   "held"                 the word you carry reached `vent_users.held` and
   *                          is on your Memory page. Depends on this request
   *                          AND on a second write that is allowed to fail
   *                          without failing the close.
   *
   * So "Nothing here is kept" is said only when nothing was, and each branch
   * below says only what actually happened.
   */
  async function seal(drop: string): Promise<{ sealed: boolean; held: boolean }> {
    if (mood === null) return { sealed: false, held: false };
    try {
      const r = await fetch(`/api/circles/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: me, mood, carry, drop }),
      });
      if (!r.ok) return { sealed: false, held: false };
      /*
        Read off the body, never off the status. A 200 says only that the close
        landed — `addHeld` reports by returning, and the route passes that
        answer through rather than assuming it. This product has already
        shipped a thank-you for a rating it dropped by reading the status and
        never the body; the same function must not do it for a word somebody
        chose.
      */
      const d: unknown = await r.json().catch(() => null);
      const held = typeof d === "object" && d !== null && (d as { held?: unknown }).held === true;
      return { sealed: true, held };
    } catch {
      return { sealed: false, held: false };
    }
  }

  /*
    Ask the browser, then tell the server where to reach it.

    Three things can say no and each is a different sentence: the person can
    refuse permission, the push service can refuse a subscription, and the
    store can refuse the row. Only the last one is a failure worth a toast —
    the first is their decision and the second is not theirs to fix.

    `subscribed` is read off the body, not off `res.ok`. "You'll be told" is a
    promise that a phone will ring.
  */
  async function askToBeWoken() {
    const key = pushKey.current;
    if (!key || !state) return;
    setNotify("asking");
    try {
      if (Notification.permission !== "granted") {
        const answer = await Notification.requestPermission();
        if (answer !== "granted") { setNotify(answer === "denied" ? "denied" : "idle"); return; }
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const raw = sub.toJSON().keys ?? {};
      const r = await fetch(`/api/circles/${id}/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          anonId: me,
          endpoint: sub.endpoint,
          p256dh: raw.p256dh,
          auth: raw.auth,
        }),
      });
      const d = await r.json().catch(() => null);
      if (d?.subscribed === true) { setNotify("on"); return; }
      setNotify("idle");
      toast("Couldn't set that up. The room still works.", "error");
    } catch {
      setNotify("idle");
      toast("Couldn't set that up. The room still works.", "error");
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content || busy || !state?.role) return;
    setBusy(true);
    setRuleError(null);
    try {
      /*
        Always a share. The Share/Reflect switch above the box was a mode to
        configure before you could speak — the second row of chrome in a
        composer a group chat keeps to one. A one-line reflection is still
        what anybody may choose to write; it no longer needs a setting first,
        and the server's rules read the words, not the switch.
      */
      const r = await fetch(`/api/circles/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: me, content, kind: "share" }),
      });
      const d = await r.json();
      if (r.status === 409 && d.error === "crisis") {
        setCrisis({ reply: typeof d.reply === "string" && d.reply.trim() ? d.reply : null });
        return;
      }
      // A rule refusal and a Guardian refusal read the same to a person: the
      // line does not go in, and here is why, in words they can act on.
      if (r.status === 422 && (d.error === "rule" || d.error === "guardian")) {
        setRuleError(d.message);
        return;
      }
      if (!r.ok) { toast("Couldn't send that.", "error"); return; }
      setDraft("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** One note's sound, downloaded once and kept as an object URL. */
  const fetchNote = React.useCallback((noteId: string): Promise<string | null> => {
    const have = blobs.current.get(noteId);
    if (have) return Promise.resolve(have);
    /*
      A minute of note is two megabytes, which on a Lagos 3G connection takes
      longer than the poll does to come round. Without this every poll would
      start the same download again beside the one still arriving.
    */
    const going = inflight.current.get(noteId);
    if (going) return going;
    const download = (async () => {
      try {
        const r = await fetch(`/api/circles/${id}/voice-notes/${noteId}`, {
          headers: { "x-anon-id": me },
        });
        if (!r.ok) return null;
        const url = URL.createObjectURL(await r.blob());
        blobs.current.set(noteId, url);
        return url;
      } catch {
        return null;
      } finally {
        inflight.current.delete(noteId);
      }
    })();
    inflight.current.set(noteId, download);
    return download;
  }, [id, me]);

  /*
    Download notes as they arrive, one at a time, the way a phone does — so a
    tap plays at once, and plays from inside the tap, which is the only place
    an iPhone lets a page start sound.
  */
  React.useEffect(() => {
    let live = true;
    void (async () => {
      for (const m of messages) {
        if (!live) return;
        if (m.kind === "voice" && !blobs.current.has(m.id)) await fetchNote(m.id);
      }
    })();
    return () => { live = false; };
  }, [messages, fetchNote]);

  // Leaving the room stops what is playing and what is recording, and lets go
  // of every note this page downloaded.
  React.useEffect(() => {
    const kept = blobs.current;
    return () => {
      recRef.current?.cancel();
      audioRef.current?.pause();
      for (const url of kept.values()) URL.revokeObjectURL(url);
      kept.clear();
    };
  }, []);

  function togglePlay(noteId: string) {
    const player =
      audioRef.current ??
      (audioRef.current = makePlayer(
        () => setPlaying(null),
        (ms) => setPlaying((p) => (p ? { ...p, at: ms } : p)),
      ));
    if (playing?.id === noteId && !player.paused) {
      player.pause();
      setPlaying(null);
      return;
    }
    setPlaying({ id: noteId, at: 0 });
    const ready = blobs.current.get(noteId);
    if (ready) {
      playOn(player, ready, () => setPlaying(null));
      return;
    }
    /*
      Not downloaded yet. Start the player on a moment of silence now, inside
      the tap, so the element is one this page is allowed to play; then hand
      it the note when it arrives.
    */
    playOn(player, SILENCE, () => {});
    void fetchNote(noteId).then((url) => {
      if (!url) {
        setPlaying(null);
        setRuleError("That voice note didn't load. Try again.");
        return;
      }
      playOn(player, url, () => setPlaying(null));
    });
  }

  /*
    Record a voice note. The AudioContext is made on the first line, inside the
    tap — the rule the live voice was rebuilt around — and the recording is
    taken off the mask, so the voice that leaves the phone is the pitched-down
    one, seat by seat, exactly as it is in a call.
  */
  function startNote() {
    const ctx = audioContextInGesture();
    if (recording || !state || state.mySeat === null) {
      void ctx?.close();
      return;
    }
    const token = ++recToken.current;
    setRuleError(null);
    setElapsed(0);
    setRecording({ startedAt: Date.now(), live: false });
    void startRecording(ctx, personaFor(`seat-${state.mySeat + 1}`)).then((r) => {
      if (token !== recToken.current) {
        if ("recording" in r) r.recording.cancel();
        return;
      }
      if ("refused" in r) {
        setRecording(null);
        setRuleError(
          r.refused === "microphone"
            ? r.name === "NotAllowedError"
              ? "The microphone is blocked for this site. Allow it in your browser settings, or type it instead."
              : "The microphone didn't open. Type it instead — it still counts."
            : "This phone can't disguise your voice, so nothing was recorded. Type it instead.",
        );
        return;
      }
      recRef.current = r.recording;
      // The clock starts when the microphone does, not when the prompt did —
      // and "Recording" is said from here, not from the tap.
      setRecording({ startedAt: Date.now(), live: true });
    });
  }

  function cancelNote() {
    recToken.current++;
    recRef.current?.cancel();
    recRef.current = null;
    setRecording(null);
  }

  const sendNote = React.useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    recToken.current++;
    recRef.current = null;
    setRecording(null);
    const out = rec.finish();
    if (!out || out.durationMs < NOTE_MIN_MS) {
      setRuleError(NOTE_TOO_SHORT);
      return;
    }
    setSendingNote(true);
    try {
      const r = await fetch(`/api/circles/${id}/voice-notes`, {
        method: "POST",
        headers: { "content-type": "audio/wav", "x-anon-id": me },
        body: new Blob([out.wav], { type: "audio/wav" }),
      });
      // The body decides, not the status: a note is only in the room once the
      // server has handed back the row it wrote.
      const d = await r.json().catch(() => null);
      if (r.status === 201 && typeof d?.id === "string") {
        await load();
        return;
      }
      setRuleError(typeof d?.message === "string" ? d.message : "That voice note didn't send. Try again, or type it.");
    } catch {
      setRuleError("That voice note didn't send. Try again, or type it.");
    } finally {
      setSendingNote(false);
    }
  }, [id, me, load]);

  // The clock on a note, and the minute it stops at — sent, not lost.
  React.useEffect(() => {
    if (!recording?.live) return;
    const t = window.setInterval(() => {
      const ms = Date.now() - recording.startedAt;
      setElapsed(ms);
      if (ms >= NOTE_MAX_MS) void sendNote();
    }, 250);
    return () => window.clearInterval(t);
  }, [recording, sendNote]);

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

  /*
    A room that cannot be reached, which is not a room that has closed.

    "That circle has closed. The words are already gone." is true of a 404 and
    false here — the room may be sitting there with five people in it while the
    database is refusing us. Saying the words are gone would be inventing a
    deletion, which is the one claim this product must never make loosely.

    Only when there has never been a room to show: a blip on the four-second
    poll keeps the last good one, upstairs in `load`. The private session is
    the door that is actually open — it answers with no store at all.
  */
  if (unreachable && !state) {
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
        <p className="font-display text-heading font-bold">Can&apos;t reach this room.</p>
        <p className="mt-2 max-w-[40ch] text-body text-ash">
          Not closed — we just can&apos;t see it from here. Try again in a minute.
        </p>
        <Link href="/chat" className="mt-6 flex min-h-[48px] items-center rounded-card bg-gold px-6 text-body font-semibold text-on-gold">
          Come in and talk instead
        </Link>
      </main>
    );
  }

  const mins = state ? Math.max(0, Math.round(state.msRemaining / 60000)) : 0;
  /* Read once, so the agreement and the refusal cannot both render and cannot
     both disappear. See the comment beside the two branches. */
  const roomIsFull = Boolean(state && state.seats >= state.maxSeats);
  const name = state ? roomName(state.circle.tag, state.circle.created_at) : "";
  // Seats speaking in voice, never counting yourself: you know when you talk.
  const mine = state?.mySeat != null ? state.mySeat + 1 : null;
  const speaking = speakingSeats.filter((n) => n !== mine);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/95 backdrop-blur-glass">
        {/*
          A group chat's header: back, the group's face, its name, one line
          under it, and the call.

          This was a name and a telemetry line, then a KEEPER word and a theme
          toggle — chrome about the system rather than the room. The theme
          lives in the lobby's header now; the role reads in the thread, where
          the Keeper speaks. What is left is what a person uses: the way out,
          who this is, whether anybody is here or typing, and voice.

          The one line under the name says the thing that is changing right
          now. Somebody speaking in voice outranks somebody typing, which
          outranks the room's clock — the same order a phone uses.
        */}
        <div className="mx-auto flex h-16 max-w-[640px] items-center gap-2 px-2">
          <Link
            href="/circles"
            aria-label="Back to circles"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-line/5"
          >
            <BackIcon />
          </Link>
          {/* The group's face. Decorative — the name beside it is the name. */}
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/20 font-display text-body font-bold text-gold-deep">
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-heading font-bold leading-tight tracking-[-0.02em]">
              {state ? name : "…"}
            </h1>
            <p
              aria-live="polite"
              className={cn(
                "truncate text-fine leading-snug",
                speaking.length || (state?.typingOthers ?? 0) > 0 ? "font-semibold text-ink" : "text-ash",
              )}
            >
              {voiceStatus === "live" && speaking.length
                ? `Seat ${speaking.join(", ")} speaking…`
                : state && state.typingOthers > 0
                  ? state.typingOthers === 1
                    ? "someone is typing…"
                    : `${state.typingOthers} people are typing…`
                  : `${state?.phaseLabel ?? "Circle"} · ${state?.present ?? 0} here · ${mins}m left`}
            </p>
          </div>
          {state?.joined && state.voice && (
            <button
              type="button"
              onClick={() => voiceRef.current?.toggle()}
              aria-label={voiceStatus === "live" ? "Leave voice" : "Join voice"}
              aria-pressed={voiceStatus === "live"}
              disabled={voiceStatus === "joining"}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                // Ink flips with the theme and gold does not, so the two
                // never share a state: on-gold over gold, ink over paper.
                voiceStatus === "live"
                  ? "bg-gold text-on-gold"
                  : "text-ink hover:bg-line/5",
                voiceStatus === "joining" && "opacity-60",
              )}
            >
              <PhoneIcon />
            </button>
          )}
        </div>
      </header>

      {/* Voice sits under the name while you are in it — a call you are on,
          never scrolled away with the thread. */}
      {state?.joined && (
        <CircleVoice
          ref={voiceRef}
          circleId={id}
          anonId={me}
          enabled={Boolean(state.voice)}
          keeper={state.role === "keeper"}
          onSpeaking={setSpeakingSeats}
          onStatus={setVoiceStatus}
        />
      )}

      {/*
        Bottom room for the composer, which is `sticky bottom-0`.

        Measured, not guessed: `--composer-h` is published by the same hook
        this file already calls, so it stays correct when a rule refusal or
        the crisis gate changes the footer's height.
      */}
      <main
        id="main"
        className="mx-auto w-full max-w-[640px] flex-1 px-3 pt-4 pb-[calc(var(--composer-h,120px)+16px)]"
      >
        {/*
          What a group chat puts first — the terms of the room, once, small,
          at the top of the thread. Ours is the twist: a seat instead of a name,
          a voice that is pitched down, and a transcript with an end.
        */}
        <p className="mx-auto mb-4 max-w-[36ch] rounded-card bg-gold/10 px-3 py-2 text-center text-fine text-ash">
          <span className="mr-1 inline-block align-[-1px]">
            <LockIcon />
          </span>
          A seat, not a name. Voices are pitched down. Everything said here is
          deleted within 24 hours.
        </p>

        {crisis && (
          <div className="glass mb-4 border-gold/60 p-4">
            <p className="label-mono mb-2">This isn&apos;t the room for that</p>
            {crisis.reply && (
              <p className="text-body leading-[1.6]">{crisis.reply}</p>
            )}
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

        {/*
          A door onto a 409, and the flag that keeps it shut.

          The agreement once rendered for anybody not in the room, whatever its
          seat count, on a circle with six people in it — answered 409 and "That
          circle is full." Every fact needed arrived in the payload the button
          was drawn from. The room never offers a door that opens onto a
          refusal; the lobby is the door that is open, so this points at it.

          One flag and its negation, never `>=` and `<` of the same pair:
          `6 >= undefined` and `6 < undefined` are **both false**, so a payload
          that lost `maxSeats` would make both branches vanish and leave
          somebody looking at nothing at all. A flag falls back to offering the
          seat instead, and a 409 they can read beats a blank space.
        */}
        {state && !state.joined && roomIsFull && (
          <div className="glass p-5">
            <p className="font-display text-heading leading-[1.3]">This one filled up.</p>
            <p className="mt-3 max-w-[46ch] text-body leading-[1.7] text-ash">
              Six seats, and they are taken. Nothing said in here is readable
              from outside it, so there is nothing to wait around for.
            </p>
            <Link
              href="/circles"
              className="mt-4 inline-flex min-h-[44px] items-center text-body font-semibold text-ink underline underline-offset-4"
            >
              Find a room with space →
            </Link>
          </div>
        )}

        {state && !state.joined && !roomIsFull && (
          <div className="glass mx-auto max-w-[440px] p-6 text-center">
            <div aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold/20 font-display text-heading font-bold text-gold-deep">
              {initials(name)}
            </div>
            <p className="mt-3 font-display text-heading font-bold">{name}</p>
            <p className="mt-1 text-fine text-ash">
              {state.seats} of {state.maxSeats} seats taken · {mins} min left
            </p>
            <ul className="mt-5 space-y-2 text-left text-body leading-[1.6]">
              {AGREEMENT.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="text-gold">·</span>
                  {line}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void join()}
              disabled={busy}
              className="mt-5 min-h-[48px] w-full rounded-card bg-gold text-body font-semibold text-on-gold disabled:opacity-40"
            >
              {busy ? "Taking a seat…" : "Take a seat"}
            </button>
            <p className="mt-2 text-fine text-ash">Taking a seat means you agree to hold it this way.</p>
          </div>
        )}

        {state?.joined && (
          <>
            {state.seats < 2 ? (
              /*
                The sentence, and the door.

                This read "the circle opens when somebody else sits down" — a
                promise, in a product whose worst shipped bug was a refusal
                that promised a turn to people whose turn could never come.
                Fourteen of the first sixteen circles had one person in them.

                ALONE_LINE says the fact without the promise. The link is the
                other half: when this door is shut you point at the one that is
                open — /chat needs nobody else and works now.
              */
              <div className="mx-auto flex max-w-[40ch] flex-col items-center gap-2 rounded-card bg-card/80 px-4 py-4 text-center">
                <p className="text-body leading-[1.7] text-ash">{ALONE_LINE}</p>
                <Link
                  href="/chat"
                  className="focusable min-h-[44px] text-body text-ink underline underline-offset-4"
                >
                  {ALONE_DOOR}
                </Link>
                {/*
                  Only here, and only when the build can actually do it: one
                  person, in a room, deciding whether to keep a tab open for
                  forty-five minutes. `notify === "off"` means no VAPID keys in
                  this deployment and nothing renders.
                */}
                {notify !== "off" && (
                  <button
                    type="button"
                    onClick={() => void askToBeWoken()}
                    disabled={notify === "on" || notify === "asking"}
                    className="focusable min-h-[44px] text-body text-ash underline underline-offset-4 disabled:no-underline disabled:opacity-70"
                  >
                    {notify === "on"
                      ? "You'll be told when someone sits down."
                      : notify === "asking"
                        ? "Asking…"
                        : notify === "denied"
                          ? "Notifications are blocked in this browser."
                          : "Tell me when someone sits down"}
                  </button>
                )}
              </div>
            ) : (
              state.phase === "breathe" && (
                <p className="mx-auto max-w-[36ch] rounded-card bg-card/80 px-4 py-2 text-center text-fine text-ash">
                  Breathing — three minutes before anybody speaks. In through the
                  nose, longer on the way out.
                </p>
              )
            )}

            {/*
              Said once, by whichever line is true: alone, the sentence above
              owns the emptiness; with people here and quiet, this does —
              silence with somebody in it is the whole feeling of a circle.
            */}
            {messages.length === 0 && (state.present ?? 1) > 1 && (
              <p className="mx-auto mt-3 max-w-[34ch] text-center text-body leading-[1.7] text-ash">
                Nobody has spoken yet. {state.present} people are here,
                waiting with you.
              </p>
            )}

            {/*
              Bubbles, the way every phone already reads a group.

              Theirs on the left under the seat that said it, yours on the
              right in gold, the time in the corner. The seat is written once
              per run of messages, as a group chat writes a name. The Keeper
              and the Guardian are not people and are not bubbles: they speak
              from the middle, in the room's own face — `.reply`, so the Keeper
              and VENT are audibly the same thing in two rooms.

              When the Closing is up, everything said recedes. Not hidden —
              still there, just no longer what the room is about.
            */}
            <ol className={cn("mt-4 flex flex-col gap-1", state.phase === "close" && "receding")}>
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const opensRun =
                  !prev ||
                  prev.kind === "keeper_prompt" ||
                  prev.kind === "guardian" ||
                  prev.mine !== m.mine ||
                  prev.seat !== m.seat;

                if (m.kind === "keeper_prompt" || m.kind === "guardian") {
                  return (
                    <li key={m.id} className="my-3 flex justify-center">
                      <div className="max-w-[92%] rounded-card bg-card/80 px-4 py-3 text-center">
                        <p className="label-mono mb-1.5">
                          {m.kind === "guardian" ? "Guardian" : "Keeper"}
                        </p>
                        <p className="reply mx-auto">{m.content}</p>
                      </div>
                    </li>
                  );
                }

                return (
                  <li
                    key={m.id}
                    className={cn("flex", m.mine ? "justify-end" : "justify-start", opensRun && "mt-2")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-card px-3.5 py-2 sm:max-w-[75%]",
                        m.mine
                          ? "bg-gold/20 text-right"
                          : "border border-line/10 bg-card",
                        opensRun && (m.mine ? "rounded-tr-md" : "rounded-tl-md"),
                      )}
                    >
                      {!m.mine && opensRun && (
                        <p className="text-fine font-semibold text-ink">
                          Seat {m.seat}
                          {m.role === "keeper" ? " · Keeper" : ""}
                        </p>
                      )}
                      {m.kind !== "voice" ? (
                        /* A person is set as a person — `.said`, never the
                           room's face — whoever's words these are. */
                        <p className="said text-left text-ink">{m.content}</p>
                      ) : (
                        /* A note: play, how far along, how long. The same bubble,
                           because a voice note is a message said out loud. */
                        <div className="flex items-center gap-2.5 py-1 text-left">
                          <button
                            type="button"
                            onClick={() => togglePlay(m.id)}
                            aria-label={playing?.id === m.id ? "Pause voice note" : "Play voice note"}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-on-gold"
                          >
                            {playing?.id === m.id ? <PauseIcon /> : <PlayIcon />}
                          </button>
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line/15 sm:w-40">
                            <div
                              className="h-full rounded-full bg-ink/60"
                              style={{
                                width: `${playing?.id === m.id && m.durationMs
                                  ? Math.min(100, (playing.at / m.durationMs) * 100)
                                  : 0}%`,
                              }}
                            />
                          </div>
                          <span className="tabular text-fine text-ash">
                            {noteLength(playing?.id === m.id ? playing.at : m.durationMs ?? 0)}
                          </span>
                        </div>
                      )}
                      <p className="mt-0.5 text-right text-label text-ash">
                        {m.kind === "witness" ? "heard · " : ""}
                        {clock(m.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {state.phase === "close" && (
              <div className="glass closing mt-6 border-gold/50 p-6 sm:p-8">
                {/*
                  The one screen that earns display type — the moment the
                  circle exists for. It arrives slower than everything else and
                  dims the room behind it.
                */}
                <p className="label-mono mb-2">Closing</p>
                <h2 className="mb-5 font-display text-heading leading-[1.2] tracking-[-0.01em]">
                  Where did you land?
                </h2>

                {mood === null ? (
                  <>
                    <p className="text-body leading-[1.6]">
                      Rate where you are now, 1–10.
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
                        {/* scaleX, not width — animating width is layout on
                            every frame, on the screen somebody is watching
                            most closely. */}
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
                            void seal(w).then(({ sealed, held }) =>
                              toast(
                                !sealed
                                  ? "Your close didn't reach us. The room still ends and the transcript still goes."
                                  : held
                                    ? `Sealed. The words here are gone. "${carry}" is on your Memory page.`
                                    : "Sealed. Nothing here is kept.",
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
                      <p className="reply mt-6">
                        You carry {carry ?? "what you came with"}. You drop{" "}
                        {dropped}. The words in this room go with it.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* scroll-margin, or `block: "end"` parks this exactly where the
                sticky footer pins itself and the last thing anybody said
                renders underneath the composer. Same fix as the chat. */}
            <div
              ref={endRef}
              className="scroll-mb-[calc(var(--composer-h,120px)+16px)]"
            />
          </>
        )}
      </main>

      {state?.joined && (
        <footer ref={footerRef} className="sticky bottom-0 border-t border-line/10 bg-paper/95 backdrop-blur-glass">
          <div className="mx-auto max-w-[640px] px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5">
            {ruleError && (
              <p role="alert" className="mb-2 rounded-card border border-gold/50 p-3 text-fine leading-relaxed">
                {ruleError}
              </p>
            )}
            {/*
              One row: the box and the send. A group chat's composer has no
              mode switch above it and no rule under it — the rules are at the
              door and enforced on the server, where a refusal is written to
              teach at the moment it actually fires (`ruleError`, above).
            */}
            {/*
              The microphone takes the send button's place while the box is
              empty, as it does on every phone. One tap starts a note and a
              second tap on send ends it — a tap, not a hold, for the reason the
              live voice gave up its hold bar: somebody crying cannot hold a
              button, and a hold looks the same whether or not it is recording.
            */}
            {recording ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelNote}
                  aria-label="Cancel voice note"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ash hover:bg-line/5"
                >
                  <TrashIcon />
                </button>
                <p
                  aria-live="polite"
                  className="flex min-h-[48px] flex-1 items-center gap-2 rounded-card border border-gold/60 bg-card px-4 text-body"
                >
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-gold motion-safe:animate-pulse" />
                  {recording.live ? `Recording · ${noteLength(elapsed)}` : "Opening the microphone…"}
                </p>
                <button
                  type="button"
                  onClick={() => void sendNote()}
                  disabled={!recording.live}
                  aria-label="Send voice note"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-on-gold disabled:opacity-40"
                >
                  <SendIcon />
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <label htmlFor="circle-input" className="sr-only">
                  Message the circle
                </label>
                <textarea
                  id="circle-input"
                  rows={1}
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); setRuleError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
                  }}
                  placeholder="Say the heaviest part."
                  maxLength={900}
                  className="max-h-32 min-h-[48px] flex-1 resize-none rounded-card border border-line/15 bg-card px-4 py-3 leading-[1.5] placeholder:text-ash"
                />
                {draft.trim() || !notesOn ? (
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!draft.trim() || busy}
                    aria-label="Send"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-on-gold disabled:opacity-40"
                  >
                    <SendIcon />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startNote}
                    disabled={sendingNote}
                    aria-label="Record a voice note"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-on-gold disabled:opacity-40"
                  >
                    <MicIcon />
                  </button>
                )}
              </div>
            )}
            {sendingNote && (
              <p aria-live="polite" className="mt-1.5 text-fine text-ash">Sending your voice note…</p>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
