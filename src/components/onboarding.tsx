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
      // The card has to read as floating in a dimmed room rather than as a box
      // dropped on a page. `.scrim` is that dimming, written once and keyed to
      // `--vignette` — see globals.css for why the `bg-ink/25` that used to be
      // here brightened the dark theme instead of darkening it.
      className="scrim fixed inset-0 z-50 flex items-end justify-center sm:items-center"
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
            <h2 className="reply">
              In my office, you pick where you sit. Which chair is you today?
            </h2>
            {/*
              Three rows, not three cards.

              This was three `rounded-card border` boxes inside a `presence`
              card inside a full-screen scrim — boxes in boxes in boxes, at the
              first thing VENT ever shows anybody. Each box was 56px tall and
              held one short label and one shorter hint, so most of what was on
              screen was the containers.

              The landing page solved the identical problem one screen earlier:
              its litany used to be three cards in a grid and is now three lines
              on a gold spine. This is the same list of three, one tap later, so
              it is the same shape — hairline between the rows, and the rule on
              the left goes gold when a chair is yours. That state only shows
              when somebody comes Back, which is exactly when it matters.

              The label and the hint sit on one baseline rather than stacked,
              which is how a dictionary sets a word and its sense, and it takes
              the block from 180px to about 150px without dropping a word.
            */}
            <div className="mt-5">
              {CHAIRS.map(({ id: value, label, hint }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setChair(value);
                    setStep(1);
                  }}
                  aria-pressed={chair === value}
                  className="pressable focusable flex min-h-[52px] w-full flex-wrap items-baseline gap-x-3 border-b border-l-2 border-line/10 border-l-transparent py-3 pl-3 text-left last:border-b-0 aria-pressed:border-l-gold"
                >
                  <span className="text-body font-semibold">{label}</span>
                  <span className="text-fine text-ash">{hint}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="reply">Pick the object for how you feel.</h2>
            {/*
              The same chips the next question uses.

              Six equal words in a 2×3 grid of 56px outlined boxes, and then
              one tap later the same person is offered six equal words as
              round chips. Two component languages for one act, back to back,
              inside thirty seconds — which is what "AI made" looks like from
              the outside: every screen invents its own control.

              Chips win because the next screen already uses them and because
              six of them wrap into about 150px instead of 180px of boxes.
            */}
            <div className="mt-5 flex flex-wrap gap-2">
              {OBJECTS.map(({ id: value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setObject(value);
                    setStep(2);
                  }}
                  aria-pressed={object === value}
                  className="chip"
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
                  className="chip"
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
                  aria-pressed={drop === w}
                  className="chip"
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
              className="min-h-[44px] shrink-0 text-fine text-ash underline underline-offset-4"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={skip}
            className="min-h-[44px] flex-1 text-right text-fine text-ash underline underline-offset-4"
          >
            Skip — just let me talk
          </button>
        </div>
      </div>
    </div>
  );
}
