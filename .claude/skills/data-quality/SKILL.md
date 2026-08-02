---
name: data-quality
description: Use when the heartbeat reports a dirty vent — a reply that gives advice, a vent answered with no tactic, a duplicate that slipped the filters, a domain mix drifting off target, or a losing tactic in the preference pipeline. Carries the extraction, dedup, heuristic and reweighting rules and says where each one lives.
---

# Data quality

Persistent context for the data loop. Read this instead of being told it.

## What the pipeline is

`scripts/data-pipeline.mjs` walks `.data/vent.json` the way a pretraining
pipeline walks a crawl, in four stages. Every stage is in that one file.

1. **Extract** — one record per vent, with the readings as tokens:
   `[CHAIR:tight_edge] [BODY:chest] [PRESSURE:82] [TAG:economy] [LANG:pidgin] [FLAVOUR:fire×lawyer×gym] [MEM:4]`
   then a newline, then the person's own words. Structure stays structure;
   prose stays theirs. `[MEM:n]` is recomputed with `selectMemory`, so the
   record says what the model could actually see.
2. **Filter** — `FILTERS`, cheapest first. `not_a_vent`, `too_short`,
   `no_completion`, `fallback_text`, `no_tactic`, `gives_advice`.
3. **Dedup** — exact by sha1 of `norm(vent) + norm(reply)`, then near-dup by
   Jaccard ≥ 0.92 over the token set of the **pair**. The pair, not the vent:
   the same sentence answered differently is two data points.
4. **Reweight** — `TARGET_MIX`: economy 40%, japa 30%, family 20%, the rest a
   long tail. Expressed as a per-record `weight`, never by duplicating rows —
   duplication is how a corpus memorises.

## Invariants — do not break these

- **Circle transcripts are never training data.** Confidentiality is a
  deletion policy; a training set is the opposite. Circles are counted in the
  summary and never quoted. If a change would put a circle message into
  `data/`, the change is wrong.
- **A fallback is not a completion.** `PLACEHOLDER` catches "I'm running
  without my model key" and "Network dipped on my side". Training on those
  teaches the model to apologise.
- **The circle's own rules are the quality filter.** `checkMessage(reply,
  "share")` runs over every candidate completion. A reply that would be
  refused in a room is not worth training on. Do not write a second advice
  regex — extend `ADVICE` in `src/lib/circles/rules.ts` and both get it.
- **Silence beats a guess.** Below `CONFIDENCE_FLOOR` (0.34) the flavour
  token is omitted entirely. Never ship `The Unnamed Air` into a dataset as
  though it were an observation.
- **`data/` is gitignored.** It is built from real vents. It never gets
  committed, pasted into an issue, or attached to anything.

## Where the rules live

| Rule | File |
| --- | --- |
| Intent routing, meta vs vent | `src/lib/vent/intent.ts` |
| Tactic selection, 3-turn block, somatic gate | `src/lib/vent/tactics.ts` |
| Memory: vents only, six-turn cap | `src/lib/vent/memory.ts` |
| Chair → tension → drop | `src/lib/vent/chairs.ts` |
| Advice / cross-talk / one-line reflection | `src/lib/circles/rules.ts` |
| Flavour confidence floor | `src/lib/flavour/types.ts` |
| Preference log sink | `src/lib/rlhf/log.ts` |

Two rules that were fixed the hard way and must not regress:

- `META` patterns must point at the assistant. "It's the same thing every
  week" is a person naming their own pattern — the most valuable sentence in
  the corpus — and a bare `/same thing/` routed it to an apology.
- The store is two backends behind one interface. `FileStore` writes
  `.data/vent.json` write-then-rename through a serialised promise chain;
  `getStore()` refuses it in production without `VENT_LOCAL_STORE=1`. The
  preference log appends instead, because rewriting a log is O(n) per signal.

## Working a finding

```bash
node scripts/heartbeat-data.mjs        # what changed, and what is dirty
npm run data                           # rebuild the sets, read the drop table
npm run rlhf                           # what is losing, and by how much
```

- `advice_in_reply` — the prompt permitted it. Fix the system prompt in
  `src/lib/vent/prompt.ts` or the tactic's `instruction`, never the filter.
  The filter catching it is the system working.
- `no_tactic` — `selectTactic` always returns something, so a null means the
  vent never reached stage 4. Check the free-path routing in
  `src/app/api/vent/route.ts`.
- A domain drifting — that is `TARGET_MIX`, a product decision. Change it
  deliberately, in one commit, with the reason in the message.

## The gate

Nothing merges unless this passes:

```bash
node scripts/heartbeat-data.mjs --gate
```

which runs the selector tests, `scripts/eval.mjs` (10/10), the pipeline, and
`live-verify` if something is serving on :3001. The gate has **zero
dependencies** — a fresh worktree can run it with no `npm install`.

## When not to loop

Skip the loop for one-offs (the `icon.svg` route collision was fixed once and
never came back), for judgment calls (whether `thought_record` reads warm or
like a clipboard is taste, and no gate measures taste), and for anything the
gate cannot see. Naming these and leaving them for a person is part of the
job, not a failure of it.
