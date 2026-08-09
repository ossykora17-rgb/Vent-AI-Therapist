"use client";

import * as React from "react";
import { anonId } from "@/lib/anon";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function FeedbackFab() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState(0);
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function submit() {
    if (!rating) return;
    setSending(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: anonId(), rating, message: message.trim() || undefined }),
      });
      toast("Thank you. Na so we dey improve.", "success");
      setOpen(false);
      setRating(0);
      setMessage("");
    } catch {
      toast("Couldn't send that. Try again later.", "error");
    } finally {
      setSending(false);
    }
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const data = {
      title: "Mind Weave VENT",
      text: "Somewhere to carve your truth.",
      url,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied.", "success");
      }
    } catch {
      // User dismissed the share sheet — not an error.
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          // Anchored to what the composer actually measures, not to 232px.
          //
          // That number was a guess at the footer's height, and at 360px the
          // footer is taller than the guess — so this button sat on top of the
          // CHEST control, over the thing somebody taps to say where it hurts.
          // Screenshots at 360 were the only way to see it; the code reads
          // fine.
          //
          // `--composer-h` is set by the footer from its own bounding box, so
          // this cannot drift again when the disclaimer rewraps.
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+var(--composer-h,232px)+12px)] right-3 z-40 min-h-[44px] rounded-full border border-line/15 bg-card/80 px-4 text-xs font-medium shadow-glass-sm backdrop-blur-glass"
        >
          How we dey do?
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Feedback"
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+var(--composer-h,232px)+12px)] z-40 mx-auto max-w-[380px]"
        >
          <div className="glass p-4">
            <p className="label-mono mb-3">How we dey do?</p>

            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} out of 5`}
                  aria-pressed={rating === n}
                  className={cn(
                    "h-11 flex-1 rounded-card border text-sm font-semibold transition-colors duration-300",
                    rating >= n ? "border-gold bg-gold text-on-gold" : "border-line/15",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>

            <label htmlFor="feedback-msg" className="sr-only">
              Anything else
            </label>
            <textarea
              id="feedback-msg"
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything else? (optional)"
              className="mt-3 w-full resize-none rounded-card border border-line/15 bg-card/60 px-3 py-2 text-sm placeholder:text-ash"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!rating || sending}
                className="min-h-[44px] flex-1 rounded-card bg-gold px-4 text-sm font-semibold text-on-gold disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send"}
              </button>
              <button
                type="button"
                onClick={() => void share()}
                className="min-h-[44px] rounded-card border border-line/15 px-4 text-sm"
              >
                Share
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close feedback"
                className="min-h-[44px] w-11 rounded-card border border-line/15 text-sm"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
