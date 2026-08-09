/**
 * One storage interface, two backends: Supabase in the cloud, a JSON file on
 * disk for local development. The routes never know which one they got, so
 * `npm run dev` gives the complete product — memory, history, rate limits,
 * wipe — with no account, no Docker and no extra dependency.
 */

export interface VentRow {
  id: string;
  user_id: string;
  user_message: string;
  ai_reply: string | null;
  mood_score: number | null;
  tension_before: number | null;
  tension_after: number | null;
  language: string | null;
  duality_value: number | null;
  body_tapped: string | null;
  chair_picked: string | null;
  pressure_value: number | null;
  tactic_used: string | null;
  intent_type: string | null;
  real_world_tag: string | null;
  real_date_used: string | null;
  safety_flagged: boolean;
  created_at: string;
}

export type NewVent = Omit<VentRow, "id" | "created_at" | "safety_flagged"> &
  Partial<Pick<VentRow, "safety_flagged">>;

export interface ProfilePatch {
  chairPicked?: string | null;
  objectPicked?: string | null;
  onboardingDone?: boolean;
}

export interface CircleRow {
  id: string;
  creator_anon_id: string;
  tag: string | null;
  chair_picked: string | null;
  pressure_seeded: number | null;
  flavour: string | null;
  status: "waiting" | "live" | "closed";
  starts_at: string;
  ends_at: string;
  created_at: string;
}

export interface CircleMemberRow {
  id: string;
  circle_id: string;
  anon_id: string;
  role: "keeper" | "sharer" | "witness";
  /** Their own chair reading, so the closing drop is measured from theirs. */
  pressure_seeded: number | null;
  /** Last poll. Presence is derived from this, never stored as a boolean. */
  last_seen_at: string | null;
  /** Set a few seconds ahead while there is text in their box. */
  typing_until: string | null;
  joined_at: string;
}

export interface CircleMessageRow {
  id: string;
  circle_id: string;
  anon_id: string;
  content: string;
  kind: "share" | "witness" | "keeper_prompt" | "guardian";
  flagged: boolean;
  created_at: string;
}

/**
 * How many notes are kept.
 *
 * A single note is a nice moment; a handful is a record. Past about five it
 * stops being something a person reads and becomes a list they scroll, which
 * is the failure mode of every gratitude journal ever shipped.
 */
export const HELD_CAP = 5;

/** One thing that held, and when they said so. */
export interface HeldNote {
  text: string;
  at: string;
}

export interface Store {
  /** Which backend answered — surfaced in /api/health so it is never a guess. */
  readonly kind: "supabase" | "file";

  ensureUser(anonId: string, patch?: ProfilePatch): Promise<string | null>;
  findUserId(anonId: string): Promise<string | null>;

  /** Vents since a timestamp, for rate limiting. */
  countVentsSince(userId: string, since: Date): Promise<number>;

  /** Most recent first is easier to query; callers reverse for prompt order. */
  recentVents(userId: string, limit: number): Promise<VentRow[]>;
  /**
   * The newest vents across everybody, for the loop only.
   *
   * Deliberately not scoped to a person, and deliberately never reachable
   * from a route that returns content. /api/heartbeat counts what comes back
   * and returns numbers; nothing anybody wrote leaves through it. Any new
   * caller has to answer that question again before using this.
   */
  recentVentsAcross(limit: number): Promise<VentRow[]>;
  listVents(userId: string, limit: number): Promise<VentRow[]>;

  insertVent(vent: NewVent): Promise<void>;
  deleteVent(userId: string, ventId: string): Promise<void>;
  /**
   * Write the outcome onto the most recent vent.
   *
   * The only thing this product claims is that the weight goes down, and
   * until now nothing ever wrote the second reading — `tension_after` was a
   * hardcoded null on every insert, so no session could be anchored, the
   * heartbeat's mean drop could never exist, and the efficacy loop had no
   * data and never would.
   *
   * Returns whether a row was actually updated, because the UI said "Saved"
   * before it knew.
   */
  anchorLatestVent(userId: string, mood: number, tensionAfter: number): Promise<boolean>;

  /**
   * The carve — eight words for the wound, from the last session that had one.
   *
   * One column on the person's own row — `vent_users.carve`, added in 0011 —
   * so it is deleted with them and no delete path has to remember it exists.
   * It was briefly written to `public.memories`, whose `user_id` references
   * `auth.users(id)`: an id space anonymous venters are not in, so Postgres
   * rejected every write while `FileStore` accepted them all.
   *
   * Null is the ordinary answer, not an error: no store, no row, a table that
   * is not there, a read that threw. Every one of those means the next
   * session opens knowing nothing, which is exactly what it did before this
   * existed. Nothing downstream is allowed to treat null as a failure.
   */
  getCarve(userId: string): Promise<string | null>;
  /**
   * Write the carve, or clear it with null.
   *
   * Null rather than `""`: the column is
   * `check (carve is null or char_length(carve) between 1 and 200)`, so an
   * empty string is a constraint violation in Postgres and a perfectly happy
   * value in `FileStore` — the same local-works/production-fails split that
   * put the carve in the wrong table to begin with.
   *
   * Returns whether the row actually landed. Nothing may claim it did otherwise.
   */
  setCarve(userId: string, carve: string | null): Promise<boolean>;

  /**
   * What held, in their own words — the other half of the carve.
   *
   * `vent_users.held` (0013), a jsonb array newest-first, capped in
   * application code rather than in a constraint because a cap is a product
   * decision that moves and a migration is a bad place to keep a moving
   * number.
   *
   * Written only by the person and never by a model. That is what makes it
   * the one thing in this product safe to quote back at them: they wrote it
   * while they were alright, on purpose, for the version of them that is not.
   *
   * Same null discipline as the carve — an empty array is the ordinary
   * answer, never an error.
   */
  getHeld(userId: string): Promise<HeldNote[]>;
  /** Prepend one note, trimming to the cap. Returns whether it landed. */
  addHeld(userId: string, text: string): Promise<boolean>;

  deleteAll(userId: string): Promise<void>;

  // ── Circles ─────────────────────────────────────────────────────────────
  listOpenCircles(): Promise<Array<CircleRow & { seats: number }>>;
  getCircle(id: string): Promise<CircleRow | null>;
  createCircle(c: Omit<CircleRow, "id" | "created_at">): Promise<CircleRow>;
  closeCircle(id: string): Promise<void>;

  listMembers(circleId: string): Promise<CircleMemberRow[]>;
  addMember(m: Omit<CircleMemberRow, "id" | "joined_at" | "last_seen_at" | "typing_until">): Promise<void>;
  /** "I am still here", and optionally "and I am writing". */
  touchMember(circleId: string, anonId: string, typing: boolean): Promise<void>;

  /** Anything past the TTL is dropped rather than returned. */
  listCircleMessages(circleId: string): Promise<CircleMessageRow[]>;
  addCircleMessage(m: Omit<CircleMessageRow, "id" | "created_at">): Promise<void>;

  countFeedbackSince(anonId: string, since: Date): Promise<number>;
  insertFeedback(input: {
    userId: string | null;
    anonId: string;
    rating: number;
    message: string | null;
  }): Promise<void>;
}
