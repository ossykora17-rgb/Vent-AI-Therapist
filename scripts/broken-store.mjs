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

const server = http.createServer((req, res) => {
  served++;
  /*
    Everything fails, including reads.

    A store that can read and not write is a fourth shape and a kinder one.
    This is the harsh case on purpose: the product must stay usable when the
    database answers nothing at all, and every sentence it prints must still
    be true.
  */
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
