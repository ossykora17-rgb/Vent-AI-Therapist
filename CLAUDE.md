# Working on Mind Weave VENT

Read this before changing anything. The README explains what the product is
and how to deploy it; this file is the operating manual for the code — the
decisions that took a bug to learn, and the ones that must not be undone
casually.

## What this is

Somewhere to put the thing you can't say out loud yet. Two surfaces on one
engine: a private session (`/chat`) and a six-seat peer circle (`/circles`).
Nigerian in root — Lagos money pressure, japa, firstborn duty — and it is
**not therapy**. Every screen that could be mistaken for one says so.

The person on the other side is having a bad day. That is the whole design
constraint. It outranks elegance, cleverness, and feature count.

## Commands

```bash
npm run local      # the whole product, no accounts, no cloud  → :3001
npm run gate       # selector + eval + pipelines + live-verify → merge or don't
npm run live-checks # boots its own build on :3001, runs the live half alone
npm run eval       # 12 checks, no server; add a URL for the live room
npm run heartbeat  # what changed, what is dirty, who should fix it
npm run data       # store → data/sft.jsonl + data/eval.jsonl
npm run rlhf       # ratings → data/dpo.jsonl, and what is losing
```

`npm run gate` is the only opinion that counts about whether a change is
safe. It has **zero dependencies**, so a fresh `git worktree` runs the whole
suite with no `npm install`. Keep it that way.

## Rules that are not preferences

**Silence beats a guess.** Flavour below its confidence floor says nothing
rather than naming you. An exchange rate that did not fetch is an absent
sentence, not an estimate. A Keeper counts words the room actually said and
cannot invent a pattern. If you are about to make something up to fill a
space, leave the space.

**Never promise what the code cannot keep.** The worst bug this product
shipped was a refusal that read *"Your turn comes"* to people whose turn
could never come, because roles were fixed at join. Read a refusal message
and ask whether it is true.

**Close means close.** `sweepIfOver()` in `src/lib/circles/sweep.ts` is the
only implementation of "is this circle over". Call it from every route that
touches a circle. It deletes the transcript and ends the voice room once, on
the transition, whichever request notices first. A closed circle answers 404
from the room and 410 from every other surface — never an empty list, because
`{messages: []}` still tells a caller the room is there.

**Governance is enforced on the server.** `checkMessage()` runs where the
message is written, because curl walks around a greyed-out button. The UI
mirrors the rules for kindness, never for safety.

**Fail open on the second opinion, closed on the first.** Crisis routing and
the no-advice rules are local, free, and always run. Perspective is a second
opinion: unreachable means pass. A network blip must never mute a room of
people trying to speak.

**Circle transcripts are never training data.** Confidentiality is a deletion
policy and a training set is its opposite. The pipeline counts circles and
never quotes them. `data/` is gitignored.

**One table, one truth.** Chair tensions lived in four files once and the
memory filter hid inside a route. Anything the eval suite asserts must be
imported from the module the product actually uses — a suite that checks its
own copy passes while the product regresses.

## Where things live

| Concern | File |
| --- | --- |
| Intent routing, crisis, meta-vs-vent | `src/lib/vent/intent.ts` |
| 32 tactics, 3-turn block, somatic gate | `src/lib/vent/tactics.ts` |
| Memory: vents only, six-turn cap | `src/lib/vent/memory.ts` |
| Chair → tension → drop | `src/lib/vent/chairs.ts` |
| Circle phases, governance, Keeper lines | `src/lib/circles/rules.ts` |
| "Is this circle over" | `src/lib/circles/sweep.ts` |
| Presence and typing windows | `src/lib/circles/presence.ts` |
| Guardian thresholds | `src/lib/external/guardian.ts` |
| Outside world, all four windows | `src/lib/external/sources.ts` |
| Voice tokens, room naming | `src/lib/voice/livekit.ts` |
| Two storage backends behind one interface | `src/lib/store/` |

Two skills carry the deeper context and are worth loading before touching
their areas: `.claude/skills/data-quality/` and `.claude/skills/circles-quality/`.

## Traps that cost a debugging session

- **The two Keeper guards must stay separate.** `keeper:open` and
  `keeper:reflect` are checked by author. Guard both on
  `kind === "keeper_prompt"` and the opening silently kills the 38-minute
  reflection — a bug that only appears 38 minutes into a live room.
- **`TrackType.AUDIO` is 0**, `VIDEO` is 1. A hand-written `=== 1` mutes the
  one thing a circle can never publish and leaves the microphone open. Use the
  SDK's enums.
- **`FileStore` caches the whole database in memory.** Editing
  `.data/vent.json` under a running server does nothing until restart.
- **A leftover server will answer your checks.** `npx next start` spawns
  `next-server` as a grandchild; killing the `npx` pid orphans it and it keeps
  port 3001. The next run then reports on the wrong build, or the wrong
  configuration, and looks green. `.github/live-checks.sh` refuses a busy port
  and kills the process group for exactly this reason — it produced a false
  pass twice while being written.
- **Verify both deployment shapes.** The voice routes answer `501` before
  touching the store when there are no LiveKit keys, so a suite run by an
  author who has keys asserts different status codes than CI. CI runs the live
  checks twice, with and without.
- **`livekit-client` is 13 MB.** It is imported *inside* the join handler in
  `src/components/circle-voice.tsx` and nowhere else. A static import puts
  508 KB into every room's first load.
- **The voice token's lifetime comes from the circle**, not a fixed clock.
  Deleting a LiveKit room is not revoking a token.
- **Meta patterns must point at the assistant.** "It's the same thing every
  week" is a person naming their own pattern — the most valuable sentence in
  the corpus — and a bare `/same thing/` routed it to an apology.

## Credit discipline

Most messages never reach a model: crisis, factual, greeting and meta are all
answered locally, for free. Only a real vent spends tokens. The eval suite,
both pipelines and the heartbeat make **zero** model calls by construction —
if a change to them needs one, the change is wrong.

## When not to automate

The heartbeat applies a four-condition test per finding: does it repeat, is it
objectively verifiable, is it bounded, is it reproducible. Advice slipping
into a reply passes. Whether the tone reads warm does not, and no gate will
ever measure it — that one is read by a person, in a real room, and it is
where every product-quality finding so far has come from.

There is a fifth question, and it is the one this project keeps failing.

## Which deployment shape makes this false?

Ask it of every user-facing string that makes a claim, and of every assertion
that expects a status code. Before it ships. It is read by a person, because
no gate can ask it — a gate only ever runs in the shape it was written in.

Every automated path here has a store. `live-checks.sh` sets
`VENT_LOCAL_STORE=1`, CI sets it, dev falls back to `FileStore`. So the one
configuration with no store — production with no Supabase env vars, which is
what a fresh Vercel project *is* — is the one configuration nothing runs. It
was also the one real people were using.

That gap has now produced the same bug four times, wearing four faces:

- A voice token with a flat 50-minute TTL. Correct from where the author sat,
  wrong from where the circle sat: a seat taken at minute 44 held a live
  credential until minute 94.
- A live-check script reporting 145 assertions where the truth was 142,
  because it ran against an orphaned `next-server` instead of the build under
  test.
- An eval assertion expecting `410` where CI got `501` — the voice routes
  answer before they touch the store, and the author had keys.
- A no-model-key reply that told people *"I've saved it, word for word"*
  while `getStore()` returned null and their words were dropped.

Four findings, one mechanism: **the suite tests the shape its author is
standing in.** Eval check 12 closes the fourth instance. It does not close the
class, and nothing written in `scripts/` ever will. Only the question does.
