/**
 * What the room knows about somebody, across sessions.
 *
 * The carve is one line about the wound. This is the rest of the office: the
 * name of the sister, the job that is going, the thing they said they would do
 * on Tuesday, the word that makes them go quiet. Six turns of transcript
 * cannot hold any of it, and a summary of the transcript loses exactly the
 * specific detail that makes somebody feel known.
 *
 * ## One table, eight kinds
 *
 * The obvious build is eight tables — facts, relationships, goals, triggers,
 * wins, losses, language, threads. Eight sets of store methods, eight
 * migrations, eight RLS policies, eight places to forget a `GRANT`. They all
 * have the same shape: a subject, a detail, when it was last true. So it is
 * one table with a `kind`, the way `circle_messages` already does it, and the
 * taxonomy is a CHECK constraint rather than a schema.
 *
 * ## Why there is no `trauma` kind
 *
 * The spec asked for one. There is a `hard` kind instead, and the difference
 * is not squeamishness.
 *
 * A `trauma` row is a clinical label, written by a model, about somebody who
 * never consented to being assessed — in a product whose every screen says it
 * is not therapy and whose prompt says *never diagnose, and never name a
 * condition*. The row would outlive the sentence that produced it, be read
 * back into a prompt weeks later as established fact, and there is no version
 * of that which is not a diagnosis in a database.
 *
 * `hard` holds the same information in the only form this product is allowed
 * to hold it: **their words for the thing, not our name for it.** "the burial"
 * is a `hard`. "unresolved grief" is a diagnosis, and `acceptable()` below
 * refuses it.
 */

export const NOTE_KINDS = [
  /** A fact about their life. "works nights at a pharmacy in Yaba" */
  "fact",
  /** Somebody who exists to them. subject is the person. "Mumcy — calls, they don't pick" */
  "person",
  /** Something they said they wanted or would do. "wants to stop sending money home" */
  "goal",
  /** What reliably sets it off, in their words. "the group chat on Sunday" */
  "trigger",
  /** A hard thing they named. Their words, never a label. See above. */
  "hard",
  /** Something that went right. The only thing here safe to read back cold. */
  "win",
  /** Something that did not. Never quoted back — it shapes what is asked. */
  "loss",
  /** How they talk. "Pidgin when angry, English when explaining" */
  "language",
] as const;

export type NoteKind = (typeof NOTE_KINDS)[number];

export interface Note {
  kind: NoteKind;
  /** What it is about, in two or three words. The dedupe key. */
  subject: string;
  /** The thing itself, in their words where possible. */
  detail: string;
}

export const MAX_SUBJECT = 24;
export const MAX_DETAIL = 70;
/**
 * What the prompt can carry, and it is small on purpose.
 *
 * Three lines at ninety-four characters is ~100 tokens against a budget check
 * 24 holds to a hard ceiling. The first draft was five at a hundred and sixty
 * and cost 230 — measured, not guessed, which is the only reason the number
 * moved. A memory that grows without a cap is a prompt that grows without a
 * cap, and this file's whole argument is that specific beats comprehensive:
 * "Mumcy — calls Sundays, they don't pick" is forty characters and worth more
 * than a paragraph.
 */
export const MAX_IN_PROMPT = 3;

/**
 * Why this note cannot be kept, or null.
 *
 * The same shape as `acceptable()` in `learned.ts` and for the same reason:
 * this is written by a model at the end of a session with nobody watching, and
 * every refusal below is a row that would otherwise be read back to somebody
 * weeks later as a settled fact about them.
 */
export function keepable(n: Note): string | null {
  if (!NOTE_KINDS.includes(n.kind)) return `not a kind: ${n.kind}`;
  const subject = n.subject?.trim() ?? "";
  const detail = n.detail?.trim() ?? "";
  if (subject.length < 2 || subject.length > MAX_SUBJECT) return `subject is not 2-${MAX_SUBJECT} characters`;
  if (detail.length < 4 || detail.length > MAX_DETAIL) return `detail is not 4-${MAX_DETAIL} characters`;

  /*
    No diagnosis, in any kind. The prompt says never name a condition and this
    is the one place a model writes something down that outlives the sentence
    it came from — so the ban has to hold at the write, not only at the reply.
  */
  if (DIAGNOSIS.test(detail) || DIAGNOSIS.test(subject)) {
    return "names a condition — this product does not diagnose, and a row outlives the sentence";
  }
  /*
    No inference about somebody's inner state stated as fact. "afraid of
    failing his father" is a reading; "said he is afraid of failing his father"
    is a record. Only the second may be kept, because only the second is
    survivable if it is wrong — and the model is told the same thing.
  */
  if (/\b(clearly|obviously|deep down|really means|the real reason)\b/i.test(detail)) {
    return "an interpretation stated as fact";
  }
  return null;
}

/*
  Condition names, refused in any kind and regardless of who said them first.

  The tempting exception is "but they said it about themselves" — and it does
  not survive the shape of this table. A note is read back into a prompt weeks
  later with no sentence around it, so "the insomnia is worse" arrives as a
  settled clinical fact about somebody whether they offered the word or not.
  Their own words for the thing are always available: "not sleeping since the
  burial" carries more and diagnoses nobody.

  `insomnia` was added by check 83 flagging it on the first run, which is the
  right way round.
*/
const DIAGNOSIS =
  /\b(depress\w*|anxiet\w*|anxious disorder|ptsd|trauma\w*|bipolar|adhd|ocd|psychosis|schizo\w*|borderline|disorder|diagnos\w*|clinical\w*|symptom\w*|insomnia|panic attacks?|burn.?out|self.harm|suicid\w*)\b/i;

/**
 * Read what the Carver wrote, and refuse most of it.
 *
 * Never throws, and returns what survived rather than failing the batch: one
 * bad note out of four is three notes worth keeping, and a session that
 * produced something good should not lose it to a fourth line that named a
 * condition.
 */
export function parseNotes(raw: unknown): { keep: Note[]; dropped: string[] } {
  const keep: Note[] = [];
  const dropped: string[] = [];
  if (!Array.isArray(raw)) return { keep, dropped };

  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const n = {
      kind: String((item as Note).kind ?? "").trim() as NoteKind,
      subject: String((item as Note).subject ?? "").trim(),
      detail: String((item as Note).detail ?? "").trim(),
    };
    const why = keepable(n);
    if (why) {
      /*
        The kind and the reason, never the subject.

        `subject` is two to four words *the person wrote about themselves* —
        "my dad", "insomnia", "sister". This list is a diagnostic, and the only
        question it exists to answer is whether the prompt or the rule needs
        changing; the kind and the reason answer that completely and the
        subject adds nothing to it.

        It matters because the caller logs this. A hosted runtime keeps stdout
        for as long as it keeps stdout, so a subject here is a durable copy of
        somebody's words in a place with no delete button — under a rule in
        CLAUDE.md saying anything the room holds about somebody is on a page
        with one. The note itself was refused; its content must not survive the
        refusal in a log line.
      */
      dropped.push(`${n.kind}: ${why}`);
      continue;
    }
    // Same subject twice in one batch is one note; the later wins.
    const at = keep.findIndex((k) => k.kind === n.kind && k.subject.toLowerCase() === n.subject.toLowerCase());
    if (at >= 0) keep[at] = n;
    else keep.push(n);
  }
  return { keep, dropped };
}

/**
 * What the model is told, which is a set of facts and not a file.
 *
 * Deliberately not grouped by kind with headings. A block that reads
 * "TRIGGERS:" and "GOALS:" is a form, and the rule this product keeps
 * relearning is that a person can hear the difference between being known and
 * being processed. These are lines about a person, in the order they were last
 * true, and `CONTEXT_RULES` already governs what may be done with them.
 *
 * `loss` is filtered out of the prompt entirely. It shapes nothing a model
 * should say — reading somebody their failures back is the cruellest thing
 * this table makes possible — and it is kept only so the audit can see whether
 * the room is working.
 */
export function notesBlock(notes: readonly Note[]): string | null {
  const keep = notes.filter((n) => n.kind !== "loss").slice(0, MAX_IN_PROMPT);
  if (keep.length === 0) return null;
  return [
    "WHAT YOU ALREADY KNOW ABOUT THEM — from what they told you, not inferred:",
    ...keep.map((n) => `- ${n.subject}: ${n.detail}`),
  ].join("\n");
}

/** Appended to the Carver's job, so one call writes the line and the notes. */
export const NOTES_INSTRUCTION = `Also return "notes": an array of at most four
things worth remembering about this person for next time. Each is
{"kind": one of ${NOTE_KINDS.join("|")}, "subject": 2-4 words, "detail": their
words where possible}.

Only what they actually said. Never a condition, never a diagnosis, never your
reading of why they feel something — "said he is afraid of failing his father"
is a record and "deep down he fears failure" is not. If nothing was said worth
keeping, return an empty array; that is the ordinary answer for a short
session and it costs nothing.`;
