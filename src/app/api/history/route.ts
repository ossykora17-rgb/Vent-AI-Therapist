/**
 * /api/history is a stable alias for the history operations that live on
 * /api/vent. Same handlers, no duplicated logic — the UI and any future
 * client can use whichever name reads better at the call site.
 *
 * `dynamic` is declared here rather than re-exported: Next parses that field
 * statically, and a re-export is not something it can read at compile time.
 * The handlers are still the same two functions, not copies.
 */
export { GET, DELETE } from "../vent/route";

export const dynamic = "force-dynamic";
