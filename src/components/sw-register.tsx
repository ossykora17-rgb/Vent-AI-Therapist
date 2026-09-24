"use client";

import * as React from "react";
import { flushQueue, readQueue } from "@/lib/anon";
import { AWAY_MS, BUILD, BUILD_HEADER, isStale, safeToReload } from "@/lib/update";
import { useToast } from "@/components/ui/toast";

/**
 * Registers the service worker and drains anything that queued up while the
 * connection was gone. Rendered once, near the root.
 */
export function ServiceWorkerRegistrar() {
  const { toast } = useToast();

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registering after load keeps it off the critical path.
    const onLoad = () => {
      // Per build, so a new deploy is a new worker and its activation clears
      // the last build's cache. See the comment on `CACHE` in `public/sw.js`.
      navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(BUILD)}`).catch(() => {
        // A failed registration only costs offline support, not the app.
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  /*
    A window that has been running an old build since before the last deploy.

    `src/lib/update.ts` has the whole argument. In short: the founder saw a
    card deleted from the code days earlier, in an installed window that had
    never reloaded, and nothing here ever asked the server whether it had
    moved on. So on coming back to the window after being away, it asks —
    and reloads only if the sitting is over and nothing is typed, because the
    thread on screen lives only in memory and a reload is its loss.

    "Away" is focus as well as visibility. A desktop app window left behind
    other windows is still "visible" to the browser, so a check on
    `visibilitychange` alone would never fire for the exact window it exists
    for.
  */
  React.useEffect(() => {
    let awayAt: number | null = null;
    let checking = false;
    const leave = () => {
      if (awayAt === null) awayAt = Date.now();
    };
    const back = async () => {
      if (document.visibilityState === "hidden" || awayAt === null || checking) return;
      const awayMs = Date.now() - awayAt;
      awayAt = null;
      if (awayMs < AWAY_MS) return;
      checking = true;
      try {
        const r = await fetch("/", { method: "HEAD", cache: "no-store" });
        const drafted = Array.from(document.querySelectorAll("textarea")).some((t) => t.value.trim() !== "");
        if (isStale(BUILD, r.headers.get(BUILD_HEADER)) && safeToReload({ awayMs, drafted })) {
          window.location.reload();
        }
      } catch {
        // Offline or refused: no answer is not a new build. Ask again next time.
      } finally {
        checking = false;
      }
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? leave() : void back());
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    async function drain() {
      const sent = await flushQueue();
      /*
        What is left, said out loud.

        The drain stops at the first vent that did not land — a rate limit,
        or a 200 the route marked `persisted: false` — and keeps the rest
        queued. Reporting only the successes let somebody read "3 sent up"
        while two of their offline vents were still sitting on the device
        with nothing said about them. They keep, and they retry on the next
        drain, but the person is owed the count.
      */
      /*
        And the case where *none* of them landed is the one worth saying most.

        This was `if (sent > 0)`. The comment above is about not letting
        somebody read "3 sent up" while two sat on the device — the partial
        case, correctly fixed. The total failure was left silent: a rate limit
        on the first vent, or a 200 the route marked `persisted: false`, and
        the drain reports nothing at all.

        That is the worst of the four states. Somebody wrote with no signal,
        came back online expecting the room to have caught up, and the product
        said nothing while their words sat on the device. Half a repair, and
        the half it skipped is the half where the person is owed a sentence.

        Silence stays correct in exactly one state: nothing queued, nothing
        sent, nothing to say.
      */
      const left = readQueue().length;
      if (sent > 0 || left > 0) {
        const waiting = `${left} still waiting.`;
        toast(
          sent === 0
            ? `Back online — nothing went up yet. ${waiting}`
            : left > 0
              ? `Back online — ${sent} sent up, ${waiting}`
              : `Back online — ${sent} saved ${sent === 1 ? "vent" : "vents"} sent up.`,
          sent > 0 && left === 0 ? "success" : "info",
        );
      }
    }
    window.addEventListener("online", drain);
    if (navigator.onLine) void drain();
    return () => window.removeEventListener("online", drain);
  }, [toast]);

  return null;
}
