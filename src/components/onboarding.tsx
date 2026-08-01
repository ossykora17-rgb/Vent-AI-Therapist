"use client";

import * as React from "react";
import { anonId } from "@/lib/anon";
import { cn } from "@/lib/utils";

/**
 * Thirty seconds, three questions, once ever. It isn't a form — it's the
 * thing a good therapist does in the first minute of the first session:
 * where are you sitting, what does it weigh, what are you carrying out.
 */

const DONE_KEY = "mw-onboarded";

type Chair = "tight_edge" | "sunk" | "half_off";
type Obj =
  | "heavy_stone"
  | "tight_knot"
  | "buzzing_wire"
  | "empty_bowl"
  | "spinning_top"
  | "cold_block";

const CHAIRS: Array<[Chair, string, string]> = [
  ["tight_edge", "Tight edge", "Perched. Ready to leave."],
  ["sunk", "Sunk in", "Heavy. Not moving."],
  ["half_off", "Half off", "One foot out the door."],
];

const OBJECTS: Array<[Obj, string]> = [
  ["heavy_stone", "Heavy stone"],
  ["tight_knot", "Tight knot"],
  ["buzzing_wire", "Buzzing wire"],
  ["empty_bowl", "Empty bowl"],
  ["spinning_top", "Spinning top"],
  ["cold_block", "Cold block"],
];

const WORDS = ["Guilt", "Proof", "Anger", "Hope", "Silence", "Tiredness"];

export interface OnboardingResult {
  chair: Chair;
  object: Obj;
  carry: string | null;
  drop: string | null;
  /** Chair maps to an opening tension reading, 0–100. */
  tension: number;
}

const CHAIR_TENSION: Record<Chair, number> = {
  tight_edge: 78,
  sunk: 62,
  half_off: 55,
};

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true; // Storage blocked — never trap them in onboarding.
  }
}

export function Onboarding({
  onDone,
}: {
  onDone: (result: OnboardingResult) => void;
}) {
  const [step, setStep] = React.useState(0);
  const [chair, setChair] = React.useState<Chair | null>(null);
  const [object, setObject] = React.useState<Obj | null>(null);
  const [carry, setCarry] = React.useState<string | null>(null);
  const [drop, setDrop] = React.useState<string | null>(null);

  async function finish(finalDrop: string | null) {
    if (!chair || !object) return;
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      /* ignore */
    }

    // Fire and forget — onboarding must never block on the network.
    void fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        anonId: anonId(),
        chairPicked: chair,
        objectPicked: object,
        onboardingDone: true,
      }),
    }).catch(() => {});

    onDone({
      chair,
      object,
      carry,
      drop: finalDrop,
      tension: CHAIR_TENSION[chair],
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Getting started"
      className="fixed inset-0 z-50 flex items-end justify-center bg-paper/80 backdrop-blur-glass sm:items-center"
    >
      <div className="glass m-3 w-full max-w-[440px] animate-slide-up p-5">
        <p className="label-mono mb-4">Step {step + 1} of 3</p>

        {step === 0 && (
          <>
            <h2 className="font-display text-xl font-bold leading-snug tracking-[-0.01em]">
              In my office, you pick where you sit. Which chair is you today?
            </h2>
            <div className="mt-5 space-y-2">
              {CHAIRS.map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setChair(value);
                    setStep(1);
                  }}
                  className={cn(
                    "flex min-h-[56px] w-full flex-col items-start justify-center rounded-card border px-4 py-3 text-left transition-colors duration-300",
                    chair === value
                      ? "border-gold bg-gold/15"
                      : "border-line/15 hover:border-gold/50",
                  )}
                >
                  <span className="text-[15px] font-semibold">{label}</span>
                  <span className="text-[13px] text-ash">{hint}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="font-display text-xl font-bold leading-snug tracking-[-0.01em]">
              Pick the object for how you feel.
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {OBJECTS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setObject(value);
                    setStep(2);
                  }}
                  className={cn(
                    "min-h-[56px] rounded-card border px-3 text-[14px] font-medium transition-colors duration-300",
                    object === value
                      ? "border-gold bg-gold/15"
                      : "border-line/15 hover:border-gold/50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-display text-xl font-bold leading-snug tracking-[-0.01em]">
              You&apos;re leaving. Wetin you go carry, wetin you go drop?
            </h2>
            <p className="label-mono mt-3">Carry one</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WORDS.map((w) => (
                <button
                  key={`c-${w}`}
                  type="button"
                  onClick={() => setCarry(w)}
                  aria-pressed={carry === w}
                  className={cn(
                    "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
                    carry === w ? "border-gold bg-gold text-ink" : "border-line/15",
                  )}
                >
                  {w}
                </button>
              ))}
            </div>

            <p className="label-mono mt-4">Drop one</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WORDS.filter((w) => w !== carry).map((w) => (
                <button
                  key={`d-${w}`}
                  type="button"
                  onClick={() => {
                    setDrop(w);
                    void finish(w);
                  }}
                  className="min-h-[44px] rounded-full border border-line/15 px-4 text-sm transition-colors duration-300 hover:border-gold"
                >
                  {w}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(DONE_KEY, "1");
            } catch {
              /* ignore */
            }
            onDone({
              chair: chair ?? "half_off",
              object: object ?? "heavy_stone",
              carry,
              drop,
              tension: CHAIR_TENSION[chair ?? "half_off"],
            });
          }}
          className="mt-5 min-h-[44px] w-full text-sm text-ash underline underline-offset-4"
        >
          Skip — just let me talk
        </button>
      </div>
    </div>
  );
}
