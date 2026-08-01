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

## Run it locally — no Vercel, no Supabase, no account

```bash
npm ci
npm run local          # http://localhost:3001
```

That is the whole setup. With no `NEXT_PUBLIC_SUPABASE_URL` set, the app falls
back to a **local JSON store** at `.data/vent.json` — no Docker, no daemon, no
extra dependency. Everything works: onboarding, memory across turns, history,
filter and search, export, delete, rate limits. The file survives restarts.

Add `ANTHROPIC_API_KEY` to `.env.local` if you want real replies; without it a
vent is saved and told so rather than answered. Nothing 500s either way.

`GET /api/health` reports which backend answered:

```json
{ "storage": "file", "persisting": true, "services": { "supabase": false } }
```

Verify a running instance — local or deployed — with:

```bash
node scripts/live-verify.mjs http://localhost:3001
```

**The file store is for development only.** It is selected automatically in
development, and in production *only* when `VENT_LOCAL_STORE=1` is set —
because serverless filesystems are per-instance and ephemeral, so it would
appear to work and then lose sessions at random.

A production build with no Supabase and no flag reports
`{"storage": "none", "persisting": false}` and still answers every request; it
just tells you plainly that nothing is being kept.

### Against Supabase instead

```bash
cp .env.example .env.local     # fill in the Supabase keys
npm run dev -- -p 3001
```

Apply both migrations first (see Deploy). `storage` then reports `supabase`.

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
| `GET`·`POST /api/circles` | Open circles with seat counts / open one |
| `GET`·`POST`·`DELETE /api/circles/[id]` | Room state / take a seat / Keeper ends it |
| `GET`·`POST /api/circles/[id]/messages` | Read the room / speak in it |

## Circles — peer support, Phase 0

Six seats, forty-five minutes, text only. **Peer support, not therapy, not
affiliated with AA.**

Whoever opens the circle holds it; everyone else shares. There is no third
rank. There used to be — seats five and six joined as witnesses who could
only reflect, and the refusal read *"Your turn comes."* It never came, because
roles were fixed at join and nothing rotated them. A circle must not promise
what it cannot give, so the seat rule is gone. What stops anyone dominating is
the one-line cap on a reflection, and that applies to every seat equally.

Three rules, and they are enforced on the server rather than in the UI,
because a greyed-out button is bypassed with one curl:

- **No advice.** "You should", "have you tried", "if I were you" and their
  relatives are refused before the message is stored, whatever your seat.
- **No cross-talk.** Speak to the circle, not at a person.
- **A witness reflects one line.** 140 characters. Reflecting is open to every
  seat — it is a way of speaking, not a rank.

Crisis is refused at the door and again inside the room: the message is not
stored, the person gets the Nigerian line and 199, and a route out to a
private vent. A circle cannot hold a crisis.

Confidentiality is a deletion policy, not a promise. Closing a circle deletes
its transcript, and the clock running out **is** a close: the row flips to
`closed` and every word goes with it on the first read after time is up. It
did not used to — the row still said `waiting` and members could keep reading
for another day, so *"what's said here stays here"* quietly meant *"for a
day."* The 24-hour sweep is now the backstop for rooms nobody reopens, not the
policy. Only members can read a room; a non-member gets 403.

The last two minutes measure something. Rate how you feel 1–10 and the Closing
shows the drop from the pressure you seeded when you took your chair — **your**
chair, not the room's, since falling back to the circle's seed would show a
joiner somebody else's starting point. Then one word to carry and one to drop.
Nothing is written to a model; it is the arithmetic of two numbers you gave.

The Keeper speaks exactly twice, and both lines are selected rather than
generated. It waits for a second person first — the creator is a member, so
"is anybody here" was true the instant a circle opened, and the Keeper read the
intention aloud to an empty room, to itself. At minute three it reads the
intention — the second sentence is
the tactic library's own tool for that tag, in room-facing phrasing, so the
open and a private session draw on one library instead of two that drift
apart. At the 38-minute mark it stops holding time and says the one thing it
is for: the pattern the room actually voiced — *"I heard chest 3 times, tight
3 times, small 2 times."* Counted from the real shares, written once, no model
call. It cannot invent a pattern nobody said.

Apply `supabase/migrations/0003_circles.sql` and `0004_circle_member_pressure.sql`
for the cloud path — both are re-runnable like the others. Locally, circles
live in the same `.data/vent.json` and survive restarts.

## Offline

A minimal service worker, no Workbox. Static assets are cache-first (they are
content-hashed), pages are network-first so a deploy is never stale, and API
calls are never cached — yesterday's reply served as today's would be worse
than an error. Vents written offline queue in localStorage and flush on
reconnect.
