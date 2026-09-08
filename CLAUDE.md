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
npm run live-checks # four shapes: store, none, one that fails, one half-applied
npm run eval       # the whole suite, no server; add a URL for the live room
npm run audit      # grade last 50 turns; --dry is free, --apply writes a diff
npm run heartbeat  # what changed, what is dirty, who should fix it
npm run data       # store → data/sft.jsonl + data/eval.jsonl
npm run rlhf       # ratings → data/dpo.jsonl, and what is losing
```

`npm run gate` is the only opinion that counts about whether a change is
safe. It has **zero dependencies**, so a fresh `git worktree` runs the whole
suite with no `npm install`. Keep it that way.

And keep it unable to pass by not running. It used to exit **0** without
running anything when the local store had no new rows — which on a fresh
checkout is always, because `.data/` is gitignored. Clone, run the one command
this file says to trust, get a green exit, merge. Every early `process.exit(0)`
in `heartbeat-data.mjs` must be guarded on `!GATE`, and check 98 asserts it for
each one it finds rather than for a list.

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

**A justification covers what it argued about, and nothing standing beside
it.** The failsafe's rejection set carried one sentence for three graders:
*"Coverage, length and language mixing are deliberately not grounds for a
retry ... a reply one sentence over the cap is worth a note and not a second
billed call."* That argument is about length, it is correct about length, and
two other graders rode it into the exempt list on the strength of adjacency.
Production says what it cost: of 171 real vents, twelve were written in
Pidgin, classified `pidgin` correctly by the router, prompted with *"Reply in
Pidgin"* — and **six of the twelve came back in English**. Half of every
Pidgin turn this product has taken. The instruction lands and the model steps
over it, which is the one failure a prompt cannot fix from inside itself.
Answering a Nigerian in English when they wrote to you in Pidgin is not drift;
it is the room declining the register they chose to be honest in. `language`
is its own tier now — worth a retry, never worth the authored line, because
the hold is English too and generic on top, so falling back would swap an
engaged reply for a bland one and call it a repair. Check 104 makes every
grader `quality.ts` can emit declare itself as rejected, retried, noted or
structurally unreachable, because an absent name and a declined name look
identical and the default is silence.

**Pidgin is grammar, not vocabulary, and the graders now know the difference.**
Naija Pidgin is an English-lexifier creole: its function words *are* English
words. So the old mixing rule — flag a Pidgin reply carrying four or more of
`the|and|that|with|from|about|because|would|there` — was measuring fluency and
calling it a defect, and it fired on **four of the six replies that got Pidgin
right**, including *"You dey demand say I holla you first because silence dey
hurt you"*. Deleted, not tuned: no threshold of English function words means
anything here. What decides the language is structure — `dey`, `na`, `wey`,
`no be`, `make I`, `don` — held in `PIDGIN_GRAMMAR`, while borrowed nouns
(`wahala`, `oga`, `abeg`) sit in `PIDGIN_LEXICAL` and decide routing but never
whether a *reply* is Pidgin. "The wahala at work is too much" is an English
sentence. Both lists live in `intent.ts` and `quality.ts` imports them: there
were two detectors, neither a superset of the other, so the router and the
grader disagreed about the most important question this product asks — and the
grader is the one that now spends a billed retry on the answer.

**A marker earns its place by what it excludes.** `make you` was the commonest
hit in the corpus by a distance — 12 of 30 across 166 English replies, ahead of
`dey` — because "what make you think" is ordinary English. Pidgin's subjunctive
runs the whole paradigm and *"make you no worry"* is good Pidgin; second person
is the one cell that collides, so it is out and `make I / we / e / dem` stay.
Removing it took single-marker English replies from 14 to 3. Third time this
list has given up a word that is Pidgin *and* English, after `fit` and `belle`.

The grader that decides all of it matched `don't`. `\bdon\b` — the Pidgin
perfective, "I don tire" — holds its boundary against an apostrophe, so every
English sentence containing the commonest contraction in the language tested
as Pidgin and walked past the check. Seven of fourteen production hits were
that. **Not a regex that matches nothing this time; a regex that matches too
much, in the one place where matching too much means the check never fires.**
And "only checked on Pidgin cases" — a true sentence about *mixing* — closed
the door on *switching*, so three English messages answered in Pidgin were
invisible by construction. That direction is the worse one: a Pidgin speaker
can read an English reply, and somebody who wrote in English may not read
Pidgin at all.

**The rule is enforced where the person meets it, not one file over.** The
prompt says *never diagnose, and never name a condition*. `keepable()` has
refused to write one into a row since notes existed, and check 83 asserts it.
Nothing had ever checked the sentence a person reads — fourteen reply graders
and not one of them asked. Of 171 real vents, eight replies name a clinical
condition and **five name one the person never used**, all five *anxiety*, the
worst of them *"carrying your parents' marriage anxiety"*: the room diagnosing
two people who are not in it. `diagnosis` is fatal and in the failsafe's
rejection set, because a name for your condition is not something you can
un-hear and an authored line that says less beats a label from a room with no
licence. `CONDITIONS` is exported from `notes.ts` and imported, never copied.
The two callers apply it differently on purpose and check 105 asserts the
asymmetry so nobody "fixes" it: a note refuses the word outright because a row
outlives the sentence around it; a reply may hand back a word they chose,
because their own word returned to them is the most useful move here. Matched
per family — one clinical word of theirs never licenses a different one of
ours.

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

**`create table if not exists` does nothing to a table that is already there.**
Production carries `vent_feedback_user_id_key UNIQUE (user_id)` and no migration
here declares it — 0002 creates the table with a plain `user_id` and no
uniqueness, and creates it *if not exists*, so its definition has never once
applied to the database it is supposed to describe. The generated name
`<table>_<column>_key` is the fingerprint: a `unique` written on the column by
something no longer in this history. The cost was invisible from either side —
the route allows five ratings an hour, the database allows one for ever, so a
person's second rating raises `23505` and is dropped. Every DPO pair `npm run
rlhf` has ever built came from first ratings only. 0020 drops it by looking the
constraint up in `pg_constraint` rather than by the auto-generated name, which
is 0016's lesson; check 120 asserts that no migration can reintroduce it, that
the repair does not guess a name, that it says so when it did nothing, and that
`vent_feedback.user_id` keeps an index after the unique one goes with its
constraint.

**The probe that would have caught it now exists, and so does the leak it
found on the way in.** `RPC_CONTRACT` held one entry, `vent_rate_count`, so the
RPC probe existed and did not cover the RPC that mattered. `match_memories` is
in it now, and the discriminator is an accident worth naming: 0006 created a
*four*-argument version and 0014 replaced it with a *three*-argument one — the
same fact that made 0016's `drop function` match nothing — and PostgREST
resolves by named parameters, so a call carrying 0014's three answers PGRST202
against a database still running 0006. A deployment on the vulnerable
definition now reports a failing RPC instead of looking identical to a fixed
one. It separates the *signatures*, not `security invoker` from `security
definer`; two functions with those three parameters and different bodies read
the same from here, and the advisors are still the tool for that.

Wiring it up meant fetching a real health response, and that is where the leak
was: `/api/health` publishes the database's `hint` and `message` in **four**
places — `tableErrors` twice, `transient`, and `writeError` — on a route with
no token. Most of what Postgres names is a schema object worth printing, which
is why the message is kept and `redactIds` only takes out uuids: an anon id in
this product is not an identifier, it is the whole credential. Three of the
four sites were redacted in one pass and the fourth was missed, with every
assertion still green — it showed up only in a response fetched off a running
server with a planted id in it. So the assertion is the class: no uuid anywhere
in that response, *and* the redaction marker present, because "no uuid" is
satisfied just as well by an endpoint that reported nothing at all.

**A migration that is written is not a migration that has been applied.**
0014 hardened `match_memories` — the vulnerable version was `security definer`,
filtered on a uuid the *caller* supplied, and was granted to `authenticated`,
so any signed-in person could read anybody's memories over
`/rest/v1/rpc/match_memories`. The repo fixed it, documented it at length, and
production ran the broken 0006 definition for months afterwards. Nothing here
compares the live schema to this one: `/api/health` checks tables and columns,
never function bodies or grants. Run Supabase's own advisors against the
project when you touch the schema — they had been reporting this the whole
time, to nobody.

**A mask with one ratio is a mask with one key.** `mask.ts` is varispeed, so
it is a uniform scaling, and anything linear is invertible by whoever knows the
ratio. Every seat used to get the same hardcoded shift — one recovered ratio
would have unmasked every speaker in every circle ever held. `personaFor` reads
the seat the *server* assigned, so an attack that works recovers one seat and
does not generalise, and six people in a room are audibly six people. Stay in
the ±3–6 band and weighted downward: past that it is a cartoon, and a cartoon
empties the room, which is a different way to lose.

**Never ask the model to grade its own turn.** Risk level, reasoning, the move
selected, whether somebody needs a human — every one of those is computed in
`assess.ts` from what the router and selectors already decided, before the
model is called. Tags in the output cost tokens on a budget that has already
produced the 217-reasoning-tokens bug, add a parse whose failure mode is XML on
a screen at 2am, and let the message being assessed argue with its own
assessment. Two of the first 130 real turns were injection attempts. A
classifier that ran first cannot be talked out of anything.

**stdout has no delete button.** Log codes, counts, kinds, statuses and
durations — never their message, never a note's subject or detail, never an
anon id. A hosted runtime keeps stdout for as long as it keeps stdout, so a
value in a log line outlives the deletion the interface offers and turns the
button into a half-truth. Check 103 reads each `console.*` call by balancing
its own parentheses, because a line-based match reads whatever sits beside the
call. The rule is not "log less": `[carve] notes refused (3): hard: names a
condition` is exactly the line that says whether the prompt or the rule is
wrong, and it carries nothing about a person.

**Nineteen of them walked past it as `error`.** Check 103 reads the string
somebody typed, so it stops `console.warn("[carve] refused", n.subject)` and
cannot read `console.warn("[carve] failed", error)` — which looks like nothing
and prints the message and the stack. Every model path, every store path, the
lobby, the voice close and the generic `[api]` handler were writing an
unbounded string from somewhere else into a place with no delete button: an SDK
throw carries the provider's response body on `.message`; Postgres quotes the
value it refused, and here the value is usually an anon id; LiveKit quotes the
room name, which is derived from the circle id. `errorKind()` in
`src/lib/errors.ts` is the one policy — an HTTP status, a short code, the class
of the throw — and check 117 enforces it by following what the caught value
flows into. Derived is not the same as unsafe and the check says which is
which: a name made from `.name`, `.code` or `typeof` is a *kind* and is exactly
what the rule wants; a name made by reading `.message` or stringifying the
throw is the thing being banned. And the sweep is wider than the catch blocks
that started it: PostgREST does not throw, it returns `{data, error}`, so six
lines in `supabase-store.ts` — `console.warn("[store] setCarve", error.code,
error.message)` — sat in `if (error)` branches where no control-flow scan could
reach them, on the paths handling somebody's carve, their held note and their
breaking point. Postgres is the thing that quotes values. So the rule is stated
flatly and swept over every file rather than over a control-flow shape: **no
console call logs a `.message`, anywhere.** `42501` and `42703` are the two most useful
strings this product has ever logged, and neither is anybody's words.

Check 103 is enforced on the *literal*, so a variable walks past it.
`Verdict.reject` was `${grader}: ${detail}` and the route logged it whole —
and details quote the reply: `recites` prints the sentence it read back as a
receipt, which here is usually the person's own words handed to them, and
`invented` prints the naira figure. The one diagnostic that fires when a reply
goes wrong was writing fragments of a private conversation to stdout. The fix
is not a smarter check. **Make the obvious field the safe one**: `reject`
carries grader names and nothing else, and anybody wanting the detail calls
`gradeReply` and has to decide on purpose what to do with it. Assert it where
the value is made, over every grader that can reject — not at the call site,
which is the place the rule already could not see.

**A diagnostic that does not outlive the night is not a diagnostic.** The
failsafe rejects on eight graders and its whole record was
`console.warn("[vent] rejected own reply:", …)`. This project is on a Hobby
plan, which keeps runtime logs for **one hour** — checked, not assumed: a
query for `[vent]` over thirty days of production returns nothing, and names
retention as the reason. The nightly audit cannot recover it either, because
the audit grades the reply that was *sent*, which after a successful retry is
the good one. So a failsafe that works and a failsafe that is dead code looked
identical from every surface here. 0019 keeps the grader names on the row and
the heartbeat prints them; a week of zeroes is the finding, not the absence of
one. Names only, never details — a column outlives a log line, so the rule is
stricter here rather than looser. Ask it of anything that only reports to
stdout: *how long does this record live, and who reads it in that time?*

**Every part working is not the feature working.** Notes had a migration, a
table, `keepable()`, a refusal message, a page, a delete button, and checks 83
and 100 over all of it. Production after a month: eight people, **two** carves,
**zero** notes, 180 vents. Three independent causes, each alone enough to
guarantee zero for ever, none of them in any of the parts. The output contract
— *"Output only JSON: {…}"*, the last line the model reads — never named
`notes`, while the instruction three paragraphs above asked for them. The
extractor was `/\{[\s\S]*?\}/`, **non-greedy**, so the first `}` it found was
the one opening the first *note*, the captured text was unbalanced, and
`JSON.parse` threw — discarding the carve along with the notes, which is why
six of eight people have no carve. And `maxTokens: 120` was sized for eight
words under a comment saying the job was small, before notes joined the same
call. The suite tested every part and had never once fed `parseCarve` a
response with a note in it. **A seam is not covered by testing both sides of
it.** Check 107 asserts the contract names every field the parser reads, and
derives the ceiling from `NOTES_ASKED`, `MAX_SUBJECT` and `MAX_DETAIL` so it
cannot drift from what is asked for.

**A hedged pattern cannot catch an unhedged model.** `GENERIC_TASKS` banned
journaling as `/(?:try |start |consider |do some )(?:journal…|writing it
down)/` — a leading hedge, required. A model asked for an instruction does not
hedge, and a production reply told somebody to *"write down one plain sentence
about what is actually true"* and then offered to *"witness this with you, or
push"*. Three sentences, three things that survive having the message deleted,
and fourteen reply graders passed all of it. Third time this shape has cost
something, after `make you` and `\bdon\b`: a pattern written the way its author
would phrase it, meeting text phrased the way a model does.

What is banned is the **empty object**, never the paper. The library's own
*"Write down the one it keeps returning to, on paper, next to the bed"* is
correct — aimed at somebody whose mind loops before sleep, and next-to-the-bed
is the CBT-I protocol rather than a gesture at one. Same line the drop set
falls on: aimed is fine, generic is the offence. Check 119 holds both halves,
and its mutation pass fails on a *widened* ban as well as a removed one,
because the over-broad fix would delete a working clinical move and look like
diligence.

The positive half of that rule — an action must be doable in the room, in under
a minute, out of what they said — is **not in the prompt**, and the reason is
written into `voice.ts` beside it. Check 24 measures the heaviest assembly at
exactly 3,600 against a 3,600 ceiling, and that check's own comment settled it
in advance: *"the next block pays by removal ... whoever raises this number
next should have deleted something."* This rule replaces nothing, so it is
enforced by the grader and absent from the prompt. There is no headroom left:
the next person with a good sentence for the prompt has to delete one.

**A reply can be correct and still say nothing to the person reading it.**
Naming the *mechanism* is the most valuable move this room makes — *"you were
taught you matter only when you work, so when you can't work you feel you don't
matter"* beats any amount of reflection. It is also the move that degrades in
one specific way: the mechanism has a name in the literature, the name is
shorter than the explanation, and a model reaches for it. *"You are experiencing
internalized instrumentalization"* is the same insight with the person taken
out. Fourteen graders and not one asked whether the sentence lands at 2am in
Lagos.

`jargon` is that grader, and the rule is **not a ban**: no bare term *unless it
is unpacked in the same sentence*. "That's what people call a core belief — a
rule you learned so early it feels like a fact" has done the work and passes; a
grader that refused it would teach the room to stop naming mechanisms, which is
the opposite of the point. It buys a retry and never the authored line: the hold
is plain by construction so it beats an opaque reply on clarity, and generic so
it loses on everything else — an opaque sentence made of *their* words still
carries their words.

Three candidates were cut for colliding with ordinary speech, and the first is
the whole lesson in a Nigerian product: **`conditioning` is what comes out of the
wall.** `projection` is a forecast and `displacement` is what a flood does to a
street. Fifth time this list has given up a word that is jargon *and* ordinary
English, after `make you`, `fit`, `belle` and `\bdon\b`.

**A negative case cannot tell "fits a family" from "fits everybody".**
`earned_worth` was added with an assertion that it does not fire on a
bereavement message — and a mutation widening its predicate to match *every*
message walked straight past it, because the selector tiers and weights, so a
tactic can fit all comers and still lose one message to something else. That is
the failure this file has recorded twice, and neither time was it found by a
negative case: `exact_mirror` making the first reply a template and
`rogers_never_said` answering four of five messages were both found by
**counting**. Check 123 counts, with two bounds — a predicate narrowed until it
matches nothing fails the lower one, widened until it matches everybody fails
the upper.

Counting it also produced a finding about the new move rather than about the
check. Its predicate reaches three of eighty-eight real messages and **loses all
three**, to `iterated_game`, `double_standard` and `ifs_parts` — including "i
have to prove myself every single day at that office or i am not", which is the
conditional-worth rule almost verbatim. The weight is 76 and it is a guess. It
was not raised: tuning a new entry until it beats three established ones, on a
sample of three, so that an assertion written an hour earlier goes green, is
fitting the code to the test, and `exact_mirror` at 90 is what that looks like
after it ships. Whether this move should win there is read by a person in a real
room.

**The router waited for the version many people never write down — twice.**
`intent.ts` already carries a section headed *"Passive ideation counts"*, citing
screening instruments and arguing that "a router that waits for 'kill myself' is
waiting for the version many people never write down". Every pattern under it
then required a first-person present desire — *I want*, *I don't want*, *I wish
I was*. Passive ideation is more often **conditional** than declarative, and none
of that shape was caught: *"If I disappeared tomorrow"*, *"what if I just
disappeared"*, *"sometimes I think about disappearing"*, *"nobody would miss me
if I was gone"*, *"I wish I could just not wake up"*, and *"if i no dey again, e
go better"* all routed to `vent`. Each is a positive item on the C-SSRS's first
category. A correct argument, written down, applied to half the sentences it
covers.

Found by a person reading a screenshot. Nothing here could see it, because
everything here tested the shape its author had in mind — which is this file's
oldest lesson, arriving on the one path where a miss is not a wasted round trip.

The exclusions are the work, and they are the same guard `want to disappear`
already carried: the words are ordinary the moment a destination follows them —
*"disappeared for a week"*, *"gone from that team"*, *"think about disappearing
from that WhatsApp group"* — and the `nobody` pattern requires an absence clause
in the same sentence, so *"nobody would notice if I changed my hair"* is
untouched. Bare **"if I died" is deliberately not gated**: it is ordinary
practical speech about passwords and wills, the clinical reading of somebody
putting their affairs in order is not nothing, and it is written into the
must-not list with its reason rather than left silently absent. Check 26 holds
eleven new catches and ten new false-positive probes, and mutations in *both*
directions fail it.

**The crisis turn was answered in English, whatever they wrote in.** This file
spends more words on register than on anything else — *"answering a Nigerian in
English when they wrote to you in Pidgin is ... the room declining the register
they chose to be honest in"* — and `CRISIS_RESPONSE` was one English string on
six surfaces, with `classification.language` computed on that path and never
read. No grader was ever going to catch it: the crisis path never calls a model,
and `quality.ts` only grades replies that did.

Three seams, and each was invisible from the others. **The reply** had no Pidgin
at all. **The client** imported the constant and rendered that instead of the
`reply` the server sent, so a language-aware server would have changed nothing a
person sees, with every server-side assertion green. And **the two detectors
disagreed**: the crisis list has caught `i wan die` for a while — the sentence it
says it existed for — while `PIDGIN_GRAMMAR`, which decides the reply's language,
read it as English, because `wan` was not in it. Nothing consumed that answer
until the reply became a function of it, so the two could have disagreed for
ever without a surface saying a word. Same shape as the router and the grader
disagreeing about Pidgin before `quality.ts` imported these lists, and here it
would have made the whole repair cosmetic.

`wan`, `comot` and the `e go` family were measured against 310 English strings
before going in and hit zero; `nobody go miss me` is why the subject list is a
construction rather than a bare `go`. Check 124 walks `src` for the constant
rather than trusting a list of files — and found a sixth surface,
`circles/[id]/messages`, that four greps had missed.

**The guard against a foreign hotline was documented twice and covered one
surface.** This file says check 17 "fails any surface that writes the crisis
number out by hand", and check 102's comment says the same thing in the same
words. Check 17 swept `src` for *our* number; the **foreign**-line pattern sat
in check 24 — the prompt-budget check — reading the assembled system prompt and
nothing else. The crisis path never uses the system prompt: it returns
`crisisReply()` before a model is called. So `988` written into
`CRISIS_RESPONSE` itself, or onto the crisis screen, left the suite green. Both
were tried; both passed.

A US hotline is a busy tone from Lagos, handed over at the worst possible
moment, and the thing standing between a person and that was a comment. The
sweep now lives in check 17, over every file under `src`, where the title
already promised it and where somebody looking for it would look — and check
102's comment now says what is true, with what it used to claim left beside it,
because a comment asserting a guarantee that does not exist is the more
dangerous half.

**Agreement is not engagement, and it was the one failure nothing graded.**
`advice` catches telling somebody what to do, `diagnosis` a label for what they
have, `jargon` a word they cannot read, `generic` a phrase that fits anybody —
and *"anyone would feel that way"* passed all of them. It feels supportive,
costs the room nothing, and leaves the person exactly where they were. It also
fails this repository's own test more plainly than anything else in the table:
it is true of every human alive, so the message could be deleted and the
sentence would still stand.

`that must be hard` has been banned for years and reads `/that must be
(hard|difficult|tough)/` — a fixed opener, required — so *"that sounds
incredibly hard"* walked straight past it. **Fourth** time a pattern written the
way its author would phrase it has met text phrased the way a model does, after
`make you`, `\bdon\b` and the journaling row.

**And a third Pidgin detector, carrying the bug the first two had fixed.**
`audit.ts` held `/\b(dey|na|abeg|wetin|don|sabi|wahala|oga|make i|e go)\b/i`
under a comment claiming it was "the same set the grader uses". It was not:
`\bdon\b` with no apostrophe guard, so *"i don't know what to do anymore"* was a
Pidgin message to the nightly job — the failure this file spends three
paragraphs on, in a copy that never heard about the repair.

Not a mislabel. That language becomes `GoldenCase.language`, `quality.ts` grades
the reply against it, and an English reply to an English message came back as
*"answered a Pidgin message in English"* — a **false** finding, in the job whose
proposals reach the prompt through the gate. `audit.ts` already carries the
sentence for why that is worse than a miss, about `containsAdvice`.

It asks `classify` now. And the check that guards it had to be narrowed twice:
a sweep for any regex containing a Nigerian word flagged seven **bilingual
feature detectors** — `depth.ts` catching "i don tire", `scan.ts` catching "i
dey try" — which is what this product wants everywhere. What is banned is the
narrow thing `audit.ts` did: turning a regex test on a message into a language.
Verified in both directions, because a sweep that no longer matches the code it
was written for is a green check over nothing.

**Governance is enforced on the server.** `checkMessage()` runs where the
message is written, because curl walks around a greyed-out button. The UI
mirrors the rules for kindness, never for safety.

**Fail open on the second opinion, closed on the first.** Crisis routing and
the no-advice rules are local, free, and always run. Perspective is a second
opinion: unreachable means pass. A network blip must never mute a room of
people trying to speak.

**A bad reply costs one night; a bad training example costs everybody.** The
SFT pipeline had six quality filters and `gradeReply` was not among them — the
one surface that turns replies into training targets was the one that never
asked the product's own graders, which are deterministic and free. Of 178 real
replies, 16 end mid-sentence, 5 name a condition nobody used and 9 are in the
wrong language; every one was eligible. Fatal and major drop, minor does not,
because that is what the severities already mean. The drop tally is named by
the *grader* — `diagnosis: 5` says what the product is doing, `graded: 9` only
says the filter runs. And the filter it replaced was `checkMessage(reply,
"share")`: the circles rulebook grading private replies, which `quality.ts`
records undoing for itself and never told the pipeline.

**Circle transcripts are never training data.** Confidentiality is a deletion
policy and a training set is its opposite. The pipeline counts circles and
never quotes them. `data/` is gitignored. A nightly backup is the same
opposite, so the export refuses them too — and the rule is *derived from the
sweep* rather than restated: check 112 reads whatever `closeCircle` deletes
and requires the export to exclude it. `NEVER_EXPORT` was a hand-written set
of one, the same shape as the route list and the page list that both turned
out to have holes, and this one guards a promise rather than a status code.

**Derive the list, or the list is the bug.** Four of them in one sweep: the
verification passes named their routes by hand and covered neither the circle
sub-routes nor `/api/profile`; `no-store-verify` listed seven of the eight
pages, missing the circle room itself; the operator-vocabulary regex was kept
"in step by intent rather than by import" and had already drifted a term and
the `i` flag, so lowercase *supabase* passed the one check written to catch it;
and `FULL_SELECT` agreed with `TABLE_CONTRACT.vents` only because somebody kept
typing columns into both. Anything enumerable — routes, pages, handlers,
tables, columns, graders — is read off the filesystem or off the contract, and
what cannot be derived is named as an exemption *with its reason*, because
"not on the list" and "decided against" look identical otherwise.

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
| The turn's verdict, computed not asked for | `src/lib/vent/assess.ts` |
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
| On-device voice mask, one persona per seat | `src/lib/voice/mask.ts` |
| Two storage backends behind one interface | `src/lib/store/` |
| The provider chain, and model discovery | `src/lib/vent/providers.ts` |
| Failure vocabulary, the health probe | `src/lib/vent/model.ts` |

Two skills carry the deeper context and are worth loading before touching
their areas: `.claude/skills/data-quality/` and `.claude/skills/circles-quality/`.

## Traps that cost a debugging session

- **An assertion can defend the bug.** Check 45 exists to stop a truncated
  reply reaching somebody, and it contained
  `ok(wasCutOff("...the next play. If you", false) === false, "a reply that
  never hit the ceiling is never second-guessed")` — the exact fragment from
  its own postmortem, asserted to *ship*, because the ceiling flag was unset.
  The rule it encoded was "truncation only counts when it comes from the
  budget", which is the assumption the whole bug lived inside. A second person
  hit it: 121 characters ending on *"First you"*, stored that way, against a
  600-token ceiling. `readSse` loops until `done` and returns what it has, so
  a dropped connection or a deadline firing mid-stream yields a partial with
  no `finish_reason` at all. 16 of 178 real replies end mid-sentence. The
  question is not *did it hit the ceiling* but *did it say it had finished*,
  and absence is not reassurance. When a check fails after a fix, read the
  assertion before changing the code: it may be the thing that was wrong.
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
- **The route list was still hand-written, and it still had holes.** `/api/notes`
  was added to both passes and the *class* stayed open: neither pass had ever
  reached `/api/circles/[id]/messages`, `/voice` or `/voice/mute`, and
  `/api/profile` — where onboarding writes the chair — was in neither. The
  first run of the new probe found a live one: the voice route answered 501
  with *"Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to open the
  room's voice"*, and `circle-voice.tsx` prints `grant.message` verbatim — so
  somebody tapping the microphone in a circle got three environment variable
  names. The same sentence in the same shape as the lobby's "Circles need
  storage. Run locally or configure Supabase.", on the route next door, and it
  survived that repair because nothing had ever asked this route what it says.
  Check 111 enumerates routes off the filesystem the way check 95 enumerates
  handlers, with exemptions named and their reasons written down — and a stale
  exemption fails too.
- **A third party's error text is not ours to show or to keep.** Three surfaces
  in one sweep, all downstream of one line. `providers.ts` threw
  `${r.status} ${body.slice(0, 300)}` — three hundred characters of an
  arbitrary provider's response, on `Error.message`, the field everything
  reaches for. `classifyModelError` copied it into `detail`, `/api/vent`
  returned `detail` in the 503 body, and `vent-chat.tsx` prints it under the
  reply as `[reason — detail]`. So a person having a bad day was shown an
  upstream error blob, from a request that had just carried their vent, their
  notes and their carve. Two console calls logged it in passing, and
  `embeddings.ts` logged 200 characters of its own upstream body — which that
  fix corrected to a bare status. This sentence used to end "on the one request
  here that sends somebody's words to a third party to be vectorised", and that
  half was **not true**: nothing imports `embeddings.ts`, so there is no such
  request and never has been. See the entry below on prices nothing pays.

  Every comment along that path was right about why it existed. *"Days were
  lost reading 'Network dipped' as a network problem. If the server said why,
  show it"* is true, and `reason` is the server saying why:
  `insufficient_credit` is not a guess, it is what was matched. The body added
  nothing a person could use and everything we do not control — seven providers
  are in that chain and none of them has told us what goes in that string.

  Same repair as `Verdict.reject`, same rule: **make the obvious field the safe
  one.** `.message` is a status and a provider id; the body lives on `.body`,
  which only the classifier names, and the classifier reads it and throws it
  away. `detail` is a status and an error kind — the two things the stdout rule
  allows — and never null, because a bucket with nothing in it is the crime the
  raw text was added to fix. Check 116 asserts the billing and model-not-found
  diagnoses still work from either field, which is the half worth more than the
  leak: that classification is what ended a week-long outage.

- **A caught exception is a user-facing string the moment it is interpolated.**
  `circle-voice.tsx` is the file that already handed somebody three environment
  variable names, and it had a second copy of the same bug one branch over. Its
  catch block is documented at length and correctly about `getUserMedia` — five
  DOMException names, each with a sentence somebody can act on. The `try` it
  belongs to opens four hundred lines earlier and covers
  `import("livekit-client")` and `room.connect(grant.url, grant.token)`, neither
  of which throws a DOMException, so both fell past the five names into
  `Couldn't reach the voice room. ${message}` — and a LiveKit connection failure
  names the URL it could not reach. The log was the mirror image: guarded on
  `if (name)`, so the microphone cases were recorded and the connection ones
  were not. The diagnostic went to the person and the person's sentence went
  nowhere.

  Check 115 scans it as a class — every named `catch` in `src`, following what
  the caught error flows into rather than grepping for `e.message`, because the
  leak was two assignments away. Scanning only `.tsx` found **one** named catch
  block in the whole component tree: the one just fixed, which is a check whose
  entire sample is its own bug. Widened to `.ts`, with `message:` as a sink
  because a route's `message` is printed verbatim by every component here, it
  found a second live one immediately — `voice/mute/route.ts` answering 502
  with `The voice server did not accept that: ${message}`, where
  `mutePublishedTrack` is called with the room name and an identity and its
  failures quote them. The room name is derived from the circle id. A circle's
  promise is that the room is sealed, and the error path was the one surface
  reading part of it back.

- **A new route ships into neither live pass unless you put it there.** The
  two verification passes name their routes by hand — `no-store-verify`'s wire
  sweep and `live-verify`'s checks — so a route added on Tuesday is covered by
  nothing on Wednesday and nobody notices, because both passes still report
  green. `/api/notes` went out that way: the surface whose entire job is
  showing somebody what a machine holds about them and letting them delete it,
  verified in zero of twenty-seven checks, by the person who wrote the section
  of this file about exactly that.
- **`drop function if exists` drops nothing when the signature moved.** 0016
  named the four-argument `match_memories` that 0006 created; 0014 had already
  replaced it with a three-argument one, so both drop lines matched nothing and
  said nothing — and applying it would have dropped `memories` out from under a
  surviving function, which is the broken object the migration's own comment
  says it is avoiding. Drop by name, looping over `pg_proc`. Check 108 fails
  any migration that names an argument list, and separately asserts 0016 still
  drops the function, because passing by deleting the drop is worse than the
  bug.
- **A green tick can mean the job did nothing.** `backup.yml` and `audit.yml`
  both skip rather than fail when their secrets are missing, which is right —
  a red cross every morning trains people to ignore red crosses. What it left
  behind was fourteen successful backups that took no copy and fifteen
  successful audits that read no reply, each six to ten seconds long. Both now
  write a `$GITHUB_STEP_SUMMARY` naming what is unset and what did not happen.
  A skip is only honest if it is legible where somebody looks.
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

Crisis, factual, greeting and meta are answered locally, for free. The eval
suite, both pipelines and the heartbeat make **zero** model calls by
construction — if a change to them needs one, the change is wrong.

**"Most messages never reach a model" was the sentence here, and production
says otherwise.** Of 186 stored turns: 178 vents, 5 greetings, 2 crisis, 1
meta. The free paths took **4.3%**. The routing is still right — a greeting
must not cost a model call and a crisis must never reach one — but it is a
safety and dignity mechanism, not an economic one, and a plan for scale built
on "most messages are free" is built on a number that is not true.

So the honest per-message cost is the per-vent cost, and it is bounded rather
than estimated: check 24 caps the system prompt at **3,600 tokens**, and
`MAX_TOKENS` caps the reply at **600** — about 4,200 a turn, plus one Carver
call per session (`CARVE_MAX_TOKENS`, derived) and one extra full call on
whatever share the failsafe rejects. Multiply by the traffic you expect before
choosing a provider, and remember which one is answering: production currently
falls through Anthropic on `insufficient_credit` and lands on Gemini Flash.

**About 1,574 of those tokens are the same tokens every time, and they were
uncacheable by construction.** Prefix caching matches on a literal prefix.
`groundingBlock` sat at byte 0 of every system prompt this product has ever
sent, and it carries `Current time` to the minute and `ISO` to the
millisecond — so the longest prefix any two requests have ever shared, from
anybody, on any day, is about twenty-five tokens. The constitution sat
immediately behind a timestamp and was re-read and re-billed on every turn.
Moving one line fixed it: `STABLE_PREFIX` is `VOICE` plus `OFFICE_RULES`,
neither of which interpolates anything but a module constant, and the clock now
sits with the other volatile facts two-thirds down. It clears Sonnet's
1,024-token floor and not Haiku's 2,048 — so a model switch turns this off
silently rather than breaking it, which is the right failure and an invisible
one.

**And it is invisible that is the point.** Every other failure in this file
announces itself somewhere — a status code, a missing sentence, a red check, a
line in a log that survives an hour. This one has no surface at all. The reply
is correct, the suite is green, the audit sees nothing, and the only witness is
a bill that arrives a month later with no breakdown. There was never going to
be a moment where somebody noticed. So the rule for anything whose whole value
is that two strings are identical: **assert the identity, over inputs that vary
what the strings are made of** — check 114 builds two prompts a year and a
language apart and requires both to start with the same bytes. A comment saying
the prefix is stable is worth nothing here, because a comment is exactly as
green as the bug.

It caught its own author on the first run, twice. `STABLE_PREFIX` was built with
`join("\n")` and the builder used `.filter(Boolean).join("\n")` — one byte, and
the prefix matched nothing. Then the mutation pass: deleting the `startsWith`
guard — the one line standing between this and a *corrupted* system prompt —
left the suite green, because the non-prefix in the assertion was twelve
characters and returned on the length floor two lines above the guard it was
written to test. The wrong-window probe again, in the check written about
invisible failures.

**And the reason the first of those was possible: the array said one thing and
the join did another.** The prompt was assembled from a list with `""` written
between the sections, which reads as a blank-line separator and is removed by
`filter(Boolean)` before `join` ever sees it. So the delimiter each section
actually got was whatever its own template literal happened to end with — a
block closing on a newline got a blank line, a block closing on a full stop did
not. Seven of twelve headings separated, five sitting on the previous sentence,
`THE OFFICE` landing on "...is the reason people quit." Nobody typed it wrong;
eighteen entries that do nothing sat in the file that decides what every reply
is made of, and read as if they did. `sections()` now does the join, the dead
entries are gone, and check 114 asserts the blank line on the built prompt
rather than on the joiner — because the joiner was never the part that was
wrong.

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

**And there is a third, which this file named as uncovered and which is now
covered too.** *"No suite here has ever run a store that exists and fails"* —
the sentence in the `?carve=1` section, about the two shapes a first Supabase
deployment passes through: `42501` before the GRANTs land, `42703` before 0011
does. Neither has a store of `null`, so `no-store-verify` cannot reach them.
`scripts/broken-store.mjs` is a PostgREST-shaped server that refuses
everything, and because `hasStore` is only `supabaseUrl && serviceKey` and the
URL check accepts `http:`, pointing the app at it gives a **real**
`SupabaseStore` making real requests to a database that says no. Nothing inside
the product is stubbed, which is the point: these bugs live in the seam between
a store call and the handler around it, and a fake below the adapter tests
neither side of it.

Three on the first run. `POST /api/feedback` and `POST /api/profile` both
answered **500 with an empty body** — an unhandled throw, which is the worst
answer available, because the client has nothing to branch on and its honest
branch has nothing to be honest with. Feedback's was
`countFeedbackSince`, the rate-limiter read, sitting *one line above* a try
block whose own comment describes this exact failure and fixes the write below
it; profile's was `ensureUser`, so onboarding — where the chair is written —
failed silently. And `/api/heartbeat` answered 503 carrying Postgres's
`message` and `hint` verbatim, on a route with no token whose own doc comment
reads *"Counts only. Never content. That is what makes it safe to leave open."*
The justification for leaving it open was true of every branch but the one
nobody had run.

Check 118 derives the rule rather than listing it: every route calling
`getStore()` wraps every handler it *exports* in `withStore`, or is named with
the reason it does not. Reading the file for the word `withStore` is not
enough and was the first version — deleting the wrapped export left the suite
green, because the import line still said it.

**And a fourth shape, because the third still could not reach the bug it was
named after.** With every request refused, a route dies at `findUserId` and
never calls `setCarve` at all — so the one store method that reports by
*returning false* rather than throwing still had no test, and `FORGET_FAILED`
was still dead code. `--fail-methods PATCH,POST,PUT,DELETE` is `GRANT SELECT`
without `GRANT UPDATE`: an ordinary half-applied migration. Reads succeed, the
update is refused with `42703`, and the route answers `deleted: 0` with
`had: true` — the shape its own comment calls honest and describes as
unreachable. It is reachable now, and asserted.

Getting there took two probes that could not see what they were looking at,
in a file about probes that cannot see what they are looking at. First the stub
returned no carve, so the route short-circuited on "nothing to delete" and
answered a true sentence about a different question. Then it returned `[]` for
list reads — but `maybeSingle()` does not send `Accept: vnd.pgrst.object+json`,
that is `single()`; it asks for an array and resolves 0-or-1 itself. So
`findUserId` was null, the shape booted, the health probe went green on seven
of eight tables, and the thing it was built to reach was never reached.

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

**And the field a repair skips is the one that looked already handled.**
`completeOnboarding` read `r.tension` and let the rest of the onboarding
answers fall out of scope. That was found and fixed for `object`, `carry` and
`drop` — and not for the chair, because `r.tension` is *derived* from the
chair two lines up, so the number survived and the choice did not. Production:
`chair_picked` null on all 186 vents, set for one user of eight. The chain
this product calls chair → tension → drop had only ever recorded the middle
term, and the training pipeline's `[CHAIR:x]` tag has never once fired. Check
109 asserts the whole shape rather than the missed field: every answer
`OnboardingResult` carries must reach the vent, with `tension` named as a
deliberate exemption because it travels as `tension_before` instead.

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

**And a plural is a number.** The chat's sticky header — the one line that says
what the room holds about somebody — read *"Remembers · 4 earlier carves"*. A
carve is `vent_users.carve`: one text column, added by 0011, read by
`getCarve(userId): Promise<string | null>`, rendered on the Memory page as a
single sentence. **One per person, ever.** There is no shape of this product in
which a second one exists, so every number that line has shown above 1 was a
count of something else wearing the word — and somebody who read it and tapped
through to Memory found one sentence or none.

Nothing upstream was wrong, which is why a hundred and twenty-five checks, four
deployment shapes and fourteen graders all walked past it. `memoryUsed` is
`history.length`; `history` is `selectMemory(recent, MEMORY_TURNS)` — their own
vents, filtered, capped at six, exactly what went into the prompt. Honest
number, borrowed noun. The bug was the last two words, sitting two lines above
*"Not saved — this session only"*, a sentence this repo defends at length for
being scrupulously true.

Check 126 derives the noun set instead of holding one: a holding is one per
person when it is `get<Noun>(userId, …)` returning something that is not an
array. The three it excludes are what make it usable — `getHeld` and
`getBreaking` return arrays, and `getCircle` is scalar but keyed by a *circle*
id, so "circles" is the whole lobby. A rule of "scalar getter, never plural"
would have flagged it and been deleted within a week; the `userId` key is what
makes the claim true.

**And the guard against an empty derivation nearly re-made the bug it guards.**
The first version proved the parse worked with `onePerPerson.includes("carve")`.
A mutation then changed the *contract* — `getCarve` to `Promise<string[]>` — and
the check went **red**, when the only correct answer is green: if the store
really could hold several, "carves" is a true word and no check has business
objecting to it. Naming the noun turned a rule about the contract into an
assertion about today's contract, in the check whose own comment says a list of
nouns is the bug. What holds instead has no noun and no integer in it: every
`get<Noun>(userId, …)` must land in exactly one bucket and the array bucket must
not be empty, so a contract that legitimately changes moves both sides together
and stays green. CLAUDE.md's oldest trap — *an assertion can defend the bug* —
found inside the guard written against it.

**And a price nobody pays is a plan wearing the word cost.** `embeddings.ts` is
86 lines, exports `embed()`, and is imported by **nothing** in this repository.
Its own doc comment says *"the caller stores what it has"* about a caller that
does not exist. Dead code is worth a line; what made it worth a check is that
two places a person goes for exactly this question said the opposite.
`orchestrator.ts` priced the MEMORY stage's semantic recall at *"one embedding
call on the surfaces that use it"*, implying surfaces. This file called it *"the
one request here that sends somebody's words to a third party to be
vectorised"* — present tense, inside a paragraph about a real leak. So the
repository's answer to *what leaves this machine* was wrong, and its answer to
*is there an approved path for semantic memory* was yes.

The loaded half is the destination. `memories.user_id` is `uuid not null
references auth.users(id)` (0006) and every RLS policy on that table is
`auth.uid() = user_id`. Anonymous venters are not in that id space — which is
the entire finding of 0011, where the carve was moved to `vent_users.carve` for
this exact reason. So wiring `embed()` today buys one Gemini call per vent **and
a foreign-key rejection per vent**, silently, for ever: the per-message cost
doubles and not one row lands. The credit arithmetic above — "about 4,200 a
turn" — goes wrong the moment somebody adds the import, and nothing would have
said so.

Check 127 is therefore written forward rather than as an epitaph. `StageCost` is
read off the type; every price must be paid by a stage or named in
`UNPAID_COSTS` with its reason, and never both. The transition is the point: the
day `embed()` acquires an importer the build fails until a stage carries its
price *and* a migration has moved `memories` off `auth.users`. Not a check
standing in front of a feature — the feature's first two steps, written where
the next person will be standing.

**And the check that holds all of this counted comments as distance.** Check 48
is the gate on this file's second recurring mechanism — *did this wait for the
thing, and did it read what came back?* It scans **30 lines** back from a claim
for the request it reports on, and `if (!fetch) return` reads anything further
as *nothing was asked*. Three of the eight claims standing downstream of a
request were further than that, and every one of them is comfortably inside 30
lines of **code**:

| the claim | lines up | of those, code |
| --- | --- | --- |
| *"Thank you. Na so we dey improve."* | 52 | 22 |
| *"Deleted."* | 36 | 20 |
| *"All cleared. Fresh start."* | 73 | 24 |

What pushed them out was prose. At `history-list.tsx:330`, **49 of those 73
lines are the comment explaining the anon-id bug** — the explanation that makes
the wipe trustworthy is what hid it from the check written to hold it. The
better the postmortem, the blinder the check that depends on it, in the
repository whose defining discipline is long postmortems.

The first row is the sharpest. That is the thank-you whose postmortem check 48
was written *from*, and check 48 has never once looked at it; only check 74, by
name, ever did. An instance is not a class — and the check's own closing note
saw the symptom without the cause: *"the sharpest instance, asserted by name,
because a heuristic above should never be the only thing holding the worst
case."* The heuristic was not weak on the wipe. It could not see the wipe.

Two repairs, and the second was only findable once the first landed. The window
now counts code, comments blanked rather than deleted so line numbers still name
the real file — check 103's trick, for check 103's reason. And with all eight
sites finally visible, `/\.ok\b/` and `/\bstatus\b/` turned out to be accepted
as sufficient *reads*, which is the precise half-measure the feedback
postmortem names: **it read the status and never read the body.** Measured
before removing: of the eight, **zero** are saved only by the status. Gone, with
`persisted` added to the field list because that is what the feedback client
correctly reads.

**Every site was already correct, which is what made this dangerous.** Widening
the window exposed no bug and fixed no sentence, so narrowing it back would have
broken nothing, failed nothing, and silently un-covered the thank-you, the
delete and the wipe — a check passing by not looking, the failure this file
opens with. So the window is pinned by the *difference it makes*: the two
windows are run against each other over the real tree and counting code must
examine strictly more claims than counting lines. Eight against five. The first
attempt at that assertion was a slack bound — "a request within 60 lines must be
examined" — and it was wrong in the way this file keeps recording: at 60 a claim
borrows the `fetch` of an unrelated function further up, which is the exact
over-reach the 30-line bound was chosen to avoid.

**And underneath all of it, the suite had four answers to what a comment is.**
`strip` was written out by hand **fourteen times**, identically, inside fourteen
different checks, and its line-comment half appeared in four forms across sixty-
one uses. Two of them spare a URL and two truncate it — and **54 of the 61 were
the truncating kind**. `const ENDPOINT = "https://…"` becomes `const ENDPOINT =
"https: `, and everything after it on that line is gone before any assertion
reads it.

Nothing was blind because of it *today*: `providers.ts` is the only stripped
source carrying URLs, and the two spans that slice it both start after the six
endpoint lines. That is luck with a short shelf life, and it is the `\bdon\b`
shape again — not a regex that matches nothing, but one that matches too much,
in the one place where matching too much means the check never fires. The other
two forms have the opposite fault: anchored to line start, so every **trailing**
note survives stripping and its prose stays in the text being scanned, where a
`// data.saved` at the end of a line can satisfy a positive assertion on its own.
Neither rule was a superset of the other. That is this repository's most-repeated
finding, wearing the suite's own clothes.

One rule now, at the top where a decision is visible: a comment's slashes open a
line or follow whitespace. A URL's follow a colon, a protocol-relative one
follows a quote. All 54 repaired, all 14 copies deleted, and the suite stayed
green through every step — which is the honest result, not a vindication.

**Three attempts to count the damage were wrong before one was right**, each
wrong in a way that looked right, and that is the part worth keeping. The first
classifier tested for `^` in the pattern source and read the `^` inside `[^\n]`
as an anchor, so it called the dangerous form safe and reported **1** offender
instead of 54. The second ran a behavioural probe whose survivor sat on the
*next* line, where the damage never reaches — it reported **0**. Only the third
put the survivor on the same line as the URL. *Classify a regex by what it does,
never by what it looks like*, and put the probe where the damage is: the same
lesson as the HEAD request that could not carry its own error, arrived at three
times in ten minutes on the question of what a comment is.

Check 128 therefore judges the **pattern**, not the `.replace` pair. Its first
version read pattern and replacement together and so excluded every stripper
whose replacement is a *function* — which is not hypothetical: `blankComments`,
written an hour earlier for check 48, is exactly that shape and was still
holding the anchored rule. The check written to abolish second opinions about
comments could not see one of them.
