"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A field you put something into.
 *
 * This was a 3px ink rectangle on flat paper, and its error state thickened
 * the frame with a 3px inset ring — legible, and shouting. Now it is a `.well`:
 * sunk into the surface with an inset shadow, so it reads as somewhere to put
 * something before anybody reads the label.
 *
 * The error still carries no red, because the palette has none. It carries a
 * gold edge and a sentence — and the sentence was always the part doing the
 * work, once it stopped being set in bold uppercase.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, label, error, hint, id, ...props }, ref) {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="w-full">
        {/* The asterisk takes the readable colour, not the accent: gold on
            marble measures 2.21:1, and this is a legibility cue. */}
        <label htmlFor={inputId} className="label-mono mb-2 block">
          {label}
          {props.required && (
            <span className="ml-1 text-ink" aria-hidden="true">
              *
            </span>
          )}
        </label>

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            cn(error && errorId, hint && hintId).trim() || undefined
          }
          className={cn(
            "well focusable w-full px-4 py-3 text-ink",
            "min-h-[48px] placeholder:text-ash/70",
            "transition-shadow duration-300",
            "disabled:cursor-not-allowed disabled:opacity-50",
            // The one place the accent marks a problem rather than a healing.
            error && "border-gold/60",
            className,
          )}
          {...props}
        />

        {hint && !error && (
          <p id={hintId} className="mt-2 text-fine leading-[1.6] text-ash">
            {hint}
          </p>
        )}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-2 border-l-2 border-gold pl-3 text-fine leading-[1.6] text-ink"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
