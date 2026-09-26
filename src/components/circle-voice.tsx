"use client";

import * as React from "react";
import type { Participant, RemoteTrack, Room, Track } from "livekit-client";
import { audioContextInGesture, maskMicrophone, personaFor, whenRunning } from "@/lib/voice/mask";
import { cn } from "@/lib/utils";

/**
 * Phase 1 — voice, audio only.
 *
 * Six anonymous people on camera is a different product and a harder promise;
 * a voice is what ends the void without asking anybody to be seen. So the
 * grant is microphone-only, the identity is a seat, and there is no path in
 * this component that publishes video.
 *
 * `livekit-client` is 13 MB and most sessions are text. It is therefore
 * imported **inside the join handler**, never at module scope — somebody who
 * only ever reads a circle downloads none of it.
 *
 * Speaking is the presence signal that matters here. The dots upstairs prove
 * somebody is in the room; a lit ring on a seat proves somebody is talking,
 * and that is the thing you cannot fake with a poll.
 */

export type Status = "idle" | "joining" | "live" | "error";

/**
 * What the room can hear from you, as three states rather than two booleans.
 *
 * `unavailable` is its own state because it was the invisible one: the mask
 * refused, nothing was published, and the screen still drew a live room with
 * a bar reading "Hold to speak". Holding it changed the label to "Speaking"
 * and sent nothing. A control that reports speech while the room hears
 * silence is the worst thing a voice room can do, so the missing microphone
 * now has a name, a sentence and a button that fixes it.
 */
type Mic = "off" | "on" | "unavailable";

interface Grant {
  url: string;
  token: string;
  identity: string;
}

interface Props {
  circleId: string;
  anonId: string;
  /** The server says whether voice exists at all. No keys, no button. */
  enabled: boolean;
  /** Only a Keeper is shown the room's volume. The server checks it again. */
  keeper: boolean;
  /**
   * Which seats are speaking, handed up to the room that draws them.
   *
   * The ring already shows six chairs and which is yours. It was built to
   * show speech too and had nothing to tell it — the only component that
   * knows is this one, and it was rendering the same information as a list of
   * text chips underneath. Lifting it puts presence, identity and speech in
   * one object instead of three, which is the difference between a diagram
   * and a decoration.
   */
  onSpeaking?: (seats: number[]) => void;
  /** Where the voice room is, for the header icon that opens it. */
  onStatus?: (status: Status) => void;
  /** The header's phone icon calls `toggle` from inside its own tap. */
  ref?: React.Ref<VoiceHandle>;
}

export interface VoiceHandle {
  toggle: () => void;
}

/**
 * Five ways to be refused a microphone, and each has its own sentence.
 *
 * `getUserMedia` rejects with a *name*, and the names are the whole diagnosis:
 *
 *   NotAllowedError    the person said no — or a Permissions-Policy did
 *   NotFoundError      there is no microphone on this device
 *   NotReadableError   something else has it: a call, another tab
 *   SecurityError      not a secure context, so http rather than https
 *   AbortError         the hardware gave up
 *
 * `vercel.json` once sent `Permissions-Policy: microphone=()`, and `()` means
 * *no origin may use this*, including the site that set it — every press of
 * Join got `NotAllowedError` with no prompt at all, and the message blamed the
 * browser for obeying a header we wrote. Check 69 holds the header.
 *
 * A refused microphone no longer ends the voice session. You were already in
 * the room when the browser was asked, and hearing it does not need a
 * microphone — so the room stays open to listen and says what happened.
 */
function micRefusal(name: string): string {
  return name === "NotAllowedError"
    ? "The microphone was blocked. Check the permission for this site in your browser settings — you can still hear the room, and type."
    : name === "NotFoundError"
      ? "No microphone on this device. You can still hear the room, and type."
      : name === "NotReadableError"
        ? "Something else is using the microphone — a call, or another tab. You can still hear the room, and type."
        : name === "SecurityError"
          ? "Voice needs a secure connection. You can still hear the room, and type."
          : "The microphone didn't open. You can still hear the room, and type.";
}

export function CircleVoice({ circleId, anonId, enabled, keeper, onSpeaking, onStatus, ref }: Props) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);
  // Shut on arrival. See `openMic` for why.
  const [mic, setMic] = React.useState<Mic>("off");
  /*
    Whether this browser is letting the room's sound out.

    iPhones refuse to play a page's audio unless the play began in a tap, or
    the page is itself publishing a microphone. LiveKit says so in its own
    source: "iOS blocks audio element playback if user is not publishing audio
    themselves and no other audio source is playing". The room is heard
    through `<audio>` elements attached seconds after the tap that joined, so
    on an iPhone whose microphone had not opened — every one of them, until
    the mask fix — the room was silent in both directions. `room.startAudio()`
    is the unlock, and it only works from a tap, so it gets a button.
  */
  const [canHear, setCanHear] = React.useState(true);
  // Distinct from `mic`: this is the Keeper closing your microphone, which is
  // not yours to undo. Talking is a choice; this is governance.
  const [muted, setMuted] = React.useState(false);
  const [seat, setSeat] = React.useState<string | null>(null);
  const [voices, setVoices] = React.useState<string[]>([]);
  const [speaking, setSpeaking] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState<string | null>(null);
  /** Seats this Keeper has closed, by identity — the only way to tell their
   *  mute from somebody muting themselves, which raises the same event. */
  const [closedByMe, setClosedByMe] = React.useState<string[]>([]);

  const roomRef = React.useRef<Room | null>(null);
  const grantRef = React.useRef<Grant | null>(null);
  // `Track.Source.Microphone`, kept from the one dynamic import so a second
  // attempt at the microphone does not need the SDK imported anywhere else.
  const sourceRef = React.useRef<Track.Source | null>(null);
  const sinkRef = React.useRef<HTMLDivElement>(null);
  /*
    How many mute/unmute events are ours and not the Keeper's.

    `RoomEvent.TrackMuted` fires for *every* mute on the track, including the
    ones this component performs itself — and it performs two kinds. The
    microphone is muted the instant it is published, deliberately, so the room
    does not hear the first thing you say before you have decided to say it.
    And the talk button mutes and unmutes on every tap.

    Both arrived at the handler below as "somebody muted your track", which
    reported them as governance: *The Keeper closed your microphone.* To a
    person sitting alone in a room they opened themselves, as the Keeper.
    Worse than the wrong sentence — it also set `muted`, which disables the
    talk button, so joining voice silenced you permanently and told you the
    Keeper had done it. The one control in here that has to work could never
    be pressed.

    A counter rather than a boolean because taps can arrive faster than React
    commits state, and two of ours in flight must not let a real one through
    in between.
  */
  const ownMutesRef = React.useRef(0);
  // The raw microphone and the audio graph masking it. Both have to be torn
  // down by hand: disconnecting the room stops the published track, and leaves
  // the real microphone open and the AudioContext running. A live mic light
  // after you left the room is the single most alarming thing this app could
  // do to somebody who came here to be unheard.
  const micRef = React.useRef<MediaStream | null>(null);
  const maskRef = React.useRef<{ stop: () => void } | null>(null);

  const releaseAudio = React.useCallback(() => {
    maskRef.current?.stop();
    maskRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
  }, []);

  const leave = React.useCallback(async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    releaseAudio();
    setStatus("idle");
    setMic("off");
    setCanHear(true);
    setVoices([]);
    setSpeaking([]);
    onSpeaking?.([]);
    setSeat(null);
    setClosedByMe([]);
  }, [releaseAudio, onSpeaking]);

  // Leaving the page is leaving the room. Without this the SFU holds a ghost
  // participant and the seat looks occupied by somebody who is gone — and the
  // microphone stays open on a page nobody is looking at.
  React.useEffect(
    () => () => {
      void roomRef.current?.disconnect();
      releaseAudio();
    },
    [releaseAudio],
  );

  /**
   * Ask the browser to let the room's sound out. Only ever from a tap.
   */
  const hear = React.useCallback(() => {
    const room = roomRef.current;
    if (!room || room.canPlaybackAudio) return;
    void room
      .startAudio()
      .then(() => setCanHear(room.canPlaybackAudio))
      .catch(() =>
        setNotice("The sound is still held back. Check the phone isn't on silent, then tap again."),
      );
  }, []);

  /**
   * Get the microphone, mask it, publish it closed.
   *
   * `ctx` must have been made by `audioContextInGesture` as the first line of
   * the tap that led here — `join`, or the "Turn on my microphone" button when
   * a first attempt was held back. That single line is the iPhone fix: a
   * context made after the awaits below is born suspended on Safari and stays
   * that way, and the mask rightly refuses to publish a graph that is not
   * running. Made in the tap, it is allowed to start, and `whenRunning` waits
   * for it to say so instead of reading the state too early.
   */
  async function openMic(ctx: AudioContext | null) {
    const room = roomRef.current;
    const grant = grantRef.current;
    if (!room || !grant) {
      void ctx?.close();
      return;
    }

    let mic: MediaStream;
    try {
      // Microphone only — there is no camera call in this file, deliberately.
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      void ctx?.close();
      const name = e instanceof DOMException ? e.name : "";
      console.warn("[voice] microphone refused:", name || "unknown");
      setMic("unavailable");
      setNotice(micRefusal(name));
      return;
    }
    micRef.current = mic;

    // Asking for the microphone can pause a running context on an iPhone while
    // the audio session changes over, so the wait comes after the prompt.
    if (ctx) await whenRunning(ctx);

    /*
      Never the raw microphone. Everything else about a circle is anonymous by
      construction; a voice is a biometric, and the person this is built for
      is usually talking about somebody who would recognise it. The mask shifts
      it before anything is published — see lib/voice/mask.ts for what that
      does and does not promise.

      The order matters: get the stream, mask it, publish the masked track.
      `setMicrophoneEnabled(true)` would publish the real one, so it is not
      used here and must not come back.

      The persona comes from the seat, not from a constant. One shift for
      everybody was one key for everybody: the shifter is a uniform scaling,
      and one recovered ratio would have unmasked every speaker in every circle
      ever held. `grant.identity` is `seat-N`, assigned server-side from join
      order, so this is stable for the session and carries nothing onward.

      Reported to the console with a name, and to the person in words that are
      true of their case. Never the raw reason on screen: somebody who came
      here to say a hard thing does not need `context_suspended`.
    */
    let why: string | null = null;
    const masked = maskMicrophone(mic, personaFor(grant.identity), (reason) => {
      why = reason;
      console.warn("[voice] mask unavailable:", reason);
    }, ctx);
    if (!masked) {
      // Fail to silence, never to an unmasked person who believed they were
      // masked. They stay in the room, can hear it, and can still write.
      mic.getTracks().forEach((t) => t.stop());
      micRef.current = null;
      setMic("unavailable");
      setNotice(
        why === "context_suspended"
          // True of their case, and now it points at a button that exists.
          // This used to read "Tap Join once more" to somebody whose screen
          // said "Leave voice" — and a second Join ran into the same wall.
          ? "Your phone held the microphone back. Tap “Turn on my microphone” — you can already hear the room."
          : "This browser can't disguise your voice, so the microphone stayed shut. You can still hear the room, and type.",
      );
    } else {
      maskRef.current = masked;
      const publication = await room.localParticipant.publishTrack(masked.track, {
        source: sourceRef.current ?? undefined,
      });
      // Closed on arrival. A published track is live by default, so without
      // this the room hears the first thing you say before you have decided
      // to say it — which for somebody who just walked into a room of
      // strangers is the worst possible first second.
      ownMutesRef.current += 1;
      await publication.mute();
      setMic("off");
      setNotice(null);
    }
  }

  async function join() {
    // Before anything is awaited: the tap is the only moment a phone lets
    // audio start. See `openMic`.
    const ctx = audioContextInGesture();
    setStatus("joining");
    setError(null);
    setNotice(null);

    try {
      const r = await fetch(`/api/circles/${circleId}/voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId }),
      });
      const grant = await r.json();

      if (!r.ok) {
        void ctx?.close();
        setError(
          r.status === 501
            // "Voice isn't configured on this instance" is a sentence about
            // our deployment. The room is not broken and nothing is lost — the
            // circle works, typed, exactly as it always does.
            ? "Voice isn't switched on here. The room still works — type."
            : grant.message ?? "Couldn't open the voice room.",
        );
        setStatus("error");
        return;
      }

      // Here, and only here. The 13 MB stays off the wire until somebody
      // actually asks to speak.
      const { Room: LiveKitRoom, RoomEvent, Track: LiveKitTrack } = await import("livekit-client");

      const room = new LiveKitRoom({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      grantRef.current = grant;
      sourceRef.current = LiveKitTrack.Source.Microphone;

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind !== LiveKitTrack.Kind.Audio) return;
          const el = track.attach();
          el.setAttribute("data-voice", "1");
          sinkRef.current?.appendChild(el);
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setCanHear(room.canPlaybackAudio))
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const ids = speakers.map((p) => p.identity);
          setSpeaking(ids);
          // `seat-3` → 3. Anything that does not parse is dropped rather than
          // drawn at index NaN — an identity shape this file does not own is
          // not a chair to light up.
          onSpeaking?.(
            ids
              .map((id) => Number(id.replace("seat-", "")))
              .filter((n) => Number.isInteger(n)),
          );
        })
        .on(RoomEvent.ParticipantConnected, () => setVoices(identities(room)))
        .on(RoomEvent.ParticipantDisconnected, () => setVoices(identities(room)))
        .on(RoomEvent.TrackMuted, (_pub, participant: Participant) => {
          // Told, never silently silenced. If the Keeper closed your
          // microphone you find out from the room, not from being ignored.
          if (participant.identity !== grant.identity) return;
          // Ours, and expected. The talk button and the mute-on-arrival both
          // land here; neither is somebody else acting on you.
          if (ownMutesRef.current > 0) {
            ownMutesRef.current -= 1;
            return;
          }
          setMuted(true);
          setMic("off");
          setNotice("The Keeper closed your microphone. The room is still here in text.");
        })
        // The Keeper letting go: the hold is a mark on this seat, and clearing
        // it hands the microphone back without opening it.
        .on(RoomEvent.ParticipantMetadataChanged, (_prev: string | undefined, participant: Participant) => {
          if (participant.identity !== grant.identity) return;
          if (readHeld(participant.metadata) !== false) return;
          setMuted(false);
          setNotice("You can speak again. Your microphone stays off until you tap.");
        })
        .on(RoomEvent.TrackUnmuted, (_pub, participant: Participant) => {
          if (participant.identity !== grant.identity) return;
          if (ownMutesRef.current > 0) {
            ownMutesRef.current -= 1;
            return;
          }
          setMuted(false);
          setNotice("Your microphone is open again.");
        })
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          // The SFU can drop us without `leave` ever running — a network
          // change, a token expiry, the Keeper ending the room. The microphone
          // has to close on that path too.
          releaseAudio();
          setStatus("idle");
          setMic("off");
          setVoices([]);
          setSpeaking([]);
        });

      await room.connect(grant.url, grant.token);

      // Hearing does not wait on speaking. Desktop browsers allow this off the
      // tap that joined; an iPhone may not, and then the button asks for a
      // tap of its own.
      await room.startAudio().catch(() => {});
      setCanHear(room.canPlaybackAudio);
      setSeat(grant.identity);
      setVoices(identities(room));
      setStatus("live");

      await openMic(ctx);
    } catch (e) {
      /*
        Everything that is not a microphone, which is most of this block.

        The `try` covers `import("livekit-client")`, `room.connect(grant.url,
        grant.token)` and the publish. None of those throw a `DOMException`,
        and their messages name things that are ours and not the person's: a
        LiveKit connection failure names the URL it could not reach — our
        LiveKit project host — and a failed dynamic import names a
        `_next/static/chunks` path. This component once printed that raw
        `Error.message` to whoever pressed Join, the exact bug the voice route
        already had recorded against it for three environment variable names.

        So the log carries the error's *kind* rather than its text, always, and
        the person gets one true sentence about what still works. The
        microphone's own five refusals are answered in `openMic`, where they
        happen, and no longer end the session.
      */
      const name = e instanceof DOMException ? e.name : "";
      const kind = name || (e instanceof Error ? e.constructor.name : typeof e);
      console.warn("[voice] join failed:", kind);
      setError("Couldn't reach the voice room. The circle still works in text — say it there.");
      setStatus("error");
      void roomRef.current?.disconnect();
      roomRef.current = null;
      // Whatever failed, the microphone does not stay open because of it.
      releaseAudio();
      void ctx?.close();
    }
  }

  /**
   * The Keeper's one control over somebody else's voice. It mutes, it never
   * removes — ejecting a person from a room they came to for support is not
   * moderation. And it is the same request to undo.
   */
  async function muteSeat(identity: string, next: boolean) {
    const seat = Number(identity.replace("seat-", ""));
    setWorking(identity);
    try {
      const r = await fetch(`/api/circles/${circleId}/voice/mute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId, seat, muted: next }),
      });
      const d = await r.json().catch(() => null);
      // The body decides: the route answers `{ ok: true }` once the SFU took it.
      if (r.ok && d?.ok === true) {
        setClosedByMe((was) => (next ? [...was.filter((v) => v !== identity), identity] : was.filter((v) => v !== identity)));
        setNotice(`Seat ${seat} ${next ? "muted" : "can speak again"}. They were told.`);
      } else {
        setNotice(typeof d?.message === "string" ? d.message : "That didn't go through.");
      }
    } catch {
      setNotice("That didn't go through.");
    } finally {
      setWorking(null);
    }
  }

  /**
   * Open or close the microphone, once, in one place.
   *
   * `setMicrophoneEnabled` manages LiveKit's *own* microphone track and this
   * room does not have one — the published track is the masked graph,
   * published by hand. Calling it did nothing to what the room heard and
   * would have opened a second, unmasked track.
   *
   * `audioTrackPublications` rather than a source comparison: this room
   * publishes exactly one audio track and never any video, so the first entry
   * is it.
   */
  const setOpen = React.useCallback(async (open: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    const pub = [...room.localParticipant.audioTrackPublications.values()][0];
    if (!pub) return;
    /*
      Counted before the call, not after.

      Every tap raises `TrackMuted`/`TrackUnmuted` for our own identity.
      Uncounted, closing your own microphone reported the Keeper closing it.
      Incremented ahead of the await because the event can arrive before the
      promise resolves; a counter bumped afterwards is a counter that is still
      zero when the handler reads it.
    */
    ownMutesRef.current += 1;
    if (open) await pub.unmute();
    else await pub.mute();
  }, []);

  /*
    Tap to talk, tap again to stop. It used to be a bar you had to hold.

    The hold existed for good reasons — ambient sound places a person as
    reliably as their voice, and six open microphones make a room unlistenable
    — and it failed at the one thing a voice control has to do: tell you
    whether anybody can hear you. It looked exactly like a voice-note recorder,
    so people held it, spoke, let go and waited for a message that was never
    going to exist; people who spoke without holding were heard by nobody. A
    latch sat beside it for "somebody crying cannot hold a button", which made
    two controls for one microphone.

    One button now, and it says the state in words: shut on arrival, open
    only when you tap it, shut again with a second tap. The privacy the hold
    bought is kept by the arrival — nothing is heard until you choose — and
    the tap doubles as the gesture an iPhone needs to let the room be heard.
  */
  const toggleMic = React.useCallback(() => {
    hear();
    const next = mic !== "on";
    setMic(next ? "on" : "off");
    void setOpen(next);
  }, [hear, mic, setOpen]);

  /** A second try at the microphone, from its own tap. */
  function retryMic() {
    // First, before anything is awaited — the same rule as `join`.
    const ctx = audioContextInGesture();
    hear();
    setNotice(null);
    void openMic(ctx).catch(() => {
      releaseAudio();
      setMic("unavailable");
      setNotice("The microphone didn't open. You can still hear the room, and type.");
    });
  }

  /*
    The room's phone icon, answered here.

    The call lives in the header now, where a group chat keeps it, so the tap
    arrives through this handle — and it has to call `join` *synchronously*,
    inside that tap. An effect or a state change would run after the event and
    hand an iPhone an AudioContext made outside the gesture, which is the bug
    this component was just rebuilt around.
  */
  React.useImperativeHandle(ref, () => ({
    toggle() {
      if (status === "live") void leave();
      else if (status !== "joining") void join();
    },
  }));

  React.useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  if (!enabled || status === "idle") return null;

  const others = Math.max(0, voices.length - 1);

  return (
    /*
      A bar under the room's name while you are in voice, the way a phone shows
      a call you are on — sticky, because the microphone is the one control
      that must never scroll out of reach while it is open.

      Nothing when you are not in voice. The offer is the phone icon in the
      header, and the claim a person needs before they speak is made here, in
      the two seconds before "Tap to talk": the microphone arrives shut, so
      joining is not speaking, and this sentence is read before anything is.
    */
    <div className="sticky top-16 z-20 border-b border-line/10 bg-paper/95 backdrop-blur-glass">
      <div className="mx-auto max-w-[640px] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="label-mono">
              {/* "In voice", because the header already counts who is in the
                  room — and a room of two with one in voice is not "only you". */}
              {status === "live"
                ? others === 0
                  ? "In voice · just you"
                  : `In voice · you and ${others} ${others === 1 ? "other" : "others"}`
                : status === "joining"
                  ? "Voice · opening…"
                  : "Voice"}
            </p>
            {status === "live" && (
              <p className="mt-0.5 text-fine text-ink">
                {mic === "unavailable"
                  ? "Your microphone is off. You can still hear the room."
                  : "Your voice is pitched down. Nobody hears which seat you are in."}
              </p>
            )}
          </div>

          {status === "live" && (
            <button
              type="button"
              onClick={leave}
              className="min-h-[44px] shrink-0 rounded-full border border-line/25 px-4 text-body"
            >
              Leave voice
            </button>
          )}
          {status === "error" && (
            <button
              type="button"
              onClick={join}
              className="min-h-[44px] shrink-0 rounded-full border border-line/25 px-4 text-body"
            >
              Try again
            </button>
          )}
        </div>

        {status === "live" && !canHear && (
          <button
            type="button"
            onClick={hear}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-card bg-gold px-4 text-body font-semibold text-on-gold"
          >
            Tap to hear the room
          </button>
        )}

        {/*
          The microphone, as one button that says what it is doing.

          Full width because it is pressed with a thumb, often by somebody who
          is not steady. `aria-pressed` carries the state for a screen reader;
          the visible text carries it for everybody else, so there is no
          accessible-name override to drift out of step with it.
        */}
        {status === "live" && mic === "unavailable" && (
          <button
            type="button"
            onClick={retryMic}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-card border border-gold text-body font-semibold text-ink"
          >
            Turn on my microphone
          </button>
        )}
        {status === "live" && mic !== "unavailable" && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={muted}
            aria-pressed={mic === "on"}
            className={cn(
              "mt-3 flex h-12 w-full select-none items-center justify-center rounded-card border text-body font-semibold transition-all duration-200",
              mic === "on" ? "border-gold bg-gold/20 text-ink" : "border-line/20 text-ash",
              muted && "opacity-40",
            )}
          >
            {muted
              ? "Microphone closed by the Keeper"
              : mic === "on"
                ? "Microphone on — tap to mute"
                : "Tap to talk"}
          </button>
        )}

        {/*
          The Keeper's one control over somebody else's voice, which the room
          lost when the seat ring went: `muteSeat` sat here with no button for
          a month. One row, only for the Keeper, only for seats in voice with
          them — mute, never remove, and the same tap undoes it.
        */}
        {status === "live" && keeper && voices.some((v) => v !== seat && /^seat-\d+$/.test(v)) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {voices
              .filter((v) => v !== seat && /^seat-\d+$/.test(v))
              .map((v) => {
                const closed = closedByMe.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => void muteSeat(v, !closed)}
                    disabled={working === v}
                    aria-pressed={closed}
                    className={cn(
                      "min-h-[44px] rounded-full border px-4 text-body text-ink disabled:opacity-40",
                      closed ? "border-gold bg-gold/20" : "border-line/25",
                      speaking.includes(v) && "ring-2 ring-gold/60",
                    )}
                  >
                    {closed ? "Unmute" : "Mute"} Seat {v.slice(5)}
                  </button>
                );
              })}
          </div>
        )}

        {notice && <p className="mt-2 text-fine text-ash" aria-live="polite">{notice}</p>}
        {error && <p className="mt-2 text-fine text-ash">{error}</p>}
      </div>

      {/* Audio elements land here. Hidden, but in the DOM — a detached element
          does not play in Safari. */}
      <div ref={sinkRef} className="sr-only" />
    </div>
  );
}


/** The Keeper's hold on a seat, as the server wrote it into that seat's metadata. */
function readHeld(metadata: string | undefined): boolean | null {
  try {
    const v = JSON.parse(metadata ?? "") as { held?: unknown } | null;
    return typeof v?.held === "boolean" ? v.held : null;
  } catch {
    return null;
  }
}

function identities(room: Room): string[] {
  return [
    room.localParticipant.identity,
    ...Array.from(room.remoteParticipants.values()).map((p) => p.identity),
  ];
}
