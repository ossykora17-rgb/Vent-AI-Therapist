/**
 * What VENT says when it is running without a model key.
 *
 * The second sentence is a promise, so it is conditional. A deployment with
 * no store configured writes nothing — `getStore()` returns null in
 * production on purpose — and telling someone "I've saved it, word for word"
 * while their words are dropped is the same bug as the refusal that offered
 * a turn which could never come. Say what is true, or say less.
 */
export function noModelKeyReply(persisting: boolean): string {
  const opening =
    "I'm running without my model key right now, so I can't go deep on that yet";

  return persisting
    ? `${opening} — but I've saved it, word for word. Say the next part.`
    : `${opening}, and nothing here is being saved yet. Say the next part anyway if putting it down helps.`;
}
