import { NextResponse } from "next/server";
import { isStoreDown } from "@/lib/store/errors";

/**
 * A route whose storage stopped answering says so, and nothing else changes.
 *
 * The catch is deliberately narrow. A blanket `try` around a handler turns
 * every programming mistake into "storage_unavailable" — a confident wrong
 * diagnosis, which is the exact failure this codebase keeps paying for. Only
 * `StoreUnavailableError` becomes a 503; a TypeError still 500s, loudly,
 * because that is the truth about a TypeError.
 *
 * 503 rather than 404 because the room is not missing, it is unreachable, and
 * a person told "not found" goes looking for something they did nothing to
 * lose.
 */
export function withStore<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (!isStoreDown(error)) throw error;
      console.error("[api]", error.message);
      return NextResponse.json(
        {
          error: "storage_unavailable",
          op: error.op,
          message: "The storage behind this isn't answering. Nothing you did caused it.",
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  };
}
