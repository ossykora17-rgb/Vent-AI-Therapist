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
        // Announced to screen readers; visually a stack of hard blocks.
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-3 sm:items-end sm:p-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-[380px] items-start gap-3",
              "border-3 border-ink p-3 shadow-brut animate-slide-up",
              // Error is the loud one: full black. Gold is never used here.
              t.tone === "error" ? "bg-ink text-paper" : "bg-paper text-ink",
            )}
          >
            <span
              aria-hidden="true"
              className="mt-[2px] text-xs font-bold uppercase tracking-widest"
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
              className="-m-1 shrink-0 p-1 text-lg font-bold leading-none"
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
