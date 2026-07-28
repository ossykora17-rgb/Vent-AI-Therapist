"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

/**
 * `seal` is the only variant allowed to use #FFD700. Gold is reserved for
 * the cut that heals — the surgical question, the totem eye, the seal.
 * Everything else is black and white.
 */
type Variant = "primary" | "ghost" | "inverse" | "seal" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper border-ink hover:bg-paper hover:text-ink",
  ghost: "bg-paper text-ink border-ink hover:bg-ink hover:text-paper",
  // For use on a black surface.
  inverse: "bg-paper text-ink border-paper hover:bg-ink hover:text-paper",
  seal: "bg-gold text-ink border-ink hover:bg-ink hover:text-gold",
  // No red exists in the palette, so destructive reads as a hard invert.
  danger:
    "bg-paper text-ink border-ink underline decoration-3 underline-offset-4 hover:bg-ink hover:text-paper",
};

// 44px floor everywhere — the iOS/Android minimum tap target.
const SIZES: Record<Size, string> = {
  sm: "min-h-[44px] px-3 text-sm",
  md: "min-h-[48px] px-4 text-base",
  lg: "min-h-[56px] px-6 text-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "border-3 font-bold uppercase tracking-wide",
          "shadow-brut transition-none",
          // Press = the shadow collapses. Physical, not animated.
          "active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
          "disabled:cursor-not-allowed disabled:border-ash disabled:bg-paper disabled:text-ash",
          "disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0",
          VARIANTS[variant],
          SIZES[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading && <Spinner className="h-4 w-4" />}
        <span className={cn(loading && "opacity-70")}>{children}</span>
      </button>
    );
  },
);
