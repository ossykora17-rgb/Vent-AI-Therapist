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

## Data, evals, preferences

The interesting part of a language model was never the architecture. It was
the data pipeline, the evals, and the preference loop — and a product has all
three whether or not anybody has written them down. These three scripts write
them down. Zero dependencies, zero model calls, and each one imports the app's
own modules rather than a second copy of them, because a copy drifts and then
the suite passes while the product regresses.

```bash
npm run data     # store → data/sft.jsonl + data/eval.jsonl
npm run eval     # 10 checks, no server; pass a URL for 4 more
npm run rlhf     # ratings → data/dpo.jsonl, and what is losing
```

**`npm run data`** walks the local store the way a pretraining pipeline walks
a crawl. Extract — the chair, body, pressure, tag and flavour go in as tokens
(`[CHAIR:tight_edge] [BODY:chest] [PRESSURE:82] [TAG:economy] [MEM:4]`) so the
structure is structure and the prose stays the person's own words. Dedup —
exact, then near-dup by Jaccard over the vent *and* its reply, because the
same sentence answered differently is two data points. Filter — greetings and
date questions are not vents, and the key-less "I'm running without my model
key" apology is never a completion. Reweight — economy 40%, japa 30%, family
20%, expressed as a per-record weight rather than by duplicating rows.

Two lines it does not cross: **circle transcripts are never training data**
(confidentiality is a deletion policy, and a training set is the opposite of
deletion — circles are counted, never quoted), and **a reply the circle rules
would refuse is not a reply worth training on**, so `checkMessage` runs over
every candidate completion as a quality filter.

**`npm run eval`** is MMLU for this product: ten checks, every one of them a
bug actually shipped here. The date answered as therapy. "It's the same thing
every week" heard as an insult and answered with an apology. A worksheet where
a sentence belonged. A witness who could never speak. 100 assertions, about a
second, no tokens. Give it a base URL and it adds four live room checks —
including the one that found the bug in this commit, where a Keeper's early
close deleted the transcript but the room kept answering `200`.

**`npm run rlhf`** rebuilds preferences from what people actually did. A
rating carries no pointer to what it was for, so the pipeline joins it to the
last real reply that person saw and refuses to guess when there isn't one.
Pairs are built *inside* a domain — comparing across domains would teach it
that money beats family, which is a topic and not a preference. Any tactic
averaging below 4.0 over two or more ratings is written out as a negative
sample, and the Keeper is scored on the drop rather than the mood, because
somebody leaving a family circle at 7/10 after arriving at 78 points of
pressure had a good night.

Ratings land in `.data/rlhf.jsonl` — append-only, local-only. Serverless disks
are thrown away, so writing preference data in production would be collecting
something guaranteed to be lost; it writes where a disk is real and no-ops
elsewhere rather than pretending. `data/` is gitignored: it is built from real
vents and never belongs in a repository.

`scripts/fixtures/` is a synthetic store — invented vents, invented ratings —
so both pipelines can be exercised end to end without touching anybody's
words. It is what eval check 10 runs against.

## The loop

One automation, one state file, one objective gate. That is the whole thing;
everything else is decoration.

```bash
npm run heartbeat    # what changed, what is dirty, who should fix it
npm run gate         # selector + eval + pipeline + live-verify, then decide
```

**The automation** (`scripts/heartbeat-data.mjs`) compares the store against
`.data/loop-state.json` and either names a specific task or goes back to
sleep. Sleeping is the common case and it stays free — one file read, no
tokens. An automation that always finds work is not an automation, it is a
cron job burning budget.

It applies the four-condition test **per finding**, not per project:

| Finding | Repeats | Verifiable | Bounded | → |
| --- | --- | --- | --- | --- |
| A reply that gives advice | yes | `checkMessage` | one prompt | `data-quality` |
| A vent with no tactic | yes | selector always returns one | one route | `data-quality` |
| A tag whose room never comes down | yes | the drop, over ≥2 circles | one library line | `circles-quality` |
| Whether the tone reads warm | yes | **no** | no | a person reads it |

That last row is the point. Warmth is taste and no gate measures it, so the
heartbeat names it and hands it back. The `icon.svg` route collision was a
one-off and never came back; `thought_record`'s warmth was a judgment call.
Neither belonged in a loop, and both were fixed by hand.

**The skills** are `.claude/skills/data-quality/` and
`.claude/skills/circles-quality/` — persistent context, not a prompt. They
carry the invariants an agent would otherwise have to be told every time: that
circle transcripts are never training data, that the two Keeper guards must
stay separate or the 38-minute reflection dies silently, that `META` patterns
must point at the assistant.

**The gate** is objective and it decides the merge, not a summary. It runs the
selector tests, the eval suite, both pipelines, and `live-verify` when
something is serving on :3001 — and it **skips** live checks rather than
failing them when nothing is up, because a gate that fails for the wrong
reason is a gate people learn to ignore. The state file only advances when the
gate passes; a loop that marks work done on a red gate stops finding it.

**Isolation** is `git worktree`, so a failed attempt never touches the branch
you ship from:

```bash
git worktree add -b loop/data-quality ../mindweave-data-loop
cd ../mindweave-data-loop && npm run gate     # no npm install needed
```

The gate has zero dependencies, so a worktree is ~1 MB and runs the whole
suite with no `node_modules` at all. Only `npm run build` and the live checks
need an install.

`.github/workflows/heartbeat.yml` is the other half: every push plus 06:00
WAT daily. It cannot see `.data/` — that store is local and ephemeral by
design — so it runs the half of the gate that needs no data, over the fixture,
and says so rather than showing a green tick for nothing.

What the loop does **not** do is call a model. It finds the work, names the
skill that knows how to do it, and states the gate that decides whether the
result may be merged. The agent is the thing in the middle, driven by a person
or a scheduler — not by a script pretending to be one.

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
| `PATCH /api/circles/[id]` | Seal: the closing number and two words, no transcript |
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
Nothing is written to a model; it is the arithmetic of two numbers you gave,
and the numbers come from `src/lib/vent/chairs.ts`, which is now the only
place that knows Tight edge reads 78 — it used to be four places.

Choosing the word you drop seals the circle: the number, the drop and the two
words go to the preference log, and nothing else does. Not a line of what
anybody said. It is the only thing that leaves a room.

### Presence

The room used to show `3/6` and nothing else, so five people reading in
silence and an empty room rendered identically. In a text circle the fear is
not being judged — it is speaking into a void — and a seat count answers the
wrong question, because it counts chairs.

Presence is **derived from two timestamps, never stored as a boolean**: an
"online" flag lies the moment a phone dies mid-session and needs a cleanup job
to un-lie. A dot is lit if that seat polled within 12 seconds — three missed
beats of the 4-second poll the room was already making. Typing rides the same
poll: the composer having text appends `&typing=1`, the server sets
`typing_until` 8 seconds out, and there is no keystroke endpoint, no debounce
timer and not one extra request. The write is skipped when the last heartbeat
is under 2.5 seconds old and nothing changed.

Counts and dots. Never who, never a name — and you are never told that *you*
are writing. Polling is the honest ceiling; Supabase Realtime is already in
the stack and replaces it with no new dependency when the room count earns it.

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
