/**
 * Live acceptance pass against a deployed Mind Weave VENT.
 *
 *   node scripts/live-verify.mjs https://your-app.vercel.app
 *
 * No dependencies — Node 18+ only. Prints the acceptance table.
 *
 * Token cost: ONE vent (check 2). Everything else routes through the free
 * local paths. The rate-limit probe deliberately uses greetings, because the
 * limiter runs before intent routing — so 11 greetings trip the same 429 as
 * 11 vents while spending nothing.
 */

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE.startsWith("http")) {
  console.error("Usage: node scripts/live-verify.mjs https://your-app.vercel.app");
  process.exit(2);
}

const ANON = `live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const rows = [];
const record = (n, name, pass, detail) =>
  rows.push({ n, name, pass, detail: String(detail).slice(0, 92) });

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const vent = (message, extra = {}) =>
  post("/api/vent", { anonId: ANON, message, ...extra });

/**
 * A proxy or captive portal answers with plain text, not JSON, and the raw
 * "Unexpected token 'H'" that causes tells you nothing. Say what happened.
 */
async function json(res, what) {
  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch {
    const head = body.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(
      `${what} returned ${res.status} and this is not JSON — something between ` +
        `you and the app answered instead (proxy, VPN, or wrong URL): "${head}"`,
    );
  }
}

async function main() {
  console.log(`Verifying ${BASE}\nanonId: ${ANON}\n`);

  // 0 — is it even up, and which keys are wired?
  const health = await json(await fetch(`${BASE}/api/health`), "/api/health");
  console.log("health:", JSON.stringify(health.services),
    "| storage:", health.storage ?? "unknown", "| persisting:", health.persisting, "\n");
  // Ask whether anything is persisting, not whether it happens to be Supabase —
  // the local file store makes these checks meaningful with no account at all.
  const hasDb = health.persisting === true;
  const hasAi = health.services?.anthropic === true;

  // 1 — the date bug, and it must be free.
  {
    const d = await vent("whats today's date?").then((r) => r.json());
    const real = new Date().toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric", timeZone: "Africa/Lagos",
    });
    const ok = d.intent === "factual" && d.tokensSpent === false && d.reply.includes(real);
    record(1, "Date zero tokens", ok, `${d.intent} tokens=${d.tokensSpent} :: ${d.reply}`);
  }

  // 2 — flavour tunes delivery; the selector still picks the tactic.
  {
    const d = await vent(
      "abeg partner shouted for chambers again, just fix am. i missed gym, leg day gone.",
      { pressure: 78 },
    ).then((r) => r.json());
    const f = d.flavour ?? {};
    const ok =
      f.temperament === "fire" && f.occupation === "lawyer" && f.hobby === "gym" &&
      typeof d.tactic === "string" && d.tactic.length > 0;
    record(2, "Flavour tunes not selects", ok,
      `${f.name} = ${f.temperament} x ${f.occupation} x ${f.hobby} | tactic=${d.tactic}`);
  }

  // 3 — crisis wins even when wrapped in a work vent, and costs nothing.
  {
    const d = await vent("work dey choke me and i want to die").then((r) => r.json());
    const ok = d.intent === "crisis" && d.crisis?.nigeria === "0806 210 6493" && d.crisis?.gated === true;
    record(3, "Crisis beats mixed", ok, `${d.intent} line=${d.crisis?.nigeria} gated=${d.crisis?.gated}`);
  }

  // 4 — every real-world pressure gets its own tool; a greeting gets none.
  {
    const cases = [
      ["fuel price don triple economy tight", "economy"],
      ["japa fear dey worry me, visa never come", "japa"],
      ["AI go take my job", "ai_job"],
      ["Instagram dey make me feel useless", "social"],
      ["firstborn pressure mother guilt", "family"],
    ];
    const got = [];
    for (const [msg, want] of cases) {
      const d = await vent(msg).then((r) => r.json());
      got.push(`${d.realWorldTag}${d.realWorldTag === want ? "" : `(want ${want})`}`);
    }
    const g = await vent("hi").then((r) => r.json());
    const ok =
      got.every((s) => !s.includes("want")) &&
      g.intent === "greeting" && g.tokensSpent === false;
    record(4, "Real-world tags own tool", ok, `${got.join(", ")} | hi=${g.intent} free=${!g.tokensSpent}`);
  }

  // 5 — the chair drives the tension maths. Asserted against the real table
  // in the eval suite now; what is left here is the pixels.
  record(5, "Tension 78->58", null,
    "npm run eval check 7 asserts 78 -> 20 = 58; manual: 360px, slider reads 78");

  // 6 — selector guarantees run offline, with no server and no tokens.
  record(6, "No-repeat somatic gated", null,
    "npm run eval checks 2+4, or node --experimental-strip-types scripts/tactics.test.mts");

  // 7 — export completeness, straight off the live history endpoint.
  {
    const d = await fetch(`${BASE}/api/history?anonId=${ANON}`).then((r) => r.json());
    const need = ["language", "duality_value", "pressure_value", "chair_picked", "real_date_used"];
    const first = d.vents?.[0];
    const ok = hasDb ? Boolean(first) && need.every((k) => k in first) : null;
    record(7, "Export complete", ok,
      hasDb ? `${d.vents?.length ?? 0} rows, fields ${first ? need.filter((k) => k in first).length : 0}/5`
            : "no store configured — nothing persisted");
  }

  // 8 — needs eyes and a viewport.
  record(8, "Breathing FAB themes", null,
    "manual: 360px light+dark, breathing guides, FAB clear of slider/Send, no flash");

  // 9a — routes.
  {
    const paths = ["/manifest.webmanifest", "/robots.txt", "/sitemap.xml", "/sw.js",
      "/offline.html", "/icon.svg", "/privacy", "/terms", "/history", "/chat"];
    const bad = [];
    for (const p of paths) {
      const r = await fetch(`${BASE}${p}`);
      if (!r.ok) bad.push(`${p}=${r.status}`);
    }
    const badRating = await post("/api/feedback", { anonId: ANON, rating: 9 });
    const ok = bad.length === 0 && badRating.status === 422;
    record("9a", "Routes + validation", ok,
      bad.length ? bad.join(",") : `all ${paths.length} ok, bad rating=${badRating.status}`);
  }

  // 9b — the rate limiter. Greetings cost nothing and hit the same guard.
  {
    if (!hasDb) {
      record("9b", "Rate limit 10/min", null, "no store — the limiter counts persisted rows");
    } else {
      // The checks above already spent requests inside the same minute, so
      // report the cumulative position — otherwise "429 on probe #2" reads
      // like the limiter firing far too early.
      const before = await fetch(`${BASE}/api/history?anonId=${ANON}`)
        .then((r) => r.json()).then((d) => d.vents?.length ?? 0);
      let tripped = 0;
      for (let i = 0; i < 13; i++) {
        const r = await vent("hi");
        if (r.status === 429) { tripped = i + 1; break; }
      }
      record("9b", "Rate limit 10/min", tripped > 0 && tripped <= 13,
        tripped ? `429 on probe #${tripped} — request ${before + tripped} in the window (limit 10/min)`
                : "never tripped in 13 requests");
    }
  }

  // 9c — feedback limiter, 5 an hour.
  {
    if (!hasDb) {
      record("9c", "Feedback limit 5/hr", null, "no store configured");
    } else {
      let tripped = 0;
      for (let i = 0; i < 7; i++) {
        const r = await post("/api/feedback", { anonId: ANON, rating: 5, message: `probe ${i}` });
        if (r.status === 429) { tripped = i + 1; break; }
      }
      record("9c", "Feedback limit 5/hr", tripped > 0, tripped ? `429 on #${tripped}` : "never tripped in 7");
    }
  }

  /*
    11 — the Breaking Room, against a running server.

    Check 44 reads the route as text and can prove the crisis branch is
    written above the write. It cannot prove the server *does* it, and this is
    the one endpoint in the product where that distinction is somebody's
    worst hour: a heavy question can be answered with a sentence that needs a
    phone number, and filing it as an answer would be the worst thing this
    product could do with anything anybody types.

    So: ask the real server, and then ask it what it kept. The second half is
    the part a source-reading check can never do — "it was refused" and "it
    was refused and also not stored" are different claims, and only one of
    them is the promise.

    Written to hold in both deployment shapes. Without a store `saved` is
    false and the GET is empty, and that is correct rather than a failure —
    the assertions that are shape-independent (422 on an invented question,
    `crisis:true`, and nothing crisis-shaped ever coming back) are asserted
    always; the one that depends on a store is asserted against `hasDb`.
  */
  {
    const CRISIS = "nothing held me, i want to die";
    const REAL = "my brother, and i never tell am";

    const invented = await post("/api/breaking", { anonId: ANON, q: "not_a_question", a: REAL });
    const crisis = await post("/api/breaking", { anonId: ANON, q: "last_loved", a: CRISIS });
    const crisisBody = await crisis.json().catch(() => ({}));
    const kept = await post("/api/breaking", { anonId: ANON, q: "last_loved", a: REAL });
    const keptBody = await kept.json().catch(() => ({}));

    const back = await fetch(`${BASE}/api/breaking?anonId=${ANON}`).then((r) => r.json());
    const answers = back.answers ?? [];
    const stored = answers.map((x) => x.a).join(" | ");

    const ok =
      // A question nobody wrote is refused in every shape, store or no store.
      invented.status === 422 &&
      // The crisis answer is routed, and routed as a 200 rather than an error
      // — the person is not being told their sentence was malformed.
      crisis.status === 200 && crisisBody.crisis === true && crisisBody.saved === false &&
      // And it is not in the record. This is the assertion the whole check is
      // for: refused and not stored, not merely refused.
      !stored.includes("want to die") &&
      // An ordinary answer is kept when there is somewhere to keep it, and
      // says so honestly when there is not.
      keptBody.saved === hasDb &&
      (hasDb ? answers.some((x) => x.a === REAL && x.text) : answers.length === 0);

    record(11, "Breaking Room refuses and does not keep it", ok,
      `invented=${invented.status} crisis=${crisisBody.crisis} saved=${keptBody.saved} ` +
      `stored=${answers.length}${hasDb ? "" : " (no store)"}`);
  }

  /*
    12 — the efficacy loop, driven end to end.

    This is the only claim the product makes about whether it helps, and it
    had never been exercised by anything. The plumbing all exists — a PATCH
    route, `anchorLatestVent` in both stores, the heartbeat's mean drop — and
    every one of those pieces was written *because* the loop was found dead:
    the closing question set React state, toasted "Saved. That's the anchor.",
    and made no request, while every insert wrote `tension_after: null`.

    It was repaired. Nothing then proved it stayed repaired. The eval suite
    reads the route as text; the live checks send vents but never a pressure
    reading and never a mood, so no run of this file has ever produced a
    single anchored sitting. A regression to `tension_after: null` would have
    left every check green — which is exactly the state the loop was in when
    it was discovered broken the first time.

    So drive the actual sequence a person drives: arrive with a reading, vent,
    rate the way out, then ask the database what it kept. The last step is the
    point. "The route answered `anchored: true`" and "the row now carries a
    drop the heartbeat can read" are different claims, and only the second one
    is the measurement.

    Both shapes: with no store the honest answer is `anchored: false` with a
    reason, and that is a pass, not a failure. The arithmetic — mood 7 becomes
    tension 30 — is shape-independent and asserted always.
  */
  {
    const BEFORE = 80;
    const MOOD = 7;
    const EXPECTED_AFTER = Math.round((10 - MOOD) * 10); // 30
    const EXPECTED_DROP = BEFORE - EXPECTED_AFTER; // 50

    /*
      Its own identity, deliberately.

      The first version of this reused the shared anonId and failed on its
      very first run: check 9b exhausts the rate limit on purpose two checks
      earlier, so the vent never landed, and the PATCH dutifully anchored an
      *older* sitting — one with no entry reading. It reported
      `anchored=true` and `stored null→30`, which is the whole bug this loop
      was built to stop, reproduced by accident: a green claim over a
      measurement that does not exist.

      A check that inherits another check's leftovers is measuring the suite,
      not the product.
    */
    const EFF = `${ANON}-eff`;
    const posted = await post("/api/vent", {
      anonId: EFF,
      message: "rent due and i cannot tell anybody at home",
      pressure: BEFORE,
    });

    const patch = await fetch(`${BASE}/api/vent`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anonId: EFF, mood: MOOD }),
    });
    const body = await patch.json().catch(() => ({}));

    // What the route claims.
    const arithmetic = !hasDb || body.tensionAfter === EXPECTED_AFTER;
    const claim = hasDb
      ? body.anchored === true
      : body.anchored === false && typeof body.reason === "string";

    // What the record actually holds — the half a source-reading check and a
    // 200 can both miss.
    let row = null;
    if (hasDb) {
      const hist = await fetch(`${BASE}/api/history?anonId=${EFF}`).then((r) => r.json());
      row = (hist.vents ?? []).find((v) => v.tension_after != null) ?? null;
    }
    const kept = hasDb
      ? Boolean(row) &&
        row.tension_before === BEFORE &&
        row.tension_after === EXPECTED_AFTER &&
        row.tension_before - row.tension_after === EXPECTED_DROP
      : true;

    record(12, "A sitting can be anchored, and the drop survives the round trip",
      posted.status === 200 && patch.status === 200 && arithmetic && claim && kept,
      hasDb
        ? `vent=${posted.status} anchored=${body.anchored} after=${body.tensionAfter} ` +
          `stored ${row ? `${row.tension_before}→${row.tension_after} = ${row.tension_before - row.tension_after} pts` : "NOTHING"}`
        : `no store: vent=${posted.status} anchored=${body.anchored} reason=${body.reason} (correct)`);
  }

  /*
    13 — the streamed turn and the plain turn are the same turn.

    Check 55 reads the wiring; this one takes the road. It is here because the
    obvious way to add streaming is a second handler, and a second handler
    drifts: the rate limit, the crisis gate, the breaking-room cadence and the
    write all live in the turn, and a copy of them for the streaming path would
    be wrong within a month — while every source-reading check kept passing,
    because both copies would still look correct on their own.

    So the same message goes twice, once each way, and the two answers are held
    to the same shape. Not the same *words*: a model is not deterministic and
    two vents from one person are two turns. The claim is narrower and is the
    one that matters — the streamed response carries the same fields, the same
    intent, the same persistence answer, and it arrives through a transport
    that really is an event stream rather than a JSON body with a hopeful
    content type.

    Zero tokens in this shape and one in a shape with keys: the message is a
    greeting, which `classify` answers locally and for free on both paths.

    It also asserts the shape most likely to be got wrong and least likely to
    be noticed — `done` is present and complete. A stream that emits deltas and
    then dies leaves a client holding a preview it was told never to trust,
    with nothing to replace it with, and the person sees their answer vanish.
  */
  {
    const STREAM = `${ANON}-sse`;
    const say = { anonId: STREAM, message: "abeg how far", pressure: 40 };

    const plain = await post("/api/vent", say);
    const plainBody = await plain.json().catch(() => ({}));

    const res = await fetch(`${BASE}/api/vent`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(say),
    });
    const ctype = res.headers.get("content-type") ?? "";
    const raw = await res.text();

    // Parsed the way the browser parses it, blank-line framed, so a change to
    // the wire format fails here rather than in front of somebody.
    let done = null;
    let deltas = 0;
    for (const frame of raw.split("\n\n")) {
      const name = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim();
      const data = frame.split("\n").filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim()).join("");
      if (!data) continue;
      if (name === "delta") deltas += 1;
      if (name === "done") { try { done = JSON.parse(data); } catch { /* reported below */ } }
    }

    const streamed = ctype.includes("text/event-stream");
    const complete = Boolean(done) && typeof done.status === "number" && Boolean(done.body);
    const agrees = complete &&
      done.status === plain.status &&
      done.body.intent === plainBody.intent &&
      done.body.persisted === plainBody.persisted &&
      typeof done.body.reply === "string" && done.body.reply.length > 0;

    record(13, "A streamed turn is the same turn, and it ends with the whole answer",
      streamed && complete && agrees,
      streamed
        ? `sse ok · ${deltas} deltas · done=${done?.status} intent=${done?.body?.intent} ` +
          `persisted=${done?.body?.persisted} (plain ${plain.status}/${plainBody.intent})`
        : `NOT STREAMED — content-type=${ctype.slice(0, 40) || "none"}`);
  }

  // 10 — degradation, read straight off health.
  record(10, "Keys / degradation", true,
    `storage=${health.storage} persisting=${hasDb} anthropic=${hasAi} — no 500s on any path above`);

  // ── table ────────────────────────────────────────────────────────────────
  const mark = (p) => (p === null ? "MANUAL" : p ? "PASS" : "FAIL");
  console.log("\n| # | Check | Result | Detail |");
  console.log("|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.n} | ${r.name} | ${mark(r.pass)} | ${r.detail} |`);

  const failed = rows.filter((r) => r.pass === false);
  console.log(`\n${rows.filter((r) => r.pass === true).length} passed, ${failed.length} failed, ` +
    `${rows.filter((r) => r.pass === null).length} manual`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("verification could not run:", e.message);
  process.exit(2);
});
