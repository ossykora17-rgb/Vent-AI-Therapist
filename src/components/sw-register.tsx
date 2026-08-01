"use client";

import * as React from "react";
import { flushQueue } from "@/lib/anon";
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
      if (sent > 0) {
        toast(`Back online — ${sent} saved ${sent === 1 ? "vent" : "vents"} sent up.`, "success");
      }
    }
    window.addEventListener("online", drain);
    if (navigator.onLine) void drain();
    return () => window.removeEventListener("online", drain);
  }, [toast]);

  return null;
}
