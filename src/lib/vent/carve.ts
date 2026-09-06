import { MAX_DETAIL, MAX_SUBJECT, NOTES_ASKED, NOTES_INSTRUCTION, parseNotes, type Note } from "./notes";
/**
 * THE CARVER — eight words for the wound.
 *
 * Memory in this product is a list of what somebody typed. Useful, and not
 * the same as remembering. A person who comes back on Thursday is not helped
 * by six verbatim paragraphs; they are helped by the room already knowing
 * what this is about.
 *
 * So: one line, eight words maximum, carved rather than summarised. Not
 * "user discussed father's health and family communication" — that is a case
 * note, and case notes are what makes a place feel like a file. The carve is
 * the wound in the fewest words that still hurt to read:
 *
 *   "I dey fear say pops go die and I go be useless"
 *     → "pops sick / fear of being useless son"
 *
 * WHY THIS IS THE ONE EXTRA CALL
 *
 * Everything else added to this product runs on regex and counting. This
 * cannot: compressing a paragraph to the wound is the one job in here that
 * is genuinely a language task, and a heuristic version would produce
 * keyword soup that is worse than the raw text it replaced.
 *
 * So it is bounded hard rather than run freely:
 *
 *   - Once per SESSION, not once per message. It fires when somebody closes
 *     a session, which is the only moment there is something whole to carve.
 *   - Only above `CARVE_FLOOR` messages. Two lines and a greeting is not a
 *     wound, and carving it produces a confident sentence about nothing.
 *   - Never on the crisis path. Somebody in crisis gets the local reply and
 *     nothing is spent deciding how to phrase their worst hour.
 *   - Fails to null. No carve is a normal outcome; a wrong carve is a
 *     sentence about somebody's life that they did not say and cannot
 *     correct.
 *
 * `MAX_COMPLETIONS_PER_MESSAGE` in the orchestrator stays 1, and it stays
 * true: this is per session and per close, and the pipeline describes a
 * message.
 */

/** Below this many exchanges, there is nothing whole enough to carve. */
export const CARVE_FLOOR = 3;

/** The hard ceiling. Nine words is a sentence; eight is an inscription. */
export const CARVE_MAX_WORDS = 8;

/**
 * What the Carver may spend, derived from what it is asked to produce.
 *
 * It was `maxTokens: 120`, under a comment reading "Eight words out. The
 * ceiling is small because the job is small." That was true of the job it was
 * written for. Then notes joined the same call — up to `NOTES_ASKED` objects,
 * each with a subject and a detail — and the ceiling stayed where it was.
 *
 * This repository's sharpest recorded bug is `max_tokens: 220`, correct for a
 * model that speaks immediately and wrong for one that thinks first. Same
 * shape: a budget correct for the original job and never revisited when the
 * job grew.
 *
 * And the failure mode here is worse than a short answer. The output is one
 * JSON object, so a response cut off mid-notes does not lose the notes — it
 * loses the *carve* too, because `JSON.parse` of a truncated object throws and
 * `parseCarve` returns null. A session that had something worth keeping is
 * exactly the session that produces enough notes to overflow, so the sessions
 * most worth remembering are the ones most likely to be remembered as nothing.
 *
 * Derived rather than typed, so it cannot drift from the limits it is sized
 * against. Three characters per token is deliberately pessimistic for JSON
 * with short quoted strings; being wrong here costs headroom on a 120-token
 * call and nothing else.
 */
const JSON_CHARS_PER_TOKEN = 3;
export const CARVE_MAX_TOKENS = Math.ceil(
  (CARVE_MAX_WORDS * 6 +
    // Each note is its own object: two bounded strings plus `kind` and the
    // three JSON keys around them.
    NOTES_ASKED * (MAX_SUBJECT + MAX_DETAIL + 40) +
    // The braces, `remembers`, and the notes array itself.
    60) /
    JSON_CHARS_PER_TOKEN,
);

export const CARVER_SYSTEM = `You are MEMORY — The Carver. You remember.

<job>
You get the last few things somebody said in one session, and one earlier
carve if there is one.

Write the real truth in ${CARVE_MAX_WORDS} words maximum, like carving on a
wall. Not a summary. The wound.

A summary says what happened. A carve says what it cost. "Discussed father's
diagnosis with family" is a case note and it is useless. "pops sick / fear of
being useless son" is the thing they would recognise at 2am.

Use their own words where they carved themselves. Keep their language — if
they wrote Pidgin, the carve is Pidgin. Never soften. Never diagnose. Never
add a feeling they did not show.

If there is an earlier carve and this session is the same wound, sharpen it
rather than repeating it. If it is a different wound, carve the new one.

If there is nothing whole enough to carve, return remembers false and an
empty carve. Saying nothing is correct far more often than it feels.

${NOTES_INSTRUCTION}
</job>

Output only JSON: {"carve": "your ${CARVE_MAX_WORDS} words", "remembers": true, "notes": []}`;

export interface Carve {
  carve: string;
  remembers: boolean;
  /**
   * What else is worth remembering, from the same call.
   *
   * Not a second request. The Carver already reads the session at the end of
   * it, and asking a second model "what did you learn about this person" would
   * be a second bill for a second reading of the same words — on a product
   * whose whole economic argument is that most messages never reach a model.
   * Everything that survives `parseNotes` is written; the ordinary answer is
   * an empty array and it costs nothing.
   */
  notes: Note[];
}

/**
 * The first complete JSON object in the text, counting braces rather than
 * finding one.
 *
 * This replaces `raw.match(/\{[\s\S]*?\}/)`, which was correct for the
 * response it was written against and silently catastrophic for the one the
 * Carver actually returns now.
 *
 * The regex is **non-greedy**, so it matched from the first `{` to the *first*
 * `}`. When `notes` is empty that is the closing brace of the whole object and
 * everything works. The moment the Carver returns a single note, the first `}`
 * is the one closing that note, the captured text is unbalanced, `JSON.parse`
 * throws — and `parseCarve` returns null, so the **carve is thrown away too**.
 *
 * Production: eight people, two carves, zero notes, across 180 vents. The six
 * without a carve are the sessions where the Carver had something to say about
 * the person and the parser could not read past the first nested brace.
 *
 * String-aware on purpose. A detail is the person's own words, and a `}` typed
 * inside one must not end the object — the same class of mistake one level
 * down.
 */
function firstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return raw.slice(start, i + 1);
  }
  // Ran out of text with the object still open — a truncated response, which
  // is what an undersized token ceiling produces. Null rather than a guess.
  return null;
}

/**
 * Parse what came back, and refuse anything that is not a carve.
 *
 * Models wrap JSON in prose, in fences, and in apologies. This takes the
 * first object it can find and then holds it to the contract — a carve over
 * the word limit is a summary that got through, and shipping it would put a
 * sentence in somebody's memory that reads like a file note about them.
 */
export function parseCarve(raw: string): Carve | null {
  const object = firstJsonObject(raw);
  if (!object) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(object);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const { carve, remembers, notes } = parsed as {
    carve?: unknown;
    remembers?: unknown;
    notes?: unknown;
  };

  if (remembers !== true) return null;
  if (typeof carve !== "string") return null;

  const text = carve.trim();
  if (!text) return null;
  // Eight words, counted the way a person would count them. A slash-joined
  // carve — "pops sick / fear of being useless son" — is eight.
  if (text.split(/\s+/).filter((w) => w !== "/").length > CARVE_MAX_WORDS) return null;

  /*
    The notes are parsed separately and never block the carve. A model that
    writes a good line and a bad note has still written a good line, and
    losing it to a fourth array element that named a condition would be the
    batch failing over its worst member.
  */
  /*
    And the rejects are said out loud, because "no notes" was unanswerable.

    Production has two carves and zero notes — from the same model call, so
    the carve half of the response parses and the notes half produces nothing.
    Which of the two reasons that is (the model returned no array, or every
    note was refused by `keepable`) decides whether the fix is a prompt or a
    rule, and nothing recorded it either way. `parseNotes` builds `dropped`
    for exactly this and the caller took `.keep` and binned it.

    A failure bucket with nothing in it, one field from the answer.
  */
  const read = parseNotes(notes);
  if (read.dropped.length > 0) {
    console.warn(`[carve] notes refused (${read.dropped.length}):`, read.dropped.join(" | "));
  } else if (read.keep.length === 0 && Array.isArray(notes) && notes.length > 0) {
    console.warn("[carve] notes array arrived and nothing survived parsing");
  } else if (!Array.isArray(notes)) {
    console.warn("[carve] the model returned no notes array at all");
  }
  return { carve: text, remembers: true, notes: read.keep };
}

/** Whether this session is worth spending a call on at all. */
export function worthCarving(exchanges: number, crisis: boolean): boolean {
  return !crisis && exchanges >= CARVE_FLOOR;
}

/**
 * The user half of the carve request.
 *
 * Their words only, and the earlier carve when there is one. No tactic ids,
 * no tension readings, no flavour — the Carver is not being asked to explain
 * the session, it is being asked to name the wound, and everything else on
 * the page is a distraction from that.
 */
export function carvePrompt(messages: readonly string[], earlier?: string | null): string {
  const lines = messages.slice(-5).map((m) => `- ${m.trim().slice(0, 400)}`);
  return [
    earlier ? `EARLIER CARVE: ${earlier}` : "EARLIER CARVE: none",
    "",
    "THIS SESSION, their words:",
    ...lines,
  ].join("\n");
}
