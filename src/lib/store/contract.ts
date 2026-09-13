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
/**
 * The stored procedures the server calls, and the arguments it calls them with.
 *
 * Tables were the whole contract, and a table check cannot see a function.
 * `countVentsSince` — every rate-limit decision on every vent — goes through
 * `vent_rate_count`, which arrives in migration 0014. If that migration is
 * skipped, dropped or renamed, all eight tables still answer perfectly and
 * `/api/health` still says `database: ok`, while every vent fails on the one
 * call the check was never told about.
 *
 * That is this file's oldest bug on its fifth outing: models.retrieve, the
 * anonymous probe, the HEAD request, the `??` fallback — and now a probe that
 * checks the right identity, in the right shape, against the wrong surface.
 *
 * The arguments are harmless by construction: a uuid that belongs to nobody
 * counts nothing and returns zero. The probe is asking whether the function
 * exists and accepts this signature, which is precisely what a caller needs
 * to know before it depends on it.
 */
export const RPC_CONTRACT: Readonly<Record<string, Record<string, unknown>>> = {
  vent_rate_count: {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_since: "1970-01-01T00:00:00.000Z",
  },
  /*
    WHAT USED TO BE HERE, AND WHY PROBING FOR IT WAS A RED LIGHT OVER A
    FINISHED CLEANUP

    `match_memories` was probed here, and the reasoning was sound at the time:
    0006 created a `security definer` version that filtered on a uuid the
    *caller* supplied and was granted to `authenticated`, so any signed-in
    person could read anybody's memories over `/rest/v1/rpc/match_memories`.
    0014 replaced it, and nothing compared the live schema to this one. Because
    0006's took four arguments and 0014's takes three, and PostgREST resolves
    an RPC by its named parameters, calling with 0014's three answered PGRST202
    against a database still running 0006 — a real discriminator on a public
    endpoint.

    0016 settles it more completely than any probe could: it drops the function
    outright, by name, along with the `memories` table it read. A function that
    does not exist cannot be the vulnerable one.

    So the probe outlived its subject, and on the day 0016 was applied to
    production `/api/health` answered **503 degraded** with `database:
    unreachable` — over a deployment that was persisting every vent, answering
    on Anthropic and `writable: ok`. The endpoint cried wolf about a working
    room because it was still demanding a function the repository had
    deliberately destroyed.

    This is the mirror of the oldest bug in CLAUDE.md, and the second time it
    has arrived: `circle_push` in `FULL_CONTRACT` did the same thing a day
    earlier and produced `PENDING_OK`. A green light over a broken road teaches
    somebody to trust a light that is lying; a red light over a working road
    teaches them to stop reading it at all.

    Nothing calls this RPC. `embeddings.ts` has no importer, which is a fact
    CLAUDE.md already makes load-bearing in three places, so there is no caller
    to protect and nothing to watch. Check 121 now enforces the class rather
    than this instance: no key here may name a function that a migration in
    `supabase/migrations/` drops.
  */
};

export const TABLE_CONTRACT: Readonly<Record<string, string>> = {
  vent_users: "id,anon_id,carve,held,breaking,created_at",
  vents:
    "id,user_id,user_message,ai_reply,mood_score,tension_before,tension_after," +
    "language,duality_value,body_tapped,chair_picked,pressure_value,tactic_used," +
    "probe_used,rejected_by," +
    "intent_type,real_world_tag,real_date_used,safety_flagged,created_at",
  // Not `vent_id`. There has never been such a column: 0002 creates this with
  // user_id and anon_id, and `insertFeedback` writes exactly those. It was
  // invented while writing this file from the row types instead of from the
  // migration, and production named it within two runs — which is the check
  // working on its author first, and the correct order for that to happen in.
  vent_feedback: "id,user_id,anon_id,rating,message,created_at",
  vent_notes: "id,user_id,kind,subject,detail,created_at,updated_at",
  circles:
    "id,creator_anon_id,tag,chair_picked,pressure_seeded,flavour,status," +
    "starts_at,ends_at,created_at",
  circle_members:
    "id,circle_id,anon_id,role,pressure_seeded,last_seen_at,typing_until,joined_at",
  circle_messages: "id,circle_id,anon_id,content,kind,flagged,created_at",
  circle_push: "id,circle_id,anon_id,endpoint,p256dh,auth,created_at",
} as const;

/**
 * Tables the product reads but the store does not own.
 *
 * Empty, and that is a statement rather than an oversight.
 *
 * It held `profiles` and `memories` — the auth and vector-memory surfaces. An
 * anonymous product had grown an account system: a login, a signup, a
 * dashboard nothing linked to, and a Memory page reading an endpoint behind
 * `requireUser()`. Nobody has ever been signed in here, because the whole
 * premise is that saying the thing you cannot say out loud does not come with
 * a name attached. So those two tables were probed on every health check, on
 * behalf of code no person could reach.
 *
 * A contract describes what the code depends on. Probing a table nothing
 * reads is the same shape as every green light in this file's history: a
 * check reporting on something other than the thing.
 *
 * Kept as a named, empty export rather than deleted, because the next surface
 * this product grows that reads a table the store does not own belongs here,
 * and a comment is cheaper than rediscovering why.
 */
export const AUXILIARY_CONTRACT: Readonly<Record<string, string>> = {} as const;

export const FULL_CONTRACT = { ...TABLE_CONTRACT, ...AUXILIARY_CONTRACT };

/**
 * Tables whose absence means a migration has not been run, not that the
 * database is broken.
 *
 * Written because adding `circle_push` to the contract turned production's
 * `/api/health` into a **503 degraded** the moment it deployed — with
 * `writable: ok`, the model answering, and every vent being persisted. The
 * endpoint's own comment defines degraded as *nobody can be answered*, and
 * that was false: one unapplied migration had made the health probe alarming
 * in the wrong direction, which is this repository's oldest bug wearing its
 * opposite face. A green light over a broken road is the usual one; this was
 * a red light over a working one.
 *
 * A half-applied schema is a **normal shape here** — `live-checks.sh` runs one
 * on purpose, `getCarve` treats `42703` with 0011 pending as a normal state
 * rather than a fault, and a first Supabase deployment passes through two of
 * these shapes on its way up.
 *
 * An entry earns its place by both halves being true:
 *
 *   1. the feature it belongs to is **off** when the table is absent, with no
 *      user-facing surface that fails — `isPushConfigured` is false without
 *      VAPID keys and the room draws no control at all; and
 *   2. nothing a person does depends on it. A vent, a carve, a note and a
 *      circle all work exactly as before.
 *
 * A table that fails either half is not pending, it is missing, and belongs
 * nowhere near this set. The absence is still probed and still reported — as
 * `pendingTables`, so an operator sees precisely which migration to run — it
 * simply stops claiming the room is shut when it is open.
 */
export const PENDING_OK: ReadonlySet<string> = new Set(["circle_push"]);

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
      /*
        Two different problems wearing one code, and the cheaper one is not
        the obvious one.

        The obvious reading is schema drift: the migration was never applied.
        The other is that it was applied a minute ago and PostgREST is still
        serving a cached schema — the column is in the table and the API layer
        has not noticed. Identical error, identical message, and somebody who
        has just run the SQL correctly is told it did not work.

        That cost real time here: a migration was run against production and
        the health check went on naming the column missing, which reads as a
        failed migration and sends you back to the SQL editor to run the thing
        you already ran.

        Both fixes are one line, so name both. `notify pgrst` is free and does
        nothing when the column genuinely is absent.
      */
      return (
        "a column in the contract does not exist — either the migration has " +
        "not been applied, or it has and PostgREST is serving a cached schema. " +
        "Check with: select column_name from information_schema.columns where " +
        "table_name='<table>'; then reload with: notify pgrst, 'reload schema';"
      );
    case "PGRST125":
      return "the request path was rejected — check NEXT_PUBLIC_SUPABASE_URL has no /rest/v1 suffix";
    case "PGRST100":
      return "the select list did not parse — a space in it asks for a column with a leading space";
    // Group 3 is JWT, not SQL: "JWT claims validation or parsing failed", 401.
    // Worth stating plainly because it looks like a table error in a list of
    // table errors and is not one — the key is the problem, not the schema.
    //
    // What does not add up, and is left in the message rather than smoothed
    // over: this fired for exactly one table out of eight in a single parallel
    // batch on one client, while the others came back 42501 — a *Postgres*
    // error, which can only be reached after the JWT was accepted and the role
    // resolved. A bad key cannot be bad for one table and fine for seven.
    case "PGRST303":
      return "clock skew, not schema — the key's `iat` reads as the future to the database, so whichever request lands inside the skew window is refused. It moves between tables run to run and clears on its own. Nothing to fix here";
    default:
      return null;
  }
}
