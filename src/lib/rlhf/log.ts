import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * The preference log — stage four's raw material.
 *
 * A rating is worth nothing on its own. It is worth something next to the
 * reply it was given for, and that pairing is what `scripts/rlhf-pipeline.mjs`
 * reconstructs. This file is only the sink: one JSON object per line, append
 * only, never read by the app itself.
 *
 * Two deliberate decisions:
 *
 * 1. **Append, not write-then-rename.** The store rewrites `vent.json` under
 *    rename because a half-written *snapshot* is a corrupt database. A log is
 *    the opposite shape: rewriting it costs O(n) per signal and grows without
 *    bound, while an `O_APPEND` write of one short line is atomic on every
 *    filesystem we run on. The serialised queue is what actually prevents two
 *    requests interleaving, and that is kept.
 *
 * 2. **Local-first, and silent elsewhere.** Serverless disks are thrown away,
 *    so writing here in production would collect training data that is
 *    guaranteed to be lost. It writes where a data directory is real, and
 *    no-ops everywhere else rather than pretending.
 */

export type PreferenceKind = "vent_rating" | "circle_close";

export interface PreferenceSignal {
  kind: PreferenceKind;
  anon_id: string;
  /** 1–5 for a vent rating, 1–10 mood for a circle close. Normalised later. */
  rating?: number | null;
  note?: string | null;
  circle_id?: string | null;
  tag?: string | null;
  tension_before?: number | null;
  tension_after?: number | null;
  drop_points?: number | null;
  word_carried?: string | null;
  word_dropped?: string | null;
}

const LOCAL =
  process.env.VENT_LOCAL_STORE === "1" || process.env.NODE_ENV !== "production";

const FILE = path.resolve(
  process.cwd(),
  process.env.VENT_DATA_DIR || ".data",
  "rlhf.jsonl",
);

let queue: Promise<void> = Promise.resolve();

export function logPreference(signal: PreferenceSignal): Promise<void> {
  if (!LOCAL) return Promise.resolve();

  const line = `${JSON.stringify({ ...signal, created_at: new Date().toISOString() })}\n`;

  queue = queue.then(async () => {
    try {
      await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
      await fs.promises.appendFile(FILE, line, "utf8");
    } catch (error) {
      // A lost preference signal is not worth failing a request over.
      console.error("[rlhf] could not log preference", error);
    }
  });

  return queue;
}
