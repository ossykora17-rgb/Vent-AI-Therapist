/**
 * A database that is there and says no.
 *
 * ## The shape nothing has ever run
 *
 * `live-checks.sh` runs the product twice: once with `VENT_LOCAL_STORE=1` and
 * once with nothing configured at all. Both are real deployments and both are
 * worth covering. Neither is the third one.
 *
 * CLAUDE.md names it, in the section about the `?carve=1` button:
 *
 *   "the two shapes where it lied are the two shapes a *first* Supabase
 *    deployment passes through — `42501` before the grants land, `42703`
 *    before 0011 does. Neither has a store of `null`, so `no-store-verify`
 *    cannot see them, and no suite here has ever run a store that exists and
 *    fails. `FORGET_FAILED` — 'Could not clear that. It is still here.' — was
 *    unreachable code the whole time."
 *
 * That is this file. `hasStore` is `supabaseUrl && supabaseServiceRoleKey` and
 * the URL check accepts `http:`, so pointing the app at this server gives it a
 * real `SupabaseStore`, constructed the real way, making real requests through
 * the real client — to a database that refuses every one of them.
 *
 * Nothing is stubbed inside the product. That matters: the bug being hunted
 * lived in the seam between a store method's return value and the route that
 * ignored it, and a fake injected below the adapter would test neither side of
 * the seam.
 *
 * ## Why PostgREST's exact error shape
 *
 * `supabase-js` reads `code`, `message`, `details` and `hint` off the JSON
 * body, and the store branches on `code`. A server that merely returns 500
 * with no body would exercise a path the real failure never takes — the same
 * mistake as the HEAD-request probe that could not read its own answer.
 *
 * The two codes are the two that matter, and they are the ones a first
 * deployment actually hits:
 *
 *   42501  insufficient_privilege — RLS is on and the GRANTs never landed
 *   42703  undefined_column       — a migration has not been applied yet
 *
 * The messages below quote a value on purpose. Postgres does, and an anon id
 * is usually the value; a check that asserts nothing leaks has to be given
 * something that would leak.
 *
 *   node scripts/broken-store.mjs [--code 42501] [--port 54321]
 */

import http from "node:http";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const CODE = arg("code", "42501");
const PORT = Number(arg("port", "54321"));

/**
 * Which methods are refused. Default: all of them.
 *
 * `--fail-methods PATCH,POST,PUT,DELETE` is the fourth shape, and it is a real
 * one rather than a contrivance: `GRANT SELECT` without `GRANT UPDATE` is an
 * ordinary half-applied migration, and it is the only configuration that can
 * reach the bug CLAUDE.md says was unreachable.
 *
 * With everything refused, a route fails at `findUserId` and never gets to the
 * write — so `setCarve`, the one mutation in `supabase-store.ts` that reports
 * by *returning false* instead of throwing, is never actually called. Its
 * failure path, and the `FORGET_FAILED` sentence behind it, stayed unprovable.
 * Letting reads through is what makes the write the thing that fails.
 */
const FAIL_METHODS = new Set(
  (arg("fail-methods", "") || "").split(",").map((m) => m.trim().toUpperCase()).filter(Boolean),
);

/** What Postgres says, including the part that quotes somebody's id. */
const BODIES = {
  42501: {
    code: "42501",
    message: 'permission denied for table vents',
    details: null,
    hint: 'GRANT was never run for role "service_role" — anon id 9f3c1b7e-4a20-4c11-8d3e-2b6a5c0f7e18 was refused',
  },
  42703: {
    code: "42703",
    message: 'column vents.carve does not exist',
    details: null,
    hint: "migration 0011 has not been applied to this project",
  },
};

const body = JSON.stringify(BODIES[CODE] ?? BODIES["42501"]);
const status = CODE === "42501" ? 403 : 400;

let served = 0;

/**
 * A user id and a carve, so a read can succeed and the *write* is the thing
 * that fails. Without a carve on the row the forget route short-circuits on
 * "there was nothing to delete" and never calls `setCarve` at all — which is
 * a true answer to a different question, and it is what the first run of this
 * shape actually measured.
 */
const USER_ID = "0b2d5a41-7c38-4f9e-9a6b-1e4c8d05f3a2";

const server = http.createServer((req, res) => {
  served++;

  /*
    In the default mode everything fails, including reads — the harsh case on
    purpose: the product must stay usable when the database answers nothing at
    all, and every sentence it prints must still be true.

    With `--fail-methods`, the rest succeed. `maybeSingle()` and `single()` set
    `Accept: application/vnd.pgrst.object+json` and a bare list read does not,
    so the shape of the answer follows the header rather than a guess about the
    path. Getting that wrong returns a 406 from `supabase-js` itself and the
    read fails for a reason that has nothing to do with the test.
  */
  if (FAIL_METHODS.size > 0 && !FAIL_METHODS.has(req.method ?? "")) {
    const wantsObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object+json");
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    const row = { id: USER_ID, carve: "the burial", anon_id: "seeded" };
    /*
      A one-row array for list reads, not an empty one.

      `maybeSingle()` does not send `Accept: vnd.pgrst.object+json` — that is
      `single()`. It asks for an array and resolves 0-or-1 itself, so an empty
      array made `findUserId` return null, and the forget route short-circuited
      on "no such user" without ever calling `setCarve`. The shape booted, the
      health probe went green on seven of eight tables, and the thing it was
      built to reach was never reached. One more probe that could not see what
      it was looking at.
    */
    res.end(wantsObject ? JSON.stringify(row) : JSON.stringify([row]));
    return;
  }

  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    // PostgREST sends this and `supabase-js` reads it. Without it the client
    // takes a different branch than production would.
    "content-profile": "public",
  });
  res.end(body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[broken-store] refusing everything with ${CODE} on :${PORT}`);
});

process.on("SIGTERM", () => {
  console.log(`[broken-store] served ${served} refusals`);
  server.close(() => process.exit(0));
});
