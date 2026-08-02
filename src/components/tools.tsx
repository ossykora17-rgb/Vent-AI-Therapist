"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Real-world tags that earn a journalling prompt. */
export const JOURNAL_PROMPTS: Record<string, string> = {
  economy:
    "Fuel up three times this month. Wetin one thing you fit control today — even down to ten naira?",
  japa: "Japa fear. Write three things you go miss, three things you go gain. Written, not felt.",
  ai_job: "AI go take job. List three things AI no fit do wey you dey do. Three, not one.",
  social: "Instagram dey lie. Which one account you go mute today?",
  family: "Firstborn pressure. One boundary, ten words. Who need to hear am?",
  lonely: "Step outside 30 seconds — opposite action. Then write what changed, if anything.",
  traffic: "Traffic no define you. Wetin one thing you fit do for danfo tomorrow?",
  climate: "Heat. Cold water on face, ten seconds. Then: wetin the heat dey make worse?",
  health: "Name the fear exactly — 'I'm scared of ___'. Then the one call you dey avoid.",
};

/** Tags where slowing the breath is the right first move. */
const BREATH_TAGS = new Set(["traffic", "climate", "health", "lonely"]);

export function shouldOfferBreathing(
  tag: string | null,
  pressure: number,
  body: string | null,
): boolean {
  return pressure > 65 || body !== null || (tag !== null && BREATH_TAGS.has(tag));
}

type Phase = "in" | "hold" | "out";

const PHASES: Array<[Phase, number, string]> = [
  ["in", 4000, "Breathe in"],
  ["hold", 2000, "Hold"],
  ["out", 6000, "Out, slow"],
];

/** 4 in, 2 hold, 6 out. Sixty seconds, then it stops on its own. */
export function Breathing({ onClose }: { onClose: () => void }) {
  const [phaseIndex, setPhaseIndex] = React.useState(0);
  const [remaining, setRemaining] = React.useState(60);

  React.useEffect(() => {
    const tick = window.setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearInterval(tick);
  }, []);

  React.useEffect(() => {
    if (remaining <= 0) onClose();
  }, [remaining, onClose]);

  React.useEffect(() => {
    const [, duration] = PHASES[phaseIndex];
    const next = window.setTimeout(
      () => setPhaseIndex((i) => (i + 1) % PHASES.length),
      duration,
    );
    return () => window.clearTimeout(next);
  }, [phaseIndex]);

  const [phase, duration, label] = PHASES[phaseIndex];

  return (
    <div className="glass mt-4 animate-slide-up p-5 text-center">
      <p className="label-mono mb-4">Breathing · {remaining}s left</p>

      <div className="flex h-40 items-center justify-center">
        <div
          aria-hidden="true"
          className="rounded-full border-2 border-gold bg-gold/10"
          style={{
            width: phase === "out" ? 72 : 136,
            height: phase === "out" ? 72 : 136,
            transitionProperty: "width, height",
            transitionDuration: `${duration}ms`,
            transitionTimingFunction: "ease-in-out",
          }}
        />
      </div>

      <p aria-live="polite" className="mt-2 text-[17px] font-semibold">
        {label}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 min-h-[44px] w-full text-sm text-ash underline underline-offset-4"
      >
        Done
      </button>
    </div>
  );
}

export function Journaling({
  tag,
  onSubmit,
  onClose,
}: {
  tag: string;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = React.useState("");
  const prompt = JOURNAL_PROMPTS[tag] ?? JOURNAL_PROMPTS.economy;

  return (
    <div className="glass mt-4 animate-slide-up p-4">
      <p className="label-mono mb-2">Journalling prompt</p>
      <p className="text-[15px] leading-[1.6]">{prompt}</p>

      <label htmlFor="journal-entry" className="sr-only">
        Your answer
      </label>
      <textarea
        id="journal-entry"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write it down…"
        className="mt-3 w-full resize-none rounded-card border border-line/15 bg-card/60 px-3 py-3 leading-[1.6] placeholder:text-ash"
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            if (text.trim()) onSubmit(text.trim());
          }}
          disabled={!text.trim()}
          className="min-h-[44px] flex-1 rounded-card bg-gold px-4 text-sm font-semibold text-ink disabled:opacity-40"
        >
          Save it
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-card border border-line/15 px-4 text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function ToolRow({
  showBreathing,
  tag,
  onBreathe,
  onJournal,
}: {
  showBreathing: boolean;
  tag: string | null;
  onBreathe: () => void;
  onJournal: () => void;
}) {
  if (!showBreathing && !tag) return null;

  return (
    <div className={cn("mt-3 flex flex-wrap gap-2")}>
      {showBreathing && (
        <button
          type="button"
          onClick={onBreathe}
          className="min-h-[44px] rounded-full border border-gold/50 px-4 text-sm font-medium"
        >
          Breathing 4·2·6
        </button>
      )}
      {tag && JOURNAL_PROMPTS[tag] && (
        <button
          type="button"
          onClick={onJournal}
          className="min-h-[44px] rounded-full border border-gold/50 px-4 text-sm font-medium"
        >
          Journalling prompt
        </button>
      )}
    </div>
  );
}
