"use client";

import * as React from "react";
import { flushQueue, readQueue } from "@/lib/anon";
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
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration only costs offline support, not the app.
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
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
