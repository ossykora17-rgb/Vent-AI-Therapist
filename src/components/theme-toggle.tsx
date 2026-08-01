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

export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("mw-theme", next ? "dark" : "light");
    } catch {
      // Private mode — the toggle still works for this session.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-line/10 bg-card/60 text-ink backdrop-blur-glass transition-colors duration-300 hover:bg-card"
    >
      <span aria-hidden="true" className="text-base leading-none">
        {dark ? "☾" : "☀"}
      </span>
    </button>
  );
}
