/*
 * Minimal service worker — no Workbox, no build step.
 *
 * Static assets are cache-first because they're content-hashed. Pages are
 * network-first so a deploy is never stale, falling back to cache and then to
 * an offline note. API calls are never cached: a therapy reply from yesterday
 * served as today's would be worse than an error.
 */
/*
  One cache per build, named from the `v` the page registered this worker with.

  It was a constant — "mw-v1", unchanged across every deploy this product has
  had — so the activate handler below, which deletes every cache but the
  current one, never deleted anything. Every build's chunks accumulated, and
  the page precached at install stayed the page this worker had first seen.
  Registered as `/sw.js?v=<build>`, a new build is a new worker, and its
  activation clears the build before it.
*/
const CACHE = "mw-" + (new URL(self.location.href).searchParams.get("v") || "v1");
const OFFLINE_URL = "/offline.html";
const PRECACHE = ["/", "/chat", OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match(OFFLINE_URL)),
        ),
    );
  }
});

/*
  The one notification this product sends.

  Payload is `{ circleId }` and nothing else — not the tag, not the seat count,
  not who arrived, not a word anybody wrote. A push notification is decrypted
  onto a lock screen that may be face-up on a table in a room with other people
  in it, and the whole promise here is that what is said in a circle is not
  readable from outside it. This says *come back*, never *about what*.

  `renotify` is deliberately absent and the tag is constant: a second person
  arriving should replace the first notification, not stack a second one. The
  room is the event, not each arrival.
*/
self.addEventListener("push", (event) => {
  let circleId = "";
  try {
    circleId = (event.data ? event.data.json() : {}).circleId || "";
  } catch {
    // A payload we cannot read is not a reason to say nothing — but it is a
    // reason not to guess where to send them.
  }
  event.waitUntil(
    self.registration.showNotification("Someone sat down", {
      body: "Your circle has another person in it.",
      tag: "circle-join",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { circleId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const id = (event.notification.data || {}).circleId;
  const url = id ? `/circles/${id}` : "/circles";
  /*
    Focus a tab that is already in this room rather than opening a second one.
    Somebody who left the tab open and walked away should come back to the
    conversation they were in, not to a fresh copy of it beside it.
  */
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if (tab.url.includes(url) && "focus" in tab) return tab.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
