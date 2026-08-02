"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

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
        <label
          htmlFor={inputId}
          className="mb-2 block text-xs font-bold uppercase tracking-widest"
        >
          {label}
          {props.required && <span className="ml-1 text-ink">*</span>}
        </label>

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            cn(error && errorId, hint && hintId).trim() || undefined
          }
          className={cn(
            "w-full border-3 border-ink bg-paper px-3 py-3 text-ink",
            "min-h-[48px] placeholder:text-ash",
            "focus:placeholder:text-ink",
            "disabled:cursor-not-allowed disabled:border-ash disabled:text-ash",
            // Errors thicken the frame. No color — the message carries it.
            error && "border-ink ring-3 ring-inset ring-ink",
            className,
          )}
          {...props}
        />

        {hint && !error && (
          <p id={hintId} className="mt-2 text-xs text-ash">
            {hint}
          </p>
        )}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-2 border-l-3 border-ink pl-2 text-xs font-bold uppercase tracking-wide"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
