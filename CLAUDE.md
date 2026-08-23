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
npm run live-checks # boots its own build twice — with a store and without
npm run eval       # the whole suite, no server; add a URL for the live room
npm run audit      # grade last 50 turns; --dry is free, --apply writes a diff
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

**Specificity outranks weight, in every selector.** A high-weighted entry that
fits everybody becomes the only entry that ever fires. It has happened twice —
`exact_mirror` at weight 90 made the product's first reply a template, and
`rogers_never_said` at 90 answered four of five messages the day `probes.ts`
was written. Anything matching their actual words beats anything that would
match anybody, and weight only breaks ties inside a tier. A library of fifty
with flat ranking ships as a library of one, and it looks fine in review.

**Understanding is the job; fixing is not.** A coping task nobody asked for is
rejected and regenerated before anybody reads it, and the ban lifts only on
their own words asking for one — `askedForSkill` in `voice.ts`. The test is not
whether the task is good advice. It is whether the reply survives having its
message deleted: if it could be sent to any human on earth, it failed. Note
where the line falls, because it is not "no actions" — the library's own drop
set is a breathing instruction and passes, because it is aimed at the exact
place in the body they named. Generic is the offence. Task is not.

**When the thinking is the problem, do not ask about the thing.** Wells' CAS:
distress is maintained by the *process* — worry, rumination, threat-monitoring
— not by the content, so a good question about the content is one more lap with
the room's blessing on it. `inTheLoop()` in `tactics.ts` is the one reading;
`FEEDS_THE_LOOP` vetoes three tactics on it and `selectProbe` filters to the
MCT set. It is a filter and never a weight, because a weight wins one contest
and then the three-turn block hands the turn to another content question.
The detector must never widen to bare `/think/` — everybody here is thinking
about something, and a room that treats all of them as ruminating stops doing
content work at all.

**Close means close.** `sweepIfOver()` in `src/lib/circles/sweep.ts` is the
only implementation of "is this circle over". It deletes the transcript and
ends the voice room once, on the transition, whichever request notices first.
A closed circle answers 404 from the room and 410 from every other surface —
never an empty list, because `{messages: []}` still tells a caller the room is
there.

Call it from every **handler** under `api/circles/[id]`, not merely from every
route file. The rule held at file granularity for months while DELETE — the
Keeper's early close — never called it, so the one surface for deliberately
ending a room was the one that could not say the room had already ended. Check
95 enumerates the handlers off the filesystem rather than listing them, because
a hand-written list of routes does not survive the next commit.

**Anything the room holds about somebody is on a page, with a button.** Not a
courtesy — Clark & Chalmers' fourth condition for a genuine cognitive extension
is that the content was consciously endorsed, and a note nobody has seen fails
it by construction. `keepable()` refusing to write a diagnosis is not the same
as letting somebody correct a wrong note. The carve had both from the day it
existed and the notes had neither for a month, one section down the same page.
Show the sentence the prompt actually reads, never a tidied version of it: a
summary is a second copy, and the one they could not check is the one still in
the prompt.

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
| The office: banned phrases, unasked-for tasks, reply contract | `src/lib/vent/voice.ts` |
| 58 extraction questions — MI, Yalom, Rogers, Wells | `src/lib/vent/probes.ts` |
| Reject and regenerate, before anybody reads it | `src/lib/vent/failsafe.ts` |
| One move from outside, per pressure, cached | `src/lib/vent/research.ts` |
| What the audit proposed and the gate kept | `src/lib/vent/learned.ts` |
| Intent routing, crisis, meta-vs-vent, injection | `src/lib/vent/intent.ts` |
| 32 tactics, 3-turn block, somatic gate | `src/lib/vent/tactics.ts` |
| Memory: vents only, six-turn cap | `src/lib/vent/memory.ts` |
| The office across sessions, and no diagnosis | `src/lib/vent/notes.ts` |
| What it worked out, shown and deletable | `src/app/api/notes/route.ts` |
| The first three messages, and the alliance line | `src/lib/vent/intake.ts` |
| Chair → tension → drop | `src/lib/vent/chairs.ts` |
| Circle phases, governance, Keeper lines | `src/lib/circles/rules.ts` |
| "Is this circle over" | `src/lib/circles/sweep.ts` |
| Presence and typing windows | `src/lib/circles/presence.ts` |
| Guardian thresholds | `src/lib/external/guardian.ts` |
| Outside world, all four windows | `src/lib/external/sources.ts` |
| Voice tokens, room naming | `src/lib/voice/livekit.ts` |
| Two storage backends behind one interface | `src/lib/store/` |
| The provider chain, and model discovery | `src/lib/vent/providers.ts` |
| Failure vocabulary, the health probe | `src/lib/vent/model.ts` |

Two skills carry the deeper context and are worth loading before touching
their areas: `.claude/skills/data-quality/` and `.claude/skills/circles-quality/`.

## Traps that cost a debugging session

- **A `\\b` can arrive as a backspace.** A tool wrote seven regexes into
  `intent.ts` with U+0008 where the escape should have been. Valid regexes,
  matching nothing, type-checked, linted, and zero pixels wide in every diff.
  The router silently stopped catching things — the quietest failure available
  here. Caught only because check 90 asserted the *behaviour*; check 91 now
  fails the build on any control character in any source file. If you write a
  regex through a script, assert what it matches, never that the file contains
  it.
- **The two Keeper guards must stay separate.** `keeper:open` and
  `keeper:reflect` are checked by author. Guard both on
  `kind === "keeper_prompt"` and the opening silently kills the 38-minute
  reflection — a bug that only appears 38 minutes into a live room.
- **`TrackType.AUDIO` is 0**, `VIDEO` is 1. A hand-written `=== 1` mutes the
  one thing a circle can never publish and leaves the microphone open. Use the
  SDK's enums.
- **`FileStore` caches the whole database in memory.** Editing
  `.data/vent.json` under a running server does nothing until restart.
- **A new route ships into neither live pass unless you put it there.** The
  two verification passes name their routes by hand — `no-store-verify`'s wire
  sweep and `live-verify`'s checks — so a route added on Tuesday is covered by
  nothing on Wednesday and nobody notices, because both passes still report
  green. `/api/notes` went out that way: the surface whose entire job is
  showing somebody what a machine holds about them and letting them delete it,
  verified in zero of twenty-seven checks, by the person who wrote the section
  of this file about exactly that.
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

The nightly audit and the web lookup are the two paid jobs added since this
was written, and both are shaped by it. The lookup is keyed to the pressure
and cached a day, so it is ten calls a day for the whole userbase rather than
one per message. The audit runs the free deterministic graders first and only
asks a model about replies that broke *no* stated rule and are still flat —
one call, ten samples, and none at all on a night with nothing flat.

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

Every automated path here had a store. `live-checks.sh` set
`VENT_LOCAL_STORE=1`, CI set it, dev falls back to `FileStore`. So the one
configuration with no store — production with no Supabase env vars, which is
what a fresh Vercel project *is* — was the one configuration nothing ran. It
was also the one real people were using.

**That is no longer true, and the list below is why it had to stop being
true.** `live-checks.sh` now runs a second pass with `env -u VENT_LOCAL_STORE
NODE_ENV=production` and `scripts/no-store-verify.mjs` against it: a set of
assertions that only mean anything when nothing is configured — no page 5xxs,
no refusal is written for whoever deployed this, no write path claims to have
kept anything. It found two live bugs on its first run, and one of them was a
sentence CLAUDE.md already listed as fixed.

Do not read that as the gap being closed. It is one shape, now covered. The
question below is the thing that generalises; the second pass is only the
answer for the shape that had already cost eleven bugs.

That gap has now produced the same bug thirteen times, wearing thirteen faces:

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
- A health probe calling `models.retrieve` — metadata, which needs no credit
  — reporting `ok` for a week while every real vent failed on billing. A
  green light over a broken road is worse than no light.
- Two model ids that did not exist, `claude-sonnet-5-20250715` and a retired
  `gemini-2.5-flash`, both found by a person in production because nothing
  here could check a hardcoded string. The adapter asks the provider now.
- `max_tokens: 220`, correct for a model that speaks immediately and wrong
  for one that thinks first: 217 tokens of silent reasoning, three tokens of
  "Tired. Na" to somebody who had just written that they were tired.
- A select list joined with `", "`. PostgREST takes it verbatim, so every read
  of `vents` asked for a column named `" user_id"` and got back a *path* error
  naming no column at all. Invisible for months because every caller sat in a
  try/catch that degrades quietly — memory across turns returned nothing in
  production the whole time, and nothing anywhere said so.
- Eleven tables and no `GRANT`. 0001–0007 wrote RLS carefully and never
  mentioned the older, coarser gate underneath it, leaning instead on default
  privileges — which attach to whoever created the object. So whether the
  server could read its own tables depended on who ran the migration and in
  which tool. `/api/health` reported `database: ok` throughout, because it
  probed with the *anonymous* client and an anonymous caller under deny-by-
  default RLS legitimately gets zero rows and no error. A green light over a
  broken road, from a probe that does not take the road: the same sentence as
  `models.retrieve`, two years of lessons apart.

- A schema probe that could not read its own answer. The contract check sent
  `head: true`, and a HEAD response has no body — so PostgREST's error JSON,
  the object carrying `code` and `hint`, never arrived. It printed seven tables
  failing and `[?] no hint` beside every one of them: a failure bucket with
  nothing in it, inside the endpoint written to abolish failure buckets with
  nothing in them. The heartbeat, doing an ordinary GET, had the whole error
  the entire time. Two probes of the same database, one of them structurally
  unable to see what it was looking at.

- Three claims made before their answer arrived. `persisted: false` nested
  inside `memoryCount > 0`, so a first-time user whose words were dropped saw
  nothing. `submitMood` toasting *"Saved. That's the anchor."* with no network
  call at all, against inserts that hardcoded `tension_after: null` — so no
  session could ever be anchored, and the mean drop, `drop_is_flat` and the
  whole efficacy loop were unreachable rather than merely empty. And
  `void seal(w)` followed immediately by *"Sealed. Nothing here is kept."*,
  where `seal` never checked `res.ok` and swallowed the rest behind a comment
  reasoning that it had already happened.
  That last one is the sharpest: the sentence held **two** promises, and only
  one depended on the request. The transcript deletion was true either way, so
  the failure tied a guarantee that always holds to one that had just broken.

- The refusal the lobby prints, still saying the thing this file says was
  fixed. `POST /api/circles` answered 503 with *"Circles need storage. Run
  locally or configure Supabase."* and `circles-list.tsx` toasts `d.message`
  verbatim, so somebody at 2am who tapped Open a circle was handed our
  vendor's name and a shell command. This file already lists that sentence
  among the faces and records it as repaired — the repair reached the lobby's
  own copy of the string and not the route's, which is the copy the lobby
  actually prints. A fixed bug with a live copy is not a fixed bug.

  The same screen offered a full-width gold **Open a circle** above it, and
  explained four hundred pixels lower, on a glass plate, that circles could
  not open. A door onto a 503, under the rule that the room never offers a
  door that opens onto a 501.

- A thank-you for a rating that was dropped. `POST /api/feedback` answers
  **200** with `persisted: false` when there is no store, and the client
  thanked people on `res.ok` — through a branch written to close exactly this
  hole, under a comment reading *"silently losing them corrupts the one place
  the product learns what is losing."* It read the status and never read the
  body: one of the two doors closed, and the other left open under a note
  explaining why the door mattered.

Thirteen findings, two mechanisms. The first, and the one most of them share:
**the suite tests the shape its author is standing in.** Checks 12, 14, 16 and 17 close instances — 14 stubs `fetch` and
makes every provider failure that reached a real person fail a build instead;
16 reads the store as text and fails any select list with a space in it; 17
fails any surface that writes the crisis number out by hand. That is the most
a script can do, and check 16 is the closest one to closing a class rather
than an instance: it found the second occurrence in the circles path
immediately, one nobody had noticed.

It still does not close the class, because the next face will be a shape
nobody thought to stub. Only the question does. The ninth and tenth faces are
the sharpest versions of it so far, and they are both about the probe rather
than the thing probed: one asked as the wrong identity, the other asked in a
shape that could not carry the answer back. Ask of `/api/health`, before
trusting a word of it:

*Is this asking as the identity that does the work, and can the reply it gets
actually carry the failure?*

A green light over a broken road is the oldest bug in this file. It has now
arrived four times — the fourth being a probe one argument short: the nightly
audit called `gradeReply` without `said`, so the only **fatal** grader in
`quality.ts` never ran in the job that exists to find what the live path
missed, and the report printed "broke a rule: 0" over it. Ask of any grader
run in a second place: *is it being given everything the first place gives
it?*

The first three arrived — `models.retrieve`, the anonymous probe, and the HEAD
request — and every time the light was the part that was wrong.

And the second mechanism, which is newer and simpler than the first:
**the interface reported an intention instead of an outcome.** Not a
probe in the wrong shape — a sentence written before, or without, the answer.
Ask of any string that says something happened:

*Did this wait for the thing, and did it read what came back?*

## And a third, which is the one to watch for now

**A fix that reached the copy in front of it and not the one that ships.**

The twelfth and thirteenth faces are both this, and neither is a bug that got
missed — both are bugs that got *fixed*, in a file next to the one that
mattered. The lobby's copy of "Circles need storage" was rewritten and the
route's copy, the one the lobby actually prints, was not. The feedback client
stopped throwing the response away and started reading the status, in a branch
written under a comment about silently losing ratings, and never read the body.

Half a repair is more dangerous than none, because the comment above it now
says the problem is handled. Every one of those comments is still there and
still reads as true.

**And the sharpest version yet: both halves repaired, and the line between them
throwing the answer away.** `?carve=1` is the button on two screens whose only
job is to answer "is it gone". `setCarve` was fixed to return whether the write
landed, and carries three paragraphs saying so, under a contract in
`store/types.ts` reading *"a carve that did not land must not be reported as
kept"*. Both screens were fixed to read `data.deleted === "carve"` from the body
rather than the status — the feedback bug's lesson, correctly applied. And the
route in the middle did `await store.setCarve(userId, null)`, dropped the
boolean, and reported `deleted: "carve"` unconditionally. Two correct fixes
facing each other across one line that ignored both.

It survived because `setCarve` is the *only* mutation in `supabase-store.ts`
that reports by returning instead of throwing — `done()` raises for everything
else, so every other delete path is honest for free and the caller was written
for that world. And it is non-throwing for a good reason: `42703` with 0011
pending is a normal state, not a fault. Which means the two shapes where it lied
are the two shapes a *first* Supabase deployment passes through — `42501` before
the grants land, `42703` before 0011 does. Neither has a store of `null`, so
`no-store-verify` cannot see them, and no suite here has ever run a store that
exists and fails. `FORGET_FAILED` — "Could not clear that. It is still here." —
was unreachable code the whole time.

Check 87 asserts it, and sweeps the class: every store method that reports by
returning a boolean must have its answer read at every call site. There was
exactly one left.

So when you fix a string or a claim, the question is not whether this one is
right. It is:

*Where else does this sentence exist, and which copy does the screen read?*

`grep` for the sentence, not for the file you were looking at. If there are two
copies, the fix is one copy — a constant, imported — and not two edits.

Check 81 asks it for you now: no sentence a person reads may live in two files.
It found three the day it was written — the chair question in the circle lobby
and the circle room, the failed-deletion sentence in the chat and on the Memory
page, and the product's own title in two metadata files.

**And a number is a sentence.** `docs/POSITIONING.md` claimed "23 banned
phrases fail the build". The true count was 15. The other eight it was counting
are `FILE_LANGUAGE`, which is graded on *model output* and has never failed a
build in its life — so the claim was a hand-typed integer sitting one table
away from the thing it counted, in the one document written for somebody who
cannot check it, in a file whose own opening paragraph says "a comparison that
only works if nobody checks it is not an advantage". Nobody typed it wrong;
a row was added and the number stayed where it was. That is what makes it the
same bug as the two copies of a sentence rather than a typo.

Check 86 asserts it against the tables now. Any claim of the form "N things are
enforced" is a copy of something the code already knows, and it belongs in the
same category as a duplicated sentence: derive it, or assert it, or do not
write the number.
