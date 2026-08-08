/**
 * What the code believes the database looks like.
 *
 * Two people build this schema now: the migrations in `supabase/`, and
 * whoever is in the Supabase SQL editor. Both are legitimate — a dashboard is
 * faster than a migration for a lot of real work — but neither can see the
 * other, and the failure mode is silent. A renamed column does not throw at
 * build time. It throws inside a route, inside a try/catch that degrades
 * quietly, and the product goes on answering while it stops remembering. That
 * has already happened here for months: `recentVents` returned nothing in
 * production the whole time and no surface said so.
 *
 * This is the contract stated once, so a deployment can be *asked* whether it
 * holds rather than assumed to. `/api/health` selects exactly these columns
 * with `head: true` — no rows cross the wire, so it costs a round trip and
 * nothing else — and reports, per table, whether the database agreed.
 *
 * Absent, forbidden, and wrong-shaped are three different answers:
 *
 *   42P01 / PGRST205  the table is not there — a migration never ran
 *   42501             it is there and this role may not read it — a GRANT
 *   42703             a column in this list does not exist — schema drift
 *
 * Naming which one it is turns a week of guessing into one request. Every one
 * of those three has cost this project real time already.
 *
 * No spaces in any list. PostgREST takes the select verbatim into the query
 * string, so `"id, user_id"` asks for a column named `" user_id"` and answers
 * with a path error naming no column at all. Check 16 fails any list with
 * whitespace in it — including these.
 */
export const TABLE_CONTRACT: Readonly<Record<string, string>> = {
  vent_users: "id,anon_id,created_at",
  vents:
    "id,user_id,user_message,ai_reply,mood_score,tension_before,tension_after," +
    "language,duality_value,body_tapped,chair_picked,pressure_value,tactic_used," +
    "intent_type,real_world_tag,real_date_used,safety_flagged,created_at",
  vent_feedback: "id,vent_id,rating,created_at",
  circles:
    "id,creator_anon_id,tag,chair_picked,pressure_seeded,flavour,status," +
    "starts_at,ends_at,created_at",
  circle_members:
    "id,circle_id,anon_id,role,pressure_seeded,last_seen_at,typing_until,joined_at",
  circle_messages: "id,circle_id,anon_id,content,kind,flagged,created_at",
} as const;

/**
 * Tables the product reads but the store does not own.
 *
 * `profiles` and `memories` belong to the auth and vector-memory surfaces.
 * They are probed too — a health check that only covers what one module
 * touches is a health check with a blind spot the size of the other modules.
 */
export const AUXILIARY_CONTRACT: Readonly<Record<string, string>> = {
  profiles: "id",
  memories: "id,user_id,key,value,created_at",
} as const;

export const FULL_CONTRACT = { ...TABLE_CONTRACT, ...AUXILIARY_CONTRACT };

/**
 * What a Postgres error code means, in the words of the fix.
 *
 * Returned to the caller so the answer is actionable without a search. The
 * hint PostgREST sends is better than anything written here when it sends
 * one, so this only fills the gap when it does not.
 */
export function explainDbCode(code?: string | null): string | null {
  switch (code) {
    case "42P01":
    case "PGRST205":
      return "table does not exist — a migration has not been applied";
    case "42501":
      return "table exists but this role cannot read it — see 0008_grants.sql";
    case "42703":
      return "a column in the contract does not exist — the schema has drifted from the code";
    case "PGRST125":
      return "the request path was rejected — check NEXT_PUBLIC_SUPABASE_URL has no /rest/v1 suffix";
    case "PGRST100":
      return "the select list did not parse — a space in it asks for a column with a leading space";
    default:
      return null;
  }
}
