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

export interface Store {
  /** Which backend answered — surfaced in /api/health so it is never a guess. */
  readonly kind: "supabase" | "file";

  ensureUser(anonId: string, patch?: ProfilePatch): Promise<string | null>;
  findUserId(anonId: string): Promise<string | null>;

  /** Vents since a timestamp, for rate limiting. */
  countVentsSince(userId: string, since: Date): Promise<number>;

  /** Most recent first is easier to query; callers reverse for prompt order. */
  recentVents(userId: string, limit: number): Promise<VentRow[]>;
  listVents(userId: string, limit: number): Promise<VentRow[]>;

  insertVent(vent: NewVent): Promise<void>;
  deleteVent(userId: string, ventId: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;

  // ── Circles ─────────────────────────────────────────────────────────────
  listOpenCircles(): Promise<Array<CircleRow & { seats: number }>>;
  getCircle(id: string): Promise<CircleRow | null>;
  createCircle(c: Omit<CircleRow, "id" | "created_at">): Promise<CircleRow>;
  closeCircle(id: string): Promise<void>;

  listMembers(circleId: string): Promise<CircleMemberRow[]>;
  addMember(m: Omit<CircleMemberRow, "id" | "joined_at">): Promise<void>;

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
