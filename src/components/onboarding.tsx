"use client";

import * as React from "react";
import { anonId } from "@/lib/anon";
import {
  CARRY_WORDS,
  CHAIRS,
  CHAIR_TENSION,
  OBJECTS,
  type ChairId,
  type ObjectId,
} from "@/lib/vent/chairs";
import { cn } from "@/lib/utils";

/**
 * Thirty seconds, three questions, once ever. It isn't a form — it's the
 * thing a good therapist does in the first minute of the first session:
 * where are you sitting, what does it weigh, what are you carrying out.
 */

const DONE_KEY = "mw-onboarded";

// One table, imported. These lists lived here and the server had no way to
// know what the person had actually been shown, which is why three of the
// five answers went nowhere.
type Chair = ChairId;
type Obj = ObjectId;

const WORDS: readonly string[] = CARRY_WORDS;

export interface OnboardingResult {
  chair: Chair;
  object: Obj;
  carry: string | null;
  drop: string | null;
  /** Chair maps to an opening tension reading, 0–100. */
  tension: number;
}

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

  // Named, so Escape and the button are the same door rather than two
  // implementations of it that can drift apart.
  function skip() {
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
  }

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

  // Leaving is always available, from the keyboard too. A modal that traps
  // somebody is the opposite of what this screen is for, and the person most
  // likely to hit Escape here is the person least able to sit through three
  // questions — which is exactly who must not be held.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chair, object, carry, drop]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Getting started"
      // Deeper than the page, not the same warm paper at 80%. The card has to
      // read as floating in a room rather than as a box dropped on a page —
      // ink at low alpha darkens whatever is behind it in both themes, where
      // paper/80 just washed it out.
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 backdrop-blur-glass sm:items-center"
    >
      {/*
        The room, not a dialog.

        This is the first thing VENT ever says to anybody, and it was set as a
        `glass` card with `<h2>` headings — the only place in the product where
        the room speaks and does not look like the room. Somebody's whole
        impression of where they have arrived is formed here, thirty seconds
        before they type the sentence they came to type.
      */}
      <div className="presence arrive m-3 w-full max-w-[440px] p-6 sm:p-8">
        {/*
          Three marks, not "Step 1 of 3".
          A counter tells you there is a form and how much of it is left, which
          is the register of an insurance quote. Marks let you feel where you
          are without being told you are filling something in. The count is
          still announced to screen readers, where it is genuinely useful.
        */}
        <p className="nameplate mb-4">Vent</p>
        <div className="mb-6 flex items-center gap-2">
          <span className="sr-only">{`Question ${step + 1} of 3`}</span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "h-px flex-1 transition-colors duration-500",
                i <= step ? "bg-gold" : "bg-line/15",
              )}
            />
          ))}
        </div>

        {step === 0 && (
          <>
            <h2 className="reply">In my office, you pick where you sit. Which chair is you today?</h2>
            <div className="mt-5 space-y-2">
              {CHAIRS.map(({ id: value, label, hint }) => (
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
            <h2 className="reply">Pick the object for how you feel.</h2>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {OBJECTS.map(({ id: value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setObject(value);
                    setStep(2);
                  }}
                  className={cn(
                    "min-h-[56px] rounded-card border px-3 text-[15px] font-medium transition-colors duration-300",
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
            {/*
              This said "You're leaving."

              It is the circle's *closing* ritual — carry one, drop one — and
              it is a good ritual, which is how it ended up transplanted onto
              the front door and told somebody who had not typed a word yet
              that they were on their way out. The mechanic stays, because
              both answers reach the room's first reply through
              `openingBlock`. Only the framing moves from departure to
              arrival, which is where this person actually is.
            */}
            <h2 className="reply">
              You just came in. Wetin you carry come, and wetin you wan drop
              here?
            </h2>
            <p className="label-mono mt-4">Carrying</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WORDS.map((w) => (
                <button
                  key={`c-${w}`}
                  type="button"
                  onClick={() => setCarry(w)}
                  aria-pressed={carry === w}
                  className={cn(
                    "min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-300",
                    carry === w ? "border-gold bg-gold text-on-gold" : "border-line/15",
                  )}
                >
                  {w}
                </button>
              ))}
            </div>

            <p className="label-mono mt-5">Leaving here</p>
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

        {/*
          A way back.
          Picking a chair advanced immediately with no way to change it, so a
          misclick on question one was permanent — and question one is the one
          that seeds the tension reading every tactic is chosen against. Three
          screens with no back button is a kiosk, not a conversation.
        */}
        <div className="mt-5 flex items-center gap-4">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="min-h-[44px] shrink-0 text-sm text-ash underline underline-offset-4"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={skip}
            className="min-h-[44px] flex-1 text-right text-sm text-ash underline underline-offset-4"
          >
            Skip — just let me talk
          </button>
        </div>
      </div>
    </div>
  );
}
