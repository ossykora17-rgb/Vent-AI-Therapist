import type { MemoryRow } from "./prompt";
import type { Pattern } from "./pattern";
import { MAX_IN_PROMPT, noteLine, type Note } from "./notes";
import { recentCrises } from "./assess";

/**
 * LAYER 2 — what the room holds about somebody, as one structured object.
 *
 * The founder's memory spec has three layers. Layer 1 is the working memory:
 * the last six vents, sent as the conversation itself (`MEMORY_TURNS`). Layer 3
 * — a vector index over summaries, graph links between themes — is "optional
 * later", and the reason it is later is written at the bottom of this file.
 * This is Layer 2, in the shape the spec gives it:
 *
 *   { core_themes, important_facts, risk_history, preferences, session_summaries }
 *
 * NOTHING HERE IS A NEW STORE, AND THAT IS THE WHOLE DESIGN
 *
 * Every field is read from something this product already keeps, already
 * shows on the Memory page with a delete button, and already destroys in
 * `deleteAll` — so "one tap deletes everything, for good" stays true with no
 * new table, no new promise and no line in the privacy page:
 *
 *   core_themes       ← `findPattern` over their own vents, and their `trigger`
 *                       and `hard` notes — what recurs, in their words
 *   important_facts   ← their `fact`, `person`, `goal` and `win` notes
 *   risk_history      ← crisis turns of theirs inside `CAREFUL_FOR_DAYS`
 *   preferences       ← their `language` notes: how they asked to be met
 *   session_summaries ← the carve, the thread a sitting left open, and the
 *                       word they carried out of a circle
 *
 * Before this it was five blocks in five places in the prompt — notes after
 * the learned rules, the other four above flavour — each with its own heading
 * and its own copy of the silence rule, under a 243-token set of rules that
 * governed all five. One object and one block say the same thing once.
 *
 * ONLY WHAT THEY SAID
 *
 * The spec's first rule, and it is held at the write rather than hoped for at
 * the read: `keepable` refuses a condition and an interpretation stated as
 * fact, and `unsaid` in carve.ts refuses a person or a sum they never named.
 * Themes are counted from the router's reading of their own messages, never
 * generated. The carve is the one field a model compresses, and it is the one
 * field the Carver is told to write in their words and never to add a feeling
 * to — shown on the Memory page, where they can delete it.
 */
export interface SemanticMemory {
  core_themes: Theme[];
  important_facts: Fact[];
  /**
   * Dates of their own crisis turns, newest first, inside `CAREFUL_FOR_DAYS`.
   *
   * Held and never rendered. It already changes what the room will not ask —
   * `careful` vetoes the moves that rate, argue or plan, and the lines ride
   * beside the reply — and assess.ts records why it goes no further: *never
   * said to them; it changes what the room will not ask, not what it says
   * about them*. A model told "they were in crisis last week" will say so.
   */
  risk_history: string[];
  /** How they asked to be met, keyed by what they called it. */
  preferences: Record<string, string>;
  session_summaries: Summary[];
}

export interface Theme {
  /** Their words for it, or the pressure the router read in their messages. */
  name: string;
  detail: string;
  /**
   * True only for what was counted across their sittings. A trigger or a hard
   * thing they named once is a theme, and not yet something that "keeps coming
   * back" — saying so would be the room inventing a pattern.
   */
  counted: boolean;
}

export interface Fact {
  subject: string;
  detail: string;
}

export interface Summary {
  kind: "carve" | "thread" | "held";
  text: string;
  /** The day it was said, for a thread. */
  at?: string;
}

/**
 * How many held words the prompt carries.
 *
 * Two, against `HELD_CAP`'s five. These are single words — "guilt",
 * "tiredness" — so the gap is not about cost: a room that opens by listing
 * five things somebody once said about themselves is reciting a file back at
 * them, which is the failure `MAX_IN_PROMPT` caps notes at three for.
 */
export const HELD_IN_PROMPT = 2;

/**
 * How many preferences ride every turn — and why they get a seat of their own.
 *
 * A fact about a sister matters on the turn the sister comes up. How somebody
 * asked to be met — "just listen", "be straight with me", "talk Pidgin" —
 * matters on every turn there is. Sharing the three slots newest-first, a
 * preference was pushed out by the next three facts the Carver wrote, which is
 * the room forgetting the one instruction a person gave it about itself.
 */
export const PREFERENCES_IN_PROMPT = 1;

/** Kinds that recur and set things off, as opposed to what is simply true. */
const THEME_KINDS = new Set<Note["kind"]>(["trigger", "hard"]);
const FACT_KINDS = new Set<Note["kind"]>(["fact", "person", "goal", "win"]);

/**
 * How long a gap makes it a different sitting.
 *
 * Four hours, not a calendar day. Somebody who writes at 2am and again at
 * 9am has had a night in between, and the second one is a new sitting by any
 * measure that matters to them.
 */
export const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

export interface OpenThread {
  said: string;
  at: string;
}

/**
 * The last thing they left here, from a sitting that has ended.
 *
 * No new column and no migration: the newest vent older than the session gap
 * is, by construction, the last thing said in a sitting that is over. Silence
 * beats a guess — a first visit, or a second message ten minutes after the
 * first, returns null rather than announcing a thread somebody is mid-way
 * through saying.
 */
export function openThread(rows: readonly MemoryRow[], now: Date = new Date()): OpenThread | null {
  const cutoff = now.getTime() - SESSION_GAP_MS;
  // Oldest-first from `selectMemory`, so the last row under the cutoff is the
  // newest thing said in a previous sitting.
  let found: MemoryRow | null = null;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (Number.isFinite(t) && t < cutoff) found = r;
  }
  if (!found) return null;

  const said = found.user_message.trim();
  if (said.length < 12) return null;

  return {
    said: said.length > 160 ? `${said.slice(0, 157)}…` : said,
    at: new Date(found.created_at).toISOString().slice(0, 10),
  };
}

export interface RecallSources {
  notes?: readonly Note[];
  carve?: string | null;
  held?: readonly { text: string }[];
  pattern?: Pattern | null;
  /** Layer 1's rows, oldest first — where the open thread is read from. */
  rows?: readonly MemoryRow[];
  /** Their own recent rows of any intent, for the risk history. */
  crises?: readonly { intent_type: string | null; created_at: string }[];
  now?: Date;
}

/**
 * Assemble Layer 2 from what the request already fetched. Pure, free, and
 * total: every source may be absent and the answer is then an empty object,
 * which renders nothing.
 */
export function recall(s: RecallSources = {}): SemanticMemory {
  const now = s.now ?? new Date();
  /*
    `loss` is in neither kind set below, so it reaches no field — kept for the
    audit only, because reading somebody their failures back is the cruellest
    thing the notes table makes possible. The sets are the one mechanism; a
    second filter here could never fire.
  */
  const notes = (s.notes ?? []).filter((n): n is Note => Boolean(n));

  const core_themes: Theme[] = [];
  const p = s.pattern;
  if (p?.tag) {
    const span = p.spanDays === 1 ? "today" : `in ${p.spanDays} days`;
    const moving =
      p.dropHere !== null && p.dropElsewhere !== null
        ? p.dropHere < p.dropElsewhere
          ? "; it shifts less than anything else they bring"
          : "; it shifts as much as anything else they bring"
        : "";
    core_themes.push({ name: p.tag, detail: `${p.times} times ${span}${moving}`, counted: true });
  }

  // One cap across themes and facts, newest first as `listNotes` returns them,
  // so the prompt carries exactly what it carried before this existed.
  const important_facts: Fact[] = [];
  for (const n of notes.filter((n) => THEME_KINDS.has(n.kind) || FACT_KINDS.has(n.kind)).slice(0, MAX_IN_PROMPT)) {
    if (THEME_KINDS.has(n.kind)) core_themes.push({ name: n.subject, detail: n.detail, counted: false });
    else important_facts.push({ subject: n.subject, detail: n.detail });
  }

  const preferences: Record<string, string> = {};
  for (const n of notes.filter((n) => n.kind === "language").slice(0, PREFERENCES_IN_PROMPT)) {
    preferences[n.subject] = n.detail;
  }

  const session_summaries: Summary[] = [];
  if (s.carve?.trim()) session_summaries.push({ kind: "carve", text: s.carve.trim() });
  const thread = openThread(s.rows ?? [], now);
  if (thread) session_summaries.push({ kind: "thread", text: thread.said, at: thread.at });
  for (const h of (s.held ?? []).map((h) => h?.text?.trim()).filter((t): t is string => Boolean(t)).slice(0, HELD_IN_PROMPT)) {
    session_summaries.push({ kind: "held", text: h });
  }

  return {
    core_themes,
    important_facts,
    risk_history: recentCrises(s.crises ?? [], now.getTime()).map((r) => r.created_at.slice(0, 10)),
    preferences,
    session_summaries,
  };
}

/**
 * The heading the block opens on — exported so every check reads this rather
 * than a copy of it.
 */
export const RECALL_HEADER = "WHAT THE ROOM HOLDS ABOUT THEM — kept from before";

/**
 * The three rules that govern every line below them, said once.
 *
 * They were `CONTEXT_RULES`, 243 tokens governing five blocks that each also
 * carried their own silence line. The rules are the same three and none is
 * weaker: say the thing and never the file, let it aim, their sentence wins.
 * What went is the essay around them and the five restatements, because
 * `recites` and `promise` are in the failsafe's rejection set and grade every
 * reply for the file read aloud and the promise to remember. The prompt says
 * it once; the grader holds it.
 */
const RULES = `1. SAY THE THING, NEVER THE FILE. Name the concrete detail — the name, the
   phrase, the number; holding it back reads as having forgotten. Never how you
   know it: no "I remember", no "you've brought this up four times". They can
   clear all of it in one tap.
2. LET IT AIM what you go after — that is its only use. Start one layer under
   where you otherwise would.
3. THEIR SENTENCE OUTRANKS ALL OF IT. Any line may simply be wrong or stale;
   the moment today points elsewhere, drop it without comment, and never ask
   them to reconcile the two.`;

/**
 * Layer 2, injected: one block, in the spec's order, or nothing at all.
 *
 * Lines about a person rather than a form — no `TRIGGERS:` or `GOALS:`
 * headings, because a person can hear the difference between being known and
 * being processed. `risk_history` is never rendered; see its field.
 *
 * Bounded by construction: one pattern, `MAX_IN_PROMPT` notes at
 * `MAX_SUBJECT` + `MAX_DETAIL`, `PREFERENCES_IN_PROMPT` preference, one carve,
 * one thread at 160 characters, `HELD_IN_PROMPT` words. Check 24 builds the
 * heaviest turn with every one of those full.
 */
export function semanticBlock(m: SemanticMemory): string | null {
  const lines: string[] = [];
  for (const t of m.core_themes) {
    const line = noteLine({ subject: t.name, detail: t.detail });
    lines.push(t.counted ? `- Keeps coming back — ${line}` : `- ${line}`);
  }
  for (const f of m.important_facts) lines.push(`- ${noteLine(f)}`);
  for (const [subject, detail] of Object.entries(m.preferences)) {
    lines.push(`- How they asked to be met — ${noteLine({ subject, detail })}`);
  }
  for (const s of m.session_summaries) {
    if (s.kind === "carve") lines.push(`- An earlier sitting, in a line: "${s.text}"`);
    if (s.kind === "thread") lines.push(`- Left open on ${s.at}: "${s.text}" Raise it once, early, in their words.`);
  }
  const held = m.session_summaries.filter((s) => s.kind === "held").map((s) => s.text);
  if (held.length > 0) lines.push(`- Carried out of a circle: ${held.join(", ")}. Never say it first.`);

  if (lines.length === 0) return null;
  return [RECALL_HEADER, RULES, ...lines].join("\n");
}

/*
  LAYER 3 IS LATER, AND THIS IS WHAT "LATER" IS WAITING ON

  A vector index over session summaries needs summaries to index, and there is
  one per person: `vent_users.carve` is one column, sharpened in place. Keeping
  a list is a new thing this product holds about somebody, which is a
  retention decision for a person and a line on the privacy page, not a
  commit. And the table built for embeddings cannot hold an anonymous venter:
  `memories.user_id` references `auth.users`, which nobody here is in —
  0011's finding, and the reason `embeddings.ts` has no caller. Check 127
  fails the build the day `embed()` is imported without a stage paying for it.

  Graph links between themes wait on the same thing and on a number: at one
  pattern per person there is nothing to link. Production held 1 note and 2
  carves across 120 vent turns when this was written.
*/
