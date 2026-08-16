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
      const left = readQueue().length;
      if (sent > 0) {
        toast(
          left > 0
            ? `Back online — ${sent} sent up, ${left} still waiting.`
            : `Back online — ${sent} saved ${sent === 1 ? "vent" : "vents"} sent up.`,
          left > 0 ? "info" : "success",
        );
      }
    }
    window.addEventListener("online", drain);
    if (navigator.onLine) void drain();
    return () => window.removeEventListener("online", drain);
  }, [toast]);

  return null;
}
