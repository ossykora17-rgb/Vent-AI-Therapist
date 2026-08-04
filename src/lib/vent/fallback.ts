/**
 * What VENT says when it is running without a model key.
 *
 * Two claims live in this file and both have to be true.
 *
 * The first is about saving. A deployment with no store writes nothing —
 * `getStore()` returns null in production on purpose — and telling someone
 * "I've saved it, word for word" while their words are dropped is the same
 * bug as the refusal that offered a turn which could never come.
 *
 * The second is about the reply itself. A vent with no key used to get one
 * static sentence, which is honest and dead. But `selectTactic()` has already
 * run by then, for free, and every tactic now carries a `hold` — the room
 * phrasing a Keeper opens a circle with, written by a person and reviewed in
 * a diff. That is a real move, not a generated one, so a key-less deployment
 * can offer it and a vent gets an answer rather than a shrug.
 *
 * The plain sentence below is not dead code. A `hold` is authored, so a
 * tactic added without one has nothing true to say here, and it says the
 * plain thing rather than inventing a move to fill the space. Eval check 5
 * keeps that from happening quietly; this keeps it from being a lie if it
 * ever does. Silence beats a guess.
 */
export function noModelKeyReply(persisting: boolean, hold?: string | null): string {
  if (hold) {
    const saved = persisting
      ? "I've saved it, word for word."
      : "Nothing here is being saved yet.";
    return `${hold}\n\nThat's the move rather than a full answer — I'm running without my model key. ${saved} Say the next part.`;
  }

  const opening =
    "I'm running without my model key right now, so I can't go deep on that yet";

  return persisting
    ? `${opening} — but I've saved it, word for word. Say the next part.`
    : `${opening}, and nothing here is being saved yet. Say the next part anyway if putting it down helps.`;
}
