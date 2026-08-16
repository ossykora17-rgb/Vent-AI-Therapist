import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isExpired, MAX_SEATS } from "@/lib/circles/rules";
import { TYPING_WINDOW_MS } from "@/lib/circles/presence";
import type {
  CircleMemberRow, CircleMessageRow, CircleRow,
  NewVent, ProfilePatch, Store, VentRow, HeldNote, BreakingAnswer } from "./types";
import { BREAKING_CAP, HELD_CAP } from "./types";

/**
 * Local development backend. A single JSON file, no dependency, no daemon.
 *
 * Deliberately not for production: it holds the whole dataset in memory and
 * writes the file on every mutation, which is fine for one developer and
 * wrong for many users. `pickStore` refuses to select it in production
 * unless someone explicitly opts in.
 */

interface UserRow {
  id: string;
  anon_id: string;
  chair_picked: string | null;
  object_picked: string | null;
  onboarding_done: boolean;
  /** Eight words for the wound. Mirrors vent_users.carve — see 0011. */
  carve: string | null;
  created_at: string;
  last_seen_at: string;
  /** What held, newest first. See `HELD_CAP`. */
  held?: HeldNote[];
  /** Breaking Room answers, newest first. See `BREAKING_CAP` and 0015. */
  breaking?: BreakingAnswer[];
}

interface FeedbackRow {
  id: string;
  user_id: string | null;
  anon_id: string;
  rating: number;
  message: string | null;
  created_at: string;
}

interface Db {
  users: UserRow[];
  vents: VentRow[];
  feedback: FeedbackRow[];
  circles: CircleRow[];
  circleMembers: CircleMemberRow[];
  circleMessages: CircleMessageRow[];
}

const EMPTY: Db = {
  users: [], vents: [], feedback: [],
  circles: [], circleMembers: [], circleMessages: [],
};

export class FileStore implements Store {
  readonly kind = "file" as const;
  private readonly file: string;
  private cache: Db | null = null;
  /** mtime of the file the cache was built from. See `read()`. */
  private cachedAt = 0;
  /** Serialises writes so two concurrent requests cannot clobber the file. */
  private queue: Promise<void> = Promise.resolve();

  constructor(dir = process.env.VENT_DATA_DIR || ".data") {
    this.file = path.resolve(process.cwd(), dir, "vent.json");
  }

  /*
    Cached, but never staler than the file.

    The cache used to be permanent: read once, keep forever. That was fine
    while only route handlers touched the store, because they all share one
    module instance and therefore one cache. The landing page now reads the
    open circles during render, and a server component is a *different bundle*
    — so its FileStore had its own cache, built the first time the page
    rendered, and never saw a single circle created through /api/circles
    afterwards. The front door said "Nobody is sitting right now" with two
    rooms open, and stayed wrong until the server was restarted.

    Not a production bug: SupabaseStore queries the database every read. It is
    a local-shape bug, which makes it exactly the kind that gets shipped —
    the author's own machine is the one place it is guaranteed to appear, and
    the thing it does is quietly tell the truth-teller a lie.

    An mtime stat per read is a syscall on a file this backend already reads
    synchronously, and it makes the cache mean "what is on disk" instead of
    "what was on disk once".
  */
  private read(): Db {
    let mtime = 0;
    try {
      mtime = fs.statSync(this.file).mtimeMs;
    } catch {
      // No file yet. Any cache we already hold is still the freshest truth.
      if (this.cache) return this.cache;
    }
    if (this.cache && mtime === this.cachedAt) return this.cache;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<Db>;
      // A file written before circles existed is missing those arrays.
      this.cache = { ...structuredClone(EMPTY), ...raw };
    } catch {
      this.cache = structuredClone(EMPTY);
    }
    this.cachedAt = mtime;
    return this.cache;
  }

  private write(mutate: (db: Db) => void): Promise<void> {
    this.queue = this.queue.then(async () => {
      const db = this.read();
      mutate(db);
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      // Write-then-rename so a crash mid-write cannot truncate the file.
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(db, null, 2));
      await fs.promises.rename(tmp, this.file);
      // The cache and the file agree right now; stamp it so the next read is
      // not a needless re-parse of what this process just serialised.
      try {
        this.cachedAt = fs.statSync(this.file).mtimeMs;
      } catch {
        this.cachedAt = 0;
      }
    });
    return this.queue;
  }

  async ensureUser(anonId: string, patch: ProfilePatch = {}): Promise<string> {
    const now = new Date().toISOString();
    let id = this.read().users.find((u) => u.anon_id === anonId)?.id ?? null;

    await this.write((db) => {
      let user = db.users.find((u) => u.anon_id === anonId);
      if (!user) {
        user = {
          id: randomUUID(),
          anon_id: anonId,
          chair_picked: null,
          object_picked: null,
          onboarding_done: false,
          carve: null,
          created_at: now,
          last_seen_at: now,
        };
        db.users.push(user);
      }
      if (patch.chairPicked !== undefined && patch.chairPicked !== null) {
        user.chair_picked = patch.chairPicked;
      }
      if (patch.objectPicked !== undefined && patch.objectPicked !== null) {
        user.object_picked = patch.objectPicked;
      }
      if (patch.onboardingDone !== undefined) user.onboarding_done = patch.onboardingDone;
      user.last_seen_at = now;
      id = user.id;
    });

    return id!;
  }

  async findUserId(anonId: string): Promise<string | null> {
    return this.read().users.find((u) => u.anon_id === anonId)?.id ?? null;
  }

  async countVentsSince(userId: string, since: Date): Promise<number> {
    const t = since.getTime();
    return this.read().vents.filter(
      (v) => v.user_id === userId && new Date(v.created_at).getTime() >= t,
    ).length;
  }

  private byUserDesc(userId: string): VentRow[] {
    return this.read()
      .vents.filter((v) => v.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async recentVents(userId: string, limit: number): Promise<VentRow[]> {
    return this.byUserDesc(userId).slice(0, limit);
  }

  async listVents(userId: string, limit: number): Promise<VentRow[]> {
    return this.byUserDesc(userId).slice(0, limit);
  }

  /** Everybody, newest first. Loop only — see the interface for why. */
  async recentVentsAcross(limit: number): Promise<VentRow[]> {
    return [...this.read().vents]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, limit);
  }

  async insertVent(vent: NewVent): Promise<void> {
    await this.write((db) => {
      db.vents.push({
        ...vent,
        safety_flagged: vent.safety_flagged ?? false,
        id: randomUUID(),
        created_at: new Date().toISOString(),
      });
    });
  }

  async anchorLatestVent(userId: string, mood: number, tensionAfter: number): Promise<boolean> {
    let hit = false;
    await this.write((db) => {
      const target = db.vents
        .filter((v) => v.user_id === userId && v.tension_after === null)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!target) return;
      target.mood_score = mood;
      target.tension_after = tensionAfter;
      hit = true;
    });
    return hit;
  }

  /*
    The same shape as Postgres, on purpose.

    This used a side `memories` collection while the Supabase store wrote to
    `public.memories` — whose `user_id` is `references auth.users(id)`, an id
    space anonymous venters are not in. The insert was rejected there and
    accepted here: the feature worked locally and was dead in production,
    which is the failure this whole repo is organised against.

    One column on the person's own row, in both backends. A shape that cannot
    diverge is worth more than a shape that is convenient in one of them.
  */
  async getCarve(userId: string): Promise<string | null> {
    return this.read().users.find((u) => u.id === userId)?.carve?.trim() || null;
  }

  async getHeld(userId: string): Promise<HeldNote[]> {
    const user = this.read().users.find((u) => u.id === userId);
    return Array.isArray(user?.held) ? user.held : [];
  }

  async addHeld(userId: string, text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) return false;
    let hit = false;
    await this.write((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) return;
      const existing = Array.isArray(user.held) ? user.held : [];
      // Newest first, and trimmed here rather than in the constraint — the
      // cap is a product decision and lives with the other product decisions.
      user.held = [{ text: trimmed, at: new Date().toISOString() }, ...existing]
        .slice(0, HELD_CAP);
      hit = true;
    });
    return hit;
  }

  /**
   * Null when there is no row, `[]` when there is one and it is empty.
   *
   * The same shape as Postgres, and it matters more here than it looks. A
   * backend that collapses the two locally while the other one distinguishes
   * them is how the Breaking Room would open on a laptop and stay shut in
   * production — or worse, the reverse. See the `Store` interface.
   */
  async getBreaking(userId: string): Promise<BreakingAnswer[] | null> {
    const user = this.read().users.find((u) => u.id === userId);
    if (!user) return null;
    return Array.isArray(user.breaking) ? user.breaking : [];
  }

  async addBreaking(userId: string, q: string, a: string): Promise<boolean> {
    const answer = a.trim();
    if (!q.trim() || !answer) return false;
    let hit = false;
    await this.write((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) return;
      const existing = Array.isArray(user.breaking) ? user.breaking : [];
      /*
        The old answer to the same question is dropped, not kept beside the
        new one.

        `nextQuestion` filters on `q`, so a duplicate id is only reachable if
        something upstream re-offered a question — and if that ever happens
        the person has answered it twice and the second answer is the current
        one. Two rows with the same id would also let the cap evict the
        *record that it was asked*, which is the one thing here that must not
        be lost: an id falling off the end is a question that becomes askable
        again, of somebody who already paid to answer it.
      */
      user.breaking = [
        { q, a: answer, at: new Date().toISOString() },
        ...existing.filter((e) => e.q !== q),
      ].slice(0, BREAKING_CAP);
      hit = true;
    });
    return hit;
  }

  async setCarve(userId: string, carve: string | null): Promise<boolean> {
    let hit = false;
    await this.write((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) return;
      user.carve = carve;
      hit = true;
    });
    return hit;
  }

  async deleteVent(userId: string, ventId: string): Promise<void> {
    await this.write((db) => {
      db.vents = db.vents.filter((v) => !(v.id === ventId && v.user_id === userId));
    });
  }

  async deleteAll(userId: string): Promise<void> {
    await this.write((db) => {
      db.vents = db.vents.filter((v) => v.user_id !== userId);
      // The carve goes with them — it is a column on this row, so deleting
      // the person deletes the sentence written about them. Nothing separate
      // to remember, which is the point of putting it here.
      db.users = db.users.filter((u) => u.id !== userId);
    });
  }

  // ── Circles ─────────────────────────────────────────────────────────────

  async listOpenCircles() {
    const db = this.read();
    const now = Date.now();
    return db.circles
      .filter((c) => c.status !== "closed" && new Date(c.ends_at).getTime() > now)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({
        ...c,
        seats: db.circleMembers.filter((m) => m.circle_id === c.id).length,
      }));
  }

  async getCircle(id: string): Promise<CircleRow | null> {
    return this.read().circles.find((c) => c.id === id) ?? null;
  }

  async createCircle(c: Omit<CircleRow, "id" | "created_at">): Promise<CircleRow> {
    const row: CircleRow = { ...c, id: randomUUID(), created_at: new Date().toISOString() };
    await this.write((db) => { db.circles.push(row); });
    return row;
  }

  async closeCircle(id: string): Promise<void> {
    await this.write((db) => {
      const c = db.circles.find((x) => x.id === id);
      if (c) c.status = "closed";
      // Closing ends confidentiality's only real guarantee: the words go.
      db.circleMessages = db.circleMessages.filter((m) => m.circle_id !== id);
    });
  }

  async listMembers(circleId: string): Promise<CircleMemberRow[]> {
    return this.read()
      .circleMembers.filter((m) => m.circle_id === circleId)
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  }

  async addMember(
    m: Omit<CircleMemberRow, "id" | "joined_at" | "last_seen_at" | "typing_until">,
  ): Promise<void> {
    await this.write((db) => {
      const seats = db.circleMembers.filter((x) => x.circle_id === m.circle_id);
      if (seats.length >= MAX_SEATS) return;
      if (seats.some((x) => x.anon_id === m.anon_id)) return;
      const now = new Date().toISOString();
      db.circleMembers.push({
        ...m,
        pressure_seeded: m.pressure_seeded ?? null,
        // Taking a seat is itself proof of presence — the dot lights up
        // before the first poll rather than a beat after it.
        last_seen_at: now,
        typing_until: null,
        id: randomUUID(),
        joined_at: now,
      });
    });
  }

  async touchMember(circleId: string, anonId: string, typing: boolean): Promise<void> {
    await this.write((db) => {
      const m = db.circleMembers.find(
        (x) => x.circle_id === circleId && x.anon_id === anonId,
      );
      if (!m) return;
      const now = Date.now();
      m.last_seen_at = new Date(now).toISOString();
      m.typing_until = typing ? new Date(now + TYPING_WINDOW_MS).toISOString() : null;
    });
  }

  async listCircleMessages(circleId: string): Promise<CircleMessageRow[]> {
    const now = Date.now();
    const live = this.read()
      .circleMessages.filter((m) => m.circle_id === circleId && !isExpired(m.created_at, now));
    // Lazy TTL: expired words are dropped on the next read, no cron needed.
    if (live.length !== this.read().circleMessages.filter((m) => m.circle_id === circleId).length) {
      await this.write((db) => {
        db.circleMessages = db.circleMessages.filter((m) => !isExpired(m.created_at, now));
      });
    }
    return live.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async addCircleMessage(m: Omit<CircleMessageRow, "id" | "created_at">): Promise<void> {
    await this.write((db) => {
      db.circleMessages.push({ ...m, id: randomUUID(), created_at: new Date().toISOString() });
    });
  }

  async countFeedbackSince(anonId: string, since: Date): Promise<number> {
    const t = since.getTime();
    return this.read().feedback.filter(
      (f) => f.anon_id === anonId && new Date(f.created_at).getTime() >= t,
    ).length;
  }

  async insertFeedback(input: {
    userId: string | null;
    anonId: string;
    rating: number;
    message: string | null;
  }): Promise<void> {
    await this.write((db) => {
      db.feedback.push({
        id: randomUUID(),
        user_id: input.userId,
        anon_id: input.anonId,
        rating: input.rating,
        message: input.message,
        created_at: new Date().toISOString(),
      });
    });
  }
}
