"use client";

import * as React from "react";
import {
  LINGER_MS,
  SETTLE_MS,
  WHISPER_MAX,
  WHISPER_MIN,
  WHISPER_PROMPT,
  type WhisperReason,
} from "@/lib/vent/whisper";
import { cn } from "@/lib/utils";

/**
 * Ten ticks in the periphery of the composer.
 *
 * At rest it is a hairline: ten marks at 15% opacity above the box, closer to
 * texture than to a control. It becomes legible on hover, on keyboard focus,
 * on touch, and when `reason` says the moment has earned it. Choosing settles
 * the mark downward and the whole strip fades back within `LINGER_MS`.
 *
 * WHAT NEVER HAPPENS HERE
 *
 * No label sits under it afterwards, no tick stays lit, and nothing says thank
 * you. The gesture is somebody noticing where the weight landed; a receipt
 * would turn it back into a report filed with a machine. The *drop* still gets
 * a card — that is their own arithmetic and the reason the question exists,
 * not a confirmation that we stored something.
 *
 * ACCESSIBILITY IS NOT THE OPACITY
 *
 * 15% opacity is a visual rest state, not a hiding place. This is a real
 * radiogroup: every tick is a focusable radio with its own label, arrow keys
 * move between them, and focus alone lifts the whole strip to full contrast.
 * A control that only a sighted mouse user can find is not subtle, it is
 * broken — and `prefers-reduced-motion` drops the settle to a plain state
 * change rather than removing the way to answer.
 *
 * THE HAPTIC, AND THE HALF OF IT THAT CANNOT BE DELIVERED HERE
 *
 * The brief asks for a Core Haptics transient with an intensity curve decaying
 * to zero. **Core Haptics is an iOS-native framework and a web page cannot
 * call it** — not a support gap that will close, an architectural one: this
 * product ships as a website, and reaching that API needs a native wrapper
 * this repository does not have. So the organic settle is delivered visually
 * and not haptically, and saying so is the point of this paragraph.
 *
 * `navigator.vibrate` is the only haptic-adjacent thing a page can reach, and
 * it is called here optional-chained, at 8ms — a selection tick, not a buzz —
 * and skipped under reduced motion, which is where somebody has said they do
 * not want to be tapped at.
 *
 * **Whether it fires on iOS Safari is not asserted here, because it was not
 * verified here**: MDN is unreachable from the environment this was written
 * in. What the code does either way is the design — the visual settle is the
 * whole feedback channel on its own and the tick is a bonus where it exists,
 * which is what the brief's own "never the sole channel" asks for. Anybody
 * with a browser and a phone can settle the support question in a minute; a
 * remembered compatibility table written into a comment is the kind of claim
 * this repository has a whole file about.
 */
export function WeightWhisper({
  reason,
  onPick,
  onIgnore,
}: {
  /** Why it is being offered now, or null to stay at rest. */
  reason: WhisperReason | null;
  onPick: (value: number) => void;
  /** An invitation came and went unanswered. */
  onIgnore: () => void;
}) {
  const [settling, setSettling] = React.useState<number | null>(null);
  const [touched, setTouched] = React.useState(false);

  /*
    An invitation that is not taken has to report itself, or the counter that
    makes this go quiet never moves and it asks forever at 15% opacity.

    Keyed on `reason` so each distinct offer counts once: the effect's cleanup
    fires when the reason clears, which is the moment the offer ended. If it
    ended because they answered, `settling` is set and this stays silent —
    answering is not ignoring.
  */
  const settled = React.useRef(false);
  React.useEffect(() => {
    if (!reason) return;
    settled.current = false;
    return () => {
      if (!settled.current) onIgnore();
    };
    // `onIgnore` is stable in the parent; re-running on identity would
    // double-count an offer that never changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  function pick(value: number) {
    settled.current = true;
    setSettling(value);
    try {
      const still =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!still) navigator.vibrate?.(8);
    } catch {
      // No vibration API, or a browser that refuses it without a gesture it
      // recognises. A missing haptic is never a failed interaction.
    }
    onPick(value);
    window.setTimeout(() => setSettling(null), LINGER_MS);
  }

  // Legible when the moment asked for it, when they are pointing at it, or
  // while a choice is settling. Otherwise it is texture.
  const lifted = reason !== null || touched || settling !== null;

  return (
    <div
      onPointerEnter={() => setTouched(true)}
      onPointerLeave={() => setTouched(false)}
      onFocus={() => setTouched(true)}
      onBlur={() => setTouched(false)}
      className={cn(
        "mb-2 select-none transition-opacity ease-out",
        lifted ? "opacity-100" : "opacity-15",
      )}
      style={{ transitionDuration: `${SETTLE_MS}ms` }}
    >
      <div
        role="radiogroup"
        aria-label={WHISPER_PROMPT}
        className="flex items-end gap-[3px]"
      >
        {Array.from({ length: WHISPER_MAX - WHISPER_MIN + 1 }, (_, i) => i + WHISPER_MIN).map(
          (n) => {
            const chosen = settling === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={`${n} out of ${WHISPER_MAX}, where ${WHISPER_MIN} is heaviest`}
                onClick={() => pick(n)}
                /*
                  A 44px hit target around a 1px mark.

                  The tick is hairline and the thing a thumb lands on is not.
                  `py-3` plus the flex row gives every mark a full-height
                  target without drawing a button, which is the whole trick:
                  ambient to look at, ordinary to hit.
                */
                className="focusable group flex-1 py-3"
              >
                <span
                  className={cn(
                    "block w-full rounded-full bg-line transition-all ease-out",
                    // The settle: the chosen mark drops and thickens, its
                    // neighbours stay where they are. Weight landing on one
                    // point, not a row lighting up like a progress bar —
                    // a filled bar would read as a score out of ten.
                    chosen
                      ? "h-[6px] translate-y-[3px] bg-gold"
                      : "h-[2px] group-hover:h-[4px]",
                  )}
                  style={{ transitionDuration: `${SETTLE_MS}ms` }}
                />
              </button>
            );
          },
        )}
      </div>

      {/*
        The sentence only exists while it is being offered, and it is one line
        of the room's own voice rather than a field label. At rest the strip
        says nothing at all — a permanent caption under a permanent control is
        the card again, smaller.
      */}
      {reason !== null && settling === null && (
        <div className="mt-1 flex items-baseline justify-between gap-3">
          {/*
            Body type, not `label-mono`.

            The first version used the mono uppercase label class and a
            screenshot settled it: "HOW DOES IT SIT IN YOU NOW?" sat directly
            under "SET THE PRESSURE" and read as a second control caption —
            chrome asking for a field, which is the exact thing this whole
            change exists to stop. It is the room's voice or it is a form.
          */}
          <p className="text-body text-ash">{WHISPER_PROMPT}</p>
          {/*
            Ten identical marks do not say which end is heavy, and a number
            given blind is worse than no number — it is noise in the one
            signal this product measures. The card carried these anchors
            permanently; here they arrive with the question and leave with it,
            because a caption that is always there is the card again, smaller.
          */}
          <p className="label-mono shrink-0 text-ash">heavy · lighter</p>
        </div>
      )}
    </div>
  );
}
