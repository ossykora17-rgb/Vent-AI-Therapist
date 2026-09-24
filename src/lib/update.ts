/**
 * Which build is this, and is there a newer one — decided without costing
 * anybody the conversation they are in.
 *
 * WHAT THIS CLOSES
 *
 * The founder opened the installed app and saw "BEFORE YOU GO" — a card
 * deleted from the code days earlier, whose only remaining trace in `main` is
 * the postmortem comments describing its deletion. The code that ships cannot
 * render it. The window could, because it was still running the JavaScript it
 * loaded before the deploy: an installed app window stays open for days, the
 * chat never navigates, and nothing on the page ever asked whether the server
 * had moved on. So every fix since that window opened was invisible to the one
 * person looking — and would have been to every tester who installed it.
 *
 * Next's own skew handling does not reach this. With a `deploymentId` it hard
 * reloads on a *client-side navigation* after a mismatch (self-hosting.md,
 * "Version Skew"), and somebody sitting in `/chat` never navigates.
 *
 * HOW IT DECIDES
 *
 * Every response carries the build it came from, in one header set from the
 * same value this bundle was built with (`next.config.mjs`). On coming back to
 * the window after being away, the page asks for that header with a `HEAD` — no
 * route of its own, no database, no model — and compares.
 *
 * WHEN IT MAY ACT, AND WHY THAT IS THE WHOLE DESIGN
 *
 * The thread on screen lives only in memory: the chat opens on a blank room
 * and fetches the carve, never the transcript. So a reload *is* the loss of
 * the conversation somebody is in the middle of, and Next's docs say as much
 * about their own skew reload. An update may therefore apply only when nothing
 * is lost by it — the window has been away long enough that the sitting is
 * over, and nothing is typed in the box. Otherwise it waits for the next
 * return; a stale screen for another hour costs less than a vanished sentence.
 */

/** The build this bundle was made from. Inlined at build by `next.config.mjs`. */
export const BUILD: string = process.env.NEXT_PUBLIC_BUILD ?? "local";

/** The response header carrying the live build. One name, read by both ends. */
export const BUILD_HEADER = "x-build";

/**
 * How long a window must have been out of use before a reload cannot cost a
 * sitting. Long on purpose: somebody who switched away to answer a message and
 * came back ten minutes later is still in the conversation.
 */
export const AWAY_MS = 30 * 60_000;

/**
 * Is the server running a build this page is not?
 *
 * No answer is not a new build — offline, a refused request and a stripped
 * header all read as "not stale", because the failure in that direction is a
 * reload nobody needed. And a local build never updates itself: two
 * development servers disagreeing about "local" is not a deploy.
 */
export function isStale(own: string, live: string | null | undefined): boolean {
  if (!live) return false;
  if (own === "local" || live === "local") return false;
  return own !== live;
}

/** May the page reload right now without taking anything from the person? */
export function safeToReload({ awayMs, drafted }: { awayMs: number; drafted: boolean }): boolean {
  return awayMs >= AWAY_MS && !drafted;
}
