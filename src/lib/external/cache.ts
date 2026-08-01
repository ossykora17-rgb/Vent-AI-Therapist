import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * A TTL cache for the outside world.
 *
 * Every rule in this file exists to protect one property: **the product never
 * shows a number it did not fetch.** A stale rate is a lie told confidently,
 * and a lie about the exchange rate in an app about money pressure is worse
 * than saying nothing. So entries carry the time they were fetched, expiry is
 * checked on read, and an expired entry is *dropped* rather than served with
 * an apology.
 *
 * Local-first, like the rest: `.data/external.json`, write-then-rename,
 * serialised. In production the disk is ephemeral, so it degrades to an
 * in-process Map — still useful (one lambda serves many requests), and
 * honest about being per-instance rather than shared.
 */

export interface CacheEntry<T> {
  value: T;
  fetched_at: string;
  /** Which upstream produced this, so a stale table can be read by a person. */
  source: string;
}

const LOCAL =
  process.env.VENT_LOCAL_STORE === "1" || process.env.NODE_ENV !== "production";

const FILE = path.resolve(
  process.cwd(),
  process.env.VENT_DATA_DIR || ".data",
  "external.json",
);

type Db = Record<string, CacheEntry<unknown>>;

let memory: Db | null = null;
let queue: Promise<void> = Promise.resolve();

function read(): Db {
  if (memory) return memory;
  if (!LOCAL) return (memory = {});
  try {
    memory = JSON.parse(fs.readFileSync(FILE, "utf8")) as Db;
  } catch {
    memory = {};
  }
  return memory;
}

function write(mutate: (db: Db) => void): Promise<void> {
  queue = queue.then(async () => {
    const db = read();
    mutate(db);
    if (!LOCAL) return;
    await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.promises.rename(tmp, FILE);
  });
  return queue;
}

export function peek<T>(key: string, ttlMs: number): CacheEntry<T> | null {
  const hit = read()[key] as CacheEntry<T> | undefined;
  if (!hit) return null;
  const age = Date.now() - new Date(hit.fetched_at).getTime();
  return age < ttlMs ? hit : null;
}

export async function put<T>(key: string, value: T, source: string): Promise<CacheEntry<T>> {
  const entry: CacheEntry<T> = { value, fetched_at: new Date().toISOString(), source };
  await write((db) => { db[key] = entry as CacheEntry<unknown>; });
  return entry;
}

/**
 * Cached fetch. Returns `null` — not a stale value, not a guess — when the
 * upstream is unreachable and nothing fresh is held. Callers are written to
 * say nothing when they get null, which is the only safe default here.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  source: string,
  fetcher: () => Promise<T | null>,
): Promise<CacheEntry<T> | null> {
  const hit = peek<T>(key, ttlMs);
  if (hit) return hit;

  const value = await fetcher();
  if (value === null || value === undefined) return null;

  return put(key, value, source);
}

/** For the heartbeat: what is held, how old, and what has gone stale. */
export function inventory(): Array<{ key: string; source: string; ageMs: number }> {
  const db = read();
  const now = Date.now();
  return Object.entries(db).map(([key, e]) => ({
    key,
    source: e.source,
    ageMs: now - new Date(e.fetched_at).getTime(),
  }));
}
