/**
 * What VENT says when there is no model key.
 *
 * Two claims live in this file and both have to be true.
 *
 * **The first is about keeping.** This function used to take
 * `Boolean(store && userId)` — computed at the top of the handler, before
 * anything had been written — and print "I've saved it, word for word" from
 * it. A store existing is an intention. `tryPersist` returning true is an
 * outcome, and it can be false with a store right there: PostgREST rejects
 * the row, the connection drops, RLS says no. Every one of those printed a
 * receipt for a message that was on the floor.
 *
 * That is the second mechanism in CLAUDE.md — *a sentence written before, or
 * without, the answer* — living inside the file whose entire docstring was
 * about not doing it. The old guard was real, it just watched one level too
 * high: it asked whether saving was possible, never whether it happened. The
 * caller now writes first and composes this second, and the flag below is the
 * write's own return value or nothing at all.
 *
 * **The second is about the reply.** A vent with no key used to get one static
 * sentence, which is honest and dead. But `selectTactic()` has already run by
 * then, for free, and every tactic carries a `hold` — the room phrasing a
 * Keeper opens a circle with, written by a person and reviewed in a diff. That
 * is a real move, not a generated one, so a key-less deployment offers it and
 * a vent gets an answer rather than a shrug.
 *
 * The plain sentence below is not dead code. A `hold` is authored, so a tactic
 * added without one has nothing true to say here, and it says the plain thing
 * rather than inventing a move to fill the space. Eval check 5 keeps that from
 * happening quietly; this keeps it from being a lie if it ever does.
 *
 * ## On not saying "model key"
 *
 * This read: *"That's the move rather than a full answer — I'm running without
 * my model key."* Seen rendered, under a person writing that their father's
 * test results had come back and they didn't know what to do with it.
 *
 * Two things wrong, and neither is a bug. **The vocabulary is the operator's,
 * not the reader's** — nobody arrives here knowing what a model key is, and
 * the machine explaining its own configuration to somebody who is frightened
 * is the machine making itself the subject. **And "rather than a full answer"
 * apologises for the one real thing in the reply.** The hold above it was
 * written by a person for exactly this pressure. Calling it the lesser option
 * tells someone at the worst hour of their week that they got the cheap
 * version.
 *
 * What stays is the honest limit, in the reader's words: one move tonight, not
 * a full read. True, complete from where they sit, and it sets an expectation
 * that the next turn can actually meet. The cause belongs in `/api/health` and
 * the server log, which is where an operator looks.
 */
export function noModelKeyReply(kept: boolean, hold?: string | null): string {
  const keeping = kept
    ? "It's kept, word for word."
    : "Nothing here is being kept yet.";

  if (hold) {
    return `${hold}\n\nThat's what I've got tonight — one move, not a full read. ${keeping} Say the next part.`;
  }

  return kept
    ? "I can't go deep on that tonight — but it's kept, word for word. Say the next part."
    : "I can't go deep on that tonight, and nothing here is being kept yet. Say the next part anyway if putting it down helps.";
}
