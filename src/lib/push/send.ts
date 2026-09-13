import "server-only";
import { createHmac, createSign, createECDH, randomBytes, createCipheriv } from "node:crypto";
import { errorKind } from "@/lib/errors";
import type { Store } from "@/lib/store/types";

/**
 * Web Push, by hand, because the dependency is not worth it here.
 *
 * `web-push` is a fine library and this product would carry one more thing to
 * audit for one notification sent at most a handful of times a day. What is
 * below is VAPID (RFC 8292) plus aes128gcm content encoding (RFC 8291) and
 * nothing else — no payload beyond a short fixed object, no topics, no
 * urgency, no TTL games.
 *
 * ONE NOTIFICATION, AND THE REASON IT IS ONLY ONE
 *
 * Of the first sixteen circles, fourteen held exactly one person. The steering
 * in #185 stops the product opening a second empty room; it cannot make the
 * first person still be there when the second arrives. This exists to say one
 * sentence — somebody sat down in the room you are holding — and there is
 * deliberately no second caller and no general notification surface. A product
 * whose front page promises nothing is kept does not get a re-engagement loop.
 *
 * WHAT THE PAYLOAD MAY CARRY
 *
 * The circle id and nothing else. Not the tag, not the seat count, not who
 * arrived, not a word anybody wrote. A push payload is decrypted on a device
 * that may be sitting on a table face-up in a room with other people in it,
 * and the whole promise of this product is that what is said here is not
 * readable from outside. The notification says *come back*, never *about what*.
 */

const PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
/**
 * Required by RFC 8292 as a contact for the push service operator. A mailto is
 * the conventional value; `VAPID_SUBJECT` overrides it.
 */
const SUBJECT = process.env.VAPID_SUBJECT ?? "";

/**
 * Configured, as a value the rest of the product can read.
 *
 * The room never offers a door that opens onto a 501 — the rule this file's
 * sibling `voice/route.ts` learned by handing somebody three environment
 * variable names. A build with no VAPID keys shows no notify control at all,
 * rather than a switch that fails when tapped.
 */
export const isPushConfigured = Boolean(PUBLIC && PRIVATE && SUBJECT);

/** The browser needs this to subscribe. Public by definition — it is the key
 *  the push service checks our signature against. Never the private one. */
export function pushPublicKey(): string | null {
  return isPushConfigured ? PUBLIC : null;
}

const b64url = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

/** RFC 8292 §2: a JWT signed ES256 over the push service's origin. */
function vapidHeader(endpoint: string): string {
  const aud = new URL(endpoint).origin;
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(
    Buffer.from(
      JSON.stringify({
        aud,
        // Twelve hours. The spec caps it at 24; shorter is strictly safer and
        // this token is minted per send, so there is no reason to reach.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: SUBJECT,
      }),
    ),
  );
  const signer = createSign("SHA256");
  signer.update(`${header}.${body}`);
  // The private key arrives as raw base64url scalar, which is how every VAPID
  // generator emits it; wrap it in the PKCS#8 envelope Node expects.
  const der = Buffer.concat([
    Buffer.from("308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420", "hex"),
    unb64(PRIVATE),
  ]);
  der.writeUInt8(der.length - 2, 1);
  const sig = signer.sign({ key: der, format: "der", type: "pkcs8", dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${body}.${b64url(sig)}, k=${PUBLIC}`;
}

/** RFC 8291: aes128gcm, one record, salt and the ephemeral key in the header. */
function encrypt(payload: string, p256dh: string, auth: string): Buffer {
  const plaintext = Buffer.from(payload, "utf8");
  const clientPub = unb64(p256dh);
  const authSecret = unb64(auth);

  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const serverPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(clientPub);
  const salt = randomBytes(16);

  /*
    HKDF (RFC 5869), the two steps written out rather than hidden.

    `extract` is one HMAC over the input keying material with the salt as key;
    `expand` is one HMAC over `info || 0x01`. Both outputs here are shorter
    than a SHA-256 block, so a single round is the whole of expand — which is
    why there is no loop. Writing it as a loop that runs once would look more
    like the RFC and be harder to check.
  */
  const extract = (saltBuf: Buffer, ikmIn: Buffer) =>
    createHmac("sha256", saltBuf).update(ikmIn).digest();
  const expand = (prk: Buffer, info: Buffer, len: number) =>
    createHmac("sha256", prk)
      .update(Buffer.concat([info, Buffer.from([1])]))
      .digest()
      .subarray(0, len);

  const authInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    clientPub,
    serverPub,
  ]);
  const ikm = expand(extract(authSecret, shared), authInfo, 32);
  const cek = expand(extract(salt, ikm), Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = expand(extract(salt, ikm), Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 is the final-record delimiter; one record, so it is also the only one.
  const body = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([serverPub.length]), serverPub, body]);
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send one notification. Returns the endpoints the push service says are dead,
 * so the caller can drop them.
 *
 * Never throws. A notification that cannot be delivered must not fail the join
 * that triggered it — somebody taking a seat is the thing that matters, and a
 * push service having a bad minute is not a reason to refuse them the room.
 * Fail open on the second opinion, closed on the first: the same rule this
 * product applies to Perspective.
 */
export async function sendJoinPing(
  targets: readonly PushTarget[],
  circleId: string,
): Promise<string[]> {
  if (!isPushConfigured || targets.length === 0) return [];
  // The circle id and nothing else. See the header.
  const payload = JSON.stringify({ circleId });
  const dead: string[] = [];

  await Promise.allSettled(
    targets.map(async (t) => {
      try {
        const res = await fetch(t.endpoint, {
          method: "POST",
          headers: {
            TTL: "900",
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            Authorization: vapidHeader(t.endpoint),
          },
          body: new Uint8Array(encrypt(payload, t.p256dh, t.auth)),
          // Every outbound call in src/lib carries one. The person who took
          // the seat is waiting on the response this runs inside.
          signal: AbortSignal.timeout(3_000),
        });
        // 404 and 410 are the push service saying this subscription is gone.
        if (res.status === 404 || res.status === 410) dead.push(t.endpoint);
      } catch (error) {
        console.warn("[push] send failed", errorKind(error));
      }
    }),
  );
  return dead;
}

/**
 * Tell whoever is holding this room that somebody came.
 *
 * One copy, here, because it had two callers the moment it existed — a seat
 * can be taken through `POST /api/circles/[id]` or through the steering in
 * `POST /api/circles`, and a helper written into both files is the shape this
 * repository keeps finding holes in: the fix reaches the copy in front of you
 * and not the one beside it.
 *
 * Never throws and never fails the join. Somebody taking a seat is the thing
 * that matters; a push service having a bad minute is not a reason to refuse
 * them the room. Fail open on the second opinion, closed on the first.
 *
 * Dead endpoints are dropped on the answer the push service gives — 404 or
 * 410 — rather than guessed at from a timeout.
 */
export async function pingTheRoom(
  store: Store,
  circleId: string,
  joinerAnonId: string,
): Promise<void> {
  if (!isPushConfigured) return;
  try {
    const targets = await store.listPush(circleId, joinerAnonId);
    if (targets.length === 0) return;
    const dead = await sendJoinPing(targets, circleId);
    for (const endpoint of dead) await store.dropPush(endpoint);
  } catch (error) {
    console.warn("[push] ping failed", errorKind(error));
  }
}
