import "server-only";
import { createHmac } from "node:crypto";
import { env, isLivekitConfigured } from "@/lib/env";
import { CIRCLE_MINUTES } from "@/lib/circles/rules";
import { errorKind } from "@/lib/errors";
import { heldSeats } from "@/lib/voice/hold";

/**
 * Phase 1, the half that can be built without a dependency.
 *
 * A LiveKit access token is a JWT signed HS256 with the API secret, and Node
 * has HMAC in the standard library — so minting one costs no package. What
 * *does* cost a package is the browser side: WebRTC against an SFU needs
 * `livekit-client`, and there is no zero-dependency path to that. This file
 * is the boundary. It ends where the honest answer is "one dependency, your
 * call" rather than something improvised.
 *
 * The identity rules matter more than the crypto:
 *
 * - The token identity is the **seat**, never the `anon_id`. A voice room
 *   that leaks a stable id across sessions would undo the thing that makes
 *   people speak here at all.
 * - The room name is derived from the circle id and nothing else, so a token
 *   cannot be replayed into a different circle.
 * - It expires with the circle. Forty-five minutes, plus a few for the walk
 *   in — never a long-lived credential sitting in a browser.
 */

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

export interface VoiceGrant {
  circleId: string;
  /** 1–6. The room hears "seat 4", the same as the transcript shows. */
  seat: number;
  /** Only a Keeper may mute the room. */
  keeper: boolean;
  /** Seconds. Defaults to the circle's own length plus a short grace. */
  ttlSeconds?: number;
  /**
   * The Keeper is holding this seat. It joins able to hear and unable to
   * publish, so coming back into voice is not a way out of the hold.
   */
  held?: boolean;
}

export interface VoiceToken {
  token: string;
  url: string;
  room: string;
  identity: string;
  expiresAt: string;
}

/** HS256, by hand. Header, payload, signature — nothing exotic. */
function sign(payload: Record<string, unknown>, secret: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

/**
 * One place decides what a circle's room is called. The token mints it and
 * the mute route resolves it; two spellings would mean a Keeper pressing mute
 * on a room nobody is in.
 */
export const roomNameFor = (circleId: string) => `circle-${circleId}`;

/**
 * A one-minute token for this server's own calls to the SFU's API, signed with
 * the same key and secret as every join token — which is the point of asking
 * with it. Never handed to a browser, and carrying no identity: it is not a
 * seat, it is the deployment.
 */
export function adminToken(video: Record<string, unknown>): string | null {
  if (!isLivekitConfigured) return null;
  const now = Math.floor(Date.now() / 1000);
  return sign({ iss: env.livekitApiKey, nbf: now, exp: now + 60, video }, env.livekitApiSecret);
}

export function mintVoiceToken(grant: VoiceGrant): VoiceToken | null {
  if (!isLivekitConfigured) return null;

  const now = Math.floor(Date.now() / 1000);
  const ttl = grant.ttlSeconds ?? CIRCLE_MINUTES * 60 + 300;
  const room = roomNameFor(grant.circleId);
  const identity = `seat-${grant.seat}`;

  const token = sign(
    {
      iss: env.livekitApiKey,
      sub: identity,
      name: `Seat ${grant.seat}`,
      nbf: now,
      exp: now + ttl,
      video: {
        room,
        roomJoin: true,
        // Voice only. Phase 0 was text because six anonymous strangers on
        // camera is a different product, and a harder promise to keep.
        canPublish: !grant.held,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: ["microphone"],
        // Muting the room is the Keeper's move, the same as ending it early.
        roomAdmin: grant.keeper,
      },
    },
    env.livekitApiSecret,
  );

  return {
    token,
    url: env.livekitUrl,
    room,
    identity,
    expiresAt: new Date((now + ttl) * 1000).toISOString(),
  };
}

const HOLD_LOOKUP_MS = 3_000;

/**
 * The seats the Keeper is holding in this circle's call, read off the room
 * before a token is minted — see `hold.ts` for why the room keeps them.
 *
 * `null` when the SFU could not be asked, and the caller mints an ordinary
 * token: a network blip must never mute a room of people trying to speak.
 * The Keeper's button still shows the hold, and one tap puts it back. No room
 * yet is an empty list, not a failure — nobody can be held in a call that has
 * not started.
 */
export async function heldInRoom(circleId: string): Promise<string[] | null> {
  const token = adminToken({ roomList: true });
  if (!token) return null;
  try {
    const r = await fetch(
      new URL("/twirp/livekit.RoomService/ListRooms", env.livekitUrl.replace(/^ws/, "http")),
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ names: [roomNameFor(circleId)] }),
        signal: AbortSignal.timeout(HOLD_LOOKUP_MS),
      },
    );
    if (!r.ok) {
      console.warn("[voice] hold lookup answered", r.status);
      return null;
    }
    const d = (await r.json()) as { rooms?: { metadata?: string }[] };
    return heldSeats(d.rooms?.[0]?.metadata);
  } catch (error) {
    console.warn("[voice] hold lookup failed:", errorKind(error));
    return null;
  }
}
