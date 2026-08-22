# VENT — the office, end to end

What each part is, where it lives, and what it costs. Nothing here restates a
table that exists in code: where a list is the source of truth, this points at
the file instead of copying it.

## Stack

| Layer | What | Why this and not the obvious thing |
| --- | --- | --- |
| App | Next.js 16 App Router on Vercel | One deploy, server routes and pages in one repo |
| Model | Anthropic first, then gemini → groq → zhipu → deepseek → openrouter → cerebras | An empty credit balance took the product down for a week once. `src/lib/vent/providers.ts` |
| Store | Supabase (Postgres) with a `FileStore` fallback | `src/lib/store/`. Two backends, one interface |
| Search | Anthropic server-side `web_search_20260209` | No scraper to run, no key to hold, results arrive as content blocks |
| Voice | LiveKit, joined lazily | 13 MB SDK, imported inside the join handler only |
| Gate | `npm run gate` — zero dependencies | A fresh `git worktree` runs the whole suite with no `npm install` |

## The four subsystems

### 1. The prompt

`src/lib/vent/voice.ts` is the office contract: the reply shape, the
reflect-to-ask ratio, and the banned-phrase table. The system prompt is
**generated** from it (`OFFICE_RULES`), the offline grader imports it, and
check 76 fails the build on any authored string in the repo that violates it.

The twenty banned phrases are `BANNED_PHRASES` + `FILE_LANGUAGE` in that file.
They are not listed here on purpose — a second copy in a doc is a copy that
drifts, and two of the original six were phrases this product had written into
its own interface.

Assembled in `src/lib/vent/prompt.ts`. The heaviest possible prompt is measured
by check 24 against a hard ceiling; every block that has ever been added had to
pay for itself out of a duplication somewhere else.

### 2. Long-term memory

Four kinds, and only one of them needed building:

| Kind | Where it comes from | Where it lives |
| --- | --- | --- |
| Facts | The vent rows themselves | `selectMemory` — vents only, six-turn window |
| Open threads | Derived, not stored | `openThread()` — newest vent older than a 4h session gap |
| Emotional state | `tension_before` / `tension_after` / `mood_score` | `vents` columns, fed to `measureEfficacy` |
| User language | `language` column + `body_tapped`, `chair_picked` | Set at write time, read by the tactic selector |

**No vector database, deliberately.** A person here has tens of turns, not tens
of thousands; exact retrieval by `anon_id` beats similarity search at that size
and costs no embedding call per write. The threshold to revisit: when a single
user's row count makes the six-turn window lose things that matter — call it
500 turns — add `pgvector`, embed `user_message` on write, and replace
`selectMemory`'s tail with a top-k lookup. The interface (`Store`) is the seam;
nothing above it changes.

Open threads deserve the note. The naive build stores "unfinished topics" in a
new table and keeps them in sync. They are derivable instead: the newest vent
older than the session gap **is** the last thing said in a sitting that ended.
No column, no migration, and it is correct retroactively for every row already
written.

### 3. The internet brain

`src/lib/vent/research.ts`. One lookup per **pressure**, not per person and not
per message, cached 24h, fenced to nine clinical domains.

```
tag ──▶ cached("research:<tag>", 24h) ──▶ web_search_20260209 (allowed_domains)
                                       ──▶ parseTechnique() ──▶ {move, source} | null
```

Three rules decide the shape, and the third decides everything:

- **Per-pressure, not per-message.** What somebody is carrying does not change
  between minute four and five, and neither does the literature. Ten keys, ten
  lookups a day, shared by everyone carrying that pressure.
- **No URL, no technique.** `parseTechnique` drops anything without a link.
- **A move, never a finding.** The model is handed a thing to do in the next
  minute — never a statistic, a study or a percentage. `parseTechnique` refuses
  anything matching `/study|research|trial|\d+%|participants/`, and the source
  URL is deliberately kept **out** of the prompt: a model shown a citation will
  cite it, and a reply that quotes a paper at somebody at 2am is the fail state
  with a footnote.

With no Anthropic key: `research()` returns null, `researchBlock()` renders
nothing, the reply is unchanged. Nothing anywhere says a technique was
consulted when it was not.

### 4. Self-improvement

```
nightly ─▶ gradeReply (free, deterministic)  ─▶ known rule breaks ─▶ report only
        └▶ flatReplies (free, mechanical)    ─▶ ONE call ─▶ parseProposals
                                                        └▶ acceptable() ─▶ learned.ts
                                                                       └▶ npm run gate
```

`scripts/audit.mjs` proposes, `src/lib/vent/learned.ts` holds, the gate
decides. **`--apply` is not in the nightly workflow** — applying a rule edits a
version-controlled file, so every rule the room gave itself is a diff somebody
can read, blame and revert.

Cost: usually zero. The graders already know every rule the product states, so
only replies that broke *nothing* and are still flat (no question asked, none
of the person's words echoed, or the rating went the wrong way) reach a model —
one call, ten samples, capped. A night with none makes no call at all.

The brake is `acceptable()`. It refuses a rule that contains a banned phrase
(a rule quoting the failure it fixes is how a ban becomes an instruction), a
rule that asks for a quality nothing can grade, and a rule that reopens a house
rule. Three rules, ninety characters, oldest dropped.

## Feedback loop

Ratings already flow: `/api/feedback` → `feedback` table → `npm run rlhf` →
`data/dpo.jsonl`, ordered by the real efficacy drop (`tension_before` −
`tension_after`) rather than by the rating alone. What "real" means for this
userbase is measured, not declared: `measureEfficacy` ranks all tactics on
those drops and `measurePersonalEfficacy` does it per person.

## Deploying it

```bash
# 1. Env — Vercel project settings
ANTHROPIC_API_KEY=...              # unlocks both the chain and the web search
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...      # the identity that does the work
VENT_BACKUP_TOKEN=...              # gates /api/export; the audit reads through it

# 2. Database
#    Paste supabase/APPLY.sql in the SQL editor. It is idempotent.
#    Then: notify pgrst, 'reload schema';

# 3. Verify — as the identity that does the work, not as anon
curl -s https://<app>/api/health | jq '{status, database, storage, model}'

# 4. Nightly audit — GitHub repo secrets
#    VENT_BASE_URL, VENT_BACKUP_TOKEN, ANTHROPIC_API_KEY
#    .github/workflows/audit.yml runs 02:00 UTC and uploads the report.
#    It skips cleanly when the secrets are absent.

# 5. Local, any time
npm run local          # whole product, no accounts, no cloud
npm run gate           # the only opinion that counts about a merge
npm run audit -- --dry # graders only, zero tokens, no key needed
```

### Temperature

There isn't one. `temperature`, `top_p` and `top_k` are **removed** on Claude
Opus 5, Sonnet 5 and the 4.7/4.8 family — sending any of them returns a 400.
The equivalent control is `output_config: { effort }` (`low` … `max`), and
thinking is `{ type: "adaptive" }` rather than a token budget. The reply path
sets neither: a three-sentence reply is not an effort-sensitive task, and the
default is right. The research and audit calls are the same.

If a provider in the chain still takes `temperature`, the OpenAI-shaped adapter
passes it; the Anthropic adapter does not, and that asymmetry is intentional
rather than an oversight.

## Bad reply vs good reply

Real inputs, from the corpus. The pattern is the same every time: the bad one
could be pasted into any other conversation on earth.

| They said | Bad | Good |
| --- | --- | --- |
| "This month don finish me. Rent due and salary never enter." | "That must be really hard. You've got this — things will get better." | "Rent due, salary not in. Which one lands first — the landlord, or the day you run out?" |
| "My dad's test results came back and honestly i don't know." | "I'm here for you during this difficult time. Take care of yourself." | "You said the results came back and then stopped. What did they say?" |
| "It's the same thing every week." | "It sounds like you're stuck in a cycle. Have you tried journaling?" | "Same thing every week. Say the week — Monday to Sunday, where does it start?" |
| "I'm fine, just tired." | "Rest is so important. Make sure you're taking care of yourself!" | "Tired since when?" |
| "I keep sending money home and there's nothing left." | "Setting boundaries with family is really important for your wellbeing." | "Nothing left after you send it. Who decided the amount — you, or somebody else?" |
| "I don't even know why I'm typing this." | "It's okay to not know! This is a safe space to explore your feelings." | "You typed it anyway. What were you about to say before you stopped?" |
| "Everyone I know has left the country." | "Change is difficult. Focus on the connections you still have." | "Everyone. Who was the last one, and when?" |
| "I shouted at my sister and I feel terrible." | "Guilt shows you care. Try to forgive yourself." | "Terrible how — that you shouted, or what you said while you were shouting?" |
| "Work is fine. It's just a lot." | "It sounds like you may be experiencing burnout. Consider taking a break." | "A lot of what? Hours, or the thing you're not saying about it?" |
| "My mum died in March and I'm still not okay." | "I'm so sorry for your loss. Grief takes time — be gentle with yourself." | "March. Five months. What is it you're supposed to be okay about by now?" |

Every bad line above fails a check in `src/lib/vent/quality.ts` or a phrase in
`voice.ts`. That is the point: the fail state is measurable, so it can be a
build failure rather than a matter of taste.

## What no gate can measure

Whether the tone reads warm. That one is read by a person, in a real room, at
the hour this product is actually used — and it is where every product-quality
finding so far has come from. See CLAUDE.md, "When not to automate".
