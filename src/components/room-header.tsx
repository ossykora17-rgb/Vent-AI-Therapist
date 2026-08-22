"use client";

import { RoomNav } from "@/components/room-nav";

/**
 * One masthead, every room that has doors.
 *
 * Three surfaces each rolled their own: the chat had a wordmark, a title and
 * three text links; History had a wordmark, a title, a pill back to the chat
 * and a theme toggle; Memory had a third arrangement again. Four rooms in a
 * house, and each one built its own front door.
 *
 * Two rows, and both are load-bearing at 360px. Put on one row the wordmark
 * and four doors do not fit — the version that shipped for ten minutes wrapped
 * "MIND WEAVE" across two lines and drew it through the nav underneath. Two
 * short rows is what a person would have done and it is what fits.
 *
 * NO PAGE TITLE, AND THAT IS THE POINT
 *
 * There was an `<h1>` here saying "Memory" directly above a nav with MEMORY
 * underlined in gold — the same word, twice, four pixels apart. The nav marks
 * where you are; a title repeating it is the duplicate readout this product
 * has now shipped four times, and the fix each time is the same: say it once,
 * in the place that is already saying it.
 *
 * What the page is *about* still gets a heading — "What is kept", "Come in.
 * Say small. Hear plenty." — in the content, where a heading belongs. That is
 * a sentence to a person. This is a signpost.
 */
export function RoomHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/95 backdrop-blur-glass">
      <div className="mx-auto max-w-[640px] px-4 pb-2 pt-3">
        {/* nowrap: at 360px this wrapped and shoved the doors down a line. */}
        <p className="label-mono whitespace-nowrap leading-none">Mind Weave</p>
        <RoomNav className="-ml-0.5 mt-0.5" />
      </div>
    </header>
  );
}
