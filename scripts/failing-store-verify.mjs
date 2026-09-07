/**
 * The third shape: a store that is there and says no.
 *
 *   node scripts/broken-store.mjs --port 54321 &
 *   node scripts/failing-store-verify.mjs http://localhost:3055
 *
 * No dependencies, no model calls — Node 18+ only.
 *
 * ## Why a third pass
 *
 * `live-checks.sh` runs the product twice: with `VENT_LOCAL_STORE=1`, and with
 * nothing configured at all. Both are real deployments. Neither is this one,
 * and CLAUDE.md names the gap in the section about the `?carve=1` button:
 *
 *   "the two shapes where it lied are the two shapes a *first* Supabase
 *    deployment passes through — `42501` before the grants land, `42703`
 *    before 0011 does. Neither has a store of `null`, so `no-store-verify`
 *    cannot see them, and no suite here has ever run a store that exists and
 *    fails."
 *
 * `hasStore` is `supabaseUrl && supabaseServiceRoleKey`, and the URL check
 * accepts `http:` — so pointing the app at `broken-store.mjs` gives it a real
 * `SupabaseStore`, built the real way, making real requests through the real
 * client, to a database that refuses every one of them. Nothing is stubbed
 * inside the product: the bugs this shape exists to find live in the seam
 * between a store call and the handler around it, and a fake below the adapter
 * would test neither side of that seam.
 *
 * ## What is worth asserting here, which is not what the other two assert
 *
 * `no-store-verify` asks whether an empty deployment is honest. This asks
 * something different: **does a failure stay a failure, or does it become a
 * crash or a lie?**
 *
 *   1. No store failure becomes a 500. A 500 with an empty body is the worst
 *      answer available — the client has nothing to read, so its honest branch
 *      has nothing to be honest with.
 *   2. Every refusal is the authored sentence, and the person is told it was
 *      not their fault.
 *   3. Nothing the database said reaches the response. Postgres quotes values
 *      and the value here is usually an anon id, which in this product is the
 *      entire credential — `/api/notes?anonId=` needs nothing else.
 *   4. The private session still works. The store is not the product; a vent
 *      must still get a reply, and must not claim it was kept.
 *
 * ## What the first run found
 *
 * Three live bugs, which is why this exists:
 *
 *   POST /api/feedback   500, empty body. `countFeedbackSince` — the rate
 *                        limiter — sat one line above a try block whose
 *                        comment describes this exact failure and fixes the
 *                        write below it.
 *   POST /api/profile    500, empty body. `ensureUser` unguarded, so
 *                        onboarding failed silently — the surface where the
 *                        chair is written.
 *   GET  /api/heartbeat  503 carrying Postgres's `message` and `hint`
 *                        verbatim, on a route with no token, whose own doc
 *                        comment says "Counts only. Never content. That is
 *                        what makes it safe to leave open."
 */

const BASE = (process.argv[2] || "http://localhost:3055").replace(/\/$/, "");
/**
 * `refusing` — the database says no to everything.
 * `writes-only` — reads succeed and writes are refused, which is `GRANT
 *   SELECT` without `GRANT UPDATE`: an ordinary half-applied migration, and
 *   the only shape that can reach `setCarve`'s failure path at all.
 */
const MODE = process.argv[3] === "writes-only" ? "writes-only" : "refusing";
const ANON = "9f3c1b7e-4a20-4c11-8d3e-2b6a5c0f7e18";

const rows = [];
const record = (n, name, pass, detail) => rows.push({ n, name, pass, detail });

async function get(p) {
  const r = await fetch(`${BASE}${p}`);
  return { status: r.status, text: await r.text() };
}
async function post(p, body) {
  const r = await fetch(`${BASE}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, text: await r.text() };
}

/*
  What the database said, and must never come back.

  `broken-store.mjs` plants these on purpose. A check that asserts nothing
  leaks has to be given something that would leak, or it is asserting that an
  empty string is empty — the failure bucket with nothing in it, one more time.
*/
const THEIR_WORDS = [
  "permission denied for table",
  "GRANT was never run",
  "column vents.carve does not exist",
  "migration 0011",
  ANON,
];
const leaks = (text) => THEIR_WORDS.filter((w) => text.includes(w));

/*
  Ours, and safe. A code is a code — `42501` and `42703` are the two most
  useful strings this product has ever logged and neither is anybody's words —
  so a response carrying one is not a leak and is not counted as one.
*/
const OPERATOR_WORDS = /supabase|livekit|NEXT_PUBLIC|SERVICE_ROLE|env var|npm run/i;

/**
 * `"storage":"supabase"` is not the leak this is looking for.
 *
 * `store.kind` is a deliberate field on a dozen responses — it is how the
 * client knows whether anything is being kept, and it is what makes
 * `persisted: false` legible. It is a machine field in JSON, not a sentence
 * rendered at somebody; the rule it looks like it breaks ("no page says the
 * word Supabase to a person") is about pages, and `no-store-verify` check 3
 * already holds that where it belongs.
 *
 * Removed before the operator-word sweep rather than removed from the sweep,
 * so a *second* occurrence of the vendor's name in the same response still
 * fails. Without this the check reads a designed field as a leak, which is a
 * false finding — and a false finding is worse than a missed one, because
 * somebody acts on it.
 */
const withoutStorageKind = (t) => t.replace(/"storage"\s*:\s*"[a-z]+"/gi, '"storage":""');

/**
 * The half-applied schema, which is the only shape that reaches the bug.
 *
 * `setCarve` is the one mutation in `supabase-store.ts` that reports by
 * returning `false` instead of throwing — deliberately, because `42703` with
 * 0011 pending is a normal state rather than a fault. The route between it and
 * the two screens dropped that boolean and reported `deleted: "carve"`
 * unconditionally, so the room said "Forgotten." about a sentence it was still
 * holding, on the two screens whose entire job is that question.
 *
 * `FORGET_FAILED` — "Could not clear that. It is still here." — was unreachable
 * code for the whole life of the product, because reaching it needs a store
 * that *succeeds* at `findUserId` and *fails* at the update. With everything
 * refused the route dies at the first read and never calls `setCarve` at all.
 *
 * This is that shape. The route's own comment names the honest answer —
 * "`deleted: 0` with `had: true` ... which until now was unreachable" — and
 * this is the assertion that it is not unreachable any more.
 */
async function writesOnly() {
  const carve = await get(`/api/carve?anonId=${ANON}`);
  let cd = {};
  try { cd = JSON.parse(carve.text); } catch { /* asserted below */ }
  record(1, "A read still works when only writes are refused",
    carve.status === 200 && typeof cd.carve === "string" && cd.carve.length > 0,
    `${carve.status} · carve=${JSON.stringify(cd.carve)}`,
  );

  const forget = await fetch(`${BASE}/api/vent?anonId=${ANON}&carve=1`, { method: "DELETE" });
  const text = await forget.text();
  let fd = {};
  try { fd = JSON.parse(text); } catch { /* asserted below */ }
  record(2, "A carve the database refused to clear is never reported as cleared",
    fd.deleted !== "carve",
    `deleted=${JSON.stringify(fd.deleted)}`);
  record(3, "and the answer is the shape both screens turn into FORGET_FAILED",
    fd.deleted === 0 && fd.had === true,
    `deleted=${JSON.stringify(fd.deleted)} had=${JSON.stringify(fd.had)}`);
  record(4, "Nothing Postgres said comes back with it",
    leaks(text).length === 0 && !OPERATOR_WORDS.test(withoutStorageKind(text)),
    leaks(text).join(", ") || "clean");

  const mark = (p) => (p === true ? "PASS" : "FAIL");
  console.log("\n| # | Check | Result | Detail |");
  console.log("|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.n} | ${r.name} | ${mark(r.pass)} | ${r.detail} |`);
  const failed = rows.filter((r) => r.pass !== true);
  console.log(`\n${rows.length - failed.length} passed, ${failed.length} failed — half-applied-schema shape\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

async function main() {
  if (MODE === "writes-only") return writesOnly();

  // ── 1. Nothing crashes ──────────────────────────────────────────────────
  const writes = [
    ["feedback", await post("/api/feedback", { anonId: ANON, rating: 4 })],
    ["profile", await post("/api/profile", { anonId: ANON, chairPicked: "tight_edge", onboardingDone: true })],
    ["held", await post("/api/held", { anonId: ANON, text: "My sister called me back." })],
    ["circles", await post("/api/circles", { anonId: ANON })],
  ];
  const reads = [
    ["carve", await get(`/api/carve?anonId=${ANON}`)],
    ["notes", await get(`/api/notes?anonId=${ANON}`)],
    ["history", await get(`/api/history?anonId=${ANON}`)],
    ["held", await get(`/api/held?anonId=${ANON}`)],
    ["heartbeat", await get("/api/heartbeat")],
    ["community", await get("/api/community")],
  ];
  const all = [...writes, ...reads];

  const crashed = all.filter(([, r]) => r.status >= 500 && r.status !== 503);
  record(1, "A database that says no never becomes a 500",
    crashed.length === 0,
    crashed.length ? crashed.map(([n, r]) => `${n}=${r.status}`).join(" · ")
      : `${all.length} surfaces, none 5xx above 503`);

  const empty = all.filter(([, r]) => r.status >= 400 && r.text.trim() === "");
  record(2, "and never an error with no body to read",
    empty.length === 0,
    empty.length ? empty.map(([n]) => n).join(" · ")
      : "every refusal carries a body the client can branch on");

  // ── 2. Every refusal is written for a person ────────────────────────────
  /*
    `/api/heartbeat` is exempt, and the reason is not "it failed the check".

    It is the loop run inside the deployment — read by `npm run heartbeat` and
    by nothing with eyes. Its refusal is `{error, detail, restPath}`, which is
    the right shape for an operator and the wrong shape to demand a sentence
    from. Requiring "Nothing you did caused it" there would be asserting that
    an ops endpoint apologises to a script.

    Named here rather than dropped from `all`, because it still has to pass
    checks 1, 2, 5 and 6 — no crash, a body, and nothing of the database's in
    it. Those are the ones it was actually failing.
  */
  const FOR_A_PERSON = ([n]) => n !== "heartbeat";
  const refusals = all.filter(([, r]) => r.status >= 400).filter(FOR_A_PERSON);
  const wordless = refusals.filter(([, r]) => {
    try {
      const d = JSON.parse(r.text);
      return !d.message || String(d.message).length < 20;
    } catch {
      return true;
    }
  });
  record(3, "Every refusal says something a person can read",
    wordless.length === 0,
    wordless.length ? wordless.map(([n]) => n).join(" · ")
      : `${refusals.length} refusals, all with a sentence`);

  const blamed = refusals.filter(([, r]) => !/Nothing you did caused it|still works|aren't open/i.test(r.text));
  record(4, "and tells them it was not their fault",
    blamed.length === 0,
    blamed.length ? blamed.map(([n]) => n).join(" · ") : "no refusal reads as the person's mistake");

  // ── 3. Nothing the database said comes back ─────────────────────────────
  const leaked = all.map(([n, r]) => [n, leaks(r.text)]).filter(([, l]) => l.length);
  record(5, "Nothing Postgres said reaches the response",
    leaked.length === 0,
    leaked.length ? leaked.map(([n, l]) => `${n}: ${l.join(", ")}`).join(" · ")
      : "no upstream message, hint or quoted value on any surface");

  const opWords = all.map(([n, r]) => [n, withoutStorageKind(r.text).match(OPERATOR_WORDS)]).filter(([, m]) => m);
  record(6, "and no route names our configuration",
    opWords.length === 0,
    opWords.length ? opWords.map(([n, m]) => `${n}: ${m[0]}`).join(" · ") : `${all.length} routes, clean`);

  /*
    ── 3b. And the public health endpoint, field by field it does not have ──

    `/api/health` has no token on it, and it publishes what the database says
    in four places: `tableErrors.hint`, `tableErrors.message`, `transient.hint`
    and `writeError`. Three of the four were redacted in one pass and the
    fourth was missed — every assertion in the suite still passed, and the leak
    only appeared in a response fetched off a running server with a planted id
    in it.

    So this asserts the class rather than the fields: no uuid anywhere in the
    response, wherever it came from. `broken-store.mjs` plants one in its
    `hint` precisely so this has something to find.

    An anon id is not an identifier in this product. It is the whole
    credential — `/api/notes?anonId=` needs nothing else.
  */
  const health = await get("/api/health");
  const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const found = [];
  const walk = (node, at) => {
    if (typeof node === "string") { if (UUID.test(node)) found.push(`${at}: ${node.slice(0, 60)}`); return; }
    if (node && typeof node === "object") for (const k of Object.keys(node)) walk(node[k], `${at}.${k}`);
  };
  try { walk(JSON.parse(health.text), ""); } catch { found.push("health did not return JSON"); }
  /*
    And proof the redaction ran, rather than proof nothing arrived.

    "No uuid in the response" is satisfied just as well by a health endpoint
    that reported nothing at all, which is the failure bucket with nothing in
    it — the shape this repository has recorded four times. `broken-store.mjs`
    plants an id in its `hint` on purpose, so a redacted response must carry
    the marker where it was.
  */
  const redacted = health.text.includes("<id>");
  record(11, "The public health endpoint carries no identifier from the database",
    found.length === 0 && redacted,
    found.length
      ? found.join(" · ")
      : redacted
        ? "no uuid in any field, and the planted one came back redacted"
        : "no uuid — but no redaction marker either, so nothing was checked");

  // The probe that would have caught a live vulnerability, on the wire rather
  // than in the contract file. See check 121.
  const probed = /match_memories/.test(health.text);
  record(12, "and it probes the function 0014 hardened", probed,
    probed ? "match_memories reported" : "the RPC probe covered vent_rate_count alone for a year");

  // ── 4. The private session still works ──────────────────────────────────
  const vent = await post("/api/vent", { anonId: ANON, message: "work is crushing me and I cannot sleep" });
  let vd = {};
  try { vd = JSON.parse(vent.text); } catch { /* asserted below */ }
  record(7, "A vent still gets a reply when the database is refusing",
    vent.status === 200 && typeof vd.reply === "string" && vd.reply.length > 20,
    `${vent.status} · ${String(vd.reply ?? "").slice(0, 60)}…`);

  record(8, "and never claims it was kept",
    vd.persisted !== true && !/saved|kept it|word for word/i.test(String(vd.reply ?? "")),
    `persisted=${vd.persisted}`);

  // ── 5. The delete button, which is what this shape was built for ────────
  /*
    `setCarve` is the one mutation in `supabase-store.ts` that reports by
    returning instead of throwing, so the route has to read its answer. Both
    halves were repaired and the line between them dropped the boolean and
    reported `deleted: "carve"` unconditionally. `FORGET_FAILED` — "Could not
    clear that. It is still here." — was unreachable code the whole time,
    because the only shapes that reach it are `42501` and `42703`, and neither
    has a store of `null`.

    This is that assertion, in the only shape that can make it.

    WHAT IT DOES AND DOES NOT PROVE

    The first version of this check posted to `/api/carve`, which is the
    *Carver* — the thing that writes a carve — and got back a cheerful
    `{"carved":false,"reason":"no_key"}` and a 200, then reported the route as
    lying. The button lives at `DELETE /api/vent?carve=1`. A probe aimed one
    route over, in the file written about probes aimed one window over.

    And with every request refused, this route fails at `findUserId` before it
    ever reaches `setCarve`. So what is proven here is that the surface does
    not report a deletion it did not make. The specific path where `setCarve`
    *returns false* rather than throwing — `42703` with 0011 pending, the one
    that made `FORGET_FAILED` unreachable — needs a store that succeeds at
    `findUserId` and fails at the update, which a blanket-refusal stub cannot
    produce. That is a fourth shape and it is not covered here. Check 87 holds
    it statically in the meantime, which is weaker and is the truth.
  */
  const forget = await fetch(`${BASE}/api/vent?anonId=${ANON}&carve=1`, { method: "DELETE" });
  const forgetText = await forget.text();
  let fd = {};
  try { fd = JSON.parse(forgetText); } catch { /* asserted below */ }
  record(9, "A delete that did not land is never reported as done",
    fd.deleted !== "carve" && forget.status !== 200 && leaks(forgetText).length === 0,
    `${forget.status} · deleted=${JSON.stringify(fd.deleted)}`);

  // ── 6. Pages still render ───────────────────────────────────────────────
  const pages = ["/", "/chat", "/circles", "/history", "/memory", "/settings"];
  const bad = [];
  for (const p of pages) {
    const r = await fetch(`${BASE}${p}`);
    const body = await r.text();
    if (r.status >= 500) bad.push(`${p}=${r.status}`);
    else if (OPERATOR_WORDS.test(body)) bad.push(`${p} names our configuration`);
    else if (leaks(body).length) bad.push(`${p} prints what the database said`);
  }
  record(10, "Every page renders with the database refusing",
    bad.length === 0,
    bad.length ? bad.join(" · ") : `${pages.length} pages, no 5xx, nothing leaked`);

  const mark = (p) => (p === true ? "PASS" : "FAIL");
  console.log("\n| # | Check | Result | Detail |");
  console.log("|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.n} | ${r.name} | ${mark(r.pass)} | ${r.detail} |`);

  const failed = rows.filter((r) => r.pass !== true);
  console.log(`\n${rows.length - failed.length} passed, ${failed.length} failed — failing-store shape\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(2);
});
