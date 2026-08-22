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
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: anonId(), rating, message: message.trim() || undefined }),
      });

      /*
        The response was thrown away and the thanks was unconditional. The
        feedback route rate-limits at five an hour and answers 429 — a limit
        this project's own live check verifies — so the sixth rating in an
        hour was dropped while the person was thanked for it. Ratings are the
        input to the preference pipeline; silently losing them corrupts the
        one place the product learns what is losing.
      */
      if (!res.ok) {
        toast(
          res.status === 429
            ? "That's a few in a short time — try again in a bit."
            : "Couldn't send that. Try again later.",
          "info",
        );
        return;
      }

      /*
        And the other half of the same lesson, which the fix above walked
        straight past.

        `res.ok` was made load-bearing when the 429 was found, and 429 is only
        one of the two ways a rating goes nowhere. The route answers **200**
        with `{persisted: false, storage: "none"}` when `getStore()` returns
        null — production with no Supabase env vars, which is what a fresh
        Vercel project is and what real people were actually using. So the
        rating was dropped on the floor and the person was thanked for it,
        through a branch that had just been written to stop exactly that.

        The same sentence as `I've saved it, word for word`, one surface over,
        and worse in one respect: ratings are the input to the preference
        pipeline. A thank-you over a dropped rating does not merely mislead
        one person — it makes the product's only measurement of what is losing
        quietly incomplete, in precisely the deployment shape nothing here
        runs in.
      */
      const data = await res.json().catch(() => null);
      if (data?.persisted !== true) {
        toast("Heard — but nothing is being kept beyond this visit yet.", "info");
        setOpen(false);
        setRating(0);
        setMessage("");
        return;
      }

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
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+var(--composer-h,232px)+12px)] right-3 z-40 min-h-[44px] rounded-full border border-line/15 bg-card/80 px-4 text-label font-medium shadow-glass-sm backdrop-blur-glass"
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
                    "h-11 flex-1 rounded-card border text-body font-semibold transition-colors duration-300",
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
              className="mt-3 w-full resize-none rounded-card border border-line/15 bg-card/60 px-3 py-2 text-body placeholder:text-ash"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!rating || sending}
                className="min-h-[44px] flex-1 rounded-card bg-gold px-4 text-body font-semibold text-on-gold disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send"}
              </button>
              <button
                type="button"
                onClick={() => void share()}
                className="min-h-[44px] rounded-card border border-line/15 px-4 text-body"
              >
                Share
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close feedback"
                className="min-h-[44px] w-11 rounded-card border border-line/15 text-body"
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
