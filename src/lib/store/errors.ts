/**
 * Absent and broken are different answers.
 *
 * Every read in `SupabaseStore` used to swallow its error and return null, or
 * an empty array, or zero. So a database that was down produced "there is no
 * such circle" — a 404 that is a lie, and a quieter member of the same family
 * as the reply that said "I've saved it, word for word" while saving nothing.
 * Worse than the 500 it replaced, in one way: a 500 at least tells you
 * something broke.
 *
 * A Supabase `error` means the query did not run. Data that is null with no
 * error means the row genuinely is not there. Those must not collapse into
 * each other, so the first one throws this and the second one returns null.
 */
export class StoreUnavailableError extends Error {
  /** Which store call failed — enough to find it without the stack. */
  readonly op: string;

  constructor(
    op: string,
    // PostgREST puts the useful part in code/details/hint and the vague part
    // in message. Reporting message alone gave "Invalid path specified in
    // request URL" three times running with nothing to act on — the same
    // shape as a failure bucket with nothing in it.
    cause?: { message?: string; code?: string; details?: string; hint?: string } | null,
  ) {
    const parts = [
      cause?.code && `[${cause.code}]`,
      cause?.message,
      cause?.details && `details: ${cause.details}`,
      cause?.hint && `hint: ${cause.hint}`,
    ].filter(Boolean);
    super(`store operation "${op}" failed: ${parts.join(" · ") || "unknown cause"}`);
    this.name = "StoreUnavailableError";
    this.op = op;
  }
}

export function isStoreDown(error: unknown): error is StoreUnavailableError {
  return error instanceof StoreUnavailableError;
}
