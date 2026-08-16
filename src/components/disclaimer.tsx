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
export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12px] leading-relaxed text-ash ${className}`.trim()}>
      Mind Weave VENT is an AI — not a person, and not a licensed therapist.
      Emotional support only, not medical advice. In crisis, call Nigeria{" "}
      <a href={`tel:${CRISIS_TEL}`} className="underline underline-offset-2">
        {CRISIS_LINES.nigeria}
      </a>{" "}
      or emergency{" "}
      <a href={`tel:${EMERGENCY_TEL}`} className="underline underline-offset-2">
        {CRISIS_LINES.emergency}
      </a>
      .
    </p>
  );
}
