---
name: circles-quality
description: Use when the heartbeat reports a losing Keeper, a governance refusal that reads wrong, a circle that closed badly, or presence behaving oddly. Carries the phases, the write-once guards, the governance rules and the four product-QA fixes, and says which of them a gate can actually prove.
---

# Circles quality

Persistent context for the circle loop. Phase 0 is text: six seats, forty-five
minutes, peer support — not therapy, not affiliated with AA.

## The shape of forty-five minutes

`phaseFor(msRemaining)` in `src/lib/circles/rules.ts`, measured from the start:

| Minute | Phase | What happens |
| --- | --- | --- |
| 0–3 | Breathing | Nobody speaks, the Keeper included |
| 3–8 | Opening | The Keeper reads the intention, once |
| 8–38 | Sharing | People share; anyone may reflect in one line |
| 38–43 | Reflection | The Keeper reads back the counted pattern, once |
| 43–45 | Closing | Rate 1–10, see the drop, carry one word, drop one |

## The Keeper speaks exactly twice, and never invents

Both lines are **selected, not generated**. No model call, no tokens.

- **Opening** — `keeperIntention(tag)` is the tag's `OPENING` sentence plus
  `REAL_WORLD_TACTIC[tag].hold`, the tactic library's own room-facing phrasing.
  One library, so a private session and a circle cannot drift. Adding a tenth
  real-world pressure means adding its `hold` in the same commit.
- **Reflection** — `keeperReflection(shares)` counts `PATTERN_WORDS` across
  what the room actually said and reports any appearing twice or more. It
  cannot name a pattern nobody voiced. With no repeated word it says how many
  people spoke, which is still true.

Two guards, keyed by author (`keeper:open`, `keeper:reflect`), each checked
separately. **Do not merge them.** Guarding both on `kind === "keeper_prompt"`
makes the opening suppress the 38-minute reflection — a bug that only shows
itself thirty-eight minutes into a live room.

The Keeper needs `members.length > 1`. The creator is a member, so
`members.length > 0` was true the instant a circle opened and the Keeper read
the intention aloud to itself.

## Governance, enforced on the server

`checkMessage(content, kind)` — content first, seat never:

- No advice (`ADVICE`), no cross-talk (`CROSSTALK`), a reflection is 140 chars.
- **There is no seat rule.** There was one: seats five and six joined as
  witnesses who could only reflect, refused with "Your turn comes." The turn
  never came, because roles were fixed at join. A circle must not promise what
  it cannot give. `roleForSeat` returns `keeper` for seat 0 and `sharer` for
  everyone else; witnessing is a way of speaking anyone may choose.
- The UI mirrors these rules for kindness. The server enforces them because
  curl walks around a greyed-out button.

Crisis is refused at the door and again inside the room: nothing is stored,
the person gets 0806 210 6493 and 199, and a route out to a private vent.

## Close means close

`sweepIfOver(store, circle)` in `src/lib/circles/sweep.ts` is the only copy of
this question. **Call it from every route that touches a circle**, before
doing anything else with it. It answers "is this over" and, on the transition,
deletes the transcript and ends the voice room — once, whichever request
noticed first.

It exists because the check used to live only in the room `GET`. A circle
nobody was polling therefore never closed at all: the row stayed `waiting`,
the transcript stayed readable to members, and the LiveKit room stayed live on
the SFU indefinitely. Now whoever knocks — a transcript read, a join, a seal,
a voice token, a mute — is the one who notices.

A closed circle answers 404 from the room itself and **410 from every other
surface**. Not an empty list: returning `{messages: []}` still tells a caller
the room is there. The 24-hour TTL is the backstop for rows nobody touches
again, not the policy.

## The Closing measures something

Each member's own `pressure_seeded`, from the chair they picked at join —
never the circle's, which would show a joiner somebody else's starting point.
`tensionDrop(seeded, mood)` from `src/lib/vent/chairs.ts`, the same arithmetic
as a private session. Choosing the dropped word seals it: the number, the drop
and the two words go to `.data/rlhf.jsonl` via `PATCH /api/circles/[id]`, and
**nothing else does** — not one line of what anybody said.

## The Guardian

`checkMessage` catches the phrasings we wrote down. Perspective catches the
paraphrase — "you are useless and everybody here knows it" — and it is a
**second** opinion, never the only one. `guardianVerdict(null)` passes, so an
unreachable classifier can never mute a room; the local rules always ran and
always will. Thresholds live in `src/lib/external/guardian.ts`: threat 0.7,
insult 0.8, toxicity 0.8. Toxicity sits highest because the score is noisy on
plain distress, and "I feel disgusting" must stay sayable here.

If a refusal reads wrong, tune the threshold in that one file and add the
sentence to `scripts/fixtures/external/perspective.json` so the eval suite
holds the new line. Never add a keyword list beside `ADVICE` — two lists drift.

## Presence

`src/lib/circles/presence.ts`. Derived from two timestamps, never stored as an
"online" boolean — a flag lies the moment a phone dies and needs a cleanup job
to un-lie.

- `last_seen_at` — touched by the poll that was already running, at most once
  per `TOUCH_INTERVAL_MS` (2.5s). Present = seen inside `PRESENCE_WINDOW_MS`
  (12s ≈ three missed beats of the 4s poll).
- `typing_until` — set `TYPING_WINDOW_MS` (8s) ahead while the composer has
  text. The poll carries `&typing=1`; there is no keystroke endpoint and no
  debounce timer.
- Counts and dots only. Never who. A circle has seats, not names.

Polling is the honest ceiling here. Supabase Realtime is already in the stack
and replaces it with no new dependency when the room count makes it worth it.

## Voice

`src/lib/voice/livekit.ts` mints the token with `node:crypto` — no SDK on the
server. `src/components/circle-voice.tsx` is the only file that imports
`livekit-client`, and it does so **inside the join handler**; a static import
would put 508 KB into every room's first load. Keep it that way.

Audio only, permanently: the grant is `canPublishSources: ["microphone"]`, so
a stray `setCameraEnabled` in the client would be refused by the SFU rather
than quietly shipping video to five strangers.

Identity is `seat-N`, derived server-side from join order. A client that could
name its own seat could name somebody else's, so the request carries only the
`anonId` and the route looks up the index.

**The token expires with the circle, never on a fixed clock.** The voice route
passes `ttlSeconds` computed from `ends_at`; `mintVoiceToken`'s 50-minute
default is a fallback nothing in the app should reach. It was the default once,
and a seat taken at minute 44 held a credential good until minute 94 — which
matters because deleting a LiveKit room is not revoking a token, and LiveKit
recreates a room on join. Two people with live tokens could reconvene the voice
of a circle the product had told everyone was over. If you touch this, keep the
lifetime bound to the circle.

Muting other people is `POST /api/circles/[id]/voice/mute`, the only place
`livekit-server-sdk` is imported. Three rules hold it:

1. **Mute, never remove.** `removeParticipant` is in that SDK and is
   deliberately never called. Ejecting somebody from a room they came to for
   support is abandonment, not moderation.
2. **Never silent.** The SFU raises `TrackMuted` on the muted client and the
   component says so in words. A quiet mute in a room whose promise is being
   heard would be the worst lie in the product. If you touch this, keep the
   notice.
3. **Authority is re-checked server-side.** `roomAdmin` lives in the Keeper's
   token, but a token is a claim the client holds — the route reads the role
   from the store on every call. Non-Keeper 403, non-member 403, self 422,
   empty seat 404.

Use the SDK's `TrackType` / `TrackSource` enums, never the integers.
`TrackType.AUDIO` is **0** and `VIDEO` is 1, so a hand-written `=== 1` mutes
the one thing this room can never publish and leaves the microphone open.

## Scoring a Keeper

`npm run rlhf` scores each tag on the **drop**, not the mood: somebody leaving
a family circle at 7/10 having arrived at 78 points of pressure had a good
night. Forty points off is a 5, nothing off is a 1, below 4.0 over two or more
circles is losing and gets written to `data/dpo.jsonl` as a negative sample
against that tag's opening line — which is fixable, because the line lives in
the tactic library.

## What the gate can and cannot prove

```bash
node scripts/heartbeat-data.mjs --gate
```

Proves: governance refusals, roles, the counted reflection, the library
wiring for all nine tags, the tension arithmetic, presence windows, and — with
a server on :3001 — that a room 404s after closing and that the last seat can
share.

Cannot prove: whether the room *felt* held. The Keeper's opening at minute
three and the reflection at thirty-eight only exist in a live forty-five
minute room, and the way to check them is to sit in one. That is a person's
job, and it is where the last five findings came from.
