# Mind Weave VENT — Truth Anchor

> Somewhere to put the thing you can't say out loud yet.

Somewhere to put the thing you can't say out loud yet. It knows what day it
is, it remembers your exact words, and it will not tell you to drop your
shoulders three times in a row.

**Mind Weave is not a licensed therapist.** VENT is for emotional support
only, not medical advice. In crisis, call Nigeria **0806 210 6493** or
emergency **199**.

## Stack

| Layer    | Choice                                  |
| -------- | --------------------------------------- |
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling  | Tailwind, CSS-variable tokens           |
| DB       | Supabase (Postgres), RLS deny-by-default |
| AI       | Provider chain — Anthropic, Gemini, Groq, OpenRouter, Cerebras |
| Hosting  | Vercel, auto-deploy from the branch     |

## Deploy

**1. Import the repo** at [vercel.com/new](https://vercel.com/new) — pick
branch `claude/nextjs-app-init-deploy-yb4qlo`. Framework detection and build
settings need no changes.

**2. Apply the migrations** in the Supabase SQL editor, in order. All seven are
re-runnable, so applying twice is safe:

```
supabase/migrations/0001_init.sql               -- accounts, sessions, billing
supabase/migrations/0002_truth_anchor.sql       -- vent_users, vents, vent_feedback
supabase/migrations/0003_circles.sql            -- circles, members, messages
supabase/migrations/0004_circle_member_pressure.sql  -- each seat's own chair
supabase/migrations/0005_circle_presence.sql    -- last_seen_at, typing_until
supabase/migrations/0006_memory_vectors.sql     -- pgvector memories, vent-files bucket
supabase/migrations/0007_rls_performance.sql    -- (select auth.uid()) + FK indexes
```

**3. Set four environment variables** (Production + Preview):

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **server only, never expose** |
| **one model key** | any of the five below |

Any one of these makes the chatbot work. They are tried in order and the
first that answers wins, so a rate limit or an empty balance on one falls
through to the next instead of silencing the room.

| Variable | Free tier | Where |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | no | console.anthropic.com |
| `GEMINI_API_KEY` | **yes, no card** | aistudio.google.com |
| `GROQ_API_KEY` | **yes, no card** | console.groq.com |
| `OPENROUTER_API_KEY` | some models | openrouter.ai |
| `CEREBRAS_API_KEY` | yes | cloud.cerebras.ai |

Order is `VENT_PROVIDER_ORDER` (comma-separated ids). Each model id is
overridable — `VENT_MODEL_GEMINI`, `VENT_MODEL_GROQ` and so on — so a
provider renaming a model is an env change, not a deploy. `/api/health`
prints the whole chain and probes the first configured one with a real
one-token call, because a metadata read passes on an empty account and that
cost this project a week.

Optional: `NEXT_PUBLIC_SITE_URL` for a custom domain (Vercel's `VERCEL_URL`
is used automatically otherwise), and the Paystack keys if you turn billing
back on.

**The app builds and runs with none of them set**, and says which of them is
missing rather than guessing. No Supabase means nothing persists; no model
key means a vent is answered with its tactic's authored move rather than by a
model. With neither — the state a
fresh Vercel project is actually in — the reply says both, because telling
someone their words were saved when there is nowhere to save them is the one
thing it must not do. No path 500s.

To apply the migrations as a single paste instead of seven files in order:

```bash
npm run migrations          # prints all seven, in order, to stdout
```

## Run it locally — no Vercel, no Supabase, no account

```bash
npm ci
npm run local          # http://localhost:3001
```

That is the whole setup. With no `NEXT_PUBLIC_SUPABASE_URL` set, the app falls
back to a **local JSON store** at `.data/vent.json` — no Docker, no daemon, no
extra dependency. Everything works: onboarding, memory across turns, history,
filter and search, export, delete, rate limits. The file survives restarts.

Add any one model key to `.env.local` for real replies — `GEMINI_API_KEY` is
free and needs no card. Without one, a vent is answered with the move its
tactic already carries and told plainly that no model is running. Nothing
500s either way.

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

Apply all seven migrations first (see Deploy). `storage` then reports `supabase`.

## How a message is handled

Routing is pure local keyword work, so most messages never reach a model.

| Intent | Handled by | Spends tokens |
| --- | --- | --- |
| Crisis | Local — checked first, always wins | No |
| Factual (date, time, who are you) | Local, from the real clock | No |
| Greeting / meta | Local | No |
| Vent | The provider chain, with the built prompt | **Yes** |

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
npm run eval     # 14 checks, no server; pass a URL for the live room
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

**`npm run eval`** is MMLU for this product: thirteen checks, every one of them a
bug actually shipped here. The date answered as therapy. "It's the same thing
every week" heard as an insult and answered with an apology. A worksheet where
a sentence belonged. A witness who could never speak. 136 assertions, about a
second, no tokens. Give it a base URL and it adds the live room checks — 14
checks, and 157 or 160 assertions depending on whether the instance has voice
keys, because a few of them assert the token's shape. CI runs it both ways.
One of those live checks found a real bug: a Keeper's early close deleted the
transcript while the room kept answering `200`.

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

## Dependencies, and why each one is here

Six runtime packages and two for voice. Everything else — the data pipeline,
the eval suite, the preference pipeline, the heartbeat, the file store, the
LiveKit token — is Node's standard library, which is why the gate runs in a
fresh worktree with no `npm install` at all.

| Package | Why |
| --- | --- |
| `next`, `react`, `react-dom` | the app |
| `@supabase/ssr`, `@supabase/supabase-js` | the cloud store, when configured |
| `@anthropic-ai/sdk` | the only thing that spends tokens |
| `zod` | every request body is parsed, never trusted |
| `clsx`, `tailwind-merge` | class composition |
| `server-only` | a compile error if a secret ever imports into a client bundle |
| `livekit-client` | Phase 1 voice, loaded lazily inside the join handler |
| `livekit-server-sdk` | the Keeper's mute, in exactly one route |

`npm audit` reports four high advisories, all in transitive build tooling —
`postcss` and `sharp` inside Next, and `brace-expansion` under a dev-only
`glob`. None has a path from user input in this app: no untrusted CSS is
processed, no user-supplied image reaches the optimizer. The two advisories
that *did* match this app's shape — SSRF in rewrites, and unauthenticated
disclosure of internal Server Function endpoints, which mattered because
`src/app/auth/actions.ts` is a server action — are what the Next 16 upgrade
cleared.

## The outside world

Four narrow windows, all fetched server-side, all with the same rule: **the
product never shows a number it did not fetch.** Every failure returns `null`
and the sentence is simply absent. Silence beats a guess is already how
flavour works below its confidence floor; this is that rule applied to money.

| Source | Where it lands | Cache | Without it |
| --- | --- | --- | --- |
| Perspective | The Guardian, on every circle message | none | local rules still run |
| exchangerate.host | The Keeper's economy opening | 1 hour | no number in the line |
| Arbeitnow | `rw_ai_job` — three people currently paying | 1 day | the tactic as it was |
| stoic-quotes.com | The Closing, after the carry/drop door | 1 day | no quote |

**The Guardian is the one that had to exist.** The keyword list catches "I
want to die". It does not catch *"you are useless and everybody here knows
it"*, which is the line that actually ends a circle. Perspective scores the
paraphrase. Thresholds: threat 0.7, insult 0.8, toxicity 0.8 — a threat
crosses lowest because it is the thing a room cannot survive, and toxicity
sits highest because the score is noisy on plain distress. *"I feel
disgusting"* reads as toxic to a classifier and is exactly what somebody
should be able to say here; it scores 0.62 and goes through.

It is **fail-open by construction**. An unreachable classifier returns `null`
and the verdict passes. A network blip silencing a room of people trying to
speak is a worse failure than one rude line a Keeper can still mute, and every
message has already passed the crisis check and the no-advice rules, which are
local, free and never down.

The text goes out; nothing identifying it does — no `anon_id`, no circle id,
no session. The browser never talks to any of these hosts, which is also why
there is no CORS problem to work around.

**Counted, not generated.** The economy room opens with:

> Today we hold the money choke. **The dollar is ₦1,605 today — that is the
> number, not a mood.** Hold one thing you can control today, down to ten
> naira. Not the whole market. No fixing, no advice — just say it.

The real number lands *before* the move, which is the order a person needs it
in. With no rate, the middle sentence is absent and the rest is unchanged —
the Keeper has never guessed a number and this is not where it starts.

`scripts/fixtures/external/` holds recorded upstream **shapes** for the eval
suite and for networks where these hosts are blocked. Point
`VENT_EXTERNAL_FIXTURE` at it to run the integrations offline. Nothing in a
deployment sets that variable, and the recorded classifier keys on content —
a fixture that returned one canned score for every sentence would block a
whole room and hide the bug rather than catch it.

## Voice — Phase 1

Audio only. Six anonymous people on camera is a different product and a
harder promise; a voice is what ends the void without asking anybody to be
seen. There is no camera call anywhere in `src/components/circle-voice.tsx`,
and the token grant is `canPublishSources: ["microphone"]`, so the client
could not publish video even if a future edit tried to.

**The server half needs no dependency.** A LiveKit access token is a JWT
signed HS256, and Node has HMAC in the standard library, so
`POST /api/circles/[id]/voice` mints one with `node:crypto`. It is
seat-scoped: the identity is `seat-4`, never the `anon_id`; the room name
derives from the circle id so a token cannot be replayed into another circle;
`roomAdmin` is the Keeper's alone. A non-member gets `403`, and with no keys
the route answers `501` — not broken, not built.

**It expires with the circle**, not on a clock of its own. That distinction
was a real hole: the lifetime used to be a flat fifty minutes from whenever
the token was asked for, so a seat taken at minute 44 held a credential good
until minute 94. Deleting a LiveKit room is not revoking a token and LiveKit
recreates a room on join, so two people with live tokens could reconvene the
voice of a circle everyone had been told was over — no Keeper, no phases, no
Guardian, and somebody who left believing it had ended. A late seat now gets
**1.9 minutes**, measured.

**The browser half is the dependency**: `livekit-client`, 13 MB on disk and
13 packages in the lockfile. Most sessions are text, so it is imported
*inside the join handler* and nowhere else. Verified in Chromium: the 508 KB
chunk is absent from the eleven files a room loads, and arrives only after
somebody clicks **Join voice**. The room page's own bundle went 5.45 kB →
7.49 kB across both halves of voice.

### The Keeper's hand on the volume

Every other rule in a circle refuses a *message* — advice, cross-talk, a
threat — and the person can try again in better words. Voice has no such
gate: by the time a sentence is wrong it has already been heard. So the
Keeper gets one control, `POST /api/circles/[id]/voice/mute`, and it is
bounded on purpose.

**It mutes; it does not remove.** `removeParticipant` exists in
`livekit-server-sdk` and is deliberately never called — ejecting somebody
from a room they came to for support is not moderation, it is abandonment.
It is reversible by the same person in the same request shape.

**It is never silent.** The SFU tells the muted client, the client says so in
words — *"The Keeper closed your microphone. The room is still here in
text."* — and the Keeper's own confirmation says *"they were told."* A circle
whose entire promise is being heard cannot take a voice away quietly; that
would be the worst lie in the building.

`roomAdmin` is in the Keeper's token, but a token is a claim the client
holds, so the authority is re-checked against the store on every call:

| Caller | Result |
| --- | --- |
| Keeper → another seat | reaches the SFU |
| Any other member | `403 not_keeper` |
| Non-member | `403 not_a_member` |
| Keeper → itself | `422` — "Your own microphone is the Mute button." |
| Keeper → an empty seat | `404 no_such_seat` |

`livekit-server-sdk` is the second dependency, 2 packages and 2.8 MB, and it
is imported only in that route — it never reaches a browser bundle.

Speaking is the presence signal that matters here. The dots in the header
prove somebody is in the room; a lit ring on a seat proves somebody is
talking, and that is the thing a poll cannot fake.

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
| `POST /api/circles/[id]/voice` | Seat-scoped LiveKit token (501 until keys exist) |
| `POST /api/external/guardian/score` | Toxicity / insult / threat on one string |
| `GET /api/external/economy/context` | Today's USD→NGN, cached an hour |
| `GET /api/external/jobs/context` | Three real remote jobs, cached a day |
| `GET /api/external/quote/context` | One Stoic line, for the Closing only |
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
its transcript, and the clock running out **is** a close. One predicate —
`sweepIfOver` — answers "is this over" for every route that touches a circle,
and on the transition it deletes the transcript and ends the voice room, once,
whichever request noticed first.

It has to be every route. When the check lived only in the room poll, a circle
nobody was watching never closed at all: the row stayed `waiting`, the words
stayed readable, the voice room stayed live. Now whoever knocks is the one who
notices — a transcript read, a join, a seal, a voice token, a mute. A closed
circle answers `404` from the room and **`410` from all six other surfaces**,
never an empty list, because `{messages: []}` still tells a caller the room is
there. The 24-hour sweep is the backstop for rows nobody touches again, not the
policy. Only members can read a live room; a non-member gets 403.

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

Apply `0003_circles.sql`, `0004_circle_member_pressure.sql` and
`0005_circle_presence.sql` for the cloud path — all re-runnable like the
others. Locally, circles live in the same `.data/vent.json` and survive
restarts.

## Offline

A minimal service worker, no Workbox. Static assets are cache-first (they are
content-hashed), pages are network-first so a deploy is never stale, and API
calls are never cached — yesterday's reply served as today's would be worse
than an error. Vents written offline queue in localStorage and flush on
reconnect.
