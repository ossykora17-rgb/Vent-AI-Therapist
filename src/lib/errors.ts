/**
 * What a thrown thing is, without any of what it says.
 *
 * ## Why this exists
 *
 * CLAUDE.md's rule for stdout is old and clear: log codes, counts, kinds,
 * statuses and durations — never a message, never a note's subject or detail,
 * never an anon id. A hosted runtime keeps stdout for as long as it keeps
 * stdout, so a value in a log line outlives the delete button the interface
 * offers and turns it into a half-truth.
 *
 * Check 103 enforces that on the *literal* — the string somebody typed. It has
 * always been able to read `console.warn("[carve] refused", n.subject)` and
 * stop it. What it cannot read is `console.warn("[carve] failed", error)`,
 * which is nineteen call sites here and looks like nothing at all.
 *
 * `console.warn(x, error)` prints the message and the stack. So every one of
 * those lines was writing an unbounded string, from somewhere else, into a
 * place with no delete button:
 *
 * - **Model providers.** An SDK throw carries the response body on `.message`.
 *   Seven providers are in this chain and none has told us what goes in it, on
 *   a request that had just carried somebody's vent, their notes and their
 *   carve.
 * - **Postgres.** `invalid input syntax for type uuid: "…"` quotes the value.
 *   Here the value is usually an anon id, which the rule names explicitly.
 * - **LiveKit.** Its failures quote the room name, and the room name is derived
 *   from the circle id. A circle's whole promise is that the room is sealed.
 *
 * ## What is kept
 *
 * The three fields that answer "what happened" and belong to the *system*
 * rather than to anybody: an HTTP status, a Postgres error code, and the class
 * of the throw. `42501` and `42703` are the two most useful strings this
 * product has ever logged — they are the difference between "the grants never
 * landed" and "0011 has not been applied" — and neither is anybody's words.
 *
 * Never empty. A bucket with nothing in it is the failure this repository has
 * recorded four times, and "unknown" that says *why* it is unknown is worth
 * more than a blank.
 */
/**
 * A database's sentence with the identifiers taken out of it.
 *
 * `/api/health` publishes Postgres's `message` on a public, unauthenticated
 * endpoint, and the comment defending that is right about why: `42703` says
 * *which column* is missing, and "the schema has drifted" is true, useless, and
 * one more round trip to find out what everybody already knew.
 *
 * The risk is narrower than the whole string and so is the redaction. Most of
 * what Postgres names is a schema object — `column vents.carve does not exist`,
 * `permission denied for table vents` — and those are ours and worth printing.
 * A few codes quote the *value* instead: `22P02 invalid input syntax for type
 * uuid: "…"` is the one that matters here, because in this product an anon id
 * is not an identifier, it is the entire credential. `/api/notes?anonId=`
 * needs nothing else.
 *
 * So uuids go and everything else stays. Exact rather than broad on purpose:
 * stripping every quoted run would take the column name with it, which is the
 * one thing the message was being kept for.
 */
export function redactIds(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  return text.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "<id>",
  );
}

export function errorKind(e: unknown): string {
  if (e === null) return "null";
  if (e === undefined) return "undefined";

  if (typeof e !== "object") {
    // A thrown string is the message. Its type is all that may be said of it.
    return `thrown ${typeof e}`;
  }

  const err = e as { status?: unknown; code?: unknown; name?: unknown; constructor?: { name?: string } };
  const parts: string[] = [];

  // Numbers and short codes only. A `code` is `42501` or `ECONNRESET`; some
  // libraries put a sentence there, and a sentence is a message wearing a
  // field name.
  if (typeof err.status === "number") parts.push(String(err.status));
  if (typeof err.code === "string" && err.code.length <= 12 && !/\s/.test(err.code)) parts.push(err.code);
  else if (typeof err.code === "number") parts.push(String(err.code));

  const name = typeof err.name === "string" && err.name ? err.name : err.constructor?.name;
  if (name && name !== "Object") parts.push(name);

  return parts.join(" · ") || "unknown shape";
}
