import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NewVent, ProfilePatch, Store, VentRow } from "./types";

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
}

const EMPTY: Db = { users: [], vents: [], feedback: [] };

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
      this.cache = JSON.parse(fs.readFileSync(this.file, "utf8")) as Db;
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
