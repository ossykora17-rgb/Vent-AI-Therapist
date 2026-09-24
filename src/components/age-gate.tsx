"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  AGE_BODY,
  AGE_CONFIRM,
  AGE_DECLINE,
  AGE_HEADLINE,
  AGE_TURNED_AWAY_ALSO,
  AGE_TURNED_AWAY_BODY,
  AGE_TURNED_AWAY_HEADLINE,
  ageServerSnapshot,
  ageSnapshot,
  confirmAge,
  subscribeAge,
} from "@/lib/age";
import { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL } from "@/lib/vent/intent";

/**
 * One tap before the room, and nothing kept.
 *
 * THE THING THIS MUST NOT BECOME
 *
 * `/chat` used to open on "Question 1 of 3 — which chair is you today?" before
 * a person could type a word. It was deleted, and the number that deleted it is
 * the argument for how this one is shaped: the form collected `chair_picked` on
 * **2 of 108** vents, while the one reading it promoted onto the line —
 * `pressure_value` — sits at **45 of 108**. Anything standing between a person
 * and the box had better not be asking them for anything.
 *
 * So the line check 109 now draws is not *no screen before the box*, it is
 * **no screen before the box takes anything from them**. This one has no fetch,
 * no route, no column, no anon id and nothing keyed to a person: it is the
 * product making a statement and somebody acknowledging it, and the only trace
 * is a flag on their own device that their own wipe button clears.
 *
 * WHY THE REFUSAL CARRIES THE NUMBERS
 *
 * Because of who is most likely to tap it. Somebody turned away here is, by
 * construction, disproportionately a teenager at 2am who has already decided to
 * type something they have not said out loud — and this repository's oldest
 * rule is that a refusal has to be true and has to open onto something. A wall
 * with no phone number on it is the door onto a 501, on the one screen where
 * that costs the most.
 *
 * WHAT IT IS WORTH, STATED RATHER THAN IMPLIED
 *
 * Nothing, against anybody who does not want to be stopped. `age.ts` says so at
 * length: the server cannot learn an age, so this is a mirror with nothing
 * behind it. It is a disclosure, not a control, and no code downstream may read
 * a cleared gate as a verified adult.
 */

export function AgeGate({ children }: { children: React.ReactNode }) {
  /*
    Three states, and `null` is load-bearing. Storage is not readable during the
    server render, so `false` there would flash the gate at every returning
    person on every navigation — the screen this product least wants to show
    twice. `null` renders nothing until the client has actually looked.

    `useSyncExternalStore` rather than an effect because that is what this is:
    a value living outside React, with a server snapshot that differs from the
    client one. The effect version called `setState` from inside an effect,
    which is a lint warning and an extra render pass, and it put the cache in
    the component where the wipe could not reach it.
  */
  const ok = useSyncExternalStore(subscribeAge, ageSnapshot, ageServerSnapshot);
  const [turnedAway, setTurnedAway] = useState(false);

  if (ok === null) return null;
  if (ok) return <>{children}</>;

  return (
    <div className="flex min-h-dvh flex-col">
      <main
        id="main"
        className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center gap-5 px-4 py-10"
      >
        {turnedAway ? (
          <>
            <h1 className="font-display text-heading font-bold leading-tight tracking-[-0.02em]">
              {AGE_TURNED_AWAY_HEADLINE}
            </h1>
            <p className="text-body leading-[1.6] text-ash">{AGE_TURNED_AWAY_BODY}</p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={`tel:${CRISIS_TEL}`}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-card bg-gold px-4 text-body font-semibold text-on-gold"
              >
                Call {CRISIS_LINES.nigeria}
              </a>
              <a
                href={`tel:${EMERGENCY_TEL}`}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-card border border-line/20 px-4 text-body font-semibold"
              >
                Emergency {CRISIS_LINES.emergency}
              </a>
            </div>

            <p className="text-fine leading-[1.6] text-ash">{AGE_TURNED_AWAY_ALSO}</p>

            {/*
              Not a dead end. They came from somewhere and the landing page is
              still theirs to read, as are the two pages that say what this
              product does and does not keep.
            */}
            <p className="text-label text-ash">
              <Link href="/" className="underline underline-offset-2">
                Back
              </Link>{" "}
              ·{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy
              </Link>{" "}
              ·{" "}
              <Link href="/terms" className="underline underline-offset-2">
                Terms
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-heading font-bold leading-tight tracking-[-0.02em]">
              {AGE_HEADLINE}
            </h1>
            <p className="text-body leading-[1.6] text-ash">{AGE_BODY}</p>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmAge}
                className="flex min-h-[48px] items-center justify-center rounded-card bg-gold px-4 text-body font-semibold text-on-gold"
              >
                {AGE_CONFIRM}
              </button>
              <button
                type="button"
                onClick={() => setTurnedAway(true)}
                className="flex min-h-[48px] items-center justify-center rounded-card border border-line/20 px-4 text-body"
              >
                {AGE_DECLINE}
              </button>
            </div>

            <p className="text-label text-ash">
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy
              </Link>{" "}
              ·{" "}
              <Link href="/terms" className="underline underline-offset-2">
                Terms
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
