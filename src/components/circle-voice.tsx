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
  const [muted, setMuted] = React.useState(false);
  const [seat, setSeat] = React.useState<string | null>(null);
  const [voices, setVoices] = React.useState<string[]>([]);
  const [speaking, setSpeaking] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState<string | null>(null);

  const roomRef = React.useRef<Room | null>(null);
  const sinkRef = React.useRef<HTMLDivElement>(null);

  const leave = React.useCallback(async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus("idle");
    setVoices([]);
    setSpeaking([]);
    setSeat(null);
  }, []);

  // Leaving the page is leaving the room. Without this the SFU holds a ghost
  // participant and the seat looks occupied by somebody who is gone.
  React.useEffect(() => () => void roomRef.current?.disconnect(), []);

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
          setStatus("idle");
          setVoices([]);
          setSpeaking([]);
        });

      await room.connect(grant.url, grant.token);
      // Microphone only. There is no camera call in this file, deliberately.
      await room.localParticipant.setMicrophoneEnabled(true);

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

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  if (!enabled) return null;

  return (
    <div className="glass mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="label-mono">Voice · audio only</p>
          <p className="mt-1 text-sm text-ash">
            {status === "live"
              ? `${voices.length} ${voices.length === 1 ? "voice" : "voices"} in the room. You are ${seat}.`
              : "No camera, ever. Your seat number is all anyone hears."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {status === "live" && (
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              className={cn(
                "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
                muted ? "border-line/40 bg-line/10" : "border-line/15",
              )}
            >
              {muted ? "Unmute" : "Mute"}
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

      {status === "live" && voices.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-live="polite">
          {voices.map((id) => (
            <li
              key={id}
              className={cn(
                "label-mono flex items-center gap-2 rounded-full border px-3 py-1 transition-colors duration-300",
                speaking.includes(id) ? "border-ink text-ink" : "border-line/15 text-ash",
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
