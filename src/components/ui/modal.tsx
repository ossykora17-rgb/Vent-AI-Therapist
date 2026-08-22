"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Blocks backdrop/Escape dismissal while a destructive action is running. */
  dismissible?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  // Escape to close + scroll lock while open.
  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
      if (e.key !== "Tab" || !panelRef.current) return;

      // Trap focus inside the panel.
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="presentation"
    >
      {/* Solid scrim — flat black at 60%, no blur. */}
      <div
        aria-hidden="true"
        onClick={dismissible ? onClose : undefined}
        className="absolute inset-0 bg-ink/60"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "glass-raised relative z-10 w-full max-w-[440px]",
          "max-h-[90dvh] overflow-y-auto",
          "animate-slide-up",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line/10 p-4">
          <h2
            id={titleId}
            className="font-display text-[15px] font-bold tracking-[-0.01em]"
          >
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="pressable focusable -m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-ash hover:bg-ink/5 hover:text-ink"
            >
              ×
            </button>
          )}
        </div>

        <div className="p-4 text-sm leading-relaxed">{children}</div>

        {footer && (
          <div className="flex flex-col gap-2 border-t border-line/10 p-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
