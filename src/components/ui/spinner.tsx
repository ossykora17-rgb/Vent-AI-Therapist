import { cn } from "@/lib/utils";

/**
 * A ring, not a block. The brutalist spinner was a hard square stepping
 * through rotations; this turns continuously in gold at low opacity, because
 * a waiting state should be the quietest thing on the screen.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current/25",
        "border-t-current motion-safe:animate-spin motion-reduce:opacity-60",
        className,
      )}
    />
  );
}
