import { cn } from "@/lib/utils";

/**
 * A ring with a gap in it, turning.
 *
 * The first version drew the track with `border-current/25` — and
 * `currentColor` cannot take a Tailwind alpha modifier, so that class
 * compiled to nothing and the track was never there. It rendered as a single
 * lit arc on no ring, which looks close enough to a spinner that it survived
 * a screenshot.
 *
 * The gap is a transparent border segment instead, which needs no alpha at
 * all and inherits whatever colour the button it sits in is using.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current",
        "border-t-transparent motion-safe:animate-spin motion-reduce:opacity-60",
        className,
      )}
    />
  );
}
