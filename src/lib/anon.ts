"use client";

const ANON_KEY = "mw-anon-id";
const QUEUE_KEY = "mw-offline-queue";

/** Stable per-browser id. No account, no email, no gate. */
export function anonId(): string {
  try {
    const existing = localStorage.getItem(ANON_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(ANON_KEY, fresh);
    return fresh;
  } catch {
    // Private mode: a session-only id still lets the API work.
    return crypto.randomUUID();
  }
}

export interface QueuedVent {
  message: string;
  pressure: number;
  bodyTapped: string | null;
  queuedAt: string;
}

/** Offline: hold the truth locally rather than losing it. */
export function queueVent(item: QueuedVent) {
  try {
    const q = readQueue();
    q.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50)));
  } catch {
    // Storage full or blocked — nothing more we can do here.
  }
}

export function readQueue(): QueuedVent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedVent[]) : [];
  } catch {
    return [];
  }
}

export function clearQueue() {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

/** Sends anything that piled up while the connection was gone. */
export async function flushQueue(): Promise<number> {
  const queued = readQueue();
  if (queued.length === 0) return 0;

  let sent = 0;
  for (const item of queued) {
    try {
      const res = await fetch("/api/vent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          anonId: anonId(),
          message: item.message,
          pressure: item.pressure,
          bodyTapped: item.bodyTapped,
        }),
      });
      if (!res.ok) break;

      /*
        A 200 is not a save, and this queue is the last copy.

        These are words somebody wrote with no connection — the one case
        where local storage is not a convenience but the only place they
        exist. Counting a 200 as sent and then calling clearQueue() deleted
        them whenever the route answered `persisted: false`: no store
        configured, or an insert that failed on its way to Supabase. The
        PGRST303 clock skew visible on production right now produces exactly
        that shape.

        The route reports `persisted` precisely so a caller does not have to
        infer it from a status code — its own comment says a write that
        failed is a write that did not happen. Reading it here means a vent
        stays queued until it is genuinely kept, and gets another attempt on
        the next drain rather than a silent deletion.
      */
      /*
        `!== true`, not `=== false`, and the difference is somebody's words.

        Every 200 this route can currently answer carries `persisted`, so the
        two read the same today. They stop reading the same the moment a
        response is added that does not carry it — a shape with no key is not
        `false`, so the vent would count as sent and be spliced out of the
        queue, which is the last copy of something written with no connection.

        The rest of this codebase states the rule in the other direction —
        an absent record is not a failed deletion — because there the harm is
        crying failure over nothing. Here the harm is silence over a loss, so
        the burden flips: absence is not success. Only the word `true` is.
      */
      const body = await res.json().catch(() => null);
      if (body?.persisted !== true) break;
      sent++;
    } catch {
      break;
    }
  }

  if (sent === queued.length) clearQueue();
  else if (sent > 0) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queued.slice(sent)));
    } catch {
      /* ignore */
    }
  }
  return sent;
}
