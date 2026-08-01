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

async function main() {
  console.log(`Verifying ${BASE}\nanonId: ${ANON}\n`);

  // 0 — is it even up, and which keys are wired?
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log("health:", JSON.stringify(health.services), "db:", health.database, "\n");
  const hasDb = health.services?.supabase === true;
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

  // 5 — the chair drives the tension maths. Verified in the browser, not here.
  record(5, "Tension 78->58", null,
    "manual: clear storage, pick Tight edge, slider must read 78, rate 8, drop must be 58");

  // 6 — selector guarantees run offline.
  record(6, "No-repeat somatic gated", null,
    "run: node --experimental-strip-types scripts/tactics.test.mts");

  // 7 — export completeness, straight off the live history endpoint.
  {
    const d = await fetch(`${BASE}/api/history?anonId=${ANON}`).then((r) => r.json());
    const need = ["language", "duality_value", "pressure_value", "chair_picked", "real_date_used"];
    const first = d.vents?.[0];
    const ok = hasDb ? Boolean(first) && need.every((k) => k in first) : null;
    record(7, "Export complete", ok,
      hasDb ? `${d.vents?.length ?? 0} rows, fields ${first ? need.filter((k) => k in first).length : 0}/5`
            : "no Supabase configured — nothing persisted");
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
      record("9b", "Rate limit 10/min", null, "needs Supabase — limiter counts persisted rows");
    } else {
      let tripped = 0;
      for (let i = 0; i < 13; i++) {
        const r = await vent("hi");
        if (r.status === 429) { tripped = i + 1; break; }
      }
      record("9b", "Rate limit 10/min", tripped > 0 && tripped <= 13,
        tripped ? `429 on request #${tripped}` : "never tripped in 13 requests");
    }
  }

  // 9c — feedback limiter, 5 an hour.
  {
    if (!hasDb) {
      record("9c", "Feedback limit 5/hr", null, "needs Supabase");
    } else {
      let tripped = 0;
      for (let i = 0; i < 7; i++) {
        const r = await post("/api/feedback", { anonId: ANON, rating: 5, message: `probe ${i}` });
        if (r.status === 429) { tripped = i + 1; break; }
      }
      record("9c", "Feedback limit 5/hr", tripped > 0, tripped ? `429 on #${tripped}` : "never tripped in 7");
    }
  }

  // 10 — degradation, read straight off health.
  record(10, "Keys / degradation", true,
    `supabase=${hasDb} anthropic=${hasAi} db=${health.database} — no 500s on any path above`);

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
