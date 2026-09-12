/**
 * The shape nothing runs in.
 *
 *   node scripts/no-store-verify.mjs http://localhost:3001
 *
 * No dependencies, no model calls — Node 18+ only.
 *
 * CLAUDE.md keeps one list longer than any other: the same bug, wearing eleven
 * faces, all of them produced by the same gap. Every automated path in this
 * repository has a store. `live-checks.sh` sets `VENT_LOCAL_STORE=1`, CI sets
 * it, dev falls back to `FileStore`. So the one configuration with nothing
 * configured — production with no Supabase env vars, which is exactly what a
 * fresh Vercel project *is* — is the one configuration nothing ever exercised.
 *
 * It was also the configuration real people were using.
 *
 * This file is that configuration, exercised. It is deliberately not the same
 * checks with a flag flipped: almost every assertion in `live-verify.mjs` is
 * about something being kept, and here nothing is kept on purpose. What is
 * worth asserting in this shape is different in kind —
 *
 *   1. Nothing 5xxs. An unconfigured deployment is a working deployment with
 *      less in it, not a broken one.
 *   2. Every refusal is written for the person reading it. The sentence
 *      "Circles need storage. Run locally or configure Supabase." was toasted
 *      into somebody's face at 2am by the lobby, and it could only ever appear
 *      here. Check 75 reads the source for that vocabulary; this reads what
 *      actually comes back over the wire, which is the only place a template,
 *      a rewrite or an upstream can put a word back in.
 *   3. Nothing claims to have kept anything. Every write path answers, and
 *      every one of them says plainly that it did not persist.
 *
 * Run against a server started with no store: no VENT_LOCAL_STORE, no Supabase
 * environment, NODE_ENV=production.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repo root, so the page walk works from any working directory. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE.startsWith("http")) {
  console.error("Usage: node scripts/no-store-verify.mjs http://localhost:3001");
  process.exit(2);
}

const ANON = `nostore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const rows = [];
const record = (n, name, pass, detail) =>
  rows.push({ n, name, pass, detail: String(detail).slice(0, 96) });

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * The vocabulary of somebody who deployed this, in front of somebody who did
 * not. Kept in step with eval check 75 by intent rather than by import — that
 * file has zero dependencies and so does this one, and both say so in prose
 * next to the list.
 */
const OPERATOR_WORDS =
  /\bSupabase\b|\bnpm run\b|LIVEKIT_|ANTHROPIC_|NEXT_PUBLIC_|SERVICE_ROLE|\.env\b|\benv var|\blocalhost\b|\bthis deployment\b|\bthis instance\b|\bnot configured on\b/i;

async function main() {
  console.log(`Verifying the unconfigured shape at ${BASE}\nanonId: ${ANON}\n`);

  /*
    First: prove we are actually in the shape. A pass here against a server
    that quietly had a store would be the worst possible outcome — a green
    light over the one road nobody drives. Every assertion below is worthless
    if this one is wrong, so it is fatal rather than a row in the table.
  */
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  if (health.storage !== "none" || health.database !== "not_configured") {
    console.error(
      `this server has a store (storage=${health.storage}, database=${health.database}).\n` +
        "start it with no VENT_LOCAL_STORE and no Supabase environment, or these checks mean nothing.",
    );
    process.exit(2);
  }
  console.log(`storage: ${health.storage} | database: ${health.database} | status: ${health.status}\n`);

  // 1 — the health endpoint answers rather than refusing.
  const hres = await fetch(`${BASE}/api/health`);
  record(1, "Health answers in an unconfigured deployment", hres.status === 200,
    `${hres.status} · status=${health.status} · storage=none`);

  /*
    2 — every page renders.

    Server-rendered HTML only, which is the honest limit of a zero-dependency
    check: the lobby's storeless state is painted after a client fetch and
    cannot be seen from here. What *can* be seen is that nothing throws, which
    is what a 500 on the landing page would look like — and the landing page is
    the one surface in this product that reads the store during render.
  */
  /*
    The legal pages are the one place a vendor's name is required rather than
    forbidden. A privacy policy that will not say which companies see your
    words is not a privacy policy, so they are checked for everything except
    the naming — and this check found the sentence around that naming, which
    called itself "this deployment" in the one document written for somebody
    who has never deployed anything.
  */
  const LEGAL = /^\/(privacy|terms)$/;
  const JARGON_ONLY = /\bnpm run\b|LIVEKIT_|ANTHROPIC_|NEXT_PUBLIC_|SERVICE_ROLE|\.env\b|\benv var|\blocalhost\b|\bthis deployment\b|\bthis instance\b/i;
  /*
    Read off the filesystem, not typed out.

    The list here was `["/", "/chat", "/circles", "/history", "/memory",
    "/privacy", "/terms"]` — seven of the eight pages that exist. The missing
    one was `/circles/[id]`: the room itself, where the transcript, the voice
    controls and the Keeper's lines are, and the page that displays the very
    refusal that was leaking three environment variable names one route over.

    Same class as the hand-written route list next door, found by asking the
    same question one file along. A list of pages does not survive the next
    page.
  */
  const pages = [];
  const walkPages = (dir, route) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walkPages(path.join(dir, entry.name), `${route}/${entry.name}`);
      else if (entry.name === "page.tsx") pages.push(route === "" ? "/" : route);
    }
  };
  walkPages(path.join(ROOT, "src/app"), "");
  pages.sort();

  const bad = [];
  const leaks = [];
  for (const p of pages) {
    /*
      A dynamic page is probed with an id that is not there, and a room that
      is not there is allowed to answer 404. What it is never allowed to do is
      throw — that is what a 5xx on this page would mean, and it is the whole
      question this pass asks.
    */
    const dynamic = p.includes("[");
    const url = p.replace(/\[[^\]]+\]/g, "does-not-exist");
    const r = await fetch(`${BASE}${url}`);
    const html = await r.text();
    if (dynamic ? r.status >= 500 : r.status !== 200) bad.push(`${p}=${r.status}`);
    // Strip the Next.js payload: it carries source paths and build ids that
    // are not sentences and never reach a screen.
    const visible = html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    const hit = visible.match(LEGAL.test(p) ? JARGON_ONLY : OPERATOR_WORDS);
    if (hit) leaks.push(`${p}: …${visible.slice(Math.max(0, hit.index - 40), hit.index + 40).trim()}…`);
  }
  record(2, "Every page renders with nothing configured", bad.length === 0,
    bad.length ? bad.join(" ") : `${pages.length} pages, no 5xx`);
  record(3, "No page says the word Supabase to a person", leaks.length === 0,
    leaks.length ? leaks.join(" | ") : "no vendor, env var or command in any rendered page");

  /*
    4 — a vent is answered.

    The whole premise of degrading rather than failing: with no store and no
    model key somebody still gets a real reply, and is told plainly that it is
    not being kept. `noModelKeyReply` is the sentence that once read "I've
    saved it, word for word" while `getStore()` returned null.
  */
  const vres = await post("/api/vent", {
    anonId: ANON,
    message: "This month don finish me. Rent due and salary never enter.",
    pressure: 70,
  });
  const vent = await vres.json();
  record(4, "A vent still gets a reply", vres.status === 200 && Boolean(vent.reply),
    `${vres.status} · intent=${vent.intent} · ${String(vent.reply).slice(0, 44)}…`);
  record(5, "And the reply never claims it was kept", vent.persisted === false,
    `persisted=${vent.persisted} · storage=${vent.storage}`);

  // 6 — the crisis path is local, so it must be identical here.
  const cres = await post("/api/vent", { anonId: ANON, message: "I want to kill myself" });
  const crisis = await cres.json();
  record(6, "Crisis routing is unchanged with nothing configured",
    Boolean(crisis.crisis?.nigeria) && crisis.intent === "crisis",
    `${cres.status} · intent=${crisis.intent} · line=${crisis.crisis?.nigeria}`);

  /*
    7 and 8 — the two writes that used to lie.

    Feedback answered 200 with `persisted: false` and the client thanked
    somebody for a rating that went on the floor. Held notes answer the same
    way and always read it. Both are asserted from the wire, because the client
    can only be as honest as what it is told.
  */
  const fres = await post("/api/feedback", { anonId: ANON, rating: 4, message: "fine" });
  const feedback = await fres.json();
  record(7, "Feedback says it was not kept", fres.status === 200 && feedback.persisted === false,
    `${fres.status} · persisted=${feedback.persisted}`);

  const hres2 = await post("/api/held", { anonId: ANON, text: "My sister called me back." });
  const held = await hres2.json();
  record(8, "A held note says it was not saved", hres2.status === 200 && held.saved === false,
    `${hres2.status} · saved=${held.saved}`);

  /*
    9 and 10 — the refusal that shipped the sentence.

    A circle genuinely cannot open here, and that is the correct answer. What
    was wrong was who the answer was written for. This asserts both halves: the
    status the client branches on, and the sentence the lobby prints verbatim.
  */
  const gres = await fetch(`${BASE}/api/circles`);
  const lobby = await gres.json();
  record(9, "The lobby reports that it cannot hold rooms",
    gres.status === 200 && lobby.persisting === false && Array.isArray(lobby.circles),
    `${gres.status} · persisting=${lobby.persisting} · circles=${lobby.circles?.length}`);

  const ores = await post("/api/circles", {
    anonId: ANON, tag: "economy", chairPicked: "sunk", pressure: 62,
  });
  const opened = await ores.json();
  const msg = String(opened.message ?? "");
  record(10, "Opening one refuses in a sentence a person can read",
    ores.status === 503 && msg.length > 0 && !OPERATOR_WORDS.test(msg),
    `${ores.status} · "${msg}"`);

  /*
    11 — nothing anywhere on the wire is about our vendors.

    The strongest form of the rule, and the one a source scan cannot make: the
    body that actually arrives. A template, a middleware rewrite or an upstream
    error can all put a word back that the source no longer contains.
  */
  const wire = [
    ["/api/carve", await fetch(`${BASE}/api/carve?anonId=${ANON}`)],
    ["/api/held", await fetch(`${BASE}/api/held?anonId=${ANON}`)],
    ["/api/notes", await fetch(`${BASE}/api/notes?anonId=${ANON}`)],
    ["/api/history", await fetch(`${BASE}/api/history?anonId=${ANON}`)],
    ["/api/pattern", await fetch(`${BASE}/api/pattern?anonId=${ANON}`)],
    ["/api/community", await fetch(`${BASE}/api/community`)],
    ["/api/circles/does-not-exist", await fetch(`${BASE}/api/circles/does-not-exist`)],
  ];
  const wireLeaks = [];
  const wire5xx = [];
  for (const [name, res] of wire) {
    const text = await res.text();
    /*
      A crash, not a refusal. 503 is this product's designed answer for "there
      is no store here", and a circle lookup with nothing to look in is
      correctly answering it — flagging that made the check fail on the very
      behaviour it exists to verify.
    */
    if ([500, 502, 504].includes(res.status)) wire5xx.push(`${name}=${res.status}`);
    /*
      Only the fields a person is shown. `storage: "none"` and
      `error: "no_storage"` are machine-readable and belong on the wire — it is
      `message` and `reply` that get printed into a toast.
    */
    for (const m of text.matchAll(/"(?:message|reply|note|detail)":"((?:[^"\\]|\\.)*)"/g)) {
      if (OPERATOR_WORDS.test(m[1])) wireLeaks.push(`${name}: ${m[1].slice(0, 60)}`);
    }
  }
  record(11, "No route answers a person with our configuration",
    wireLeaks.length === 0 && wire5xx.length === 0,
    [...wireLeaks, ...wire5xx].join(" | ") || `${wire.length} routes, clean`);

  /*
    12 — deleting nothing is not a failure, in this shape too.

    The finding CLAUDE.md records as `deleted: 0` misread as failure appeared
    in three places. With no store there is nothing to delete by construction,
    which makes this the shape where the distinction between "nothing was
    there" and "it did not work" is load-bearing on every request.
  */
  const dres = await fetch(`${BASE}/api/vent?anonId=${ANON}`, { method: "DELETE" });
  const del = await dres.json();
  record(12, "A wipe with nothing stored reports nothing stored",
    dres.status === 200 && del.persisted === false,
    `${dres.status} · deleted=${JSON.stringify(del.deleted)} · persisted=${del.persisted}`);

  /*
    13 — the surface that answers "what do you know about me", with nothing
    configured.

    Added the day after `/api/notes` shipped, because it shipped into neither
    verification pass. A route that lists what a machine holds about somebody
    and lets them delete it is exactly the surface this file exists for, and it
    went out covered by nothing in either shape — which is the gap CLAUDE.md's
    last section is entirely about, repeated by the person who wrote that
    section down.

    Two claims, and the second is the one worth the request. An empty list is
    ordinary. But the *deletion* must report as having held: nothing is kept
    here, so nothing is being held, and the honest answer to "is it gone" is
    yes. `deleted: false` would be true about the row and wrong about the
    question — the `?carve=1` bug said forwards.
  */
  const nres = await fetch(`${BASE}/api/notes?anonId=${ANON}`);
  const notes = await nres.json();
  const ndel = await fetch(`${BASE}/api/notes?anonId=${ANON}&id=00000000-0000-4000-8000-000000000000`, {
    method: "DELETE",
  });
  const ndelBody = await ndel.json();
  record(13, "Nothing is known, and forgetting it still holds",
    nres.status === 200 && Array.isArray(notes.notes) && notes.notes.length === 0 &&
      notes.persisted === false &&
      ndel.status === 200 && ndelBody.deleted === true && ndelBody.persisted === false,
    `list=${nres.status}/${notes.notes?.length} persisted=${notes.persisted} · ` +
      `del=${ndel.status} deleted=${JSON.stringify(ndelBody.deleted)}`);

  /*
    14 and 15 — the export in this shape, and the route that was in neither.

    `/api/profile` was covered by nothing at all. It is where onboarding
    writes the chair, and the reason `vent_users.chair_picked` is set for one
    person of eight. With no store it must answer without claiming to have
    kept anything.

    `/api/export` was already checked by live-verify — *with* a store. That is
    the whole point of two passes: the same route answers differently when
    nothing is configured, and the unconfigured answer is the one nobody was
    looking at. It must refuse rather than hand back an empty backup that
    looks like a complete one, because `complete: true` over zero rows is the
    artifact that looks exactly like a good one until the day it is needed.
  */
  const xres = await fetch(`${BASE}/api/export`, {
    headers: { authorization: "Bearer whatever-there-is-no-token-here" },
  });
  let xbody = {};
  try { xbody = await xres.json(); } catch { /* a body is optional on a refusal */ }
  record(14, "The backup refuses rather than exporting nothing",
    xres.status !== 200 && xbody.complete !== true,
    `${xres.status} · complete=${xbody.complete ?? "absent"}`);

  const pres = await post("/api/profile", { anonId: ANON, chairPicked: "tight_edge", onboardingDone: true });
  let pbody = {};
  try { pbody = await pres.json(); } catch { /* same */ }
  record(15, "Onboarding never claims a chair was kept",
    pres.status < 500 && pbody.persisted !== true && pbody.saved !== true,
    `${pres.status} · persisted=${pbody.persisted ?? "absent"}`);

  /*
    16 — the circle sub-routes, which neither pass had ever touched.

    Both passes reached `/api/circles/does-not-exist` and stopped there, so
    the transcript surface and the two voice routes were verified by nothing.
    The transcript is the one that matters: "close means close" says a circle
    that is over answers 404 from the room and 410 from every other surface,
    and **never an empty list**, because `{messages: []}` still tells a caller
    the room is there.

    Statuses are asserted as a class rather than pinned, because pinning one
    is how an author with LiveKit keys writes a suite that disagrees with CI —
    the voice routes answer 501 before they touch the store when there are no
    keys, and 404 when there are.
  */
  const sub = await Promise.all([
    ["messages", fetch(`${BASE}/api/circles/does-not-exist/messages`)],
    ["voice", post("/api/circles/does-not-exist/voice", { anonId: ANON })],
    ["mute", post("/api/circles/does-not-exist/voice/mute", { anonId: ANON, identity: "seat-1" })],
  ].map(async ([name, p]) => {
    const res = await p;
    const text = await res.text();
    return { name, status: res.status, text };
  }));

  const refused = sub.every((s) => s.status >= 400);
  const emptyList = sub.some((s) => s.name === "messages" && /"messages"\s*:\s*\[\s*\]/.test(s.text));
  const subLeaks = sub.some((s) => /supabase|livekit|env\b|NEXT_PUBLIC/i.test(s.text));
  record(16, "A room that is not there is not an empty room",
    refused && !emptyList && !subLeaks,
    sub.map((s) => `${s.name}=${s.status}`).join(" · ") +
      `${emptyList ? " · LEAKED AN EMPTY LIST" : ""}${subLeaks ? " · LEAKED CONFIG" : ""}`);

  const mark = (p) => (p === true ? "PASS" : "FAIL");
  console.log("\n| # | Check | Result | Detail |");
  console.log("|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.n} | ${r.name} | ${mark(r.pass)} | ${r.detail} |`);

  const failed = rows.filter((r) => r.pass !== true);
  console.log(`\n${rows.length - failed.length} passed, ${failed.length} failed — unconfigured shape\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(2);
});
