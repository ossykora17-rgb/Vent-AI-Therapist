import "server-only";
import { errorKind } from "@/lib/errors";
import { env } from "@/lib/env";
import { adminToken } from "@/lib/voice/livekit";

/**
 * Does the voice server accept the keys this build signs voice tokens with?
 *
 * `services.livekit` answers whether three environment variables are set, and
 * that is all it ever answered — the `models.retrieve` bug from the other
 * side: a green field over a road nobody had driven. Voice was reported broken
 * by a person who tested it twice, and the only evidence available from here
 * was indirect (the lobby's room deletes had stopped logging errors). A key
 * that has been rotated, a project that has been deleted and a URL with a
 * typo all looked exactly like a working deployment.
 *
 * So this asks the SFU as the identity that does the work. `ListRooms` is
 * signed with the same key and secret that mint every join token, so a 401
 * here is a 401 for everybody who taps Join — and an answer here is the one
 * thing a phone cannot report back to us.
 *
 * By hand rather than through `livekit-server-sdk`, for the reason
 * `livekit.ts` gives for minting by hand: a JWT is HMAC, Twirp is one POST,
 * and a probe the zero-dependency gate can run offline is a probe that is
 * actually tested. Never the host, never the SFU's message — the status is the
 * whole report, and the SFU's refusal text quotes the key it refused.
 */
export type VoiceStatus = "ok" | "refused" | "unreachable" | "off";

const PROBE_TIMEOUT_MS = 4_000;

export async function probeVoice(): Promise<VoiceStatus> {
  const token = adminToken({ roomList: true });
  if (!token) return "off";
  try {
    const r = await fetch(
      new URL("/twirp/livekit.RoomService/ListRooms", env.livekitUrl.replace(/^ws/, "http")),
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      },
    );
    if (r.ok) return "ok";
    if (r.status === 401 || r.status === 403) return "refused";
    console.warn("[voice] probe answered", r.status);
    return "unreachable";
  } catch (error) {
    console.warn("[voice] probe failed:", errorKind(error));
    return "unreachable";
  }
}
