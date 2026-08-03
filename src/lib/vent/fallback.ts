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
 * run by then, for free, and ten of the thirty-two tactics carry a `hold` —
 * the room phrasing a Keeper opens a circle with, authored by a person and
 * already asserted by the eval suite. That is a real move, not a generated
 * one, so a key-less deployment can offer it.
 *
 * The other twenty-two tactics have no `hold`. Nothing is invented to fill
 * that space: they get the plain sentence. Silence beats a guess.
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
