"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ToastTone = "info" | "success" | "error";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        /*
          Lifted above the composer, because of what sits at the very bottom
          of the chat page: the crisis line.

          This was `bottom-0`, and a screenshot of an ordinary session showed
          the success toast — "Anchored." — sitting squarely on top of the
          crisis line for four seconds. The one string in this product that
          must never be unreadable, covered by a confirmation that somebody
          rated their mood.

          `--composer-h` is the footer's measured height, published by the
          chat composer's ResizeObserver. The +60px clears the feedback pill
          that floats just above it. Both fall back to 0 and to a bare 60px
          lift on pages with no composer, which is where this used to sit
          flush and looked pasted on anyway.
        */
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+var(--composer-h,0px)+60px)] z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-[380px] items-start gap-3",
              // Spoken in the room's voice, not the old brutalist one.
              //
              // This was a 3px black box with a hard drop shadow — a leftover
              // from a visual language the two surfaces that actually raise
              // toasts stopped using. In a screenshot it read as an alarm
              // while the word inside it was "Anchored.": the single moment
              // this product has to say *something worked*, rendered as a
              // warning. Same plate as everything else now, with the gold
              // edge the room uses to mark a good arrival.
              "glass animate-slide-up border-l-2 p-3",
              t.tone === "error"
                ? "border-l-ink bg-ink/90 text-paper"
                : t.tone === "success"
                  ? "border-l-gold text-ink"
                  : "border-l-line/30 text-ink",
            )}
          >
            <span
              aria-hidden="true"
              className="label-mono mt-[2px]"
            >
              {t.tone === "error" ? "!" : t.tone === "success" ? "✓" : "i"}
            </span>
            <p className="flex-1 text-sm font-medium leading-snug">
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-my-3 -mr-2 flex min-h-[44px] w-11 shrink-0 items-center justify-center text-lg font-bold leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
