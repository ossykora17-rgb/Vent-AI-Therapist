"use client";

import * as React from "react";
import type { Participant, RemoteTrack, Room } from "livekit-client";
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

type Status = "idle" | "joining" | "live" | "error";

interface Props {
  circleId: string;
  anonId: string;
  /** The server says whether voice exists at all. No keys, no button. */
  enabled: boolean;
  /** Only a Keeper is shown the room's volume. The server checks it again. */
  keeper: boolean;
}

export function CircleVoice({ circleId, anonId, enabled, keeper }: Props) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);
  // Shut on arrival. See the push-to-talk comment below for why.
  const [talking, setTalking] = React.useState(false);
  const [latched, setLatched] = React.useState(false);
  // Distinct from the two above: this is the Keeper closing your microphone,
  // which is not yours to undo. Push-to-talk is a choice; this is governance.
  const [muted, setMuted] = React.useState(false);
  const [seat, setSeat] = React.useState<string | null>(null);
  const [voices, setVoices] = React.useState<string[]>([]);
  const [speaking, setSpeaking] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState<string | null>(null);

  const roomRef = React.useRef<Room | null>(null);
  const sinkRef = React.useRef<HTMLDivElement>(null);
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
    setVoices([]);
    setSpeaking([]);
    setSeat(null);
  }, [releaseAudio]);

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

  async function join() {
    setStatus("joining");
    setError(null);

    try {
      const r = await fetch(`/api/circles/${circleId}/voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId }),
      });
      const grant = await r.json();

      if (!r.ok) {
        setError(
          r.status === 501
            ? "Voice isn't configured on this instance."
            : grant.message ?? "Couldn't open the voice room.",
        );
        setStatus("error");
        return;
      }

      // Here, and only here. The 13 MB stays off the wire until somebody
      // actually asks to speak.
      const { Room: LiveKitRoom, RoomEvent, Track } = await import("livekit-client");

      const room = new LiveKitRoom({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach();
          el.setAttribute("data-voice", "1");
          sinkRef.current?.appendChild(el);
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          setSpeaking(speakers.map((p) => p.identity));
        })
        .on(RoomEvent.ParticipantConnected, () => setVoices(identities(room)))
        .on(RoomEvent.ParticipantDisconnected, () => setVoices(identities(room)))
        .on(RoomEvent.TrackMuted, (_pub, participant: Participant) => {
          // Told, never silently silenced. If the Keeper closed your
          // microphone you find out from the room, not from being ignored.
          if (participant.identity === grant.identity) {
            setMuted(true);
            setNotice("The Keeper closed your microphone. The room is still here in text.");
          }
        })
        .on(RoomEvent.TrackUnmuted, (_pub, participant: Participant) => {
          if (participant.identity === grant.identity) {
            setMuted(false);
            setNotice("Your microphone is open again.");
          }
        })
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          // The SFU can drop us without `leave` ever running — a network
          // change, a token expiry, the Keeper ending the room. The microphone
          // has to close on that path too.
          releaseAudio();
          setStatus("idle");
          setVoices([]);
          setSpeaking([]);
        });

      await room.connect(grant.url, grant.token);

      // Microphone only — there is no camera call in this file, deliberately.
      //
      // And never the raw microphone. Everything else about a circle is
      // anonymous by construction; a voice is a biometric, and the person this
      // is built for is usually talking about somebody who would recognise it.
      // `maskMicrophone` shifts it four semitones before anything is
      // published. See lib/voice/mask.ts for what that does and does not
      // promise.
      //
      // The order matters: get the stream, mask it, publish the masked track.
      // `setMicrophoneEnabled(true)` would publish the real one, so it is not
      // used here and must not come back.
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micRef.current = mic;

      const { maskMicrophone } = await import("@/lib/voice/mask");
      const masked = maskMicrophone(mic, "deeper");
      if (!masked) {
        // Fail to silence, never to an unmasked person who believed they were
        // masked. They stay in the room and can still read and write.
        mic.getTracks().forEach((t) => t.stop());
        micRef.current = null;
        setNotice(
          "This browser can't disguise your voice, so the microphone stayed shut. The room is still here in text.",
        );
      } else {
        maskRef.current = masked;
        const publication = await room.localParticipant.publishTrack(masked.track, {
          source: Track.Source.Microphone,
        });
        // Closed on arrival. A published track is live by default, so without
        // this the room hears the first thing you say before you have decided
        // to say it — which for somebody who just walked into a room of
        // strangers is the worst possible first second.
        await publication.mute();
        setTalking(false);
        setLatched(false);
      }

      setSeat(grant.identity);
      setVoices(identities(room));
      setStatus("live");
    } catch (e) {
      // A refused microphone and an unreachable SFU look the same to a person
      // in a circle, so say which it was.
      const message = e instanceof Error ? e.message : String(e);
      setError(
        /permission|NotAllowed/i.test(message)
          ? "Your browser refused the microphone. The room is still here in text."
          : `Couldn't reach the voice room. ${message}`,
      );
      setStatus("error");
      roomRef.current = null;
      // Whatever failed, the microphone does not stay open because of it.
      releaseAudio();
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
      const d = await r.json();
      setNotice(
        r.ok
          ? `${identity} ${next ? "muted" : "unmuted"}. They were told.`
          : d.message ?? "That didn't go through.",
      );
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
   * is it. That also avoids `Track.Source`, which is only in scope inside
   * `join` — and CLAUDE.md's standing rule is to use the SDK's own enums
   * rather than hand-written values, so needing neither is the right answer.
   *
   * The raw-stream fallback means the control is never a no-op. A microphone
   * control that silently fails is the one control in here that has to work.
   */
  const setOpen = React.useCallback(async (open: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    const pub = [...room.localParticipant.audioTrackPublications.values()][0];
    if (pub) {
      if (open) await pub.unmute();
      else await pub.mute();
    } else {
      micRef.current?.getAudioTracks().forEach((t) => (t.enabled = open));
    }
  }, []);

  /*
   * Hold to speak, and a latch for when you cannot hold anything.
   *
   * An open microphone in a six-seat room leaks more than a voice. A
   * generator, the call to prayer, a street, somebody in the next room saying
   * your actual name — ambient sound places a person as reliably as their
   * voice does, and the mask does nothing about any of it. Six open mics also
   * make a circle unlistenable, which is the ordinary reason every voice
   * product ends up here.
   *
   * So the microphone is shut on arrival and opens while you hold the bar.
   *
   * The latch is not a convenience. Somebody crying cannot hold a button, and
   * a product that requires steady hands from people at their worst has
   * chosen the wrong default for the exact moment it exists for. Tap the lock
   * and the mic stays open; it is one tap back.
   */
  const setTalkingSafely = React.useCallback(
    (on: boolean) => {
      setTalking(on);
      void setOpen(on || latched);
    },
    [setOpen, latched],
  );

  const toggleLatch = React.useCallback(() => {
    const next = !latched;
    setLatched(next);
    void setOpen(next || talking);
  }, [latched, talking, setOpen]);

  // Space is the hold key. Ignored while typing, so it never swallows a space
  // in the message box — the transcript is right there and people use it.
  React.useEffect(() => {
    if (status !== "live") return;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typing(e.target)) return;
      e.preventDefault();
      setTalkingSafely(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e.target)) return;
      setTalkingSafely(false);
    };
    // A tab-away with the key still down would otherwise leave it open.
    const blur = () => setTalkingSafely(false);

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [status, setTalkingSafely]);

  if (!enabled) return null;

  return (
    <div className="glass mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/*
          Say that the voice is disguised, before they speak and while they
          are speaking.

          A safety feature nobody is told about is one nobody trusts, and the
          decision this sentence changes — whether to say the true thing or the
          safe one — is made in the two seconds before the join button. Putting
          it in a settings panel would be the same as not having it.

          The claim is deliberately bounded: "not recognisably yours" rather
          than "anonymous". A fixed pitch shift raises the cost of recognition;
          it does not make it impossible, and somebody who already suspects
          will hear cadence and the story regardless. Overstating it here would
          be the exact bug this codebase keeps removing, on the one screen
          where being wrong has a person on the other end of it.
        */}
        <div className="min-w-0">
          <p className="label-mono">Voice · audio only</p>
          <p className="mt-1 text-sm text-ash">
            {status === "live"
              ? `${voices.length} ${voices.length === 1 ? "voice" : "voices"} in the room. You are ${seat}.`
              : "No camera, ever. Your seat number is all anyone hears."}
          </p>
          <p className="mt-1 text-sm text-gold">
            {status === "live"
              ? "Your voice is pitched down — not recognisably yours."
              : "Your voice is pitched down before it leaves your phone."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {status === "live" && (
            <button
              type="button"
              onClick={toggleLatch}
              aria-pressed={latched}
              disabled={muted}
              title={latched ? "Close the microphone" : "Keep the microphone open"}
              className={cn(
                "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
                latched ? "border-gold bg-gold/15" : "border-line/15",
                muted && "opacity-40",
              )}
            >
              {latched ? "Open mic · on" : "Open mic"}
            </button>
          )}
          <button
            type="button"
            onClick={status === "live" ? leave : join}
            disabled={status === "joining"}
            className={cn(
              "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
              status === "live" ? "border-line/25" : "border-line/15",
              status === "joining" && "opacity-60",
            )}
          >
            {status === "joining" ? "Opening…" : status === "live" ? "Leave voice" : "Join voice"}
          </button>
        </div>
      </div>

      {/*
        The bar you hold to speak.

        Full width and 64px tall because it is held with a thumb, often by
        somebody who is not steady. Every pointer exit closes it — up, cancel,
        and leave — so a finger sliding off the edge shuts the microphone
        rather than leaving it open on a person who thinks they stopped.

        `touch-none` stops the browser treating the press as a scroll gesture
        and stealing the pointerup, which is the standard way this control
        breaks on Android.
      */}
      {status === "live" && !muted && (
        <div className="mt-4">
          <button
            type="button"
            aria-pressed={talking || latched}
            /*
              No accessible-name override here, deliberately.

              This carried a fixed label reading "Hold to speak" over a button
              that renders three different things — and when the mic is
              latched open it shows "Microphone open" while still announcing
              the old one. That is not a naming mismatch, it is an instruction
              to do something that does nothing: hold a button that is already
              open, told only to the person who cannot see that it is.

              The visible text is correct in all three states, so it is the
              name. `aria-pressed` carries the state, which is what it is for.
              An override could only ever be a fourth string to keep in sync
              with three.
            */
            onPointerDown={() => setTalkingSafely(true)}
            onPointerUp={() => setTalkingSafely(false)}
            onPointerCancel={() => setTalkingSafely(false)}
            onPointerLeave={() => setTalkingSafely(false)}
            className={cn(
              "flex h-16 w-full touch-none select-none items-center justify-center rounded-card border text-[15px] font-semibold transition-all duration-200",
              talking || latched
                ? "border-gold bg-gold/20 text-ink"
                : "border-line/20 text-ash",
            )}
          >
            {latched
              ? "Microphone open"
              : talking
                ? "Speaking — let go to stop"
                : "Hold to speak"}
          </button>
          <p className="label-mono mt-2 text-center">
            {latched ? "Tap “Open mic” to close it again" : "Or hold the space bar"}
          </p>
        </div>
      )}

      {status === "live" && voices.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-live="polite">
          {voices.map((id) => (
            <li
              key={id}
              // Lit, not merely darker.
              //
              // This went from grey text to black text — the doc comment at
              // the top of this file promises "a lit ring on a seat" and what
              // it delivered was a shade change you could miss across the
              // room. In a voice circle, who is speaking is the only evidence
              // there are people here at all; it is what a face does in a
              // room, and it has to be unmistakable at a glance.
              //
              // Gold, because the whole product has one light and this is it
              // landing on whoever is talking.
              className={cn(
                "label-mono flex items-center gap-2 rounded-full border px-3 py-1 transition-all duration-300",
                speaking.includes(id)
                  ? "border-gold bg-gold/15 text-ink shadow-[0_0_0_3px_rgb(var(--gold)/0.12)]"
                  : "border-line/15 text-ash",
              )}
            >
              <span>
                {id === seat ? `${id} (you)` : id}
                {speaking.includes(id) ? " · speaking" : ""}
              </span>
              {keeper && id !== seat && (
                <button
                  type="button"
                  onClick={() => muteSeat(id, true)}
                  disabled={working === id}
                  className="underline underline-offset-2 disabled:opacity-50"
                >
                  {working === id ? "…" : "mute"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {notice && <p className="mt-3 text-sm text-ash" aria-live="polite">{notice}</p>}
      {error && <p className="mt-3 text-sm text-ash">{error}</p>}

      {/* Audio elements land here. Hidden, but in the DOM — a detached element
          does not play in Safari. */}
      <div ref={sinkRef} className="sr-only" />
    </div>
  );
}

function identities(room: Room): string[] {
  return [
    room.localParticipant.identity,
    ...Array.from(room.remoteParticipants.values()).map((p) => p.identity),
  ];
}
