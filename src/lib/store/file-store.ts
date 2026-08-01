import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isExpired, MAX_SEATS } from "@/lib/circles/rules";
import type {
  CircleMemberRow, CircleMessageRow, CircleRow,
  NewVent, ProfilePatch, Store, VentRow,
} from "./types";

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
  created_at: string;
  last_seen_at: string;
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
  /** Serialises writes so two concurrent requests cannot clobber the file. */
  private queue: Promise<void> = Promise.resolve();

  constructor(dir = process.env.VENT_DATA_DIR || ".data") {
    this.file = path.resolve(process.cwd(), dir, "vent.json");
  }

  private read(): Db {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<Db>;
      // A file written before circles existed is missing those arrays.
      this.cache = { ...structuredClone(EMPTY), ...raw };
    } catch {
      this.cache = structuredClone(EMPTY);
    }
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

  async deleteVent(userId: string, ventId: string): Promise<void> {
    await this.write((db) => {
      db.vents = db.vents.filter((v) => !(v.id === ventId && v.user_id === userId));
    });
  }

  async deleteAll(userId: string): Promise<void> {
    await this.write((db) => {
      db.vents = db.vents.filter((v) => v.user_id !== userId);
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

  async addMember(m: Omit<CircleMemberRow, "id" | "joined_at">): Promise<void> {
    await this.write((db) => {
      const seats = db.circleMembers.filter((x) => x.circle_id === m.circle_id);
      if (seats.length >= MAX_SEATS) return;
      if (seats.some((x) => x.anon_id === m.anon_id)) return;
      db.circleMembers.push({ ...m, id: randomUUID(), joined_at: new Date().toISOString() });
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
