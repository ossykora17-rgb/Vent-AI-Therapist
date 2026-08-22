"use client";

import * as React from "react";

/**
 * Runs before paint in <head> so the correct theme is on <html> from the very
 * first frame — no white flash on a dark-mode phone at 3am.
 */
export const THEME_SCRIPT = `(function(){try{
var s=localStorage.getItem('mw-theme');
var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark',d);
}catch(e){}})();`;

/**
 * `<html class="dark">` is the source of truth — the script above already set
 * it before first paint, so the button reads the DOM rather than keeping a
 * second copy of the answer in state. `useSyncExternalStore` is exactly this
 * shape: a snapshot from outside React, a server snapshot for the render that
 * has no DOM, and a subscription for when it changes.
 *
 * This used to be `useState(false)` plus a mount effect, which meant the icon
 * rendered as the sun for one frame on a dark phone before correcting itself.
 */
const themeListeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  themeListeners.add(onChange);
  return () => themeListeners.delete(onChange);
}

const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const dark = React.useSyncExternalStore(
    subscribe,
    isDark,
    // Server render: the class is not knowable, and light is the default the
    // stylesheet assumes. The script corrects it before anybody sees a frame.
    () => false,
  );

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("mw-theme", next ? "dark" : "light");
    } catch {
      // Private mode — the toggle still works for this session.
    }
    // One store, many buttons: every toggle on the page stays in step.
    themeListeners.forEach((notify) => notify());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-line/10 bg-card/60 text-ink backdrop-blur-glass transition-colors duration-300 hover:bg-card"
    >
      <span aria-hidden="true" className="text-body leading-none">
        {dark ? "☾" : "☀"}
      </span>
    </button>
  );
}
