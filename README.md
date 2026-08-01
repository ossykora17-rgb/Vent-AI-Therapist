# Mind Weave VENT — Truth Anchor

> Carve your truth.

Somewhere to put the thing you can't say out loud yet. It knows what day it
is, it remembers your exact words, and it will not tell you to drop your
shoulders three times in a row.

**Mind Weave is not a licensed therapist.** VENT is for emotional support
only, not medical advice. In crisis, call Nigeria **0806 210 6493** or
emergency **199**.

## Stack

| Layer    | Choice                                  |
| -------- | --------------------------------------- |
| Frontend | Next.js 14 (App Router) + TypeScript    |
| Styling  | Tailwind, CSS-variable tokens           |
| DB       | Supabase (Postgres), RLS deny-by-default |
| AI       | Anthropic (`@anthropic-ai/sdk`)         |
| Hosting  | Vercel, auto-deploy from the branch     |

## Deploy

**1. Import the repo** at [vercel.com/new](https://vercel.com/new) — pick
branch `claude/nextjs-app-init-deploy-yb4qlo`. Framework detection and build
settings need no changes.

**2. Apply the migrations** in the Supabase SQL editor, in order. Both are
re-runnable, so applying twice is safe:

```
supabase/migrations/0001_init.sql          -- accounts, sessions, billing
supabase/migrations/0002_truth_anchor.sql  -- vent_users, vents, vent_feedback
```

**3. Set four environment variables** (Production + Preview):

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **server only, never expose** |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

Optional: `NEXT_PUBLIC_SITE_URL` for a custom domain (Vercel's `VERCEL_URL`
is used automatically otherwise), and the Paystack keys if you turn billing
back on.

**The app builds and runs with none of them set.** No Anthropic key means a
vent is saved and told so rather than answered; no Supabase means the session
works but nothing persists. Neither path 500s.

## Local development

```bash
npm ci
cp .env.example .env.local     # fill in what you have
npm run dev -- -p 3001         # http://localhost:3001
```

## How a message is handled

Routing is pure local keyword work, so most messages never reach a model.

| Intent | Handled by | Spends tokens |
| --- | --- | --- |
| Crisis | Local — checked first, always wins | No |
| Factual (date, time, who are you) | Local, from the real clock | No |
| Greeting / meta | Local | No |
| Vent | Anthropic, with the built prompt | **Yes** |

The system prompt is assembled per turn from: real-time grounding, flavour
(temperament × occupation × hobby, three lines, tunes delivery only), the
selected tactic, the last six turns in the user's own words, and the readings
they gave — body, pressure, duality, mood.

### Tactics

32 tactics across seven families plus nine real-world coping tools (fuel and
cost of living, japa, AI job fear, comparison, firstborn duty, loneliness,
traffic, heat, health). The selector will not return a tactic used in the
last three turns, and somatic moves stay locked unless the body was named or
pressure is high.

Verify it without installing a test runner:

```bash
node --experimental-strip-types scripts/tactics.test.mts
```

## Data and privacy

RLS is on with **no public policies** — the browser-facing anon key can read
nothing. An `anon_id` in localStorage is forgeable, so every read and write
goes through the server on the service role, which scopes each query itself.

Users can export everything as JSON and delete everything from
**History → Delete everything**, which removes the vents and the anon user
row. Rate limits: 10 vents/minute, 100/day, 5 feedback ratings/hour.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/vent` | Classify, answer, persist |
| `GET /api/vent` · `GET /api/history` | History for this `anon_id` |
| `DELETE /api/vent` · `DELETE /api/history` | Delete one vent (`?id=`) or all |
| `POST /api/profile` | Save onboarding (chair, object) |
| `POST /api/feedback` | 1–5 rating plus optional note |
| `GET /api/health` | Which integrations are wired, and is the DB reachable |

## Offline

A minimal service worker, no Workbox. Static assets are cache-first (they are
content-hashed), pages are network-first so a deploy is never stale, and API
calls are never cached — yesterday's reply served as today's would be worse
than an error. Vents written offline queue in localStorage and flush on
reconnect.
