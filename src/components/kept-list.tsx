"use client";

import * as React from "react";
import Link from "next/link";
import { anonId } from "@/lib/anon";
import { useToast } from "@/components/ui/toast";
import { RoomHeader } from "@/components/room-header";

interface Held {
  text: string;
  at: string;
}

/**
 * What this product actually keeps about you.
 *
 * The Memory page used to read `/api/memories`, which is the vector-memory
 * surface and requires a signed-in Supabase user. Nothing in this product
 * signs anybody in — the whole thing runs on an anonymous id made on the
 * device, on purpose, because the premise is saying a thing you cannot say
 * out loud and an account is a name attached to it.
 *
 * So "Memory" sat in the navigation of every screen, on every visit, and
 * opened onto an endpoint that answered 401 to every person who has ever used
 * this app. Then it offered them a link to log in, for a feature nothing else
 * touches. A door that opens onto nothing, in the product whose own file says
 * "the room never offers a door that opens onto 501".
 *
 * Meanwhile the memory that does exist had no page at all. The carve is
 * written at the end of every real session and only the model had ever read
 * it; the held notes are the one thing here somebody wrote on purpose, while
 * they were alright, to be read back later. Both are keyed to the anonymous
 * id. Both were invisible.
 *
 * This is that, and only that: the two things that are true.
 */
export function KeptList() {
  const { toast } = useToast();
  const [carve, setCarve] = React.useState<string | null>(null);
  const [held, setHeld] = React.useState<Held[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reachable, setReachable] = React.useState(true);

  React.useEffect(() => {
    let live = true;
    const id = encodeURIComponent(anonId());
    Promise.all([
      fetch(`/api/carve?anonId=${id}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/held?anonId=${id}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([c, h]) => {
        if (!live) return;
        // Absent is the ordinary answer here and it is not a failure. A first
        // visit, a session too short to carve, a wipe — all of them are empty,
        // and empty has its own sentence below rather than an error.
        if (c === null && h === null) setReachable(false);
        if (typeof c?.carve === "string" && c.carve.trim()) setCarve(c.carve.trim());
        if (Array.isArray(h?.held)) setHeld(h.held as Held[]);
      })
      .catch(() => {
        if (live) setReachable(false);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  /**
   * Make it forget, and say so only once it has.
   *
   * The same request the chat's "Forget this" makes, reading the same field
   * of the same answer. Two screens, one deletion — a second implementation
   * of "is it gone" is a second answer to the only question that matters on
   * this page.
   */
  async function forget() {
    try {
      const res = await fetch(
        `/api/vent?anonId=${encodeURIComponent(anonId())}&carve=1`,
        { method: "DELETE" },
      );
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (data?.deleted === "carve") {
        setCarve(null);
        toast("Forgotten.", "success");
      } else {
        toast("Could not clear that. It is still here.", "info");
      }
    } catch {
      toast("Could not clear that. It is still here.", "info");
    }
  }

  const empty = !loading && !carve && held.length === 0;

  return (
    <>
    <RoomHeader />

    <main id="main" className="mx-auto w-full max-w-[640px] flex-1 px-4 pb-16 pt-6">
      <h2 className="font-display text-heading font-bold tracking-[-0.01em]">
        What is kept
      </h2>
      <p className="mt-3 max-w-[52ch] text-body leading-[1.7] text-ash">
        Nothing here has your name on it. It is tied to this device, and you can
        take any of it back.
      </p>

      {loading && <p className="mt-8 text-body text-ash">Looking…</p>}

      {!loading && !reachable && (
        <p className="mt-8 max-w-[52ch] text-body leading-[1.7] text-ash">
          Could not reach what is kept just now. Nothing has been lost — try
          again in a moment.
        </p>
      )}

      {empty && reachable && (
        <div className="mt-10">
          <p className="max-w-[46ch] text-body leading-[1.7] text-ash">
            Nothing is kept yet. A session that goes somewhere leaves one line
            behind; the rest is up to you.
          </p>
          <Link
            href="/chat"
            className="label-mono mt-5 inline-flex min-h-[44px] items-center text-ink underline decoration-gold underline-offset-[6px]"
          >
            Open a session
          </Link>
        </div>
      )}

      {/*
        The carve, behind the same tap it has in the room.

        Eight words in their own language and never softened — printing it on
        arrival means somebody who opened this page to check what is kept
        reads their worst week before deciding to look. The claim proves the
        memory; the contents belong to them.
      */}
      {carve && (
        <section className="presence arrive mt-8 p-6 sm:p-8">
          <p className="nameplate mb-4">The line it keeps</p>
          <p className="reply max-w-[42ch]">{carve}</p>
          <button
            type="button"
            onClick={() => void forget()}
            className="focusable mt-5 min-h-[44px] text-body text-ash underline underline-offset-4"
          >
            Forget this
          </button>
        </section>
      )}

      {/*
        And what held, which is the other half and the opposite half.

        The carve is the wound, written by the machine. These are sentences a
        person wrote on purpose, while they were alright, about something that
        carried them — the only thing in this product safe to read back at
        somebody later, because they chose it.
      */}
      {held.length > 0 && (
        <section className="mt-10">
          <p className="label-mono">What held</p>
          <ol className="mt-4 space-y-5">
            {held.map((h) => (
              <li key={`${h.at}-${h.text.slice(0, 12)}`} className="border-l border-gold/30 pl-4">
                <p className="said max-w-[46ch]">{h.text}</p>
                <p className="label-mono mt-1.5">
                  {new Date(h.at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
    </>
  );
}
