"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

/**
 * One button, in the frosted-marble language.
 *
 * This file used to be the other design system: 3px ink borders, a hard 4px
 * offset shadow, `uppercase tracking-wide` on every label, and a press that
 * moved the whole control 4px down-right into the space the shadow had been
 * holding. That instinct — press means the object *moves*, not that a colour
 * fades — was the best thing about it and it is kept, translated to 1px of
 * travel and a shadow that tightens instead of vanishing.
 *
 * Gold stays reserved. It is the accent for the thing that heals, so `seal`
 * is the only variant that fills with it and there is exactly one of those on
 * any screen.
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
  // Solid ink. The one real action on a page.
  primary:
    "bg-ink text-paper shadow-glass-sm hover:opacity-90 active:shadow-none",
  // Glass over whatever is behind it — the default for everything secondary.
  ghost: "glass text-ink hover:bg-card/85",
  // For use on a dark plate, where glass would disappear into it.
  inverse:
    "bg-paper text-ink shadow-glass-sm hover:opacity-90 active:shadow-none",
  seal: "bg-gold text-on-gold shadow-glass-sm hover:bg-gold-deep active:shadow-none",
  /*
    No red exists in this palette and none is being added for this. A
    destructive action reads as the one control on the page with a drawn
    edge — it should look like it is asking a second time, which is what a
    deletion is.
  */
  danger:
    "border border-ink/30 bg-transparent text-ink hover:bg-ink hover:text-paper",
};

// 44px floor everywhere — the iOS/Android minimum tap target.
const SIZES: Record<Size, string> = {
  sm: "min-h-[44px] px-4 text-body",
  md: "min-h-[48px] px-5 text-body",
  lg: "min-h-[56px] px-6 text-body",
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
          "inline-flex items-center justify-center gap-2 rounded-card",
          // Sentence case, not shouting. An uppercase label on every control
          // is a house style that reads as urgency, and nothing here is urgent.
          "font-semibold tracking-[-0.01em]",
          "pressable focusable",
          "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
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
