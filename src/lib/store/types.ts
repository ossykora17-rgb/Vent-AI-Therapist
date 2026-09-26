import type { Note } from "@/lib/vent/notes";
/**
 * One storage interface, two backends: Supabase in the cloud, a JSON file on
 * disk for local development. The routes never know which one they got, so
 * `npm run dev` gives the complete product — memory, history, rate limits,
 * wipe — with no account, no Docker and no extra dependency.
 */

export interface VentRow {
  id: string;
  user_id: string;
  user_message: string;
  ai_reply: string | null;
  mood_score: number | null;
  tension_before: number | null;
  tension_after: number | null;
  language: string | null;
  duality_value: number | null;
  body_tapped: string | null;
  chair_picked: string | null;
  pressure_value: number | null;
  tactic_used: string | null;
  /** Which extraction question was asked. Mirrors tactic_used — see probes.ts. */
  probe_used: string | null;
  /**
   * Which graders rejected the first attempt, or null.
   *
   * Names only, never details — the details quote the reply, and a column
   * outlives a log line. The failsafe's only other record is a `console.warn`
   * on a plan that keeps stdout for one hour, so without this a failsafe that
   * works and a failsafe that is dead code look identical.
   */
  rejected_by: string | null;
  intent_type: string | null;
  real_world_tag: string | null;
  real_date_used: string | null;
  safety_flagged: boolean;
  created_at: string;
}

export type NewVent = Omit<VentRow, "id" | "created_at" | "safety_flagged"> &
  Partial<Pick<VentRow, "safety_flagged">>;

export interface ProfilePatch {
  chairPicked?: string | null;
  objectPicked?: string | null;
  onboardingDone?: boolean;
}

export interface CircleRow {
  id: string;
  creator_anon_id: string;
  tag: string | null;
  chair_picked: string | null;
  pressure_seeded: number | null;
  flavour: string | null;
  status: "waiting" | "live" | "closed";
  starts_at: string;
  ends_at: string;
  created_at: string;
}

export interface CircleMemberRow {
  id: string;
  circle_id: string;
  anon_id: string;
  role: "keeper" | "sharer" | "witness";
  /** Their own chair reading, so the closing drop is measured from theirs. */
  pressure_seeded: number | null;
  /** Last poll. Presence is derived from this, never stored as a boolean. */
  last_seen_at: string | null;
  /** Set a few seconds ahead while there is text in their box. */
  typing_until: string | null;
  joined_at: string;
}

/**
 * A browser to wake when somebody sits down in this circle.
 *
 * No name, no device string, no user agent, no last-seen. The row answers one
 * question — where to send the one notification — and cannot answer another.
 */
export interface CirclePushRow {
  id: string;
  circle_id: string;
  anon_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

/**
 * A voice note, without its sound.
 *
 * The listing never carries the audio: the thread is polled every four
 * seconds by everybody in the room, and a minute of WAV riding on each poll
 * would be a megabyte a person every four seconds. The sound is fetched once,
 * by id, by somebody who is in the room — `getVoiceNoteAudio`.
 */
export interface CircleVoiceNoteRow {
  id: string;
  circle_id: string;
  anon_id: string;
  duration_ms: number;
  created_at: string;
}

export interface CircleMessageRow {
  id: string;
  circle_id: string;
  anon_id: string;
  content: string;
  kind: "share" | "witness" | "keeper_prompt" | "guardian";
  flagged: boolean;
  created_at: string;
}

/**
 * How many notes are kept.
 *
 * A single note is a nice moment; a handful is a record. Past about five it
 * stops being something a person reads and becomes a list they scroll, which
 * is the failure mode of every gratitude journal ever shipped.
 */
export const HELD_CAP = 5;

/** One thing that held, and when they said so. */
export interface HeldNote {
  text: string;
  at: string;
}

/**
 * How many Breaking Room answers are kept.
 *
 * Higher than `HELD_CAP` because these are not interchangeable. A held note is
 * one of a kind of thing; a breaking answer is the answer to *that* question,
 * and dropping it loses the only record that the question was ever asked —
 * which would let the room ask it again, of somebody who already paid to
 * answer it once.
 *
 * The column constraint allows sixty. This is under it on purpose: the
 * constraint is a ceiling that stops a bug, and this is the product decision,
 * which is the thing that moves.
 */
export const BREAKING_CAP = 30;

/**
 * One heavy question, answered.
 *
 * `q` is the question id rather than its text — the wording of a question is
 * ours and may be improved; what somebody said is theirs and never changes.
 * Storing the text would freeze an old draft into their record and make an
 * edit look like they answered something they never saw.
 */
export interface BreakingAnswer {
  /** The `Question.id` from `lib/vent/breaking`. */
  q: string;
  /** Their words. Never a model's. */
  a: string;
  at: string;
}

export interface Store {
  /** Which backend answered — surfaced in /api/health so it is never a guess. */
  readonly kind: "supabase" | "file";

  ensureUser(anonId: string, patch?: ProfilePatch): Promise<string | null>;
  findUserId(anonId: string): Promise<string | null>;

  /** Vents since a timestamp, for rate limiting. */
  countVentsSince(userId: string, since: Date): Promise<number>;

  /** Most recent first is easier to query; callers reverse for prompt order. */
  recentVents(userId: string, limit: number): Promise<VentRow[]>;
  /**
   * The newest vents across everybody, for the loop only.
   *
   * Deliberately not scoped to a person, and deliberately never reachable
   * from a route that returns content. /api/heartbeat counts what comes back
   * and returns numbers; nothing anybody wrote leaves through it. Any new
   * caller has to answer that question again before using this.
   */
  recentVentsAcross(limit: number): Promise<VentRow[]>;

  /**
   * How much the room is actually holding, across everybody. Counts only.
   *
   * WHY THIS EXISTS AT ALL
   *
   * `vent_notes` produced **zero rows** for its whole life and
   * `vent_users.carve` produced **one**, against 108 vents. The trigger was
   * the reason and it is repaired — the carve now fires when the arc says a
   * sitting is landing, not only when somebody taps a number — and the note
   * that repair ends on is *"the only evidence worth anything here is
   * `vent_notes` going above zero in production. That is the number to read
   * first when traffic resumes."*
   *
   * Nothing reported that number. A fix whose verdict lives in a query
   * somebody has to remember to run is the shape this repository keeps
   * recording: a measurement that is unreachable rather than merely empty.
   * `/api/heartbeat` is where counts live, so this is what it reads.
   *
   * Counts and nothing else — never a carve, never a note's subject, never an
   * id. That is the property that makes the heartbeat safe to leave open, and
   * it is the same rule the stdout policy states one file over.
   *
   * **`peopleWithCarve`, not `carves`**, and check 126 is the reason. A carve
   * is `vent_users.carve` — one text column, one per person, ever — so a field
   * called `carves` is the sticky header's *"4 earlier carves"* bug wearing an
   * operator endpoint. The honest quantity is how many people are holding one.
   * Notes are legitimately plural: `listNotes` returns an array.
   */
  countMemory(): Promise<{ peopleWithCarve: number; notes: number }>;
  listVents(userId: string, limit: number): Promise<VentRow[]>;

  insertVent(vent: NewVent): Promise<void>;
  deleteVent(userId: string, ventId: string): Promise<void>;
  /**
   * Write the outcome onto the most recent vent.
   *
   * The only thing this product claims is that the weight goes down, and
   * until now nothing ever wrote the second reading — `tension_after` was a
   * hardcoded null on every insert, so no session could be anchored, the
   * heartbeat's mean drop could never exist, and the efficacy loop had no
   * data and never would.
   *
   * Returns whether a row was actually updated, because the UI said "Saved"
   * before it knew.
   */
  anchorLatestVent(userId: string, mood: number, tensionAfter: number): Promise<boolean>;

  /**
   * The carve — eight words for the wound, from the last session that had one.
   *
   * One column on the person's own row — `vent_users.carve`, added in 0011 —
   * so it is deleted with them and no delete path has to remember it exists.
   * It was briefly written to `public.memories`, whose `user_id` references
   * `auth.users(id)`: an id space anonymous venters are not in, so Postgres
   * rejected every write while `FileStore` accepted them all.
   *
   * Null is the ordinary answer, not an error: no store, no row, a table that
   * is not there, a read that threw. Every one of those means the next
   * session opens knowing nothing, which is exactly what it did before this
   * existed. Nothing downstream is allowed to treat null as a failure.
   */
  getCarve(userId: string): Promise<string | null>;
  /**
   * Write the carve, or clear it with null.
   *
   * Null rather than `""`: the column is
   * `check (carve is null or char_length(carve) between 1 and 200)`, so an
   * empty string is a constraint violation in Postgres and a perfectly happy
   * value in `FileStore` — the same local-works/production-fails split that
   * put the carve in the wrong table to begin with.
   *
   * Returns whether the row actually landed. Nothing may claim it did otherwise.
   */
  setCarve(userId: string, carve: string | null): Promise<boolean>;

  /**
   * What held, in their own words — the other half of the carve.
   *
   * `vent_users.held` (0013), a jsonb array newest-first, capped in
   * application code rather than in a constraint because a cap is a product
   * decision that moves and a migration is a bad place to keep a moving
   * number.
   *
   * Written only by the person and never by a model. That is what makes it
   * the one thing in this product safe to quote back at them: they wrote it
   * while they were alright, on purpose, for the version of them that is not.
   *
   * Same null discipline as the carve — an empty array is the ordinary
   * answer, never an error.
   */
  getHeld(userId: string): Promise<HeldNote[]>;
  /** Prepend one note, trimming to the cap. Returns whether it landed. */
  addHeld(userId: string, text: string): Promise<boolean>;

  /**
   * What they answered when the room asked something heavy — 0015.
   *
   * **Null and `[]` are different answers, and this is the whole reason this
   * signature is not `Promise<BreakingAnswer[]>`.**
   *
   *   `[]`    read it; they have answered nothing yet
   *   `null`  could not read it — no row, no column, a throw
   *
   * `getCarve` and `getHeld` can collapse those two, because a missing carve
   * means a room that opens knowing nothing, which is exactly what it did
   * before the carve existed. This cannot. The ids in this list are the only
   * thing stopping a question being asked twice, so an unreadable column
   * returned as `[]` makes every question look unasked — and a deployment
   * with 0015 pending would offer the same question, fail to keep the answer,
   * and offer it again on the next cadence turn, forever.
   *
   * A person asked the same question twice has learned the room was not
   * listening the first time, and there is no recovering from that inside one
   * session. So the caller must treat null as "do not open the room" rather
   * than as "nothing here yet", and it can only do that if it can tell them
   * apart. This is the `models.retrieve` lesson in the store: a probe whose
   * failure and whose success return the same value is not a probe.
   */
  getBreaking(userId: string): Promise<BreakingAnswer[] | null>;
  /**
   * File one answer. Returns whether it landed.
   *
   * Never called with a model's words on either side: `q` is an id from a
   * hand-written bank, `a` is what the person typed. Nothing in this pair was
   * generated, so nothing in it can be invented.
   */
  addBreaking(userId: string, q: string, a: string): Promise<boolean>;

  deleteAll(userId: string): Promise<void>;

  // ── What the room knows across sessions ──────────────────────────────────
  /** Everything about this person, newest first. Empty is the ordinary case. */
  listNotes(userId: string): Promise<Note[]>;
  /**
   * Write what the Carver learned. **Returns how many rows landed**, not
   * whether Postgres complained — one note out of four surviving is still a
   * session that learned something, and a caller cannot tell the difference
   * from a boolean.
   */
  saveNotes(userId: string, notes: readonly Note[]): Promise<number>;
  /**
   * Take one back.
   *
   * Throws when the delete could not be attempted, the way `deleteVent` and
   * `deleteAll` do, rather than reporting by return value the way `setCarve`
   * does. That is deliberate and it is the lesson from the `?carve=1` bug: a
   * method that reports failure by returning is one call site away from having
   * its answer dropped, and this one answers the only question that matters on
   * that page. A throw cannot be ignored.
   *
   * Deleting a row that is not there is not an error. The question a person is
   * asking is "is it gone", and for a note that was never theirs the answer is
   * yes — scoped by `user_id` so an id from somebody else removes nothing.
   */
  deleteNote(userId: string, noteId: string): Promise<void>;

  // ── Circles ─────────────────────────────────────────────────────────────
  listOpenCircles(): Promise<Array<CircleRow & { seats: number }>>;

  /**
   * Circles whose clock is up and which nobody has closed.
   *
   * The one query in this interface that exists to find rows *nobody is
   * asking for*, and the reason it has to exist is written at the top of
   * `sweep.ts`: a circle nobody polls never closes, so its transcript stays
   * readable and its voice room stays live on the SFU.
   *
   * That comment says the fix was calling `sweepIfOver` from every route. It
   * is not sufficient and never was. Every one of those routes is scoped to a
   * circle id, so the check only runs when somebody asks about that circle —
   * and when a circle ends, everybody closes their tab. `listOpenCircles`
   * filters the expired ones out with `ends_at > now()`, so the lobby cannot
   * see them either. The rows go invisible instead of going away.
   *
   * The common case, not an edge case: the normal end of a normal circle.
   *
   * Bounded by `limit` because the caller is a route somebody is waiting on,
   * and a backlog is swept a few at a time rather than all at once. There is
   * no deadline on a backlog; there is one on the person who opened the page.
   */
  expiredUnclosedCircles(limit: number): Promise<CircleRow[]>;
  getCircle(id: string): Promise<CircleRow | null>;
  createCircle(c: Omit<CircleRow, "id" | "created_at">): Promise<CircleRow>;
  closeCircle(id: string): Promise<void>;

  /**
   * Everybody in the room, in the order they arrived.
   *
   * Total and identical across both backends. Seat numbers are derived from
   * this position — `seatOf` in the messages route, the `seat-N` voice
   * identity, the ring the room draws — so two stores that break a
   * `joined_at` tie differently would hand the same person different seats
   * depending on where the deployment keeps its rows.
   */
  listMembers(circleId: string): Promise<CircleMemberRow[]>;
  /**
   * Which circles this person already holds a seat in. Ids only.
   *
   * Ids and nothing else on purpose. The one existing way to answer this was
   * `listMembers` per circle, and the lobby route returns `listOpenCircles()`
   * verbatim to the browser — so widening *that* to carry members would
   * publish every seated person's anon id to anybody who loads the page, and
   * an anon id here is not an identifier, it is the whole credential.
   *
   * Open-ness is not asked about, because this table does not know: the
   * caller intersects with `listOpenCircles`, which already owns both the
   * status and the clock predicate.
   */
  seatedIn(anonId: string): Promise<string[]>;
  /**
   * Take a seat. **True only if a row was actually written.**
   *
   * It used to return `void`, and both implementations quietly declined a
   * full room — which the route could not see, so it answered 201 with a role
   * to somebody who had no seat. That is the shape of the worst bug this
   * product ever shipped: a promise the code could not keep, made to the
   * person least able to absorb it.
   */
  addMember(
    m: Omit<CircleMemberRow, "id" | "joined_at" | "last_seen_at" | "typing_until">,
  ): Promise<boolean>;
  /**
   * Where to wake somebody who is holding this room, if they asked to be woken.
   *
   * Keyed to the circle, not to the person, and that is the whole design: a
   * push subscription is a capability to wake a device, and held per person it
   * is a thing this product keeps indefinitely on a front page promising one
   * tap deletes everything. Here it dies in `closeCircle` with the seats and
   * the transcript, so the capability cannot outlive the forty-five minutes it
   * was granted for.
   *
   * Returns whether a row was written, like `addMember` and unlike everything
   * else in this interface — a subscription that did not land must not be
   * reported as kept, and check 87 sweeps every boolean-returning method for a
   * caller that reads the answer.
   */
  savePush(p: {
    circleId: string;
    anonId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<boolean>;
  /** Everybody in this room who asked to be woken, minus the person who just acted. */
  listPush(circleId: string, exceptAnonId: string): Promise<CirclePushRow[]>;
  /** One endpoint, gone. Called when the push service says it is dead (404/410). */
  dropPush(endpoint: string): Promise<void>;
  /**
   * Keep one voice note for as long as the room lasts. `audio` is the masked
   * WAV as base64, already validated by the route.
   *
   * Returns the new row's id, or null when nothing landed — read off the rows
   * the write returned, never off the absence of an error, which is the shape
   * `savePush` and `setCarve` were each wrong about once.
   */
  addVoiceNote(n: {
    circleId: string;
    anonId: string;
    durationMs: number;
    audio: string;
  }): Promise<string | null>;
  /** Every note in this room, oldest first, without the sound. */
  listVoiceNotes(circleId: string): Promise<CircleVoiceNoteRow[]>;
  /** One note's sound, and whose it is — scoped to the circle, so an id from
   *  another room answers nothing. */
  getVoiceNoteAudio(circleId: string, noteId: string): Promise<{ anon_id: string; audio: string } | null>;
  /**
   * Take one note out of its room. True only when a row was deleted — a note
   * already gone, or a note from another room, is false, and the caller says
   * so rather than claiming a removal nobody watched.
   */
  deleteVoiceNote(circleId: string, noteId: string): Promise<boolean>;
  /**
   * Give the seat back. Used to undo a join that lost a race, and by nothing
   * else — leaving a circle is not a feature, it is a thing that happens when
   * the clock runs out.
   */
  removeMember(circleId: string, anonId: string): Promise<void>;
  /** "I am still here", and optionally "and I am writing". */
  touchMember(circleId: string, anonId: string, typing: boolean): Promise<void>;

  /** Anything past the TTL is dropped rather than returned. */
  listCircleMessages(circleId: string): Promise<CircleMessageRow[]>;
  addCircleMessage(m: Omit<CircleMessageRow, "id" | "created_at">): Promise<void>;

  countFeedbackSince(anonId: string, since: Date): Promise<number>;
  insertFeedback(input: {
    userId: string | null;
    anonId: string;
    rating: number;
    message: string | null;
  }): Promise<void>;
}
