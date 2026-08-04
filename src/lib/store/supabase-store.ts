import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isExpired, MAX_SEATS, TRANSCRIPT_TTL_MS } from "@/lib/circles/rules";
import { TYPING_WINDOW_MS } from "@/lib/circles/presence";
import { StoreUnavailableError } from "./errors";
import type {
  CircleMemberRow, CircleMessageRow, CircleRow,
  NewVent, ProfilePatch, Store, VentRow,
} from "./types";

const FULL_SELECT =
  "id, user_id, user_message, ai_reply, mood_score, tension_before, tension_after, " +
  "language, duality_value, pressure_value, chair_picked, tactic_used, intent_type, " +
  "real_world_tag, real_date_used, body_tapped, safety_flagged, created_at";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * The one place absent and broken are told apart.
 *
 * A Supabase `error` means the query did not run — that throws. Data that is
 * null with no error means the row is genuinely not there — that returns
 * null. Reading `data` without ever looking at `error`, which is what every
 * method here used to do, silently turns the first into the second.
 */
function ok<T>(op: string, res: { data: T; error: { message?: string } | null }): T {
  if (res.error) throw new StoreUnavailableError(op, res.error);
  return res.data;
}

/** Same rule for writes, which have no data to return. */
function done(op: string, res: { error: { message?: string } | null }): void {
  if (res.error) throw new StoreUnavailableError(op, res.error);
}

/** Service-role backend. Every query scopes by user_id itself — RLS denies all. */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  constructor(private readonly db: Admin) {}

  async ensureUser(anonId: string, patch: ProfilePatch = {}): Promise<string | null> {
    const { data, error } = await this.db
      .from("vent_users")
      .upsert(
        {
          anon_id: anonId,
          ...(patch.chairPicked ? { chair_picked: patch.chairPicked } : {}),
          ...(patch.objectPicked ? { object_picked: patch.objectPicked } : {}),
          ...(patch.onboardingDone !== undefined
            ? { onboarding_done: patch.onboardingDone }
            : {}),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "anon_id" },
      )
      .select("id")
      .single();

    if (error) throw new StoreUnavailableError("ensureUser", error);
    return data.id;
  }

  async findUserId(anonId: string): Promise<string | null> {
    const data = ok("findUserId", await this.db
      .from("vent_users")
      .select("id")
      .eq("anon_id", anonId)
      .maybeSingle());
    return data?.id ?? null;
  }

  async countVentsSince(userId: string, since: Date): Promise<number> {
    const data = ok("countVentsSince", await this.db.rpc("vent_rate_count", {
      p_user_id: userId,
      p_since: since.toISOString(),
    }));
    return (data as number | null) ?? 0;
  }

  async recentVents(userId: string, limit: number): Promise<VentRow[]> {
    const data = ok("recentVents", await this.db
      .from("vents")
      .select(FULL_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit));
    return (data ?? []) as unknown as VentRow[];
  }

  listVents(userId: string, limit: number): Promise<VentRow[]> {
    return this.recentVents(userId, limit);
  }

  async insertVent(vent: NewVent): Promise<void> {
    done("insertVent", await this.db.from("vents").insert(vent));
  }

  async deleteVent(userId: string, ventId: string): Promise<void> {
    // Scoped by user_id too, so an id from another user deletes nothing.
    done("deleteVent", await this.db
      .from("vents")
      .delete()
      .eq("user_id", userId)
      .eq("id", ventId));
  }

  async deleteAll(userId: string): Promise<void> {
    done("deleteAll", await this.db.from("vents").delete().eq("user_id", userId));
    // Clearing everything means clearing the person too. A half-done delete
    // is the one outcome this must never report as success.
    done("deleteAll:user", await this.db.from("vent_users").delete().eq("id", userId));
  }

  // ── Circles ─────────────────────────────────────────────────────────────

  async listOpenCircles() {
    const data = ok("listOpenCircles", await this.db
      .from("circles")
      .select("*, circle_members(count)")
      .neq("status", "closed")
      .gt("ends_at", new Date().toISOString())
      .order("created_at", { ascending: true }));

    return ((data ?? []) as unknown as Array<
      CircleRow & { circle_members: Array<{ count: number }> }
    >).map(({ circle_members, ...c }) => ({
      ...c,
      seats: circle_members?.[0]?.count ?? 0,
    }));
  }

  async getCircle(id: string): Promise<CircleRow | null> {
    // null here now means "no such circle", and only that.
    const data = ok("getCircle",
      await this.db.from("circles").select("*").eq("id", id).maybeSingle());
    return (data as CircleRow | null) ?? null;
  }

  async createCircle(c: Omit<CircleRow, "id" | "created_at">): Promise<CircleRow> {
    const { data, error } = await this.db.from("circles").insert(c).select("*").single();
    if (error) throw new StoreUnavailableError("createCircle", error);
    return data as unknown as CircleRow;
  }

  async closeCircle(id: string): Promise<void> {
    done("closeCircle", await this.db.from("circles").update({ status: "closed" }).eq("id", id));
    // Closing ends confidentiality's only real guarantee: the words go. A
    // failed delete must not be reported as a circle that closed cleanly.
    done("closeCircle:transcript",
      await this.db.from("circle_messages").delete().eq("circle_id", id));
  }

  async listMembers(circleId: string): Promise<CircleMemberRow[]> {
    const data = ok("listMembers", await this.db
      .from("circle_members")
      .select("*")
      .eq("circle_id", circleId)
      .order("joined_at", { ascending: true }));
    return (data ?? []) as unknown as CircleMemberRow[];
  }

  async addMember(
    m: Omit<CircleMemberRow, "id" | "joined_at" | "last_seen_at" | "typing_until">,
  ): Promise<void> {
    const existing = await this.listMembers(m.circle_id);
    if (existing.length >= MAX_SEATS) return;
    if (existing.some((x) => x.anon_id === m.anon_id)) return;
    done("addMember", await this.db
      .from("circle_members")
      .insert({ ...m, last_seen_at: new Date().toISOString() }));
  }

  async touchMember(circleId: string, anonId: string, typing: boolean): Promise<void> {
    const now = Date.now();
    const { error } = await this.db
      .from("circle_members")
      .update({
        last_seen_at: new Date(now).toISOString(),
        typing_until: typing ? new Date(now + TYPING_WINDOW_MS).toISOString() : null,
      })
      .eq("circle_id", circleId)
      .eq("anon_id", anonId);
    // A missed heartbeat costs one grey dot for a few seconds, never a 500.
    if (error) console.error("[store] touchMember failed", error);
  }

  async listCircleMessages(circleId: string): Promise<CircleMessageRow[]> {
    // Lazy TTL: sweep what expired, then return what is still inside the day.
    done("listCircleMessages:sweep", await this.db
      .from("circle_messages")
      .delete()
      .lt("created_at", new Date(Date.now() - TRANSCRIPT_TTL_MS).toISOString()));

    const data = ok("listCircleMessages", await this.db
      .from("circle_messages")
      .select("*")
      .eq("circle_id", circleId)
      .order("created_at", { ascending: true }));

    return ((data ?? []) as unknown as CircleMessageRow[]).filter(
      (m) => !isExpired(m.created_at),
    );
  }

  async addCircleMessage(m: Omit<CircleMessageRow, "id" | "created_at">): Promise<void> {
    done("addCircleMessage", await this.db.from("circle_messages").insert(m));
  }

  async countFeedbackSince(anonId: string, since: Date): Promise<number> {
    const res = await this.db
      .from("vent_feedback")
      .select("id", { count: "exact", head: true })
      .eq("anon_id", anonId)
      .gte("created_at", since.toISOString());
    if (res.error) throw new StoreUnavailableError("countFeedbackSince", res.error);
    return res.count ?? 0;
  }

  async insertFeedback(input: {
    userId: string | null;
    anonId: string;
    rating: number;
    message: string | null;
  }): Promise<void> {
    done("insertFeedback", await this.db.from("vent_feedback").insert({
      user_id: input.userId,
      anon_id: input.anonId,
      rating: input.rating,
      message: input.message,
    }));
  }
}
