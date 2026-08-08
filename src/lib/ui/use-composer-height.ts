"use client";

import * as React from "react";

/**
 * Publish a sticky composer's real height as `--composer-h`.
 *
 * Two surfaces in this product have a composer pinned to the bottom of a
 * scrolling transcript, and both need the same three things from it: a
 * feedback pill that clears it, a toast stack that does not land on the
 * crisis line, and a scroll sentinel that comes to rest above it rather than
 * underneath.
 *
 * It was written once, in the chat, and the circle room did not have it — so
 * the room kept the bug the chat had already fixed: `scrollIntoView` with
 * `block: "end"` puts the sentinel's bottom exactly where a `sticky bottom-0`
 * footer pins itself, and the tail of every transcript lands behind the
 * composer. In a circle that tail is the last thing somebody said, which is
 * the whole reason anybody is in the room.
 *
 * A hook rather than a copy, because the copy is how the two drift: the chat
 * footer grows when the crisis gate appears and the room's grows when a rule
 * refusal is shown, and a hardcoded number is right for neither. The measured
 * one is right for both.
 *
 * `ResizeObserver`, not a one-off read — the textarea grows, the disclaimer
 * rewraps on rotation, banners appear and go.
 */
export function useComposerHeight(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const publish = () =>
      document.documentElement.style.setProperty(
        "--composer-h",
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      // Removed on the way out, so a page without a composer does not inherit
      // the last one's height and push its toasts into the middle of nowhere.
      document.documentElement.style.removeProperty("--composer-h");
    };
  }, [ref]);
}
