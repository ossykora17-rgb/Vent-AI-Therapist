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

`npm run gate` is the only **dependency-free** opinion about whether a change
is safe. It has zero dependencies, so a fresh `git worktree` runs the whole
suite with no `npm install`. Keep it that way.

**That sentence was false until check 146 was written, and it is the oldest
shape in this file arriving in its own first paragraph.** A fresh worktree died
on `ERR_MODULE_NOT_FOUND` before a single check ran: `research.ts` imports
`@anthropic-ai/sdk` statically and `eval.mjs` loads it at the top. Verified
across four commits, two of them older than the change that found it — the
property had been false for as long as that import existed. It looked fine from
everywhere anybody stands, because `node_modules` was simply there. *The suite
tests the shape its author is standing in*, and the author always has an
install; the one person it was written for — somebody handed a finding and the
`git worktree add` line the heartbeat prints next to it — is the one person who
could not run it.

Exactly one package was missing, measured by resolving every bare specifier the
suite reaches and printing what failed. `app-imports.mjs` resolves a package for
real and stubs only what is absent, so an installed repository behaves exactly
as it always did. **The stub throws on use**, because a silent one would let a
check that reached for a model see a no-op and report green — a check passing by
not looking, in the file that decides what every other check can see. And the
footer names what it ran without, so a worktree run is legible rather than
merely green, while an installed run appends nothing and stays byte-identical to
what check 131 grades.

The alternative was making `research.ts` import lazily, which is the lesson
check 141 enforces on `audit.mjs`. Not taken: `research()` is awaited on the
path a person is waiting on, so a dynamic import buys a first-call cost on the
vent route to fix a property of the test harness — and the loader covers the
next static importer as well as the one that exists today.

**It is not the only opinion, and this sentence used to say it was.** CI also
runs `npm run lint`, `npx tsc --noEmit` and `next build`, and the gate runs
none of the three — it cannot, because every one of them is an install and
the zero-dependency property is the point. So a green gate and a red CI is a
normal outcome, not a contradiction, and it happened on the commit that
corrected this paragraph: `prefer-const` on a `let` the gate has no opinion
about.

Run `npm run lint` and `npx tsc --noEmit` before pushing. The gate now names
the three steps it did not take instead of saying "the diff may be merged" —
a line that grants permission has to be as honest as a refusal, which is the
rule this file opens with, arriving at the sentence that hands out merges.

And keep it unable to pass by not running. It used to exit **0** without
running anything when the local store had no new rows — which on a fresh
checkout is always, because `.data/` is gitignored. Clone, run the one command
this file says to trust, get a green exit, merge. Every early `process.exit(0)`
in `heartbeat-data.mjs` must be guarded on `!GATE`, and check 98 asserts it for
each one it finds rather than for a list.

## Standing accountability rules

These apply to every session, with no exceptions, and they outrank any
tendency to sound confident, complete, or helpful when the evidence is
incomplete. Violating one is a failure, not a style note.

They are not a new idea in this file — they are the general case of it. Every
postmortem below is a claim that was made before its evidence arrived: a
health probe reporting `ok` from an identity that does no work, a thank-you
printed for a rating that was dropped, a number typed beside a table instead
of read off it, a SHA remembered instead of fetched. The rules are what those
findings look like stated forward instead of as epitaphs.

1. NEVER declare a task done, finished, complete, or successful unless you
   have produced the actual artifact (file contents, full diff, command
   output, test results, or equivalent tangible deliverable). Plans,
   intentions, "I would…", "this should work", or "looks correct on first
   read" are not results. If you cannot produce the artifact, stop and say so.
2. Every non-trivial claim about code, numbers, file state, sources, behavior,
   or correctness MUST be accompanied by a fingerprint. Acceptable
   fingerprints: exact file path + line range, exact shell command + its full
   output, git diff / patch, hash, or direct quotation with source. No
   fingerprint → do not make the claim. Invented, approximated, or remembered
   numbers/content are forbidden.
3. If any required input, file, check, test, dependency, version, or
   acceptance criterion is missing or unavailable, HALT. Report the exact
   blocker. Do not invent, fill gaps, approximate, substitute, or proceed with
   a "close enough" solution.
4. Treat the user's framing, assumptions, and stated goals as hypotheses, not
   ground truth. Cross-check against the actual files, code, and evidence.
   Surface any contradiction explicitly before continuing.
5. Never silently substitute. If a required library, API, approach, version,
   tool, or constraint cannot be met, stop and report. Do not swap in an
   alternative without explicit user confirmation.
6. Preserve and re-state every early constraint, rule, acceptance criterion,
   and requirement given in this conversation or in CLAUDE.md before producing
   final output on long or multi-step tasks. Dropping or quietly weakening any
   of them is a failure.
7. For any quantitative claim (counts, sizes, timings, scores, percentages,
   line numbers, etc.) show the exact measurement method or calculation. No
   invented numbers.
8. When referencing real sources, quote or link the precise relevant passage.
   Do not paraphrase into content that is not present in the source.
9. One primary job per chat/context. If the scope expands beyond the original
   request, explicitly flag it and obtain confirmation before continuing. Do
   not silently absorb extra work.
10. Prefer the actual project files over any pasted extracts or summaries. If
    only extracts are provided, treat the information as incomplete and state
    that limitation.
11. Final output on any non-trivial task MUST end with a short "Verification
    Checklist" that lists: the exact fingerprints produced; the checks / tests
    / commands that were run (or explicitly state which ones could not be run
    and why); confirmation that no constraints were dropped or substituted;
    any remaining blockers or open questions.

Do not fill gaps with plausible-looking content. Do not treat a plan as a
result. Do not treat the user's framing as verified fact. Do not produce
"fake-done" work that survives a first read but lacks evidence. If you are
uncertain, say so and show what evidence is missing.

**The one that has already been violated in this repository is rule 2, and it
is worth naming so it is not learnt twice.** A merge was attempted with a
forty-character `expectedHeadSha` built from a seven-character short SHA and
thirty-three invented hex characters. GitHub refused it twice with 409. The
real value was one API call away and had never been fetched. Nothing was
damaged, because the remote checked — which is the only reason the failure was
visible at all, and exactly the position every unfingerprinted claim in this
file was in before it cost something.

**It was learnt twice.** PR #217 was merged after a 409 on
`126c1331e37ae1fc3f4b19f11d0d3e8b3a4a3f37` — first eight characters real, the
remaining thirty-two invented, against a true head of
`126c1331a9af18b2824664c3792fda262a958469`. The paragraph above was written to
stop exactly this and did not, because a remembered prefix *feels* like a
fingerprint: it matches the first thing you check. The rule is not "start from
the real SHA", it is **fetch the whole value at the moment you use it** — and
the tell is that the merge tool never needs a SHA you typed, only one an API
returned. Nothing was damaged again, and again the only reason is that the
remote checks. Two of this file's findings are now about the same field.

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
| What a proposed rule did to the corpus, measured | `src/lib/vent/fitness.ts` |
| Intent routing, crisis, meta-vs-vent, injection | `src/lib/vent/intent.ts` |
| The turn's verdict, computed not asked for | `src/lib/vent/assess.ts` |
| 36 tactics, 3-turn block, body asked about, never instructed | `src/lib/vent/tactics.ts` |
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
and cached a day, so it is **ten calls a day per running instance** rather than
one per message. The audit runs the free deterministic graders first and only
asks a model about replies that broke *no* stated rule and are still flat —
one call, ten samples, and none at all on a night with nothing flat.

**That last sentence was false, and it was stated in four places.** The doc
comment on `flatReplies` opens *"Replies that broke nothing and still went
nowhere"*, the caller prints the result as `flat, unbroken`, the block directly
above that call argues the case — *"the grader that fired already names the
rule the product states; adding an instruction telling the model to obey a rule
it was already given is how a prompt doubles in size while nothing improves"* —
and this paragraph said it too. `knownProblems` was computed one line up,
printed, and **never subtracted**. Four statements of a rule and no
implementation of it, which is the typed `0 model calls` again: an intention
where an outcome belongs.

Measured on a four-row sample carrying one clean reply: **3 broke a rule, 3
were flat, and all 3 of the flat ones were the convicted ones.** Genuinely
unbroken-and-flat: **zero**. So the billed call's whole payload was replies the
free deterministic graders had already judged, and the right number of calls
that night was none — which is what it now prints. Worse than the money: the
prompt sent with them asks for a *new rule*, so the one path that reaches the
live prompt was being fed defects that already have names.

`broke` is a **required positional parameter** now — every call site fails to
compile until it says what was convicted. That is CLAUDE.md's "make the obvious
field the safe one" applied to an argument, and it is still not enough on its
own, because a required argument can be fed `[]`. So the behaviour is asserted
as well as the signature, and separately the **caller** is read off
`scripts/audit.mjs` to prove it passes `known` rather than something that
type-checks. Three mutations fail it: drop the filter, pass `[]`, and make the
probe row one that was never a candidate — the last because a probe that proves
nothing is how the first two would have looked green.

**And the loop this feeds has never once run.** `audit.yml` gates on
`VENT_BACKUP_TOKEN` and `VENT_BASE_URL` and `exit 0`s when either is unset.
Both are unset: production answers `backups: "off"`. **21 of 21 scheduled runs
report success, every one of them 7 to 11 seconds long**, and
`LEARNED_RULES: readonly LearnedRule[] = []` in `learned.ts` is the other end of
the same pipe. The workflow's own step summary says so — *"This job is the only
thing that grades the replies real people actually received"* — which is the
honest skip this file already argued for, and it has been true every night
since. The machinery is correct and has been fed nothing; both secrets are the
whole difference.

**Both secrets have since been set, and this paragraph is history.** The loop
has run nightly since run 29 — *"The loop's first real run reached
production"*, further down, is where it starts. The paragraph stays because it
is true of the nights it describes; this line is here because a sentence this
confident, this high up, was quoted as current a month later.

**That sentence said "for the whole userbase", and the cache one file over
says otherwise in its own header:** *"In production the disk is ephemeral, so
it degrades to an in-process Map — still useful (one lambda serves many
requests), and honest about being per-instance rather than shared."* Honest in
the module, and not carried into the paragraph doing the arithmetic. Ten a day
for the userbase is ten a day *per lambda*, and on a product with eight people
almost every request is a cold start — which is the "one per message" the
sentence was written to deny.

**The half that cost something was worse, and it was in `cached()` itself:
only successes were ever written.** A `null` stored nothing, so an upstream
that is *down* — a dead key, an exhausted quota, a refusal — was asked again by
the very next request, for ever, by the cache whose entire job is to stop that.
Production *was* in exactly that state: `ANTHROPIC_API_KEY` set and out of
credit, so every vent paid a doomed round trip **inline, before the reply**,
for a second opinion the module's own header says the room must not depend on.

**The credit landed on 2026-09-13 and the fix is what makes that boring.**
`/api/health` now answers `answeredBy: "anthropic"`, `tried: [{anthropic:
ok}]`, `skipped: []`. The failure-caching repair is the reason this paragraph
is history rather than a live cost: an upstream that goes down again is asked
once per five-minute window instead of once per vent, whether or not anybody
notices. Do not read the balance as the fix.

**And it had no deadline.** `PROVIDER_DEADLINE_MS` is 50s, model discovery 15s,
`embeddings.ts` 15s, and all four windows in `sources.ts` list
`AbortSignal.timeout(3_000)` among the file's rules. `research()` is awaited in
`api/vent/route.ts` *before* the model is called, so its latency is the person's
latency, against an SDK default of ten minutes. The comment beside that await
reads *"the reply is unaffected either way"* — true of the reply's **content**,
and silent about the one dimension a hanging upstream touches.

**This paragraph said "the only outbound call here that did not", and that was
wrong.** There was a second, and it was the worse one: the **Anthropic
adapter** in `providers.ts` — the primary provider, on the path a person is
actually waiting on. `ProviderCall` declares `deadlineMs`, the
OpenAI-compatible adapter honours it as `AbortSignal.timeout(call.deadlineMs ??
PROVIDER_DEADLINE_MS)`, and `send()` in the Anthropic adapter never
destructured it. Both branches — the stream and the plain `create` — ran on the
SDK's ten-minute default with its own retries.

Found by tightening the check, not by reading. Check 130's sweep asked whether
an outbound *file* carried a deadline anywhere, and `providers.ts` carries two —
on model discovery and on the OpenAI-compatible chat call — so it passed while
the third call site in the same file had none. **One bounded call was vouching
for its unbounded neighbours.** The sweep counts call sites now, and the
granularity is pinned by the difference it makes on the real tree, because every
site is bounded today and reverting to per-file would break nothing, fail
nothing, and silently un-cover the primary provider again.

Check 130 exercises the cache rather than asserting about it, in a subprocess
with `VENT_DATA_DIR` pointed at a scratch directory, because a suite that
writes to `.data/external.json` pollutes the heartbeat that reads it. And the
deadline is swept over every outbound call in `src/lib` rather than named on
the one that was missing — with a relative `fetch("/api/vent")` deliberately
out of the class, because the first version flagged `anon.ts`, the browser's
offline queue posting to our own origin. Whether a queue flush wants a deadline
is a real question and a different one; answering it there would have been a
rule invented to make a sweep go green.

Crisis, factual, greeting and meta are answered locally, for free. The eval
suite, both pipelines and the heartbeat make **zero** model calls by
construction — if a change to them needs one, the change is wrong.

**And that zero was a string literal.** The suite's footer read
`… assertions · 0 tokens · 0 model calls`. The assertion count is computed; the
two numbers beside it were typed, and they are the numbers this entire section
rests on. "By construction" was an argument about how checks are written, and
nothing enforced it — the suite imports the real product, `research.ts` is
loaded at the top of `eval.mjs`, and `research()` makes a paid Anthropic web
search. A check that called it, or `generateReply`, or `embed`, would have spent
real money on every gate run and printed `0 model calls` underneath. Second
mechanism, in the one place that reports on the interface: **an intention
instead of an outcome.**

It is metered now. `globalThis.fetch` is wrapped before any check runs, anything
leaving the process that is not the live server under test is recorded and
printed, and a run that spent anything **exits non-zero whatever the checks
said**. On a clean run the footer is byte-identical to what it always said,
which is the point: the sentence stopped being a promise and became a
measurement without changing.

Two limits, stated rather than papered over: a provider SDK bypassing
`globalThis.fetch` would not be seen (the ones here do not), and a subprocess
has its own `fetch`, so the pipelines and the heartbeat are outside this count.

**The mutation that escaped is the lesson.** Four of five caught. The fifth
rewrote the meter so an empty `BASE` — which is every ordinary gate run —
whitelists the entire internet, and the check passed, because the check had
**re-implemented the predicate** two lines above the assertions instead of
calling the one the meter uses. *A suite that checks its own copy passes while
the thing regresses*: the oldest rule in this file, broken inside the check
written to stop a typed number, by the person who had just quoted it twice that
hour. `countsAsSpend` is one function now, the check grades that function, and a
sixth mutation asserts the meter still calls it — because a correct predicate
nothing calls is the shape of half the findings here.

**And the meter's first CI run failed the gate, correctly.** Green locally,
red on the runner:

```
142/142 PASS · 3973 assertions · 1 OUTBOUND CALL —
  http://127.0.0.1:9/twirp/livekit.RoomService/DeleteRoom
```

The suite really does issue a LiveKit `DeleteRoom` while exercising the circle
close. It is deliberate and it is fine: `heartbeat.yml` sets
`LIVEKIT_URL: ws://127.0.0.1:9` with dummy credentials so the voice routes take
their *configured* branch against the discard port — the "verify both deployment
shapes" discipline doing its job. It never leaves the machine and costs nothing.

So the meter was too broad, not the suite wrong: **loopback is not spend.** The
predicate now exempts `127.0.0.1`, `localhost` and `[::1]` on any scheme and
port, anchored so `https://127.0.0.1.evil.example` is still counted. The trade
is stated rather than hidden — a check talking to a model server on localhost
would not be caught — because the class being guarded is money leaving the
account, and nothing on loopback can do that.

Two things worth keeping from it. The first is that **this is the shape the
whole file is about, arriving in the meter's favour**: a rule written from where
its author was standing, correct there, wrong one deployment shape over. The
local run had no `LIVEKIT_*` set, so the branch never ran. Reproducing it needed
the workflow's own three environment variables and nothing else.

The second is smaller and worth writing down anyway, since nothing else records
it: the suite sends a genuine destructive `DeleteRoom`. Harmless against port 9.
If `LIVEKIT_URL` in CI ever pointed at a real SFU, the suite would be deleting
rooms on it.

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
choosing a provider, and remember which one is answering. That sentence used
to end "production currently falls through Anthropic on `insufficient_credit`
and lands on Gemini Flash", and it is **no longer true**: credit landed on
2026-09-13 and `/api/health` reports Anthropic answering `claude-sonnet-5` with
nothing skipped. The arithmetic above is therefore Sonnet 5's — $2 per million
in, $10 per million out — which on the 178 vents production took in a month is
about **$2.50**. The chain still has Gemini, Groq and OpenRouter behind it with
keys present, so the fallthrough remains a real path and not a hypothetical.

Check the endpoint rather than this paragraph. A balance is a fact about a
moment, and this file's whole discipline is that a moment written down as a
present tense goes stale without announcing it.

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

**`acceptable()` was a spelling check standing where a fitness function
belongs.** `--apply` merged whatever the nightly model proposed, as long as the
rule was short enough, concrete enough and did not reopen a house rule. Nothing
anywhere asked whether it made a single reply better — so a rule reached
everybody who uses this on the strength of a model's opinion of its own output,
which is the failure mode of asking a model what it did wrong. Every published
version of reflective prompt evolution has a scorer in that slot: the
reflection proposes and the *score* decides. A generation with no score is a
random walk with a changelog, which is the drift `learned.ts` opens by
describing and had no defence against.

Every candidate is now answered twice on twelve held-out cases — same model,
same minute, same cases, once with the rule in the prompt and once without —
and `isImprovement` refuses anything that is not a **Pareto improvement across
every grader**. Not an average: a rule that removes four `jargon` findings and
introduces one `diagnosis` has a better total and is a strictly worse product,
because a clinical label is not something a person can un-hear. Summing first
and judging second is exactly how four small wins buy one of those.

**Held-out is the load-bearing word.** The candidate was proposed from flat
production replies, so measuring it on those same replies is fitting the rule
to its own sample — `earned_worth` weighted on a sample of three, already paid
for once. The authored corpus is the set the rule has never seen. Sampled by
position rather than the first twelve, because the first twelve rows of a
hand-written file are twelve rows one person wrote in one sitting.

**And `prune` keeps the frontier instead of the queue.** Three slots ranked by
recency is a list that forgets its best rule the moment a fourth arrives. An
unscored rule ranks as zero, which is the load-bearing default: proven beats
assumed, assumed beats a regression, recency is the tie-break rather than the
rank — so with nothing scored it returns exactly what it always returned, and
the existing assertion stayed green without being touched.

**What it cannot do is remove the sampler, and that is stated rather than
glossed.** `providers.ts` records that non-default sampling parameters are a
**400** on this model — "not a degraded reply, a refused request" — so
temperature cannot be pinned and two identical prompts do not give two
identical replies. Some of every delta is noise and the only lever is more
cases. That is survivable in exactly one direction, which is why the test is
dominance: noise mostly produces a **false refusal**, costing a re-run, while a
false accept costs one neutral rule in one of three slots, in a diff the gate
runs against and a person reads. The asymmetry is the design, not an accident
of it.

The measurement is paid, so it lives below the no-key exit in `audit.mjs`. The
arithmetic over two sets of replies is free and pure and lives in `fitness.ts`,
so check 145 grades the function the script calls rather than a copy of it —
`countsAsSpend`'s precedent, for `countsAsSpend`'s reason.

**And check 141's list of paid imports was hand-written, so it had a hole the
moment this file grew a third.** It named the SDK and `providers.ts`. The
fitness gate imports `prompt.ts`, which reaches `research.ts`, which imports
the SDK statically — a third paid import the pair could never have seen. It
happened to be placed correctly and nothing here would have said so if it had
not been. *Derive the list, or the list is the bug*, inside the check whose
whole subject is an import in the wrong place. The graph is walked now: what
makes an import paid is not its name, it is whether the module it pulls reaches
a package `npm ci` would have had to install, and `audit.yml` runs no `npm ci`.

**The mutation pass deleted a guard I had just written, and it was right to.**
`fitnessOf` carried a rule excluding `skipped` findings, with a paragraph on
why counting a grader that did not run would make an unbilled arm look worse
than a billed one. True, and unreachable: both arms of a pair are billed
identically by construction — the harness calls the model twice inside one
`try` and drops the whole pair if either throws — so a skipped grader fires in
both or in neither and cancels to zero. Deleting it changed nothing any check
could see. A guard that cannot fire is worse than an absence, because a comment
above it now claims a property nothing holds; what replaced it is the sentence,
and the note that the day one arm can be billed and the other not, this needs a
per-arm flag.

**Two of the check's own probes were in the wrong window before the mutations
found them**, which is the third time in this file. "No zeroes in the record"
was asserted of a record that never had a zero in it, because no grader fired
in both arms — the mutation keeping the zeroes walked straight through until
both replies carried the same advice line. *Put the probe where the damage is*,
the HEAD-request lesson again.

**And the whole thing was run end to end before it shipped, because every part
working is not the feature working — for the sixth time.** The notes had a
migration, a table, a refusal, a page and two checks and produced zero rows in
a month; the push had a table, two routes, a service worker and a destruction
path and never rang. This gate has a module, a caller, thirteen mutations and
thirty-seven assertions, and the one failure that would make all of it
worthless is the two arms building the **same prompt** — in which case every
delta is sampler noise and the gate reads as working.

There is no `ANTHROPIC_API_KEY` in the environment this was written in, so the
two calls could not be made against Anthropic. Everything else could: a
Messages-API-shaped server on loopback, `ANTHROPIC_BASE_URL` pointed at it, the
real SDK, the real prompts, the real graders, the real merge — `broken-store`'s
discipline, nothing inside the script stubbed. Both paths ran. A candidate
whose arms graded identically printed `nothing moved` and merged nothing; a
candidate whose without-arm was jargon printed `jargon -12` over 12 cases and
24 calls, wrote itself into `learned.ts` carrying its fitness, and **check 79
went red on it** — the gate refusing a rule the script merged, which is the
whole architecture in one line. The one byte not exercised is Anthropic
accepting the call shape, and that shape is copied verbatim from
`providers.ts`, which is answering in production today.

**One measurement changed the code rather than confirming it.** The first
corpus build left `recentTactics` empty, so the three-turn block never fired,
one weight won repeatedly, and twelve cases came back carrying **two** distinct
tactics out of forty-five. Fed from the run itself it is **eight**. Both arms
share the tactic either way, so this does not change what a delta means — it
changes how much of the library a rule is measured against. Same shape as
pinning `mood: 3` and reporting `behavioral_activation` at forty per cent, and
found the same way: by printing the number instead of assuming it.

**The bill, measured — and the first measurement of it was a word count.**
That sentence said "1,456–1,563 words, so roughly 2,000 tokens in". Words times
a remembered ratio is the shape rule 7 bans, and it was eleven per cent low.
Measured with check 24's own estimator, which is the one number in this
repository allowed to say what a prompt costs: **2,138–2,329 tokens** per call,
**53,200** across the 24 calls a candidate takes. At Sonnet 5's $2/$10 per
million that is **$0.25 at the 600-token output ceiling and about $0.12 at the
reply lengths this room actually produces** — under a dollar for a night that
proposes three either way, so nothing downstream changes and the method still
had to.

The budget is 96 calls and a candidate that cannot be measured inside it is
**refused, not merged**: running out of money must fail closed, not fall back to
the behaviour this block replaced.

**And the recheck found the language asked for and the intent typed, three
lines apart, in the same object literal.** `GoldenCase` has two fields
describing what the router decided. The harness read `classify` for
`language` — the repair this file records four times — and wrote `intent:
"vent"` by hand directly beneath it.

The wrong reading is the smaller half. The product answers crisis, greeting,
factual and meta locally and for free, and a crisis reaching a model is the one
thing `quality.ts` calls **fatal** — so a fitness run that paid for those would
be buying replies on a path that does not exist, with a crisis message. Both
fields come from the classifier now and the corpus is filtered by
`reachesTheModel` **before** it is sampled, because filtering after quietly
returns fewer than twelve.

All 72 authored rows classify as `vent` today — measured, not assumed — so this
changed nothing and is the guard for the day somebody adds a crisis example to a
corpus whose whole job is exercising the room. Luck with a shelf life, the same
luck `providers.ts` had about URLs before check 128. And a corpus too small to
sample now **says so** rather than refusing every candidate in silence, because
a gate that silently refuses everything looks exactly like one that works.

**The other recheck finding was a fiction that bought nothing, until it was
counted.** The corpus build carried `ventCount: i` beside a heavily documented
`recentTactics`, undocumented. Measured over the twelve sampled cases:
`ventCount: 0` with no recent tactics selects **2** distinct moves out of
forty-five, feeding the block alone takes it to **8**, and the turn counter
changes nothing on top of that. So the block does all the work. It was kept
anyway and written down, because claiming turn one while remembering three
previous turns is the incoherent mix rather than either honest end of it — one
simulated sitting is a choice, twelve cold opens is a choice, and both arms
share it either way.

**And the claim that this change needed no live pass was checked rather than
asserted.** CLAUDE.md says to run `npm run live-checks` before pushing anything
that touches a rule with a copy on the wire, and the fitness gate touches no
route, page or user-facing string. Run anyway: **16 · 16 · 12 · 4** across the
store, unconfigured, failing-store and half-applied-schema shapes, with the live
suite at 155/155 and 4,265 assertions. The claim was right, which is not the
reason to have skipped it.

**The zero that three fixes did not move, and the reason was the door.**
`vent_notes` holds **zero rows** and `vent_users.carve` holds **one**, against
108 vents from 9 people. Three causes were found inside `parseCarve` and the
route, every one of them real, and the count never moved — because none of them
was the reason.

The reason was the trigger. The carve fired in exactly one place, inside
`submitMood`, so the room's entire long-term memory hung off a gesture that
**2 of 108** turns produce. A migration, a table, `keepable()`, a refusal
message, a page, a delete button and checks 83 and 100, behind a door almost
nobody opens. *Every part working is not the feature working*, for the
**seventh** time in this file.

**`isLanding()` already knew, and it was already free.** The arc reads a
sitting winding down — a message short against their own habit, or words that
end a conversation — and the route returns it as `closing`. That is the room's
own reading that this is ending, computed every turn, and already the thing
that decides the weight question. It is strictly better than *they tapped a
number*, which the ambient track lets somebody do on any turn at all. The
landing is the trigger now and the mood is the fallback, once per sitting
whichever arrives first — not twice, because `vent_users.carve` is one column
and a second call would overwrite a good line to buy the same column.

**Attribution, without a new column.** CLAUDE.md asked that this not be changed
in a way that makes the arc's own effect unreadable, and it is not:
`submitMood` is the only writer of `tension_after`, so a carve on a sitting
with **no anchor** can only have come from the landing. The new path's
contribution is a query over two columns that already exist. A `trigger` column
would be a new thing this product keeps about somebody to answer a question the
schema already answers.

**The deadlock this resolves is worth naming**, because the rule it steps
around is this file's own. The entry above says *"measure the new anchor rate
first, then re-plumb"* — and `/api/heartbeat` reads `vents: 108`, identical to
the audit three days earlier, so **there have been no vents at all since the
arc shipped**. The measurement that rule waits for cannot exist until somebody
uses the product, and nobody will accrue memory while the door stays shut. The
rule was right about attribution and it assumed traffic; the derivation above
is what satisfies it without one.

**Verified on the wire, four turns through the real route against a real
store:** `closing` false, false, false, **true** on *"anyway thanks"* — the
exact condition the client now hangs the carve on — and `POST /api/carve`
answering `{"carved":false,"reason":"no_key"}`, which is the route reached and
refusing cleanly rather than throwing. Five mutations fail check 147: delete
the landing trigger, delete the once-guard, make the guard state instead of a
ref, add a second writer that walks around it, and stop compressing on the
mood.

**Two things this cannot prove, stated rather than implied.** That a browser
actually calls it — that is the settle bug's lesson and it needs a real phone.
And that a row arrives, which needs a model key this environment does not have.
The notes feature had every part working and produced nothing for a month, so
the only evidence worth anything here is `vent_notes` going above zero in
production. **That is the number to read first when traffic resumes.**

**The front door was a form, and it collected two per cent.** `/chat` opened
on *"Question 1 of 3 — which chair is you today?"* before a person could type a
word — once per device, skippable, and the first thing anybody ever met. The
entry above already names it: *"the most spoon-feeding object left in the
product"*, deferred because a redesign shipped unverified at the end of a long
session is the one thing this file bans.

It is deleted rather than redesigned, and the counts are the whole argument.
`chair_picked` sits on **2 of 108** vents. `pressure_value` sits on **45 of
108**, and the only thing that ever changed for it was being promoted out of a
tray onto the line. The form's main output was the opening tension reading, and
the pressure track gives that directly, to twenty-two times as many people,
without asking a question first. Same call as the body tray, which went at
`body_tapped` 2/108.

**The difference from the body tray is stated rather than glossed.** That
deletion lost nothing, because `/api/vent` reads `input.bodyTapped ??
classification.body` and the room took the reading anyway. Nothing derives the
chair, so the honest sentence is that the chair becomes **absent** rather than
derived — which is what it already was on 106 of 108 rows. A derived chair is a
real idea and it is not that commit: it would be a fourth detector in a
repository whose most-repeated bug is detectors that disagree, and it needs a
count behind it before it decides anybody's reading, for the reason `arc.ts`
refuses to phase-filter the tactic library.

**The capability is not deleted with the form, and the asymmetry is on
purpose.** `openingBlock` renders null on absence — the path almost every row
already took — and check 21 still grades it in full. The route still accepts
the four fields and the client sends them as explicit `null` rather than going
quiet, because *asked and absent* and *nobody remembered* are different states
and `PENDING_OK` already draws that line elsewhere.

**Three checks went red and every one was anchored to the old world.** Check 21
required the client to keep what the form collected. Check 63 asserted
`is(setters.length, 2)` — *"exactly two things can mark the reading as given —
onboarding, and the slider"* — which is check 126's trap exactly: an integer
describing the world in the check guarding the one number this product claims
about itself. The rule was never the integer, it was *a third would be
somewhere quietly deciding on the person's behalf*, so it is a bound now plus
the shape "quietly" would actually take — a setter inside an effect, firing
without anybody touching anything. And check 109 held *nothing onboarding asks
for is collected and then dropped*, which is vacuous when nothing is collected;
a vacuous check passes by not looking, so it was replaced with the stronger
half rather than deleted: **nothing stands between a person and the box.**

Check 21's vocabulary rule was repaired by **derivation** rather than by
re-pointing it. It read `onboarding.tsx` by name and asserted that screen used
the shared chair table; the rule — chair tensions lived in four files once — is
why `chairs.ts` exists, and the circle lobby and circle room still render it.
It sweeps every `.tsx` that mentions the vocabulary now, with a floor, because
a hand-written list of the screens showing a chair is how the fourth copy got
in the first time.

**Two instrument errors, and both are the same lesson twice in an hour.** The
composer assertion was `/inputRef/`, and a mutation renaming it `inputRefX`
walked straight through — a substring satisfying the rule, `role="radio"`
matching `role="radiogroup"` again, written an hour after re-reading that
entry. It asserts `ref={inputRef}` now, which is the wiring rather than a name.
And the mutation runner's own `restore()` overwrote the repair before it was
copied to the backup, so a re-run tested the old assertion and reported the
same escape: **`git checkout` destroying an uncommitted fix, wearing the
mutation harness's clothes.** Pin the fix into the backup *before* re-running,
not after.

**The number the last fix said to read first was a number nothing reported.**
The carve's trigger repair ends on *"the only evidence worth anything here is
`vent_notes` going above zero in production. That is the number to read first
when traffic resumes."* `/api/heartbeat` reported `vents`, `anchored`,
`meanDrop`, `findings` and `learned`, and not that. A verdict living in a query
somebody has to remember to run is a measurement that is **unreachable rather
than merely empty** — which is the phrase this endpoint already uses for
circles with no closes and for a week with no anchors, applied to the two
fields the last two commits exist to move.

`countMemory()` is two integers and cannot be anything else. `head: true` on
both counts, so the row count arrives in a header and no row is transferred —
which matters past speed, because a select would pull every carve and every
note subject into a route with **no token on it**. That is the property that
keeps the heartbeat open, and it is asserted on the query rather than on the
comment above it.

**`peopleWithCarve`, not `carves`, and check 126 caught it rather than a
reviewer.** A carve is one text column per person, ever, so a field called
`carves` is the sticky header's *"4 earlier carves"* bug wearing an operator
endpoint. The check also flagged a **local variable** named `carves` inside the
store, and the tempting fix — widen the sweep to string literals only, since
its own comment says it is about what a person reads — would have weakened a
guard to admit the code that broke it, and un-covered bare JSX text on the way.
The variable was renamed instead. *An assertion can defend the bug*; so can a
convenient reading of one.

**A failed read is not a zero.** A store that refuses this must not take the
report down — the counts above already arrived — but a zero standing in for a
question nobody managed to ask is the green-light-over-a-broken-road bug, so
the field is `null` and the finding does not fire. And the finding waits for
`MEMORY_FLOOR` sittings, because an endpoint that alarms about a working
deployment is how somebody learns to stop reading it, which this file records
happening three times in three days.

**`MEMORY_FLOOR` lives in `efficacy.ts` for `isTotalOutage`'s reason.** The
route imports `next/server`, which the suite's loader cannot resolve, so a
constant declared there is a constant no check can read. The first version was
declared in the route, and the package stub added two commits earlier handed
back `undefined` rather than throwing — the check asserted *"the finding waits
for undefined sittings"* and went red. That is the stub doing exactly what it
promises, naming what it ran without in the footer, and it is also the half of
that mechanism worth watching: a **named import** from a stubbed module
resolves to nothing quietly, where a property access on its default throws.

Verified on the wire off a running server: `{"vents":500,"anchored":39,
"peopleWithCarve":0,"notes":0,...,"findings":[{"kind":"memory_empty","count":500,
"why":"500 vents and not one carve — the room is holding nothing across
sessions"}]}`. Seven mutations fail check 148, and the seventh is the lesson of
the day: adding `; sample: string` to the return type left the assertion green,
because it matched as a **substring** — the `role="radio"` /
`role="radiogroup"` disease, for the **third time in one session**, in three
different checks written hours after re-reading the entry about it. Anchor both
ends, every time.

**And the finding watched one of the two zeroes.** It fired on
`peopleWithCarve === 0`. Production answered `peopleWithCarve: 1, notes: 0` on
the first deploy that could read them — so it stayed **silent over the exact
number the endpoint was built for**. `vent_notes` at zero is what motivated
every line of this, and the condition had been written about carves.

*A justification covers what it argued about, and nothing standing beside it*:
the argument was notes, the implementation was carves, and adjacency carried it
across. Both are watched now and the finding **names which**, because `0 notes`
and `0 carves` are different defects — the first is the Carver's output being
refused, the second is the Carver never firing — and one that cannot say which
is a bucket with nothing in it.

Read off production after the repair: **`peopleWithCarve: 1, notes: 0` against
108 vents from 9 people.** That is this file's own claim, confirmed from the
endpoint rather than from the paragraph that made it, and it is the baseline
the trigger repair will be measured against.

**And the endpoint written to watch for silence caught its own author in ten
minutes.** `countMemory` shipped reading `.from("vent_users").select("user_id",
…)` — and `vent_users` is keyed by **`id`**; `user_id` is what `vents` uses to
point at it. PostgREST refused it, the store threw, and production answered
`peopleWithCarve: null`.

That is the select-list bug this file already records — *"every read of `vents`
asked for a column named `" user_id"`... invisible for months because every
caller sat in a try/catch that degrades quietly"* — arriving with a different
cause and the same shape. The difference is the whole argument for the design
one paragraph up: the original hid for months; this one was visible on the
first fetch, because **the field reports `null` rather than a confident zero**.
A failed read that says so is a bug with a ten-minute life.

**Nothing could have caught it, and that was the real finding.** Check 16 reads
every select list the store writes and asserts one thing about them: that they
carry no whitespace. `FULL_CONTRACT` is validated against the DDL, and every
*other* select was never asked the only question that matters — **do these
columns exist on that table?** It pairs `.from("t")` with the literal
`.select("…")` that follows it now and checks each column against the parsed
migrations, with a floor. Three mutations fail it, and the first is the exact
line that shipped.

Literal selects only, stated as a limit rather than left to be discovered:
`FULL_SELECT` and its siblings are constants the older sweep already covers,
and an embedded `table(col)` select is a different grammar this must not
pretend to parse.

**The return leg was built and the prompt never read it.** The circle's seal
writes `carry` into `vent_users.held`. That shipped with a migration, a store
method whose answer is read, a route, the Memory page, a delete button, a
destruction path in `deleteAll`, three branches of honest closing copy, four
mutations, and a live seam in check 20 proving the row actually arrives.

`getHeld` had exactly **two callers**: `/api/held`, which draws the Memory
page, and the store implementations. So the word was stored, and shown to them,
and the room they came back to had no idea. This file calls that commit *"the
return leg, which was the last cold component"* and *"why the product read as
two products: the bridge was one-way by construction"* — and the bridge stayed
one-way, **one function call short**, with every part working. **Eighth time.**

**Wired into both sites, and the second one is the easy miss.**
`buildSystemPrompt` renders context blocks twice: once inside a `.some(Boolean)`
that decides whether `CONTEXT_RULES` renders at all, and once for real. Wiring
only the render hands somebody the block *without* the rules that govern how
context is used — and the only person that happens to is somebody whose held
word is their sole context, which is exactly who this is for.

**And it had to pay by removal, because the ceiling is not slack.** Check 24
measured the heaviest turn at **3,599 of 3,600** — one token — and this file's
own rule is that whoever raises that number should have deleted something. The
deletion was `openingBlock`: **58 tokens** reserved for a shape no request can
produce since the front door went at `chair_picked` 2/108. A price nobody pays,
in the most expensive real estate this product has. Arithmetic, all measured:
3,599 − 58 + 36 = **3,577, headroom 23**.

It is also the same trade stated as a product argument. The **guessed** version
of *what are you carrying* was three taps off a list before anybody had spoken;
the **earned** version is one word somebody chose after an hour in a circle.
The vocabulary itself stays in `chairs.ts` — `voice.ts` reads `OBJECTS` and
`CARRY_WORDS` for the ban on *"you chose the tight knot"*, and circles still ask
the chair question on two screens. `chairPicked` stays on the vent route too,
and the difference is the point: it is a **column** write that `/api/profile`
and `/api/circles` genuinely feed, where the three `opening*` fields had no
writer anywhere and cost prompt budget on top.

**The budget assertion caught its own author, which is the part worth keeping.**
Check 149 asserts that the new block *counts against the ceiling* — check 24's
own rule about `probeBlock`, applied to the block added after it — and it went
red, because an earlier script had aborted before writing the fixture into the
heaviest assembly. So the block really was outside the budget and the suite
really did say so. Without that assertion the measurement would have read 3,541
and looked like headroom that did not exist.

Two checks went red on the deletion and both were right. Check 21 graded
`openingBlock` in full and check 109 asserted the route still accepted the four
fields — the exact rule written two days earlier, kept for *"the day a reading
feeds it"*. Nothing ever did. Both were replaced rather than repointed: 21 is
about personality having one home, and 109's second half is now the rule that
succeeded it — **the room's cross-session context comes from what they did,
never from what they declared on the way in.**

Verified on the wire, four calls against a real store: a vent, `POST /api/held`
answering `{"saved":true}`, the GET returning
`{"held":[{"text":"tiredness","at":"…"}]}`, and the next vent answering **200**
— the turn that now carries it. Seven mutations fail check 149: wire only the
render and not the guard, stop fetching it, remove the cap, drop the silence
line, render a heading over an empty list, stop counting it against the ceiling,
and let a store failure take the session down.

**What that does not prove, stated rather than implied.** The route's fetch and
its pass are asserted off the source; the block is graded behaviourally; the GET
proves the store returns the row for that person. What no check here reaches is
the assembled prompt of a live turn carrying it — `/api/vent` imports
`next/server`, so the suite's loader cannot build the route, and the prompt is
not on any response. The chain is covered on both sides and at the join, and
that sentence is the honest shape of it.

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

**And then this file did it.** The "Where things live" table above said **32
tactics**. There are **45**. Nobody typed it wrong; thirteen were added and the
integer stayed — the same mechanism, in the document that records the
mechanism, four hundred lines below the paragraph you just read.

The guard that paragraph produced reads `docs/POSITIONING.md`. Nothing in the
suite had ever read `CLAUDE.md` as *data* — every mention of it in `eval.mjs` is
prose inside a comment. So the document written for somebody who cannot check it
was covered, and the operating manual, read by whoever is about to change the
code, was not. Same shape as the foreign-hotline guard: the rule stated twice,
enforced on one surface.

Check 132 closes it, scoped to the table on purpose. This file is full of
integers — 171 vents, 3,600 tokens, 1,574 cacheable — and nearly all of them are
observations about a moment rather than live counts; a check asserting those
would be wrong the day production moved. What is asserted is the narrow set the
code can still answer for itself, and it asserts the sibling guard still exists
too, so the asymmetry cannot come back from the other direction.

The row that maps an English phrase to a module stays hand-written, because that
mapping cannot be derived. The integer beside it always can, and the integer is
the half that goes stale.

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

**And the strongest promise on the front page was false about one table.**
*"One tap deletes everything, for good."* True of every vent, note, carve, held
note and breaking answer. False of `circle_members`.

That table is keyed by `anon_id` — a bare text column, **no foreign key to
`vent_users`** — and each row carries the role, the join time, `last_seen_at`
and `pressure_seeded`: a 0–100 reading of how bad it was when that person sat
down. **Nothing deleted one.** Not `closeCircle`, which takes the words and
leaves the seats. Not `deleteAll`, which cannot reach them — it works in
`userId` space and these are keyed by anon id. There is no leave path;
`removeMember` exists only to roll back a lost seat race. And the wipe drops
`mw-anon-id` on its way out, so afterwards the person no longer holds the only
key that could ever have addressed those rows.

It is fixed at **close**, not in `deleteAll`, and the reason is a live-room one.
`seat` is not a column: `voice/route.ts` computes `seat: index + 1` from the
member list's order, and `personaFor` keys the voice mask to the seat. Deleting
one row from a circle that is still running renumbers everybody after it and
changes which masked voice belongs to whom, mid-session — invisible to every
test that can run here, and the same shape as the roles-fixed-at-join bug this
file opens with. At close the room is over, the seats mean nothing, and no read
of a closed circle's members exists. Bounded rather than eventual: closure is
driven by `expiredUnclosedCircles` from the lobby, the same sweep that already
deletes the transcript.

Check 129 derives the tables off the migrations, because a hand-kept list of
"tables holding personal data" is exactly how this one stayed off a list for as
long as it existed. Anything with a column naming a person must die by
`deleteAll` — directly or by cascade from `vent_users` — or by `closeCircle`,
or be named with its reason. Four are: `sessions`, `messages`, `subscriptions`
and `memories` are keyed to `auth.users(id)`, and no anonymous venter is in that
id space. That is 0011's finding, the reason the carve moved to
`vent_users.carve`, and the reason `embeddings.ts` still has no caller — one
fact now load-bearing in three places. The exemption is checked rather than
trusted: each must still be keyed to `auth.users`, so the day one is re-keyed to
the person this product actually has, it stops being exempt.

**And the derivation paid for itself immediately.** Adding `circle_members` to
what `closeCircle` destroys turned check 112 red on its own — that check reads
whatever the close deletes and requires the backup to exclude it, so the nightly
export was told about the new promise without anybody remembering to go there.
That is what deriving a list buys, stated once by a check going red rather than
by a paragraph.

**Then the live checks went red, and the second bug was underneath the first.**
Deleting the seats made the seal handler answer **403 `not_a_member`** to
somebody sealing a circle that had ended. That is the refusal this file opens
with: *they were a member*. The room is over. A false sentence, at the moment
somebody is trying to close the worst hour of their week.

The handler looked up the seat before asking whether the room was still there.
Check 95 already asserts that exact order — *"'you are not the Keeper' about a
room that no longer exists is the wrong refusal"* — **for the DELETE handler
only**, in the same file, forty lines away. Third mechanism again: the fix
reached the copy in front of it and not the one beside it.

And it had been unreachable the whole time. The 403 needed `listMembers` to come
back empty, which only happens once the seats are deleted — so the row that
should not have outlived the promise was the thing holding the ordering bug's
symptom down. **One defect was hiding another, and fixing the first is what
surfaced the second.** Nothing static found it; a live check did, on the run
after the change.

So the order is swept over every handler in the file rather than written out a
second time: if a handler asks whether the circle is over *and* refuses somebody
by their seat, the question comes first. **True for everybody is the right
order** — "this room is over" is true of any caller, "you are not a member" of
only some, and asking the narrower one first can only ever answer the wrong
question. Statically, too, because `npm run gate` skips `live-verify` when
nothing is serving on :3001 — the check that caught this does not run in the
command this file tells you to trust.

**And the anti-fragmentation fix could not see the room that was working.**
Of the first sixteen circles, fourteen held exactly one person, because
`POST /api/circles` created a room unconditionally — two people arriving
minutes apart for the same pressure each got their own, and the Keeper needs
`members.length > 1` to say a word, so neither room ever started. The repair
steers the second person into the first one's room, and its predicate was
`same tag && seats > 0 && seats < MAX_SEATS && creator !== me && early phase`.

`addMember` answers false for two different events — **the room filled, and
you are already in it** — and the second one fell straight through to opening
an empty second room. Somebody closes the tab, comes back to the lobby, taps
the same button. The first patch read the members back on a failed write and
handed them their seat, which is correct and covers only the rooms that still
have a free seat: the predicate never looks at a full one. So the fragmentation
this whole block exists to stop survived in the exact case where the room was
working — **six people in it**. A fix written from where its author was
standing, which here was a room with space in it.

`seatedIn(anonId)` is a store method rather than a widening of
`listOpenCircles`, and the reason is the lobby: that route returns
`listOpenCircles()` verbatim to the browser, so carrying members on it would
publish every seated person's anon id to whoever loads the page — and an anon
id here is not an identifier, it is the whole credential. Ids only, intersected
in the route, which already owns the status and clock predicates.

The seat is asked about **before** the tag matches, and that is a product
decision rather than an optimisation: there is no leave path, so a seat is held
for the full forty-five minutes whether or not anybody is looking at it.
Holding two is worse than being sent to the wrong one, because `members.length
> 1` is the Keeper's whole trigger and a phantom seat is a room the Keeper
opens for nobody. The client is told — `joined: "seated"`, one line — because
landing in a room you did not just ask for is otherwise a mystery, and the
client reads the body rather than the status, which is the feedback bug's
lesson applied in the file next door to it.

**Found by the live check for the first fix failing on its second run**, and
that is the only way it could have been found: the bug needs a full room, and
the suite's first pass creates an empty one. The check then had to be repaired
twice for the same reason it found the bug — it tested the shape its author was
standing in, and the shape was "a database nobody had used yet". It picks a
pressure with no room currently open for it rather than hardcoding one, and it
ends the room it filled, because a check that takes a tag out of the pool on
every run fails on its own leavings by the seventh.

**And the route was the right answer to a question the screen should not have
asked.** Every card in the lobby read *"Take a seat →"* — including the one they
were already sitting in — and the room you are already in is the one most likely
to be **full**, six people being a working circle, so the fallback read *"Room is
full"* at somebody who had a seat in it. Underneath sat *"Open a different
circle"*, which a person holding a seat cannot do: there is no leave path, so the
route sends them back. A control that does not do what it says, under two labels
that are true of a stranger and false of the reader. The honest version of that
button is its absence.

`GET /api/circles` answers `mine` — your own seat or nothing, from your own id,
computed with the same `seatedIn` the route uses. Nobody learns where anybody
else is sitting, and somebody holding another person's anon id already has the
transcript, so it adds no reach to a credential that is lost. The list itself
still carries no anon id, because the lobby payload is the one circle response a
stranger can fetch.

The order is the assertion, not the presence: both branches read correctly with
the seat asked second, and the answer would still be wrong for exactly the rooms
that matter. **True for you before true for anybody** — the same ordering rule
check 95 enforces on the handlers, one screen earlier. Check 101 holds it,
because a sentence that is false about the person reading it is what check 101
is for.

**And the handler whose order had just been corrected was wrong one rung
further out.** The seal guarded its sweep with `circle && …`, so a circle that
does not exist fell past it into the seat check and answered **403
`not_a_member`** — *you are not a member* about a room nobody is a member of.
That is the bug the DELETE handler's own comment records as fixed, in the same
file, forty lines down, for DELETE. Moving the sweep above the membership check
an hour earlier did not make anybody look at the line above *that*.

Not a rule invented to make a sweep go green: **seven of the eight handlers
addressed by an id already answered 404 here.** So it is written down as what
the file already does, over every route under `[id]` — the messages, voice and
mute handlers refuse by seat too — and the eighth stops being the exception.
*Does this room exist* is true of every caller as well, and it is truer first.

**The check written under that lesson reproduced it within the hour.** Check 95
opens with `ok(files.length >= 5, "a sweep that walks nothing passes loudest")`,
and the sweep added below it had no floor: a mutation pointing it at `[nope]`
walked through green, because two empty lists are exactly what a sweep over no
files reports and it reports them as a pass. Any sweep whose finding is an empty
list needs a count of what it examined, asserted beside it.

**Then that rule was asked of every other sweep, and five more were passing by
not looking.** Checks **18, 29, 46, 72 and 125** each walk `src`, collect
offenders, and assert the list is empty — with nothing pinning how many files
they read. Point the walk at nothing and all five go green: the crisis-line
layout guard, the rate-limiter's refusal wording, the always-visible *"not a
licensed therapist"* line, the dark-mode scrim sweep, and the guard against a
fourth Pidgin detector. Five rules with no enforcement behind them, indefinitely,
with a green tick on top.

**The method is the part worth keeping, because a static detector cannot do
it.** Mine flagged eight and three were wrong — 103 already floors on
`scanned > 20`, and 112 and 126 both fail on an empty parse through assertions
that carry no `>=` at all (126's is `keyedToPerson < <bigger set>`, which is
`0 < 0` and false when the parse finds nothing). A check that reads suites for
the *shape* of a floor would flag those three and need a hand-kept exemption
list, which is this file's own definition of the bug. What settles it is
behavioural: **replace the derivation with `[]`, run the suite, and read which
checks still pass.** Re-run that whenever a sweep is added.

No meta-check was written, for the reason above. The floors are the fix and the
mutation is the proof.

**Two decisions, taken rather than drifted into: the cap is 4, and the private
room may not say "we".**

`REPLY_SENTENCE_CAP` moved from 3 to 4. The argument in its doc comment still
holds — one sentence and a question is usually right — and this is a ceiling
rather than a target, so it costs up to a third more output tokens on the
replies that use it and nothing on the replies that do not. Every reader
imports the constant (both language branches of the prompt, the failsafe's
retry line, the `length` grader), so one edit moved all four.

**`fused` is the grader, and the exemption is the whole work.** First-person
plural is the room joining somebody inside their own problem: there is one
person here and a machine, and "we can look at that" asserts a second party who
will not be there at 3am. But **`make we` is Pidgin's hortative** — this file
already keeps `make I / we / e / dem` in `PIDGIN_GRAMMAR` on purpose, and the
authored corpus uses it: *"Make we leave the why tonight."* Banning it would
force stilted Pidgin on somebody who wrote in Pidgin, which is the
register-decline failure this file spends more words on than anything else.
**Sixth word given up for being one thing in English and another in Naija**,
after `make you`, `fit`, `belle`, `\bdon\b` and `conditioning`.

Private room only by construction rather than by a flag: `quality.ts` grades
what the model wrote here, and the circles rulebook is `checkMessage(x,
"share")` — a different function on a different surface. The Keeper's own
refusal is *"We no dey fix here. We dey witness"*, and a circle really does
have six people in it. Check 82 asserts that line still passes.

`major`, not a retry, and named in `NOTED`: the row never reaches training and
the heartbeat counts it, but **nothing has measured how often a model actually
writes it.** Tuning a new grader into the rejection set on a sample of zero is
what `earned_worth` looks like before it ships. Promote it when there is a
number.

**Three authored replies were reworded, and the fourth was not.** The ban flags
hand-written corpus — *"Let's see if they were three things or one thing three
times"*, *"Then we don't"*, *"Let's take the map away tonight"* — and the rule
in `scripts/quality.mjs` says a grader that flags the corpus is the grader that
is wrong. Not here: the grader is a decision that postdates those lines, so the
corpus moved. The fourth is the Pidgin one and it is untouched.

**And the mutation pass found two holes in its own new work.** Reverting the cap
to 3 left the suite green — correct, because the *value* is a product decision
and a check asserting `=== 4` is check 126's trap. What was actually at risk is
singleness: three files state the ceiling to the model and all three interpolate
the constant, so spelling one as a word makes the prompt and the grader disagree
silently, in the direction that ships longer replies. That is what is asserted.
Its first version then flagged `voice.ts`'s own prompt line — *"the right reply
is one sentence, sometimes it is only the question"* — which is a **floor** and
correct advice: `make you` again, the commonest hit being the ordinary use. And
the narrowed sweep had no coverage floor, so pointing it at `[]` passed — the
hole closed one commit earlier, reopened in the check written after it.

**And the same false door, one screen further in, still live after the lobby's
was repaired.** `circle-room.tsx` rendered the whole agreement to anybody not in
the room, whatever its seat count — the rules, the chair question, the consent
box and a full-width gold **Take a seat** — on a circle with six people in it.
Working through all of it answers **409** and toasts *"That circle is full."*
Every fact needed to know that arrived in the same payload the button was drawn
from: `seats` and `maxSeats`. This file already records the lobby's version, a
gold *Open a circle* over a plate explaining four hundred pixels lower that
circles could not open, under the rule that *the room never offers a door that
opens onto a 501*. The repair reached the lobby and not the room.

**The branch is one flag and its negation, and that is not a style note.**
`6 >= undefined` and `6 < undefined` are **both false**, so writing the pair as
two comparisons makes a payload that lost `maxSeats` render neither half —
somebody outside the room looking at nothing at all, no way in and no sentence
saying why. A flag falls back to offering the seat, and a 409 they can read
beats a blank space. It was written the wrong way first, in the repository whose
whole subject is the other deployment shape, with a comment underneath claiming
the unsafe form was the safe one.

Check 101 holds the branch and check 134 holds the payload it branches on,
because a correct branch over an absent field renders nothing and looks
identical from the static side.

**And the same door in the two shapes where it cannot open at all.** `load` read
`const d: RoomState = await r.json()` on every status but 404, so a **503** from
a store that is absent or refusing became a room object with every field
`undefined` — the fullness flag read false over it and the screen drew the
agreement and the gold button. Reachable by anybody holding a circle link while
the database is down, which is a real production shape and one the live pass
runs twice. A refusal is not a room; the last good one is kept instead, because
this runs every four seconds and one blip must not empty a circle somebody is
sitting in.

It is asserted as a **named instance**, and the reason belongs here rather than
in the check: a sweep for that annotated cast finds **one** site in the whole
tree, the one being fixed — the `catch`-block mistake again, where the check's
entire sample is its own bug. What generalises is the sentence, not the cast:
*"That circle has closed. The words are already gone."* is true of a 404 and
false of a room that is merely unreachable, which may be sitting there with five
people in it. **Never announce a deletion nobody watched.**

**And the circle's whole efficacy loop is empty in production, by construction
rather than by outcome.** The seal — mood, the word carried, the word dropped,
the drop in points — goes to `logPreference`, and `logPreference` opens with
`if (!LOCAL) return Promise.resolve()`. That is deliberate and its header says
why: *"serverless disks are thrown away, so writing here in production would
collect training data that is guaranteed to be lost."* Honest in the module.
The vent rating survives because `/api/feedback` also calls
`store.insertFeedback`; the circle close calls nothing else, so on the
deployment people actually use it records **nothing, anywhere**.

The heartbeat is where that became a false reading. `keeper_losing` scores a tag
by the mean drop across its circles and reads exactly that signal, so zero
closes in a report is indistinguishable from a week of circles where nothing
went wrong. Same shape as the anchor that could never be set, which this file
already spends a paragraph on: **unreachable rather than merely empty.** The
heartbeat now says so whenever it sees circles and no closes — the emptiness
stops looking like a result.

Not repaired here, and the reason is not effort. Keeping a circle's closing
reading past the circle's life is a **new thing this product would hold about
somebody**, on a front page that promises one tap deletes everything, and it
would need a table, a destruction path in `closeCircle` or `deleteAll`, an
exemption from the backup, and a line in the privacy page. That is a retention
decision, and this file's own test says a retention decision is read by a
person. The finding is the deliverable; the schema is not.

**One notification, and the design decision is which key it hangs on.** The
steering stops the product opening a second empty room; it cannot make the
first person still be there when the second arrives. Fourteen of the first
sixteen circles held exactly one person, and the Keeper needs
`members.length > 1` to say a word — so `circle_push` exists to send one
sentence: *somebody sat down in the room you are holding.*

It was written first as a per-browser subscription table and that was wrong. A
push subscription is a capability to wake a device; held per person it is a
thing this product keeps indefinitely, and `deleteAll` works in `userId` space
and cannot reach a row keyed by anon id — **which is exactly how
`circle_members` outlived "one tap deletes everything, for good"**. Keyed to
the circle, the question does not arise: the row dies in `closeCircle` beside
the seats and the transcript, so the capability cannot outlive the
forty-five minutes it was granted for. It is also true to the thing, because a
subscription that survives the room has no notification left to deliver.

The payload is the circle id and nothing else — not the tag, not the seat
count, not who arrived. A notification is decrypted onto a lock screen that may
be face-up on a table in a room with other people in it. It says *come back*,
never *about what*.

**Four checks objected, and every one of them was right.** Check 60 caught
`savePush` returning `true` because Postgres had not complained — the shape
this store has now been wrong about three times, after `setCarve` and
`anchorLatestVent`; the rows are the evidence and the absence of an error is
not. Check 112 went red on its own the moment `closeCircle` learned to destroy
the new table, which is what deriving the backup's exclusion from the sweep
buys. Check 111 caught both new routes belonging to no live pass — the
`/api/notes` trap, named in this file and stepped in anyway. And check 16
caught a column the contract declared and the DDL appeared not to have.

That last one was the check being wrong, and it is the sixth face of this
file's most-repeated finding. The DDL parser read column names as `[a-z_]+`,
which is every column this schema had until one arrived with a digit in it:
**`p256dh`**, whose name is fixed by RFC 8291 and is not ours to choose. The
fix is the identifier rule — `[a-z_][a-z0-9_]*`, what Postgres accepts
unquoted — and not a renamed column, because bending a standard field name to
satisfy a regex is fitting the code to the test. A pattern written the way its
author's data happened to look, again, after `make you` and `\bdon\b`.

**And it shipped a regression the merge itself revealed: a red light over a
working road.** Adding `circle_push` to `FULL_CONTRACT` turned production's
`/api/health` into a **503 `degraded`** the instant it deployed — with
`writable: ok`, Anthropic answering, and every vent persisted. That endpoint
defines degraded as *nobody can be answered*, and it was false. One unapplied
migration made the probe alarming in the wrong direction.

A green light over a broken road is this file's oldest bug, arriving four
times. This is its mirror, and it is not obviously the lesser one: an endpoint
that cries wolf about a working deployment is how somebody learns to stop
reading it.

A **half-applied schema is a normal shape here** — `live-checks.sh` runs one on
purpose, `getCarve` treats `42703` with 0011 pending as a normal state rather
than a fault, and a first Supabase deployment passes through two of these
shapes on its way up. So `PENDING_OK` names the tables whose absence means a
migration has not run, and an entry earns its place by both halves being true:
the feature is **off** without the table with no surface that fails, and
nothing a person does depends on it. Still probed, still reported as
`pendingTables` so an operator knows what to apply — it simply stops claiming
the room is shut when it is open.

The exemption is the dangerous half, so it is checked rather than trusted:
every entry must name a table a migration actually creates, or a typo in the
contract would read as "not applied yet" for ever, and the set is capped small
enough to read — a long list of tables exempt from `degraded` is a health
endpoint that cannot go red.

**And it happened again the next day, from the other end of the same rule.**
0016, 0020 and 0021 were applied to production. `/api/health` went **503
`degraded`**, `database: unreachable`, `tableErrors: {match_memories:
PGRST202}` — over a deployment persisting all 221 vents, answering on
Anthropic, `writable: ok`. Second red light over a working road in two days.

This one was not a missing migration. `RPC_CONTRACT` probed `match_memories`
so a deployment still running 0006's vulnerable definition would report a
failing RPC instead of looking healthy — correct, and the sharpest probe in
the file. **0016 drops that function outright.** So the repository held two
migrations and a check that could not all be true: 0014 hardens it, check 121
asserted the probe covered it, 0016 destroys it. Nothing could see the
contradiction until 0016 ran, because every one of the three was green on its
own.

A probe outliving its subject is the general case, and it is not the same bug
as `PENDING_OK` even though it produces the same status code. There the table
was coming; here the function is *gone on purpose* and the endpoint was
demanding it for ever. Check 121 no longer names `match_memories` — it derives
every function any migration drops, in **both** shapes (`drop function
public.x` and 0016's own `proname = 'x'` loop, which exists precisely because
the first shape matched nothing when the signature moved), and fails if any
probed RPC is in that set. Mutations in three directions fail it: reinstating
the probe, walking no migrations, and blinding the parse to the by-name loop.

**And the repair reached three copies of four.** `contract.ts` and check 121
were fixed, the gate went green, and CI went red: `failing-store-verify.mjs`
held the same rule on the wire — *"and it probes the function 0014
hardened"* — and `npm run gate` **skips** that file when nothing is serving on
:3001. The command this document tells you to trust could not see the copy
that ships, which is the gap already written down about check 95, arriving on
the fix for the paragraph above it. Third mechanism, one script over, inside
the commit repairing the same rule.

That copy now derives the names off `contract.ts` and asserts every declared
RPC is reported by name when the database refuses everything — which proves
the probe ran *and* that its failures reach the response, and names nothing.
Its floor is the one that matters: zero names parsed makes `every` vacuously
true, so an empty parse fails loudly instead of passing. Mutation: blind the
parse, `FAIL 12 — no RPC names parsed out of contract.ts, this check examined
nothing`. Run `npm run live-checks` before pushing anything that touches a
rule with a copy on the wire; the gate alone is not enough and says so.

Two facts worth keeping from the application itself, both read off the live
database rather than reasoned about. `vent_feedback_user_id_key` **was really
there** — this file inferred it from a generated name and it is now confirmed
and dropped, so a person's second rating is no longer discarded. And
`profiles` and `memories` held **0 rows** against 221 vents and 19 circles, so
0016's "THIS IS IRREVERSIBLE AND IT DESTROYS ROWS" destroyed nothing. Counting
first is what made that a fact instead of a hope.

**And then push was found never to have rung, by one line, with the keys in
hand.** Generating the VAPID pair meant checking the encoding against
`vapidHeader`, and it threw: `ERR_OSSL_ASN1_WRONG_TAG` on every call it had
ever made. The envelope opens `30 81 41` — SEQUENCE, long-form length, `0x81`
meaning *one length byte follows* — and the function ended
`der.writeUInt8(der.length - 2, 1)`, writing over that marker to make
`30 42 41`. A byte.

`sendJoinPing` never throws outward, deliberately and correctly: a failed
notification must not take down the request that triggered it. So a build with
correct keys and a build with none were **identical from every surface** —
`isPushConfigured` true, `/api/push` serving a key, the browser subscribing,
the row written, `closeCircle` destroying it on time, and nothing ever
ringing. No status code, no red check, no log line. This is the
invisible-failure class from the prefix-caching entry — *the reply is correct,
the suite is green, and the only witness is a bill a month later* — wearing a
notification instead, where the witness is a person who never came back to a
room because nothing told them to.

Four checks objected while `circle_push` was written and every one was right.
**Not one of them signed anything.** The feature had a migration, a table, a
store method, two routes, a service worker, a client control and a destruction
path, and zero assertions about its crypto — *every part working is not the
feature working*, for the second time in this file, now with the part being
the only one a person actually experiences.

It was reachable the whole time. `app-imports.mjs` neutralises `server-only`
at resolve, so the suite could always have imported this module. Check 135
does: it generates a P-256 pair, hands the module the keys through the
environment it really reads, and **verifies the signature against the public
key the module was never given.** Free and offline — one local signature, no
push service, which the spend meter requires. `vapidHeader` is exported for
no other reason, and that is stated where it is exported: a crypto path with
no seam is a crypto path nothing can verify. The mutation that matters is the
second: flipping one bit of the scalar still produces 64 bytes of the right
shape, and only the verify catches it.

Its first run then failed on the repair's own postmortem, which quotes the
banned line verbatim — check 48's finding, in a check written the same hour it
was re-read. Stripped now, with an assertion that the stripper left the file
behind.

**A fourth Pidgin detector, and it held no regex at all.** This file records
three: the router and the grader disagreeing before `quality.ts` imported both
marker lists; `audit.ts` carrying a private copy under a comment claiming it
was "the same set the grader uses"; and the crisis list catching `i wan die`
while `PIDGIN_GRAMMAR` read it as English.

The fourth was a **typed constant**. `scripts/quality.mjs` built every authored
case with `language: "en"` written out, and the 72 rows in
`holisticExamples.jsonl` carry no language field — `{"undefined": 72}`. So the
corpus grader was told every example was English, and **ten correct Pidgin
replies to Pidgin messages came back as "answered an English message in
Pidgin"**.

The placement is what makes it expensive. That file's own header calls it *"the
only way to know whether a prompt change helped"*, and the rule four lines
above the bug is the instrument this repository uses to **kill** candidate
graders — *if the corpus flags them, the graders are wrong*. Four graders have
been rejected on that instrument. It had ten permanent false readings while
they were.

**Asking `classify` took 10 to 41, in the other direction, and that number is
the real finding.** The pairing had never been printed, so it hid both ways at
once:

| message → reply | count |
| --- | --- |
| pidgin → pidgin | 10 |
| **pidgin → english** | **41** |
| english → pidgin | 0 |
| english → english | 21 |

The authored corpus answers a Pidgin message in English 41 times out of 72 —
usually a short, lightly code-switched opener like *"work dey choke me"* met
with an English reply that hands their word back. That is either the corpus
being right about register (four words of Pidgin do not oblige a full Pidgin
reply) or it is the production failure measured above, where six of twelve
Pidgin turns came back in English, sitting in the examples the model is shown.

**Not decided here, and the reason is this file's own test.** Rewriting 41
hand-written replies is a register decision about every Nigerian who uses this,
and the rule says a corpus is the instrument rather than the thing under test.
The 2x2 now prints beside the flag count so a reader can tell a grader bug from
a corpus one instead of watching a number move. The measurement is the
deliverable; the rewrite is read by a person in a real room.

Check 136 holds the narrow rule — no harness may decide the language of a real
message by typing one — behaviourally rather than by the absence of a string, a
fixture that states its own language being an input and not a verdict. Three
mutations fail it: restore the hardcode, type `"pidgin"` instead while still
importing `classify`, and empty the corpus read.

**And the mutation pass destroyed the check twice by the same command.**
`git checkout scripts/eval.mjs` to undo a mutation reverts to HEAD, and a check
written minutes earlier is not in HEAD. Back up to the scratchpad and restore
from there; never revert an uncommitted file with git.

**Third red light over a working road in three days, and this one was a
timeout wearing a schema verdict.** Production answered **503 `degraded`**,
`database: unreachable`, `missingTables: ["vent_feedback"]`, with `tableErrors`
reading exactly `{"message":"Gateway Timeout"}` — no code, no hint, which is
why only the message rendered. `writable: ok`, Anthropic answering, 221 vents
persisted. A refetch 27 seconds later returned **200 `ok`** on the same commit.

The first two were contract drift. This one is transport: `transient` existed
for precisely this and was gated on one literal, `PGRST303`. A gateway timeout
carries no code at all, so it fell straight through to the schema bucket — and
`missingTables` is a sentence. The table is there; the request did not arrive.

The rule is now **a failure carrying no code is not a verdict about the
schema**, and it lives in `contract.ts` rather than the route, because the
route imports `next/server` and this suite's loader cannot resolve it — a rule
kept there is a rule no check can exercise. `countsAsSpend` is the precedent:
one function, graded directly, called by everything that decides.

**The inversion is the half that could have gone wrong silently, and check 41
caught it being written too wide.** Routing every codeless error to `transient`
is right for one table and catastrophic for all of them: a database that is
down answers nothing, every probe returns codeless, and the endpoint prints
`ok` over an outage — the oldest bug here, arriving as the price of fixing its
mirror. The first guard counted every `transient` entry, and check 41 went red
on it, correctly: clock skew is one key's `iat` and can land on all nine tables
at once, so that version would have paged somebody at 7am for a wobble that
clears itself — the exact thing that check exists to prevent. **Skew has a
code. A gateway timeout does not.** `isTotalOutage` counts codeless probes
only.

Check 41 itself then had to move twice rather than be argued with, and both
times it was half right: it asserted the literal `database = missingTables
.length ? …`, which had to grow a clause it has no opinion about, and it
anchored its ordering probe on the `PGRST303` literal, which moved into
`contract.ts`. It asserts the properties now — skew alone never reaches the
outage clause, and the diversion still happens before anything is counted
missing — with the call as the anchor, because the call is what the route does.

**And the mutation pass lied about itself, for the third time this session.**
Four mutations reported one catch. The pattern was `grep -E '^FAIL  (41\|137)'`
— inside an ERE, `\|` is a literal pipe, so three results were invisible rather
than absent. Re-run with a correct pattern and an `assert n != s` proving each
mutation actually applied: **all four fail.** *Classify a measurement by what it
does, never by what it looks like* — the `strip` lesson, arriving in the
instrument rather than the code, which is where it keeps arriving.

**Two surfaces on one engine, and the one door between them is gated on a
coincidence.** `circleInvite` is the whole bridge: a person writing *"i no get
person wey i fit tell"* in `/chat` is told a peer room has a seat. It is the
only moment the private session and the circle ever touch, and nothing here had
ever asked whether it fires — the third instance of *every part working is not
the feature working*, after the notes that produced zero rows in a month and
the push that never rang.

The detector is not the limit. Measured on the authored corpus: **4 of 72
sound alone**, and the invite fires **0 of 4** with no open circle and **4 of
4** with one warm room. What gates it is the clock — `seats > 0 && seats <
MAX_SEATS && !isExpired`, then `minutesLeft < 8`. The question it really asks
is *is somebody sitting in a live room at the instant you happened to type*.

Production has held 19 circles at a 45-minute lifetime: roughly 855 minutes of
circle-uptime in a ~43,200-minute month, about **2%** of wall-clock. That is
arithmetic off this file's own counts rather than a measurement, which is why
it is written here and not asserted anywhere. The bridge is correct and almost
never in the right place at the right time — the same root cause as the
fragmentation entry above, seen from the other side: the room that would have
fit somebody closed before they needed it.

Check 138 holds what does not go stale: two bounds in check 123's shape — a
detector narrowed until it reaches nobody fails the floor, widened until it
reaches everybody fails the ceiling — plus the refusal, which is the half that
protects a person, because *"arriving at a room that was never there is worse
than never being offered it"*. The lifetime, the seat gate and the eight
minutes are product decisions and none of them is asserted as an integer.

**One mutation escaped and it was right to.** Deleting `isExpired` from the
filter left the check green, because `if (minutesLeft < 8) return null` sits
below it and is strictly tighter — every expired room was already refused
twice. Defence in depth, and the 90-minute probe had overshot the guard that
does the work. So the boundary a person actually meets is asserted instead: a
five-minute-old room is offered, a room with two minutes left is not. That one
fails in **both** directions — delete the floor and dead rooms get offered,
raise it past the lifetime and the door shuts for everybody. Not an assertion
invented to make a mutation fail; a guard the first probe had stepped over.

**The return leg, which was the last cold component.** The vent path could
send somebody to a circle. The circle sent nothing back: the seal's mood, the
word carried, the word dropped and the drop in points all went to
`logPreference`, which no-ops in production. A person vented, was offered a
room, sat in it, named a word, came back to `/chat` — and the room had no idea
it happened. The entry above frames that as lost training data. It was also
why the product read as two products: the bridge was one-way by construction.

**Built, and the paragraph this replaces got the word wrong.** It read *"the
word they dropped is their own word about themselves, which is the exact shape
of `vent_users.held`"* — and `held` means *what held*, so the dropped word is
the one shape that column must never take. The right half of that sentence
survived: a column that already has a page, a button and a destruction path is
the version that needs no new promise, which is why this could be built at all
when every other shape of it is a retention decision. The wrong half is left
here because it is the mistake a reader is most likely to repeat: the two words
arrive in the same request, and only one of them is theirs to keep.

The seal now writes `carry` into `vent_users.held`, reads the answer, and says
which of three things actually happened. The rest of the closing reading — the
mood, the drop, the dropped word — still goes only to `logPreference` and is
still recorded nowhere in production, so the efficacy loop below is unchanged
and the finding above it still stands.

**The brake was bolted to the wheel.** `/api/vent` rate-limits per person and
does it well — `RATE_PER_MINUTE`, `RATE_PER_DAY`, a higher cap at the edge, and
a refusal that hands somebody a human rather than a countdown. Two gaps, and
neither matters at eight people.

**It lives inside `if (store)`.** The route degrades to the no-store shape when
the database is unreachable, deliberately, and its comment is right that *"the
reply is worth more than the record"*. But `userId` stays null on that path, so
the counting never runs and the model is called anyway. Production answered
`Gateway Timeout` on two tables five days ago; for that window every vent was
unlimited. The live pass even proves the path — *"A vent still gets a reply
when the database is refusing · 200"* — and nothing asserted it was bounded.
**The limiter is a dependent of the thing most likely to fail under load.**

**And `anonId` comes from the client.** It is the whole credential and it is
self-asserted, so a per-person limit bounds an honest person and nobody else.
Rotating the id resets the count.

There is also no global ceiling of any kind: every use of the word *budget* in
this tree is per-request tokens. Swept and confirmed, which is the only reason
that sentence is here rather than assumed.

`ceiling.ts` counts what neither gap can dodge — model calls by *this
instance*, rolling minute, no identity and no database. `allowModelCall` both
decides and records, which is `countsAsSpend`'s precedent and stops a caller
looping on a pure predicate for free.

**What it is not is written in the module, not discovered later.** It is
per-instance, exactly like `cached()`, and on a product where almost every
request is a cold start it catches nothing. What it bounds is the shape that
actually costs money: one warm instance taking a sustained flood. A cold-start
flood is the platform's job, and Vercel's own rate limiting is the honest
answer there — infrastructure, not code. Defence in depth, named as the shallow
half.

**That last sentence was reached for, and the arithmetic says it does not
reach.** There is no firewall configuration on this project — the API answers
`404 Seawall Config not found` — so somebody was always going to write one, and
a per-IP rate limit is the obvious shape. It does not bound spend at any
setting worth having.

Take this file's own numbers rather than new ones: a vent is about 4,200 tokens
(check 24's 3,600-token prompt ceiling plus `MAX_TOKENS` of 600), and 178 vents
cost about $2.50 on Sonnet 5 — **1.4 cents a vent**. So 60 requests a minute
from one address is about $0.84 a minute, $50 an hour, $1,200 a day, from a
single IP that a firewall is reporting as within limits. Tighten it to a number
that actually bounds that and it is now low enough to refuse a shared mobile
NAT pool during a spike, which on a Nigerian product is the ordinary case and
not the edge one — mobile networks routinely put many subscribers behind one
public IPv4 address, and this product's actual traffic has never been measured
for that concentration, which is stated rather than assumed.

**No per-IP number is both safe for a pool and tight enough for a bill.** The
firewall is worth having against the shapes it is actually good at — a single
abusive address, a scripted scrape — and it is not the missing half of
`ceiling.ts`. That half is a bound that survives a cold start, which means
shared state and a round trip on the path a person is waiting on. It is not
built here, it is not urgent at eight people, and the reason it is written down
is that the alternative is somebody setting a firewall rule, reading the word
*limit*, and believing the spend is bounded.

The gate is on the primary call only. The failsafe's retry is bounded at one
per vent, so the true ceiling is twice the constant, and that is deliberate:
refusing a retry ships the worse of two replies to somebody already having a
bad night, to save one call.

**Check 29 went red on the repair, and the anchor was what was wrong.** It read
`route.slice(limitAt, limitAt + 700)` — the refusal had to sit within seven
hundred characters of the limiter. A second rail needs the same sentence, so
the strings moved into one `rateLimited()` function, which is check 81's fix
applied inside a file check 81 cannot see. The rule was never about distance;
the assertion pinned where the sentence lived rather than what it says, so a
correct repair failed it and the wrong response would have been to move the
strings back. It anchors on the function now, and asserts **both** rails return
it — because a rail with its own refusal is how one of them becomes the dead
end this file opens with.

Four mutations fail check 139: a ceiling that never refuses, one that decides
without recording, a window that never releases, and the gate moved past the
billed call. That last one is the one worth keeping — *a ceiling downstream of
the spend is a counter, not a brake*.

**The return leg, built — and it is `carry`, not `drop`.** The circle now
sends one thing back: the word a person says they are taking with them lands in
`vent_users.held`.

The mapping was written the wrong way round twice in conversation before the
contract settled it. `held` is documented as *"what held, in their own words —
the other half of the carve"*, and the seal asks two questions: the word you
take and the word you leave. Writing the **dropped** word into a column meaning
*what held* hands somebody back the thing they came here to put down.

It needs no new promise, which is the only reason it could be built at all.
`vent_users.held` exists (0013), renders on `/memory`, has a delete button, and
dies in `deleteAll` — so *one tap deletes everything, for good* stays true with
no new table, no new destruction path and no line in the privacy page. Every
other shape of carrying a circle's close forward is a retention decision; this
one is a write into a promise already kept. It is also the one thing a circle
produces that is safe to move: not the transcript, not anybody else's words,
not a model's summary, but one word the person chose about themselves — the
contract's *"written only by the person and never by a model"*.

**And the sentence had to change, which is the half that mattered.**
*"Sealed. Nothing here is kept."* was true for exactly as long as a circle kept
nothing. The moment one word leaves the room it is false at the moment somebody
most needs it to be true — this file's opening rule, on the screen a person
reads after the worst hour of their week. Three branches now, each true: the
close failed; the close landed and nothing was kept; the close landed and
*"«carry» is on your Memory page"*.

`seal()` returned `r.ok` — correct while the seal made two promises, and the
feedback bug's exact shape the moment a third arrived. It reads the body now.
The check's **first version tested for the text** of that read and a mutation
returning `{ sealed: r.ok, held: r.ok }` left the `r.json()` lines below as
dead code and went green. Asserted on the binding instead: `held` must come
from the parsed body and never from the status. Four mutations fail check 140;
one of them — dropping `addHeld`'s answer — was caught by **check 87**, which
already swept that class and fired on its own.

**And none of those four would have caught the failure this feature was most
likely to have.** Every one of them reads the source. The notes feature had a
migration, a table, `keepable()`, a refusal message, a page, a delete button
and checks 83 and 100 — and produced **zero rows in a month**. `held` now has
exactly the same parts, so the only evidence worth anything is the word going
in through the seal a person taps and coming back out of the surface their
Memory page reads, across two routes and a real store with nothing stubbed
between them. Check 20 does that, in the live block, beside the seal that was
already there.

The mutation that settles it is a store whose `addHeld` returns `true` and
writes nothing — every part reporting working, which is the notes bug exactly.
**Check 140 passes it.** The live seam fails with `nothing came back`, and the
wrong-word mutation fails it with `Guilt` printed beside the assertion. A
static check can prove the call is written and the answer is read; it cannot
prove the row arrived.

**The loop's first real run reached production, then died before a grader
ran.** Both secrets set, `skip=0`, rows fetched for the first time in
twenty-eight scheduled runs — and `ERR_MODULE_NOT_FOUND: Cannot find package
'@anthropic-ai/sdk'` at module load, nine seconds in.

`audit.yml` deliberately runs no `npm ci`; the audit reaches `src/` through the
same zero-dependency loader as the gate. The SDK import in `audit.mjs` was
already lazy and below the no-key exit. **`MODEL` was not** — one line at the
top reading one model id used forty lines *below* that exit, and `providers.ts`
imports the SDK statically. So the branch whose entire job is *"no key tonight,
here is what the free graders found"* was unreachable from the only environment
that needs it. The free half of a job must never depend on the paid half being
installed, and the one script allowed to spend money is the one most likely to
forget it.

Check 141 asserts ordering rather than absence — both paid imports may exist,
and both must sit below the exit. Its own first version then went red on the
workflow's **own comment**: `# No \`npm ci\`` matched a regex for `npm ci`, so a
line stating the property being asserted failed the assertion. Fourth
instrument error in one session, after the ERE pipe, the too-narrow href sweep
and the text-not-binding check above. It reads the `run:` steps now, with a
floor, because a filter that finds nothing satisfies any ban by not looking.

**And `git checkout` destroyed an uncommitted fix for the third time**, on a
*committed* file this time — `scripts/audit.mjs` reverted to HEAD and took the
repair with it. The rule already written here is not enough: it is not only
uncommitted files. Back up to the scratchpad before any mutation and restore
from there, always.

**The job only leaked once it started working, and the commit that fixed it is
the commit that made the leak reachable.** `audit.yml` had reported success 28
times without reading a reply: 21 skips with no secrets, then two failures at
module load. Minutes after that was fixed, run 29 read production for the first
time — and printed **three real replies into a public GitHub Actions log** and
uploaded the full `Finding` objects as a **public artifact**. This repository is
`"private": false`; the log has 90-day retention and the artifact 30.

Two lines did it. `scripts/audit.mjs` printed `f.problems.slice(0, 2)` and 88
characters of `f.reply`, and the report written to `data/audit/<date>.json` —
which the workflow uploads — embedded the whole object. `data/` is gitignored
precisely because it is built from real vents; an artifact upload walks around
a gitignore without touching it.

**A detail is not a softer version of the reply.** This file already records
that for `Verdict.reject`: `recites` prints the sentence it read back, which
here is usually the person's own words handed to them, and `invented` prints
the naira figure. `Finding.problems` carried `n.detail`, under a doc comment
that had said *"Every grader label that fired"* since the day it was written.
The comment was right and the code was not, which is the shape this file has
recorded more than any other.

Names and an id now, and the id is the point: an operator reads the reply
through the authenticated path, which is the only place it should ever be read
from. Check 142 grades it **behaviourally** — a sentinel goes into a reply and
must not come out of the finding, which covers the stored report too because
the report embeds these objects verbatim, and covers a future grader whose
detail starts quoting. It also sweeps the script, because `rows` is in scope
where it prints and no behavioural guard on `Finding` can see
`console.log(r.ai_reply)` two lines away. Four mutations fail it: carry the
reply, carry the detail, print the reply, and walk no console lines.

**And one thing was named rather than changed, because it is a product decision
with a trigger — then the trigger was reached on purpose rather than by
accident, and the paragraph below it is what was decided.**
`LearnedRule.found` was documented as *"The reply that caused
it, in a few words. Evidence, not decoration"* — a 160-character quote from a
production reply, which lands in `data/audit/<date>.json` and, under `--apply`,
in `src/lib/vent/learned.ts`, which is committed source in a public repo. It has
never fired: `LEARNED_RULES` is `[]`, `ANTHROPIC_API_KEY` is unset in CI, and
`--apply` is deliberately absent from the workflow. The argument for it is
sound — *"a rule with no reply behind it is a rule the model reasoned its way
to"* — and it was made before the artifact was public. **Decide it before
`ANTHROPIC_API_KEY` is set**, because that is the moment the path becomes live,
and this file's own test says a retention decision is read by a person.

**Decided, and the gate kept its input while the record lost it.** `found` is
gone from `LearnedRule`. The argument that put it there is untouched and lives
where it always did: `parseProposals` still refuses a proposal that cannot point
at a reply, still reads the quote to decide, and now throws it away — the same
shape as `classifyModelError` reading a provider's `.body` and discarding it,
and as `Verdict.reject` carrying grader names. What settled it was one grep
rather than an argument: `learnedBlock` renders `r.rule` and no other field, so
`found` reached no prompt, no product and no screen. **A fragment of somebody's
session, published to two public places, read by nothing.**

**And the same rule had two more sites in the same two files, which is why this
is one commit and not one edit.** `acceptable()`'s own doc comment has said
since the day it was written that *"a rule that **quotes** the failure it is
fixing is how a ban becomes an instruction after one bad parse"* — and the only
enforcement was `bannedPhrase`, which sees our fifteen phrases and nothing else.
A rule quoting the **person's** sentence walked past it into committed source
*and into the prompt*, which is further than `found` ever travelled. A rule
stated in a comment and implemented nowhere, in the file whose job is holding
rules: the shape this document records more often than any other.

Double quotes only, and the exclusion is the work. A straight `'` is an
apostrophe far more often than a quotation mark, so matching it would refuse
*don't* and *they've* — `\bdon\b` from the other side, the same character
wearing two jobs. The guard is narrow and says so: an **unquoted paraphrase** of
somebody's sentence still passes and nothing here can see it. What it closes is
the shape a model actually writes when it is asked for evidence and puts the
evidence inside the rule.

The third site is the one that would have published the exact fragment the
second was written to stop. `REJECT` printed sixty characters of the rule it
refused — to a public Actions log with 90-day retention and into the uploaded
artifact — and a refusal for *quoting* carries somebody's words **by
definition**. `Verdict.reject` a third time, arriving inside the fix for its own
lesson. `rejected` is `string[]` now, reasons only; the JSON-parse failure that
returned sixty characters of the model's raw output returns `"not JSON"`; and
the accepted rules still print in full, because those are the diff `--apply`
commits and a rule nobody reads before it ships is the unsupervised loop this
pipeline exists to refuse.

Check 142 covers both halves of the script now and six mutations fail it: carry
the quote onto the rule, delete the quote guard, widen it onto the apostrophe,
put the refused text back on the refusal, put it back in the printer, and drop
the evidence gate. Two of those are worth naming — the apostrophe one fails in
the *widening* direction, which is the half a careful fix gets wrong, and the
probe asserts the proposal is **accepted** before checking what it carries,
because a probe whose input is refused proves nothing about the output.

**The difference from the half above it is that nothing has happened yet.**
`ANTHROPIC_API_KEY` is unset, `LEARNED_RULES` is `[]`, and no run has ever taken
this path — where the `Finding` half was found by leaking three real replies
into a public log minutes after a fix made it reachable. Same file, same
retention, same rule, one found by reading and one by bleeding.

One instrument note, because it nearly hid a mutation. A Python raw-string
prefix did not survive into the heredoc, so `r'\u201c'` arrived as a curly
quote and the mutation matched nothing. It was visible only because every
mutation here carries `assert s.count(a) == 1` before it writes — a mutation
that silently applies to nothing is a green suite reported as a caught bug.

**The right question in the shape of a demand.** "BEFORE YOU GO" was a
full-width card with ten 44px buttons, rendered after **every** vent turn. The
sentence on it — *"Where did the weight land?"* — is the best question this
product asks. The card announced the room's agenda at the end of every
exchange, broke the transcript in half, and handed somebody who had just
written the worst sentence of their week a form to fill in first.

It is the teaching state now, for the first two anchored sittings on a device,
and a hairline track above the composer for ever after: ten marks at 15%
opacity, lifted by hover, keyboard focus, or a reason. `whisper.ts` owns when
it may step forward — a long message, a ten-second pause, or leaving — and the
component owns nothing but the drawing, because a rule the suite asserts has to
be imported from the module that ships.

**The scale did not move, and that is the change that would have failed
silently.** `tension_after` is `(10 - mood) * 10` and every anchored row in
production is in that space. A five-dot track is prettier, ships clean, and
re-scales a year of rows against a column that cannot say which scale it was
written in — the prefix-caching class exactly: correct reply, green suite, and
the only witness is a mean drop that quietly stops meaning anything. Check 143
pins `1-10` against the arithmetic that reads it.

**Refusal is a real answer and it costs something, so the cost is written
down.** Three invitations ignored and this goes quiet for the sitting. A quiet
sitting records no anchor and the efficacy loop learns nothing from it. That is
the trade and it is worth taking, because a room that asks a fourth time is not
ambient, it is nagging at a lower opacity. What silence must never do is remove
the *control*: going quiet is about asking, and the track stays rendered and
tappable, or refusal would take away the ability to answer later in the name of
giving somebody agency. Asserted, because the tidy implementation is the wrong
one.

**The teaching card is not a courtesy, it is the discovery path.** Nobody finds
a 15%-opacity control on their own. Delete the card and this is a measurement
with no way in — *every part working is not the feature working*, for the
fourth time in this file, now wearing an interaction instead of a migration.

**The receipt is gone and the failure still speaks.** *"Anchored."* was the
product confirming its own database at the one moment it has something to say
about the person, and a receipt turns noticing into reporting. Nothing is said
on success now; the drop card is their own arithmetic and speaks for itself.
*"Noted here — not saved."* stays, because a write that did not land is the one
thing they could learn nowhere else, and it is not a confirmation. `cardWillSpeak`
went with the toast it guarded — a derived boolean with no reader is how a
comment starts describing code that is not there — and its argument is recorded
where it stood rather than deleted with it.

**Check 44 was pinned to a line rather than to a rule, and a correct change
failed it.** It asserted `/\{askMood && !offer && !answering &&/` character for
character. The rule — *what asks for the weight waits while a heavy question is
on the table* — is still exactly right; the literal stopped being true the day
the card grew a `teaching` guard. Check 29's finding, one file over. It sweeps
every guard opening on `askMood` now, which made it stronger rather than merely
repaired: there are **two** surfaces asking for this number and the rule had
only ever been asserted of one.

**And check 128 caught its own author within the hour.** The new check read the
whisper component's source into a variable called `strip` — the hairline strip —
which shadowed the suite's one comment stripper inside that scope. `strip is not
a function`, and the ban on a fifteenth private copy fired at the same time. The
check written about having one answer to what a comment is, catching a collision
with the word itself.

**Core Haptics is not reachable from a web page, and the iOS question is left
open rather than answered from memory.** The brief asks for a transient with an
intensity curve decaying to zero; that is an iOS-native framework and this
product ships as a website, so the organic settle is delivered visually and the
gap is named in the module rather than left as a silent no-op.
`navigator.vibrate` is called optional-chained at 8ms and skipped under reduced
motion. **Whether it fires on iOS Safari is not asserted anywhere in this
change**, because MDN was unreachable from the environment it was written in and
a remembered compatibility table is a claim with no fingerprint. The design does
not depend on the answer: the visual settle is the whole feedback channel and
the tick is a bonus where it exists.

**What no check here can answer is the one that matters.** Whether a 15%
hairline reads as accompaniment or as something hidden, and whether the first
two cards are enough to teach it, is the fifth question this file says a gate
can never ask. Nine mutations fail check 143 and not one of them proves a
person notices the track. That one is read by a person, on a phone, at 2am.

**So it was looked at, and the screenshot found the settle had never played.**
`submitMood` clears `askMood`, which unmounted the strip on the same tick as
the tap — the chosen mark never dropped, never thickened, never faded back. The
brief's whole physical metaphor was dead code behind nine green mutations and a
suite that had asserted every constant it is made of. **Fifth instance of
*every part working is not the feature working***, after the notes, the push,
the bridge and the held route, and the first one caught by an actual browser at
390px rather than by a check.

Two more came out of the same three screenshots, and neither is a bug a gate
could hold an opinion about. The prompt was `label-mono`, so *"HOW DOES IT SIT
IN YOU NOW?"* sat in mono capitals directly under *"SET THE PRESSURE"* and read
as a second **control caption** — chrome asking for a field, which is precisely
what this change exists to abolish. And ten identical marks say nothing about
which end is heavy: a number given blind is not a quiet measurement, it is
noise in the one signal this product has. Both are fixed in the direction the
rest of this rule already points — body type for the room's voice, and anchors
that arrive with the question and leave with it, because a caption that is
always there is the card again, smaller.

The strip now outlives its own answer by `LINGER_MS` and nothing else changed:
`askMood` still ends the *asking* on the tap. Check 143 asserts the guard does
not die with the question, and check 44's sweep had to widen in the same
commit — it matched guards that *open* on `askMood`, and the correct fix made
the whisper's guard open on a parenthesis instead, which would have dropped it
out of the "waits while a question is on the table" rule silently. **Second
time in two commits that a sweep anchored to a token lost coverage to a correct
change**, which is the argument for anchoring on the rule rather than on the
line, made twice in a row by the same check.

**Two instruments for one axis, twelve pixels apart.** The ambient scale
shipped, the settle was repaired, and the screen was still wrong — which a
screenshot said and no check could. Above one input box sat a mono-uppercase
toggle reading `● SET THE PRESSURE ⌄`, with a 0–100 range slider folded behind
it, and directly under it ten hairline marks on a different scale in a
different visual language, asking the same question at the other end of the
session.

Nothing was broken. `chair → tension → drop` is one chain and it was being
drawn as two unrelated controls, so the composer read as a control panel rather
than as a room. **Adding a good control beside an existing one is how a screen
stops having a goal.**

`pressure-track.tsx` is that axis: one line, left light, right heavy, the same
direction at both ends. Before anything is answered it is the pressure slider —
promoted out of the tray, because a measurement folded behind a chevron is a
measurement most people never give. After a vent is answered the same line
takes a tap. The arrival mark stays where it was and **the drop stops being a
number somebody is told and becomes a distance they watched move.**

**The scale still did not move.** The ten stops are `(10 - mood) * 10` run
backwards — `moodFor = 10 - stop / 10` — derived in one line rather than typed,
so the track and the column it feeds cannot disagree. Check 143 fails on a
hand-written lookup table that returns the same numbers today.

Three checks went red and all three were anchored to lines rather than rules,
which is now the ordinary cost of a correct change here. Check 44 had already
moved twice — the card's guard verbatim, then a sweep for guards *opening* on
`askMood` — and the gate is not a JSX guard at all now, it is `askingAfter`, so
it reads both shapes. Check 63 asserted `/!pressureSet/` against
`vent-chat.tsx` and the distinction had moved file with the slider; the rule —
*an untouched track must not read as an answer* — is unchanged and holds on the
mark, hollow until the number is theirs.

**And the repair to 63 passed the mutation it was written for.** `surface.some(
f => /pressureSet/.test(f) && /border/.test(f))` over two files let the *wrong*
file satisfy the rule for the right one: making the mark unconditionally gold
walked straight through, inside the check that guards the one number this
product claims about itself. It reads the mark's own ternary now. Check 143's
`role="radio"` had the same disease twice over — a substring of
`role="radiogroup"`, and then still a substring of `data-role="radio"` after
the first repair. Both anchored on both ends.

Five mutations fail: the after-question stops waiting for a heavy question,
silence removes the instrument, the stops are typed instead of derived, an
untouched track reads as an answer, and the marks stop being radios.

**The orphan in the traps list above is real and cost a run here.** `ss -lptn`
showed nothing on :3001 while `next-server` (pid 774, parent already gone) was
serving it and `live-checks.sh` correctly refused. `ps -eo pid,ppid,cmd` found
it in one line. Read the process list, not the socket table.

**Going quiet costs a tactic, not just a row.** The ambient scale asks at most
three times a sitting and then stops, and this file already states that trade:
*"a quiet sitting records no anchor and the efficacy loop learns nothing from
it."* That sentence was about the efficacy loop. It is also about the **next
reply**, which nobody had noticed.

`behavioral_activation`'s entire predicate is `(c) => (c.mood ?? 10) <= 4`.
Mood comes from one gesture — somebody answering the weight scale — so a
sitting where the scale goes unanswered is a sitting where that move cannot be
selected at all. Counted on the authored corpus with the real router and the
real selector: it wins **15 of 72** messages at mood ≤ 4 and **0 of 72** when
the mood is absent. Silence does not only cost a row; it narrows the library
the next reply is chosen from.

**Three of the four numbers I measured on the way to that were fixture
artifacts, and the corrections are the useful part.** The first count pinned
`recentTactics: []`, so it reported `behavioral_activation` winning **29 of
72 — 40%** and read like a third `exact_mirror`. The three-turn block is real
and running it dropped that to 15 and took distinct winners from 17 to 28. The
second still pinned `mood: 3`, which **forces that predicate true on every
message** — the probe was manufacturing the condition it was measuring. Varying
mood is what showed the gate is a real gate: at null, 5 and 8 the tactic never
fires and `deepsearch_pattern` leads at 13 of 72 with a reasonable spread.

So the suspicion was wrong and saying so is the finding: **`rw_lonely` at
weight 95 and `behavioral_activation` at 78 are both correctly gated**, the
first behind a router tag and the second behind a reading the person gave. The
two disasters this file records — `exact_mirror` at 90 and `rogers_never_said`
at 90 — were ungated members of the base pool, which is the actual shared
property, and weight was never the thing that made them dangerous. A high
weight behind a real gate is how a library says *when this fits, it wins*.

The guard is the heartbeat's, and it is copied from the one directly above it.
That block prints when there are circles and no closes, and its own comment
names this parallel — *"the same shape as the anchor that could never be
set"* — and then guards only the circles. The anchor had the excuse of being
genuinely unreachable when that was written; it is reachable now, and the
redesign above changed how often it is reached. Zero anchors in a week has two
readings that look identical from here: nobody had anything to report, or the
hairline is too quiet to find. It is **not** repaired by making the scale
louder — that decision was taken deliberately and reversing it on a week of
silence is fitting the product to the metric. The line only stops the emptiness
from looking like a result.

Both directions were run before it shipped, in a subprocess with
`VENT_DATA_DIR` pointed at a scratch store — check 130's trick, for check 130's
reason. Two vents and no anchor prints `anchors 0/2`; two vents and one anchor
prints nothing. The first probe reported `new 0 vents` because it wrote
`{"since": …}` and the file reads `state.last_processed` — a probe that could
not see what it was looking at, caught by expecting the line and not getting
it rather than by reading the code.

**A second ledger nobody read, going red on every merge.** `Supabase Preview`
failed on three consecutive main commits with `Remote migration versions not
found in local migrations directory`, and it was not about the schema:
`/api/health` reported all 9 tables present, `missingTables: []`,
`pendingTables: []` throughout. It was a **Supabase branch** named `main`,
stuck in `MIGRATIONS_FAILED` since 2026-08-23, comparing two things that had
never agreed.

The database's ledger held **10** rows, all timestamp versions
(`20260810002130 vent_user_carve_and_held`), applied by hand through the
dashboard. `supabase/migrations/` holds **21** files, hand-numbered
`0001`–`0021`. There is no `supabase/config.toml`: this repo has never used
the Supabase CLI, so the integration was asserting a workflow that does not
exist here. **One table, one truth** — and there were two, one of them right.

Renaming was not available. The map is not 1:1: three remote rows relate to
`0014` (`rpc_hardening`, `match_memories_security_invoker`,
`0014_rpc_hardening_backfill`) and one row covers two files
(`vent_user_carve_and_held` → `0011` and `0013`). So the ledger was
**re-recorded, never re-run**: 21 rows inserted to match the directory, the 10
ad-hoc rows deleted by explicit version, all in one transaction, with the
originals copied to `supabase_migrations.ledger_backup_20260919` first.
`live: 21, backed_up: 10`.

Re-running was the option to refuse. The reconciliation the Supabase CLI
offers — `migration repair --status reverted` — empties the ledger, and the
next push would have applied all 21 against a live database holding 221
people's vents. Recording costs nothing and executes nothing; the SQL in those
files had already run.

Nothing in the product reads `supabase_migrations`. The statement touched that
schema and no other.

**The card was the wrong object, not the wrong size.** "BEFORE YOU GO" was a
full-width card; then the teaching state for two sittings with a hairline after
it; then a hairline with a caption. Three shapes, each quieter than the last,
and every one of them **beside** the conversation — its own box, its own
heading, announcing that the room wants something. A form drawn at 15% opacity
is a form. Shrinking it was answering the wrong question for three commits.

So the question moved into the only place it can be invisible: **the room's own
last sentence.** Every vent reply already ends on a question — that is the reply
contract, and `probeBlock` is the slot it fills. On the turn `arc.ts` decides a
sitting is landing, the question filling that slot *is* the weight question.
Same sentence count, same voice, same place on the screen. Nothing pops.

**It costs nothing in the prompt, and that was a hard constraint rather than a
nicety.** Check 24 measures the heaviest assembly at exactly 3,600 against a
3,600 ceiling. The arc adds no block and no sentence: it swaps which probe fills
a slot already paid for. An arc that needed a paragraph would have had to delete
one, and that is a different commit.

**The threshold was invented and the corpus killed it.** `SHORT_TAIL_WORDS = 12`
— "short enough to be a goodbye rather than a thought" — reached **62 of 72**
messages. One measurement nobody had taken explains it: **the median message in
this product is eleven words.** Twelve was not a short tail, it was the typical
thing a person writes here. A detector that fires on the median is
`exact_mirror` at 90 wearing the room's voice, so nobody can even tell they are
being asked. There is no absolute ceiling now — tapering is relative to their
own habit and a constant only says when there is a habit to be relative to.

**And the first reading of that bound was a fixture artifact, for the second
time in this file.** The probe pinned `typicalWords: 60` and so manufactured the
condition it was measuring — the same mistake as pinning `mood: 3` and reporting
`behavioral_activation` at 40%. Measured against the corpus's own median the
detector reaches **5 of 72**, and the corpus is 72 *opening* messages, so that
is a floor on the real rate rather than an estimate of it.

**The last permanent caption went the same way, by counting.** A body tray sat
above every composer for ever — `○ WHERE IS IT? ⌄` in mono capitals — with head
/ throat / chest behind it. Production: **`body_tapped` on 2 of 108 vents.**
Under two per cent, in exchange for a line of chrome every person reads on every
turn that announces there is a field to fill in.

The same table says what removing chrome is worth. `pressure_value` is on **45
of 108** and the only thing that ever changed for it was being promoted out of a
tray onto the line. Folded behind a caption it was a measurement most people
never gave; ambient and visible it is the most answered thing here. `chair_picked`,
still behind a card, is **2 of 108**.

Nothing was lost, which is why it is a deletion and not a redesign:
`/api/vent` reads `input.bodyTapped ?? classification.body`, so where it sits in
the body was *already* derived from their own words. The tap was an override on
a reading the room takes anyway — behind the scenes, which is where it belongs.

**Verified on the wire, because ten green mutations prove nothing about a
seam.** Four turns through the real route against a real store, nothing stubbed:
`closing` false, false, false, **true** on *"anyway thanks"*, and false again on
the same message with `closingAsked` set. The refusal to ask twice is the half
that protects somebody, and it is the half a static check cannot reach.

**Two findings this change did not act on, both named with their numbers.**

The reply in the screenshot that started this ended mid-sentence on *"First
you"* — and it is **history, not a live bug**: 5 of 99 stored replies end
mid-clause and the most recent is 2026-09-11, against a latest vent of
2026-09-18. The fix has held for a week. Counting first is what stopped a day
being spent there.

And the front door is still a form. `/chat` opens on *"Question 1 of 3 — which
chair is you today?"* before a person can type a word, which is the most
spoon-feeding object left in the product and the first thing anybody meets.
`chair_picked` at 2 of 108 is what it collects. It is once per device and
skippable, so it is smaller than the per-turn card — but the honest version is
a room that opens on the box and learns the chair from how somebody writes.
That is a product decision with a real redesign behind it, and shipping it
unverified at the end of a long session is the one thing this file bans.

**A dispassionate audit, and the feature this file calls fixed has produced
nothing.** `vent_notes` holds **0 rows**. Not "zero in a month" as the
postmortem above records — zero across **59 vents from 8 people** since the
table shipped on 2026-08-24, with the latest vent on 2026-09-18. Three causes
were found and fixed and the row count never moved.

Counting the whole path found two more blockers, and both sit under comments
asserting the opposite.

| | |
| --- | --- |
| sittings (user × day) | 19 |
| long enough to carve (≥3 turns) | 14 |
| **Carver should have fired** (≥3 turns *and* anchored) | **8** |
| carves produced | **1** |
| notes produced | **0** |

**The first is a coupling, in the direction nobody wrote down.**
`parseCarve`'s own comment reads *"the notes are parsed separately and never
block the carve"* — true, and only half a rule. The other half was implemented
nowhere: every rejection above it returned the **whole object** as `null`, and
`parseNotes` ran below them. So a carve one word over `CARVE_MAX_WORDS`
discarded notes that had not been looked at yet. It is the same two fields and
the same direction as the non-greedy extractor this file already records as
*"discarding the carve along with the notes"* — the other end of the same
function, fixed once, reintroduced by a guard.

And the diagnostics could not see it. All three `console.warn`s explaining
"why no notes" sat **under** the word cap, so the failure bucket built for this
exact question was unreachable on its most likely cause. The comment beside
them reasons carefully about which of *two* causes it is; this is a third, one
line above the reasoning.

**The second is the route repeating it.** `if (!carve) return … nothing_to_carve`
sat above the only call that writes notes — three lines under a comment
promising *"a session can produce a good line and no notes, **or notes and no
line**"*. The second case was unreachable by construction, which is
`FORGET_FAILED` again: a documented state that no input could produce.

Notes are parsed first now and survive a refused line; the route's exit fires
only when there is nothing at all, and `setCarve` is conditional rather than the
gate. **The word cap is untouched** — a nine-word summary is still refused, and
the mutation that removes the cap fails check 107, because the risk in fixing a
coupling is loosening the guard that shares the line with it.

Five mutations fail: return null on rejection, parse notes after the cap, gate
the route on the carve, make `setCarve` the gate, and stop refusing over the
cap.

**The trigger is the other half and it is deliberately not changed in the same
commit.** The Carver fires in exactly one place — inside `submitMood` — so the
room's entire long-term memory hangs off the gesture **14% of turns** make, and
6 of 14 eligible sittings never fired it at all. That is a real defect and the
fix is not obvious: the arc landing shipped hours earlier changes how often
mood is answered, so moving the trigger now would make both unattributable.
**Measure the new anchor rate first, then re-plumb.** Changing two things at
once is how a product learns nothing from either.

**What the audit cleared.** Supabase's security advisors — the tool this file
says had been "reporting the whole time, to nobody" — return one INFO
(`circle_push` has RLS on with no policy, which is deny-all and the safe
direction) and one irrelevant WARN about password protection on a product with
no passwords. Retention is the surprise: **9 people, 108 vents, a mean of 12
each, 4 of 9 returning on another day, 2 one-and-done.** That is engagement, and
it means the thing failing is not the room.

**What is still broken and is not code.** Circles: **19 circles, 16 of them
holding exactly one person**, 1.16 seats each — *after* the anti-fragmentation
repair. The Keeper needs `members.length > 1`, so sixteen rooms never started.
Steering cannot manufacture a second person; this is a liquidity problem and it
is the one thing in this product that more engineering cannot reach.

And there was **no age gate** anywhere in `src/app`, on a mental-health-adjacent
product with `/privacy` and `/terms` pages that do exist. Named rather than
built for two rounds, because an age wall is a product and legal decision and
this file's own test says those are read by a person. It is built now, on an
explicit instruction to handle it; what that decision actually turned on is
below.

**The number itself had never been checked.** This file spends more words on
the crisis path than on any other single surface — check 17 makes the digits
impossible to hand-write, check 102 guards the layout, `CRISIS_LINES` exists
because nine copies once drifted, and a whole entry records that a US hotline
is a busy tone from Lagos. Every one of those is about *which* number is shown
and *where*. **None of them asks whether it answers.**

Checked, for the first time: `0806 210 6493` is real — the Suicide Research
and Prevention Initiative, with a public site at
`nigeriasuicideprevention.com`. The most important fact in the product is
correct, and it was correct by somebody's care rather than by anything here.

Two things came out of the check that are worth writing down:

**The service publishes a second line, `0809 210 6493`, and the product shows
one.** A busy tone at 2am is the likeliest failure this path has. That is a
real gap and **it was not fixed here**, for a
reason this file already records about iOS haptics: `findahelpline.com` and
Wikipedia are both blocked by this environment's egress proxy, so the only
evidence for the sibling number is a search-engine summary. Changing the digits
somebody dials in the worst hour of their life, on a paraphrase, is the exact
shape of every unfingerprinted claim in this document. **Confirm it against
SURPIN directly, then add it** — the constant is already the one place, so it
is a two-line change once the fact is real.

**The sentence that used to follow "likeliest failure" said "and there is no
fallback behind it", and that was false.** Read off the four call sites rather
than remembered: `disclaimer.tsx:61-76`, `circle-room.tsx:474-478`,
`circles-list.tsx:533-538` and `terms/page.tsx:24-25` each render SURPIN **and**
`CRISIS_LINES.emergency` side by side, both as `tel:` links. There has been a
second number on every crisis surface this product has. What is missing is a
second *counselling* line, which is a narrower and truer claim than the one this
file made — and the reason it matters is that the false version overstates the
urgency of a change nobody can currently verify, which is how somebody talks
themselves into typing digits.

**Retried with a search tool and still refused.** `WebSearch` reaches this
environment where `curl` does not, and it returns `0809 210 6493` — but what it
returns is a *summary written over pages it read for me*. `WebFetch` on
`surpinng.com` and `lifeline-international.com` both answer `EGRESS_BLOCKED`,
the same as `nigeriasuicideprevention.com`. A summary of a source is a
paraphrase of a source, which is the exact thing rule 8 bans, and the fact that
a different tool produced it does not make it a fingerprint. **A primary page or
nothing.** The environment's network policy is where this unblocks.

**And `112` is Nigeria's national emergency number**, with `767` for Lagos,
while `CRISIS_LINES.emergency` is `199`. 199 is the long-standing line and is
not wrong; whether the newer 112 belongs beside it is a product decision for
somebody who knows which one actually connects in Lagos today. Named rather
than changed, same reason.

The rule this produces is one the file did not have: **a guard that the right
number is displayed is not a check that the number works.** Everything here
verifies the plumbing. The fact at the end of the pipe is external, it goes
stale without announcing it, and it is the one number in this product where
being wrong is not a bug report.

**A full-screen wall went in front of `/chat` and the suite said 157/157.**
The age gate is the first thing a new person meets, it replaces the room
entirely until it is answered, and not one of a hundred and fifty-seven checks
noticed it arrive — **check 109 among them**, whose stated rule is *nothing
stands between a person and the box*. It reads `vent-chat.tsx` and greps for
`hasOnboarded|showOnboarding|<Onboarding`. The wall is one file up, in
`page.tsx`, under a different name.

*Anchor on the rule, not the line* — found by the exact object the line was
written about. The rule that survives is narrower and stronger, and it is the
only thing separating this from the front door deleted at `chair_picked` 2/108:
**nothing standing between a person and the box takes anything from them.** The
form asked four questions and collected two per cent; this asks none, stores one
flag on the person's own device, and their own wipe button clears it. Check 109
now reads the *page* and requires every component rendered before the composer
to be named with its reason, so a second wrapper next month fails the build
instead of arriving in silence — which is the only property that would have
caught this one.

**It is a mirror with nothing behind it, and `age.ts` says so in its own first
paragraph.** *"Governance is enforced on the server ... The UI mirrors the rules
for kindness, never for safety"* — and the server cannot learn anybody's age,
because there is no account here and never has been. So this is a liability
posture and a disclosure, it stops nobody who does not want to be stopped, and
no code downstream may read a cleared gate as a verified adult. A gate
documented as a control is a lie the next commit will believe, so the check
asserts the sentence is still in the module.

`MIN_AGE` is 18 because it is the strictest ordinary answer, which means counsel
can only ever loosen it — a gate that has to be *tightened* later has already
shipped to the people it should not have. Nobody here read a statute.

**What it must never cost is the crisis path, and that is the half a check can
actually protect.** Somebody tapping *"I am under 18"* is, by construction,
disproportionately a teenager at 2am who has already decided to type something
they have not said out loud. A wall with no phone number on it hands them
nothing and closes — the door onto a 501, on the one screen where that costs
most. So the refusal carries both lines as the loudest element on it, plus one
thing to do that is not a phone call, plus a way back. And `/memory`,
`/history`, `/privacy` and `/terms` are never behind it: deleting what this
product holds about you cannot require confirming your age to the thing you are
deleting it from, and a disclosure behind a gate is not a disclosure. The page
list is derived off the filesystem with the open ones named and reasoned, so a
page added next month is in neither bucket and fails.

**The mutation that escaped was the one assertion here that protects
somebody.** `indexOf("AGE_TURNED_AWAY_HEADLINE")` found the name in the **import
list**, not in the JSX — so the slice meant to be the refusal branch ran from
the imports through the whole component, and `import { CRISIS_LINES, CRISIS_TEL,
EMERGENCY_TEL }` satisfied *"the crisis line is on the screen that turns
somebody away"* on its own. Taking the crisis link off the refusal walked
straight through. **The wrong window, inside the check written about the wrong
window** — the HEAD-request lesson for the fifth time, and the third time in
this file that anchoring one end was not anchoring. Both ends braced; ten of ten
mutations fail it now.

**The flag is an external store rather than a `useEffect`, and the reason is not
the lint warning.** The first version read storage in an effect and cached the
answer *in the component*, while the wipe removed the key somewhere else — two
writers, one invisible to the other, so navigating from the wipe into the room
inside one session would have stayed cleared off a memory the wipe could not
reach. That is `setCarve` and `circle_members` wearing a browser. The read, the
cache, the write and the forget all live in `age.ts`, there is no second path to
the key, and **that is also the only reason any of it is testable**: a component
is not importable by the suite, so check 150 runs the real confirm and the real
forget against a stubbed `localStorage`, and a subprocess runs one that throws.

`ageServerSnapshot()` returns `null`, not `false`, and that is load-bearing:
`false` renders the wall into the HTML, so every returning person is shown the
screen this product least wants to show twice, for one frame, on every
navigation. `null` renders nothing until the client has looked. The cost is
paid and measured rather than assumed — `/chat` now serves 11,977 bytes with
**zero** `<textarea>` in it, and the gate paints 174ms after `domcontentloaded`
locally. A person cannot type into an un-hydrated composer, so the blank frame
is bounded by hydration either way; what would not be bounded is an alarming
legal wall flashing at somebody mid-crisis.

**Verified in an actual browser at 390px, because five of the last findings
here were not findable any other way.** Fresh `/chat` shows the gate with no
composer; confirm gives a composer and writes the flag; reload goes straight to
the room with no flash; *"under 18"* gives the refusal carrying
`tel:08062106493` and `tel:199` as live links and no reachable composer;
`/circles` is gated; `/memory`, `/history`, `/privacy`, `/terms` and `/` are
not. Ten mutations fail checks 109 and 150 between them.

**Sixteen graders and not one asked whether the room decided what is inside
somebody.** A grounding protocol was handed over to be integrated, and the first
useful thing was to check it against the code rather than build from it. Six of
its seven clauses already have enforcement here, and the mapping is worth
keeping because it is what stops a second parallel system: source hierarchy is
the context blocks and `MEMORY_TURNS`; uncertainty is *silence beats a guess*
and `CONFIDENCE_FLOOR`; tool-first is `research.ts` and `sources.ts`; the
internal check is the failsafe; memory discipline is already the strongest of
them — `voice.ts:413` calls *"I remember you mentioned…"* **the worst failure
available here**, and `heldBlock` ends on *"Never name it out loud."*

One clause had nothing behind it: *never invent what the user must be feeling
beyond what they have expressed.* `invented` catches a person nobody mentioned
and a figure nobody gave; `diagnosis` catches a clinical label. All three are
facts about the **world**. Nothing asked the other question.

Measured before it was built, and again before it was tiered. Of 108 production
replies, **four assert a feeling and three name one the person never used** —
"you're exhausted", "you're terrified", and "you're abandoned" on a Pidgin turn.
The fourth is "you're trapped" to somebody who wrote that they were trapped,
which is their own word handed back and is the best move in the room. `presumed`
is `major` and sits in `RETRY_ONLY` with its own argument rather than
`jargon`'s: being told what you feel is not harmful the way advice or a label
is — it is the specific thing that makes a person stop talking, because a
listener who has already decided is not listening. Worth a second call; never
worth the authored line, because a reply that presumes is still made of *their*
words and the hold is made of nobody's.

**The design died on its first corpus run, and that is the finding.** The first
version asked whether the reply's feeling word appeared in what they wrote. One
authored row flagged out of 72, and reading it settled the shape: the person
wrote **"i dey fear say i go end up like my papa"** and the reply answered
"You're afraid of becoming him". Their word, their sentence, returned in the
other language — and a word-identity test called it an invention.

So **a "did they say this word" test is a register test in disguise**, and it
fails hardest on exactly the people this product is for. `FEELING_FAMILIES`
carries `don tire`, `vex` and `e pain` inside the families rather than in a
second list, because the most-repeated bug here is two detectors disagreeing
about one question and the one they disagree about most is this one.

**And the comment claimed a guarantee the code did not have, an hour after it
was written.** It said every hedged form was outside "by construction rather
than by exclusion list" — and the probe said **"I imagine you're exhausted"
fires**, because the hedge sits in front of the frame and the frame matches
anyway. `HEDGED` is the implementation, scoped to the **clause** rather than a
character window, so "That sounds hard. You're terrified." still fires: a hedge
excuses what it is attached to and nothing standing after it.

**Three instrument errors on the way, and all three are this file's own traps
arriving somewhere new.**

*`\b` is a backspace in Postgres.* The production count came back **zero**, and
zero was wrong. Postgres ARE spells a word boundary `\y`; `\b` is backspace —
the exact trap this file records about U+0008 in `intent.ts`, in a different
engine. It was caught only because the floor was measured before the zero was
believed: 108 replies, 53 second-person, 13 carrying a feeling word. A zero
under a probe nobody validated is the oldest bug here.

*An assertion that reduced every name to nothing.* The check forbidding a
clinical word from entering a feeling family stripped `CONDITIONS` with one
escaping level too many, so `anxiet\w*` became `anxietw`, nothing could match,
and a mutation smuggling `anxiet` into a family walked straight through. It
takes the leading alphabetic run now — a prefix needs no escaping to be right,
which is the point, since the failure was a property of how the pattern was
written.

*And a regex inside a block comment closed it.* The repair's own explanation
quoted the pattern, the quote contained `*` followed by `/`, and the comment
ended there. Same class as check 135 failing on its postmortem quoting the
banned line.

**Check 122 was pinned to a literal and a correct change failed it**, for the
third time after checks 44 and 29. It read `RETRY_ONLY = new Set(["language",
"jargon"])` character for character, so a third member going into the tier
turned it red. The rule never mentioned how many members the tier has; it says
where `jargon` lives. It reads the set now.

Eleven mutations fail check 151, and two are the ones worth keeping: swapping
families back to word identity reproduces the register bug, and widening the
hedge from the clause to the whole reply makes one "sounds like" excuse
everything after it.

**The room was told to hand out homework, in its own constitution.** The
founder's spec: *"You never assign external tasks, behavioral homework, or
micro-errands of any kind"*, with exercises named. It overrules this file's
older line — *generic is the offence, task is not* — and the argument that lost
is kept where it stood in `voice.ts` and check 119, marked overruled, because
the aimed version of a clinical move really is better than the generic one and
a record of what was given up is worth more than a tidy file.

Production said how often before anything changed: **18 of 113 English
replies** handed somebody something to do — seven *"…tonight, you can / try…"*,
the spec's own example, and six *"say it … out loud"*, which is `exact_mirror`'s
hold read back word for word. Counted in the database with verbs from a closed
list, never text.

It was not the model misbehaving. **Five sentences in the prompt asked for
it**: engine one's habit loop *"small enough that they will actually do it
tonight"*, engine two's *"what is that one doing in the next two hours"*, the
body rule's licence for breathing instructions, *"If they ask for advice you may
give it"* in `OFFICE_RULES`, and *"Nothing for them to do unless they asked"*
in HOW YOU SPEAK. The last was found only because check 86 asserted it
**present** — `/unless they asked/` — and stayed green through the whole
change: a check guarding a rule by requiring the sentence that contradicts it.
All five are flipped, and the heaviest assembly went from 3,577 tokens to
**3,571**.

**The holds are the door a grader-only fix leaves open.** `inspectReply`
exempts authored lines by design, so the failsafe rejects the model's errand,
falls back to a hold — and fifteen of 45 holds were exercises. The sweep
guarding that door asked `genericTask`, which passes an aimed task by
construction. It asks `errand()` now, and all 36 holds pass it.

**Nine tactics retired rather than renamed** — `micro_action`,
`opposite_action`, `behavioral_activation`, `micro_loop`, `body_map_drop_set`,
`grounding_54321`, `progressive_squeeze`, `orienting`, `postpone_the_loop` —
because a process-level drop set is not a drop set, and keeping the id over a
different move would make the efficacy loop score one tactic under another's
name. Two families went with them. Check 4 caught the cost on the first run:
**"chest + high pressure" went to `double_standard`**, the room changing the
subject on the one thing somebody had located. `felt_sense` takes the body now,
with the drop set's exact gate and weights — the same selection pressure on the
same turns, a question where an instruction was.

The costs are written down rather than discovered: `grounding_54321` was the
answer to panic, numbness and "not real", and the room now stays with that
instead of walking somebody through it; and `behavioral_activation` won 15 of 72
authored messages at mood ≤ 4, which now go to the rest of the library.

**The corpus killed three of the detector's first shapes, and all three were
shapes this file has already paid for.** *"**Rest** is being held hostage"* — a
verb used as a noun subject. *"**Make we** leave the why tonight"* — Pidgin's
hortative, which `fused` already exempts by name: `make you` from the other
side. And *"you no dey **talk to anybody** for house"* — the room handing
somebody's own sentence back, the best move it has, read as an instruction to go
and find somebody. The other seven flags were real and were rewritten, and one
rewrite introduced `advice` — *"what would you **have to** feel"* — caught only
because every rewrite was graded, and the pre-existing `language` findings on
four of them were attributed by grading the originals rather than assumed.

Scope, stated: this governs the private room. The circle Keeper's eight exported
lines carry none. UI copy stays on `genericTask`, because a *"Try again"* button
is not a move, and the crisis lines and the age gate's referral are the safety
floor rather than something the room says inside a conversation.

**The mutation pass had two escapes, and they were two different things.** One
was the instrument: a probe that renamed a frame instead of removing it applied
cleanly, changed nothing, and reported an escape. The other was real — cutting
`errand()` off from the generic table left every row green, because every row
was an imperative and none needed the table. *"A little self-care might help"*
would have walked through the rule written to stop it. Fifteen of fifteen now.

**The founder saw a card deleted days earlier, and the product could not
update the window he was looking at.** A screenshot of the installed app showed
"BEFORE YOU GO" — whose only trace left in `main` is the postmortem comments
describing its deletion, `git grep` confirming it. The shipped code could not
render it. The window could, because it was still running JavaScript loaded
before the deploy: an installed app stays open for days, `/chat` never
navigates, and nothing on the page ever asked whether the server had moved on.
**Every fix since that window opened was invisible to the one person looking**,
and would have been to every tester who installed it — which is the whole
"you said it was handled" argument, arriving from the delivery layer rather
than the code.

Two faults made it permanent. `public/sw.js` named its cache `"mw-v1"` and never
changed it across a deploy, so the activate handler — which deletes every cache
but the current one — never deleted anything. And the page registered the same
`/sw.js` on every build, so an old page could not learn of a new one by asking
again. Next's own skew handling does not reach it either: with a `deploymentId`
it hard-reloads on a *client-side navigation* (its `self-hosting.md`), and
somebody sitting in `/chat` never navigates.

**The fix is shaped by one fact: the thread on screen lives only in memory.**
The chat opens on a blank room and fetches the carve, never the transcript, so
a reload *is* the loss of the conversation somebody is in the middle of. Every
response now carries its build as `x-build`, set in `next.config.mjs` from the
same value the bundle is stamped with and derived exactly as `/api/health`
derives `commit`. On coming back to the window the page sends one `HEAD` — no
route of its own, no database, no model — and reloads only when the build moved
**and** the window was away thirty minutes **and** nothing is typed. "Away" is
focus as well as visibility, because a desktop app window left behind other
windows is still "visible" to the browser — which was the founder's window.
The worker is registered per build, so a new build is a new worker and its
activation clears the last one's cache.

**Proven in a real browser across two real builds, because a static check
cannot see a window update.** Build A served, the chat opened, the server
swapped to build B under the still-open page: away ten minutes, no reload;
away thirty-one with a sentence half-typed, no reload; away thirty-one with the
box empty, reloaded onto B, age gate not asked again. And the probe was wrong
once before it was right: the first run read the worker **mid-install** and
reported both caches alive under the old controller. A lifecycle trace showed
the mechanism completing in three seconds, and the re-run with a patient probe
measured it end to end: `controller=v=bbbbbbb caches=mw-bbbbbbb(3)`, the
offline page precached, no 4xx anywhere. Ten mutations fail check 153.

**What this cannot fix, stated rather than implied.** A window installed from a
Vercel *deployment* URL — the kind a PR's preview comment links to — is pinned
to that deployment for ever, and its own server will always agree it is
current. The production alias is `vent-ai-therapist.vercel.app`; an app
installed from anywhere else never sees a deploy.

**The capability question lives at `/api/push`, outside the `[id]` prefix, and
that is not filing.** Every handler under `api/circles/[id]` operates on a
circle that exists, so every one must call `sweepIfOver` (check 95) and wrap in
`withStore` (check 118). A route that answers "does this build have VAPID keys"
does neither and should not need two exemptions to say it is not that kind of
route. **A route that needs two exemptions is in the wrong place.**

**The VENT spec asked for three things this repository had already forbidden,
and the integration is where each one landed.** A mirror that talks back, not
a therapist; the AI truth used rather than hidden — no body, no stake, no
tomorrow, so it cannot leave, flinch or punish and the truth costs them nothing;
one or two lines and a single question about them, never about the room; the
room as the rehearsal and never the destination. It went into the prompt by
removal — *"You run a therapy office"*, *"ten years and fifty thousand hours"*
and *"No metaphor"* all said the opposite — for **7 tokens net**, 3,570 → 3,577.

The three conflicts, and where each landed:

- *"You've asked 10 versions of…"* — the room sees six turns (`MEMORY_TURNS`),
  so ten is unprovable by construction, and `patternBlock` already keeps the
  count away from them. The pattern is called out; the number never is.
- *"Always redirect to him"* against the no-errands spec a day older —
  resolved as a **question**, only towards somebody they named, never an
  instruction. Pointing the courage is not assigning it.
- The safety line's *"then return"* — the crisis path stays local, pre-model,
  both numbers on every surface. Only its sentence moved: it opened *"I'm
  really concerned about you"*, a stake the same spec says the room does not
  have, and *"cannot hold this alone"* is written as the weight being more than
  a screen can hold, never as the room being burdened, because perceived
  burdensomeness is the belief most present at that turn. *"You are not
  alone"* stays although the spec bans it: that list governs the voice, and
  this is the one line the spec breaks character on. Check 76 names the two
  surfaces, and a stale entry fails.

**The measurement pointed at the library, not the model.** Nine of 118
production replies asked about the room, and **eight of the nine** carried a
probe that asked it — `yalom_what_from_me` three, `mi_permission` two,
`rogers_check` two. `mi_permission` was *"Do you want me to just hear this, or
do you want me to push?"*, the same menu as the screenshot this file already
records as a failure. Seven probes were replaced under new ids, because a
different question under an old id scores one move under another's name.

**And eight of the nine real-world moves were errands, a day after the rule
that should have removed them.** *"Hold ten seconds of cold water on the
face"*, *"Hold thirty seconds outside the door"*, *"One account, muted. That
is the whole task."* Every line opened on **Hold**, a verb `errand()` did not
know: the fifth pattern written the way its author would phrase a task.
`rw_lonely` had fired twice in production, which is two lonely people sent to
stand outside a door. Two tasks had no verb at all — a breathing count and a
task that names itself — one of each in production, and all three shapes in
the pipeline's fixture as rows **certified clean**, under *"four rows survive
everything"*. Check 5 had asserted *"ten naira"* as *"a number a person can act
on tonight"*: an assertion defending the bug, again.

**The question grader came back, and the corpus moved instead of the rule.**
`quality.ts` records killing *"ask one question"* and *"never stack
questions"* because hand-written replies failed them. They were right against
the constitution of the day. The founder's spec replaced it, so `closing`
returns as a decision, the way `fused` did, and 14 authored replies were
rewritten to end on one question. The other 20 that ran past three sentences
were cut to the cap the next morning, with every row graded before and after —
twenty `length` findings cleared, no grader newly fired, no reply changed
language — and check 154 reads the corpus now, so the instrument stays in tune
with the rule it is used to judge. `closing` is noted rather than retried —
19 of 118 production replies fail it, and a billed retry on one turn in six
is the wrong trade on a spec that also says strict token usage. `about_me` buys
a retry and never the hold, for `presumed`'s reason. Both drop the row from
training. The cap is three: 51 of 118 production replies ran longer.

**One mutation escaped, and it was the instrument.** Disabling a regex by
prefixing `(?!)|` makes an alternation that still matches, so the suite
passed over a frame that was still there. To switch a pattern off in a
mutation, delete the line. Nineteen of nineteen fail once that is done.

**What no check here can answer is whether it lands.** *"One or two
devastating lines"* is a claim about a person at 2am reading a sentence, and
the graders can only hold the shape it has to fit. The two numbers to read
first when traffic comes are `about_me` and `closing` — and they do not arrive
the same way. `about_me` buys a retry, so it lands in `vents.rejected_by`,
where the heartbeat reads grader names. `closing` is noted, so the live path
writes it nowhere; the number arrives from the nightly audit, which re-grades
the stored replies with whatever graders are current and names every one that
fired — the first eight in the Actions log, the full list in the `audit`
artifact, kept seven days.

**`vent_notes` left zero, and it cannot be credited to the landing trigger.**
The heartbeat reads `peopleWithCarve: 2, notes: 1`. The note was written on
2026-09-24 at 05:54 UTC, four vents into a sitting whose two anchors both came
before it — so the mood path could have fired the Carver as well as the
landing, and this file's attribution rule, *a carve on a sitting with no anchor
can only have come from the landing*, does not reach this one. And the sample
is small enough to name: every vent since 19 September — nineteen of them —
came from one person on one day. The Carver produces notes in production now;
which door opened this one is still unmeasured, and the next unanchored sitting
is the one that answers it.

**This paragraph first said the audit had never run, and that was false.** It
repeated *"the loop this feeds has never once run"* from the credit section
without reading the entries below it, which record run 29 reading production
and the leak it found. Run 37 went out on the commit that shipped these
graders: 50 of 127 stored turns read, 36 broke a rule, and one of them was
`about_me` — a reply written before the change, which is the baseline and not
a regression. A sentence copied from higher up this file is a claim about the
moment it was written, and this file is long enough for that moment to be
gone.

**"Are you even real?" was answered with an apology for repeating.** The
question the VENT spec is built around — *can something see me, can something
stay* — sat in `META` as `/are you (even )?(real|listening|a bot)/`, and `META`
had one answer that was not a refusal: *"You're right — I repeated myself, and
that's on me. Fixing it now."* False, and a promise about the next reply on
top. And `META` matches anywhere, so a vent that merely contained the phrase
lost everything else it said.

Nothing in the suite had ever asked what that route *says*: the live passes
never post to it, and eval asserted only that the injection refusal differed
from the apology. Found by probing the router with the spec's own questions
after the integration shipped, which is the fifth question this file keeps
asking — the check that could have caught it was never written because the
shape had never been looked at.

Three routes now. A **bare** question about what the room is — six words or
fewer, the greeting's rule for the greeting's reason — gets the spec's honest
answer locally, in English or Pidgin, for free. A longer message carrying the
same words is a vent, and the model answers it under a constitution that now
says when to say what it is. And *"are you even listening"* is not a question
about the room's nature at all but a rupture, which the prompt already meets —
*take your half, and stay* — and a canned line cannot, because it cannot see
what was missed. The apology lost its promise, ends on a question about them,
and has Pidgin now. Check 155 holds all three routes and six mutations fail
it; live check 18 posts the bare question to `/api/vent` and requires the
answer, for free — the seam eval cannot reach.

**And the regex went in as a backspace, for the second time in this file.** The
script that wrote `ASKED_WHAT_I_AM` turned `\b` into U+0008, so both patterns
were valid, matched nothing, and the router sent the question to the model. It
was caught because the probe asserted what the router *did* with the message —
this file's own instruction, *assert what it matches, never that the file
contains it* — and check 91 fails the build on the byte as well.

One gap left named rather than closed: *"you be robot?"* alone reads as English
to the router, because `you be` is in neither Pidgin list. Adding it is a
decision about the detector this file guards hardest, measured first, not a
line slipped in beside an unrelated fix.

**The sixth prompt sentence asking for homework was in the web lookup, and
the first sentence a stranger reads called this therapy.** Both found by
looking at what a surface *says* after the rules around it had changed.

`research.ts` asked its model for *"one imperative sentence a therapist could
act on"* and ruled that *"the move is a THING TO DO … It will be acted on"* —
which is how an evidence-based technique arrives as homework: have them list,
have them write, have them practise. The no-errands spec removed five
sentences like that from the prompt; this was the sixth, one block over, and it
is live in production because the key is set. The request now asks for
something to ask or reflect inside the conversation, and `parseTechnique`
refuses a task the way it already refused a finding — the prompt is a request
and the parser is the guard. Moves are written to the listener in the third
person, so `errand()` alone cannot see *"have them list three things"*; a
second pattern reads that shape, and the rows that must still pass — *"Ask
them what the number is doing to them"* — are asserted beside the ones that
must not, because a guard that empties the block looks exactly like caution.

And `layout.tsx` carried the product's default title as *"— Calm AI Therapy
Grounded in Reality"* and its description as *"Autonomous AI therapy grounded
in real time. Vent, track mood, breathe, journal."* — the text of every search
result and shared link. Every screen here says it is not therapy, the VENT
spec opens on *"You are not a therapist"*, and the room hands nobody a
breathing exercise or a journal. It says what the product is now, and the
crisis number still comes from `CRISIS_LINES`.

**Voice had never once worked on an iPhone, and 163 checks were green over it.**
The founder tested circle voice twice and reported that it does not work.
Nothing here could say why: `[voice] join failed` is a console line in a
browser, and production had logged no voice errors in seven days — which only
said the server half was fine.

The cause was one sentence in `mask.ts`, which was confidently wrong. The mask
refuses to publish a graph that is not running, correctly, and decided whether
it was running by reading `state` straight after `resume()`, under a comment
saying the state *"flips synchronously wherever the policy allows it at all"*.
The Web Audio spec says the opposite: the constructor sets *"[[control thread
state]] to suspended"*, and `running` arrives in *"a media element task"*
queued once processing starts (`WebAudio/web-audio-api`, `index.bs`, the
AudioContext constructor and "sending a control message to start
processing"). Only Chrome flips it synchronously. So on Safari, and on every
browser on an iPhone, the mask refused every context — including the ones that
would have been running a millisecond later — and the context was made after a
fetch, an SDK download and a microphone prompt anyway, long after the tap that
could have started it.

Then the screen compounded it in three ways. It told the person *"Tap Join once
more"* while their only button read *Leave voice*. It kept saying *"Your voice
is pitched down"* over a room that was hearing nothing. And its hold bar read
*"Speaking — let go to stop"* while nothing was published. Meanwhile the room's
own sound was silent too: LiveKit's source says *"iOS blocks audio element
playback if user is not publishing audio themselves and no other audio source
is playing"*, and nothing here ever called `startAudio()`.

Reproduced before it was fixed, against a real SFU, because a static check
cannot see a phone. `livekit-server` built from source through the Go module
proxy (GitHub releases are blocked from this environment). Two Chromium
browsers joined one circle, and an init script held them to the iPhone's two
rules: audio starts only inside a tap, and there is no `<audio>` playback
unless the page is capturing. The old build logged `mask unavailable:
context_suspended` on both seats, and the listener received **0 bytes** while
the speaker's screen read *Speaking*. The fixed build was heard: about 30 KB of
audio with non-zero energy, measured off the listener's own
`RTCPeerConnection` stats. Without the iPhone rules, the old build worked as
well — **the laptop shape was the only one anybody had ever tested.**

The context is now made as the first line of the tap (`audioContextInGesture`).
`whenRunning` then waits for it to say so, and the wait is bounded, because a
resume that is not allowed never settles. The mask takes the context it is
handed. The refusal stays, as the last guard rather than the only attempt. The
held-back microphone gets a button that exists (*Turn on my microphone*), and
held-back sound gets one too (*Tap to hear the room*). And the hold bar is a
tap toggle, because it looked exactly like a voice-note recorder: people held
it, spoke, let go and waited for a message that was never going to exist. The
privacy the hold bought is kept by the arrival — shut until you choose.

The server half gets a probe that asks rather than reads. `/api/health` now
reports `voice`, from a `ListRooms` signed with the same key and secret as
every join token. It is signed by hand rather than through the SDK, so the
dependency-free gate can run it offline against a loopback server. And it is
never part of `status`: a room with no voice is still a room people can be
heard in. Check 156 holds all of it, and 14 mutations fail it. Live check 19
holds the field in both of CI's shapes.

**What this cannot prove, stated rather than implied.** The iPhone rules are an
emulation built from the spec and LiveKit's own comment, and are not an iPhone.
The production SFU is unreachable from here, so whether it accepts our keys is
`/api/health`'s `voice` field, read after deploy. Whether it works on a phone
in Lagos is read by a person holding one.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
