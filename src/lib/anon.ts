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
