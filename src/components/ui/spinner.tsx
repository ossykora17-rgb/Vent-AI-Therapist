import { cn } from "@/lib/utils";

/** A square that rotates. No arcs, no gradients. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 shrink-0 border-3 border-current",
        "motion-safe:animate-spin",
        className,
      )}
      style={{ borderRightColor: "transparent" }}
    />
  );
}
