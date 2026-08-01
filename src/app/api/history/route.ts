/**
 * /api/history is a stable alias for the history operations that live on
 * /api/vent. Same handlers, no duplicated logic — the UI and any future
 * client can use whichever name reads better at the call site.
 */
export { GET, DELETE, dynamic } from "../vent/route";
