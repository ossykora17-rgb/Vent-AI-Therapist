import { cn } from "@/lib/utils";

/**
 * The totem: a black cube with one eye. The eye is one of the three sanctioned
 * uses of #FFD700. The blink is a hard cut every 7s — steps(1), never eased,
 * never glowing.
 */
export function Totem({
  tired = false,
  className,
}: {
  /** Set once the user hasn't vented by 9pm — the eye hangs half-closed. */
  tired?: boolean;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={tired ? "The totem, tired" : "The totem"}
      className={cn(
        "relative grid h-28 w-28 place-items-center border-3 border-paper bg-ink sm:h-36 sm:w-36",
        // Hard white offset. Zero blur — a second cube, not a shadow.
        "shadow-[6px_6px_0_0_#FFFFFF]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "block h-5 w-10 bg-gold sm:h-6 sm:w-12",
          tired ? "scale-y-[0.35]" : "motion-safe:animate-blink",
        )}
      />
    </div>
  );
}
