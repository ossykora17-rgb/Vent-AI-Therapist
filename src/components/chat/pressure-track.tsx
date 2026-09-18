"use client";

import * as React from "react";
import { LINGER_MS, SETTLE_MS, WHISPER_PROMPT, type WhisperReason } from "@/lib/vent/whisper";
import { cn } from "@/lib/utils";

/**
 * One line. Where it sits when you arrive, and where it sits now.
 *
 * WHY THIS REPLACED TWO CONTROLS
 *
 * A screenshot of the composer at 390px showed a mono-uppercase toggle reading
 * `● SET THE PRESSURE ⌄` with a 0–100 range slider folded behind it, and
 * twelve pixels below it a second horizontal control — ten hairline marks, a
 * different visual language, a different scale — asking the same question at
 * the other end of the session. Two instruments for one axis, stacked above
 * one input box. Nothing was broken and the screen was incoherent.
 *
 * `chair → tension → drop` is one chain and this file is one instrument for
 * it. Left is light, right is heavy, and it is the same direction at both
 * ends: the reading you came in with and the reading you leave with are marks
 * on the same line. **The drop stops being a number somebody is told and
 * becomes a distance they watched move.** That is the whole reason to do this
 * rather than restyle two controls to match.
 *
 * TWO MODES, ONE OBJECT
 *
 * `before` — nothing has been answered yet, so the track is a real range
 * input, 0–100, continuous. This is the pressure slider exactly as it was,
 * promoted out of the tray, because a measurement folded behind a chevron is a
 * measurement most people never give.
 *
 * `after` — a vent has been answered, so the same line takes a tap: ten
 * positions, snapped, mapped straight back onto the 1–10 the server has always
 * received. **The scale did not move.** `tension_after` is `(10 - mood) * 10`
 * and the snap positions are exactly that arithmetic run backwards, so every
 * row written here is in the same space as every row before it.
 *
 * WHAT IT NEVER DOES
 *
 * It does not announce itself. At rest it is a hairline at 15% — texture above
 * the box rather than a control demanding a value — and it lifts on hover, on
 * focus, on touch, or when `reason` says the moment earned it. Choosing says
 * nothing back: no receipt, no lit state, no thank-you. The mark moves, and
 * the mark moving is the only thing that happens.
 *
 * An untouched track is a **hollow** mark, never a filled one at the default.
 * A half-lit dot over a number nobody has given reads as a reading, and this
 * product's oldest rule is that silence beats a guess.
 */
export function PressureTrack({
  pressure,
  pressureSet,
  onPressure,
  mode,
  reason,
  before,
  after,
  onPick,
  onIgnore,
}: {
  /** 0–100, the reading they came in with. */
  pressure: number;
  /** False until they have actually touched it — a default is not an answer. */
  pressureSet: boolean;
  onPressure: (value: number) => void;
  /** Which question this line is currently asking. */
  mode: "before" | "after";
  /** Why the after-question is being offered now, or null to stay at rest. */
  reason: WhisperReason | null;
  /** Where they came in, once it exists. */
  before: number | null;
  /** Where it landed, once they have said. */
  after: number | null;
  onPick: (mood: number) => void;
  onIgnore: () => void;
}) {
  const [touched, setTouched] = React.useState(false);
  const [justMoved, setJustMoved] = React.useState(false);

  /*
    An offer that is not taken has to report itself, or the counter that makes
    this go quiet never moves and it asks for ever at 15% opacity. Keyed on
    `reason`, so each distinct offer counts once, and silent when the cleanup
    runs because they answered — answering is not ignoring.
  */
  const answered = React.useRef(false);
  React.useEffect(() => {
    if (!reason) return;
    answered.current = false;
    return () => {
      if (!answered.current) onIgnore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  /*
    Ten positions, and they are the server's scale run backwards.

    `tension_after = (10 - mood) * 10`, so a mark at 0 is mood 10 and a mark at
    90 is mood 1. Deriving it here rather than writing the ten numbers out is
    what stops this line and the column it feeds from ever disagreeing.
  */
  const STOPS = Array.from({ length: 10 }, (_, i) => i * 10);
  const moodFor = (stop: number) => 10 - stop / 10;

  function pick(stop: number) {
    answered.current = true;
    setJustMoved(true);
    try {
      const still =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!still) navigator.vibrate?.(8);
    } catch {
      // No vibration API here. A missing haptic is never a failed interaction,
      // and the mark moving is the feedback either way.
    }
    onPick(moodFor(stop));
    window.setTimeout(() => setJustMoved(false), LINGER_MS);
  }

  const asking = mode === "after" && reason !== null;
  const lifted = asking || touched || justMoved;
  // Where the mark is right now: their answer if they have given one, else
  // where they came in, else the slider's live position.
  const at = after ?? (mode === "after" ? before ?? pressure : pressure);

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
      <div className="relative h-11">
        {/* The line itself. One hairline, full width, both modes. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-line" />

        {/*
          Where they came in, left behind once they have answered.

          It is the fainter of the two on purpose: the distance between the two
          marks is the drop, and the one that matters is where they are now.
        */}
        {after !== null && before !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-[10px] w-[2px] -translate-y-1/2 rounded-full bg-line"
            style={{ left: `calc(${before}% - 1px)` }}
          />
        )}

        {/* The mark. Hollow until the number is theirs. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all ease-out",
            pressureSet || after !== null ? "bg-gold" : "border border-gold/50",
            justMoved && "h-[14px] w-[14px]",
          )}
          style={{ left: `${at}%`, transitionDuration: `${SETTLE_MS}ms` }}
        />

        {mode === "before" ? (
          /*
            The pressure slider, out of the tray and onto the line.

            Folded behind a chevron it was a measurement most people never
            gave. It is the same input, the same 0–100, the same `pressureSet`
            rule — only visible.
          */
          <label className="absolute inset-0 block">
            <span className="sr-only">Pressure, 0 loose to 100 tight</span>
            <input
              type="range"
              min={0}
              max={100}
              value={pressure}
              onChange={(e) => onPressure(Number(e.target.value))}
              aria-label="Pressure, 0 loose to 100 tight"
              className="h-full w-full cursor-pointer opacity-0"
            />
          </label>
        ) : (
          /*
            The same line, taking a tap instead of a drag.

            Ten invisible zones over one visible track: ambient to look at,
            ordinary to hit, and every one a labelled radio so that 15% opacity
            is a rest state rather than a hiding place.
          */
          <div
            role="radiogroup"
            aria-label={WHISPER_PROMPT}
            className="absolute inset-0 flex"
          >
            {STOPS.map((stop) => (
              <button
                key={stop}
                type="button"
                role="radio"
                aria-checked={after === stop}
                aria-label={`${moodFor(stop)} out of 10, where 1 is heaviest`}
                onClick={() => pick(stop)}
                className="focusable h-full flex-1 opacity-0"
              >
                {moodFor(stop)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/*
        One line of the room's voice, and only while it is being asked.

        `label-mono` put this in mono capitals directly under another mono
        capital label and it read as a second field caption — chrome asking for
        a value, which is the thing this whole control exists to stop being.
        At rest it says nothing at all: a permanent caption under a permanent
        control is the card again, smaller.
      */}
      {asking && !justMoved && <p className="text-body text-ash">{WHISPER_PROMPT}</p>}
    </div>
  );
}
