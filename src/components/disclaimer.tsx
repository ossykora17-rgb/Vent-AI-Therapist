import { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL } from "@/lib/vent/intent";

/**
 * The sentence at the bottom of every screen, written once.
 *
 * It was written twice — the chat footer and the landing footer, hand-typed,
 * identical by luck rather than by construction. Check 17 already made the
 * crisis *number* impossible to hand-write for exactly this reason; the
 * sentence carrying that number was still copy-paste. The two copies had
 * already drifted in whitespace, which is how drift starts.
 *
 * It also did not say the one thing four US states now require a product like
 * this to say, and a person deserves to know regardless of jurisdiction: that
 * the thing answering is not a person. VENT says so out loud when asked
 * ("I'm VENT — an AI, not a person and not a licensed therapist" —
 * `grounding.ts`) and on the terms page. The always-visible line, the one
 * somebody actually reads at 2am, said only that Mind Weave is not a licensed
 * therapist — true, and quiet about the part that matters most.
 *
 * Which deployment shape makes this false? None: this is a pure component
 * with no store, no key, and no network. It renders the same in production
 * with nothing configured as it does locally, which is the point — a
 * disclosure that depends on configuration is not a disclosure.
 */
/*
  Two lines, not four — and nothing removed to get there.

  Screenshotted at 360px after the composer's controls were folded away, this
  was the loudest thing left on the screen: four lines of legal prose directly
  under a one-line input, taking more vertical space than the input, the
  button and the pressure strip combined. Tidying the composer had made the
  disclaimer the composer.

  The temptation was to cut a clause. Every clause here is load-bearing —
  "an AI", "not a person", "not a licensed therapist", "not medical advice",
  and two numbers somebody might have to dial tonight — and check 46 holds all
  of them, correctly.

  So nothing is cut. It is set as what it actually is: one sentence somebody
  should read, and a row of facts they should be able to find. The disclosure
  keeps its size and its full stop; the numbers become a tight tabular row that
  reads as a footer rather than as a paragraph, which is also how somebody
  scanning for a phone number at 2am actually looks for one.

  Same words, half the height, and the number is easier to hit than it was.
*/
export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <div className={`text-ash ${className}`.trim()}>
      <p className="text-fine leading-snug">
        Mind Weave VENT is an AI — not a person, and not a licensed therapist.
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-label leading-snug">
        <span>Support, not medical advice</span>
        <span aria-hidden className="opacity-40">
          ·
        </span>
        <span>
          Crisis{" "}
          <a
            href={`tel:${CRISIS_TEL}`}
            className="tabular underline underline-offset-2"
          >
            {CRISIS_LINES.nigeria}
          </a>
        </span>
        <span aria-hidden className="opacity-40">
          ·
        </span>
        <span>
          Emergency{" "}
          <a
            href={`tel:${EMERGENCY_TEL}`}
            className="tabular underline underline-offset-2"
          >
            {CRISIS_LINES.emergency}
          </a>
        </span>
      </p>
    </div>
  );
}
