# Where VENT actually stands

## A note on this table before you read it

Every VENT cell below is a file you can open or a check you can run. Every
competitor cell is from public product pages and published research, and where
I could not verify a claim I have written "not published" rather than a number
that would make us look better.

That is not modesty. This repository's first rule is that an invented fact is
worse than an absent one, and a competitive table is the easiest place in a
company to break it — the claims end up in a deck, the deck ends up in a
conversation with an investor, and nobody can say where the number came from.
A comparison that only works if nobody checks it is not an advantage.

| | VENT | Woebot | Wysa | Replika |
| --- | --- | --- | --- | --- |
| **Memory across sessions** | Six-turn window + a carve, an open thread derived from the session gap, and per-person efficacy. `memory.ts`, `prompt.ts` | Session-scoped by design; CBT modules, not recall | Session-scoped; some journal continuity | Persistent profile and long-term memory, marketed as its main feature |
| **Human tone** | Enforced, not aspired to: 23 banned phrases fail the **build**, and a reply carrying one is regenerated before anybody reads it. `voice.ts`, `failsafe.ts` | Scripted decision trees; deliberately consistent | Scripted + LLM hybrid | Free-form; optimises for engagement |
| **Learning speed** | Nightly audit proposes rules from real sessions; the gate decides. Per-tag web lookup, cached daily. `audit.mjs`, `research.ts` | Clinical release cycle — slow on purpose | Clinical release cycle | Continuous, engagement-driven |
| **Crisis handling** | Local, free, always runs — before any model call, in every deployment shape, including one with no keys at all. Verified by live check 3 and no-store check 6 | Documented crisis routing | Documented crisis routing, SOS toolkit | Widely reported failures |
| **Privacy** | No account exists to make. Anonymous id generated on the device, one tap deletes everything, circle transcripts deleted at close and never used as training data | Account-based | Account-based; anonymous option | Account-based |
| **Cost** | Free. Most messages never reach a model — crisis, date, greeting and meta are answered locally | Free / employer-funded | Freemium | Freemium + subscription |
| **Accessibility** | Web, no install, no account, works on a 360px phone, Pidgin and English, Nigerian context by construction | App store, US-centric | App store | App store |

### Alliance before treatment

Woebot opens with mood tracking. Wysa opens with an exercise. Both are doing
the second thing first, which works on somebody who has already decided to be
helped and loses everybody else in ninety seconds.

VENT's first three messages are `src/lib/vent/intake.ts`, and there is no form
in them. A returning person is welcomed back **and the thing is named** — the
carve, in their own words — or, if there is nothing specific to name, they get
the new-visitor line instead, because "welcome back" said to a stranger is the
single tell that makes a product in this category feel fake.

At the third exchange, once ever, the room says what it is. The claim half of
that sentence — *"I keep what we talk about"* — is only said when the write
actually landed; with no store it says the disclosure and drops the claim,
because "I remember" told to somebody whose words are being dropped is the
first entry on CLAUDE.md's list of thirteen. Check 84 asserts both halves.

### Where the advantage is actually real

Three of those rows are structural rather than a matter of effort, and they are
the ones worth defending:

1. **Crisis routing runs with nothing configured.** No API key, no database,
   no network to a model — the classifier is local and free. `no-store-verify`
   check 6 asserts it in the shape that has no keys at all. A product whose
   safety path depends on a vendor being up has a safety path that is down
   sometimes.

2. **The voice is a build failure, not a style guide.** Every other product on
   this list improves tone by writing better prompts. Here, a banned phrase in
   any authored string fails CI (check 76), a duplicated sentence fails CI
   (check 81), and a model reply carrying one is regenerated before it is sent
   (check 82). Tone drift is the default outcome of shipping for a year;
   nothing here can drift without turning a build red.

3. **No account.** Not "anonymous mode" — there is no user table to be
   anonymous in. That is the difference between a promise and an architecture,
   and it is why the deletion button is one tap and takes everything.

### Where we are behind, honestly

- **Clinical validation.** Woebot has published RCTs. We have 2,892 assertions
  and zero trials. Those are not the same kind of evidence and it would be
  dishonest to put them in the same column.
- **Long-term memory depth.** Replika's whole product is recall; ours is a
  six-turn window plus a derived thread. That is deliberate at this size —
  exact retrieval beats similarity search at tens of turns — but it is a
  ceiling, and `docs/ARCHITECTURE.md` names the threshold where it stops being
  the right call.
- **Reach.** They have app stores and marketing budgets.

## Thirty days

Sequenced so that each week is shippable on its own, and nothing depends on a
week that has not happened.

**Week 1 — make it real for one person.**
Anthropic credit so replies come from the top of the chain rather than Groq.
Apply `supabase/APPLY.sql` and confirm `/api/health` reports `database: ok`
*as the service role*. Set `VENT_BACKUP_TOKEN` so the nightly audit has rows to
read. Then use it yourself for seven days, at the hour it is written for, and
write down every sentence that made you wince. That list is worth more than the
next three weeks of code.

**Week 2 — make the memory earn its name.**
The long-term tables (facts, relationships, triggers, wins) from
`docs/ARCHITECTURE.md`, extracted from signals already stored rather than by a
new model call per turn. Then the thing that proves it: on the second session,
the room names something specific from the first, and it is right.

**Week 3 — get ten people in a circle at once.**
Circles are the only thing on that table nobody else has, and they have never
had six real people in them. One scheduled room a night for a week, seeded by
you. Watch what the Keeper does at minute 38.

**Week 4 — let it be found.**
The landing page is written; nothing points at it. One Nigerian mental-health
community, one honest post that says what this is and what it is not, and the
referral list in `referrals.ts` verified by three phone calls — because a
number that does not answer is worse than no number, and that is the one claim
on this whole page nobody can check but us.

### What would make me wrong about week 4

If week 1 produces a list of sentences that made you wince, weeks 2 and 3 are
the wrong order. Fix the voice first. Everything on the table above is
recoverable except somebody's first session being bad.
