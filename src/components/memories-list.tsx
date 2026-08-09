"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/theme-toggle";

interface MemoryRow {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

/**
 * What is held about you, and the door out.
 *
 * Long-term memory without a delete button is not a feature. If this product
 * keeps a handful of durable facts so it does not ask the same question every
 * month, the person those facts belong to has to be able to read them and take
 * any of them back — in one place, without asking anyone.
 *
 * This is deliberately plain. It is a list and a way to remove things, not a
 * dashboard. Nobody comes here to be impressed.
 */
export function MemoriesList() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<MemoryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [signedIn, setSignedIn] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/memories");
        if (res.status === 401) {
          if (!cancelled) setSignedIn(false);
          return;
        }
        const data = await res.json();
        if (!cancelled) setRows(data.memories ?? []);
      } catch {
        if (!cancelled) toast("Could not reach your memories just now.", "info");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function forget(id: string, key: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/memories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      // Removed from the list only after the server confirms. Showing it gone
      // and leaving it in the database would be the same lie as the reply that
      // said it had saved something it had not.
      setRows((r) => r.filter((m) => m.id !== id));
      toast(`Forgotten: ${key}`, "success");
    } catch {
      toast("That did not delete. Nothing was removed.", "info");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/95 backdrop-blur-glass">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div>
            <p className="label-mono">Mind Weave</p>
            <h1 className="font-display text-2xl">Memory</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/chat"
              className="rounded-full border border-line/15 px-4 py-2 text-sm hover:border-gold/50"
            >
              Back
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <p className="reply mb-6 text-ash">
          These are the few things kept between sessions, so you are not asked
          the same question every month. Nothing here is a transcript. Remove
          anything you want gone — it goes immediately and does not come back.
        </p>

        {/* Page states are not the room speaking, so they do not get the
            room's plate. Same correction as the chat and lobby empty states. */}
        {!signedIn && (
          <div className="mt-2">
            <p className="mb-3 max-w-[46ch] leading-[1.7]">
              Memory belongs to an account, so it needs you signed in.
            </p>
            <Link href="/login" className="underline underline-offset-4">
              Sign in
            </Link>
          </div>
        )}

        {signedIn && loading && <p className="label-mono">Reading…</p>}

        {signedIn && !loading && rows.length === 0 && (
          <div className="mt-2">
            <p className="max-w-[46ch] leading-[1.7]">
              Nothing is being kept yet. That is not a gap — it fills only when
              something is worth carrying.
            </p>
          </div>
        )}

        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="glass settle p-5">
              {/* Not `.reply`. That class is what VENT *says* — 62ch, slow
                  leading, built to be sat with. A memory is a stored fact
                  about you, and dressing a record in the voice of the room
                  makes the app look like it is talking when it is only
                  holding. */}
              <p className="label-mono mb-2">{m.key}</p>
              <p className="mb-4 text-[15px] leading-[1.6]">{m.value}</p>
              <div className="flex items-center justify-between gap-4">
                <span className="label-mono">
                  {new Date(m.updated_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => forget(m.id, m.key)}
                  disabled={busy === m.id}
                  className="rounded-full border border-line/15 px-4 py-2 text-sm hover:border-gold/50 disabled:opacity-50"
                >
                  {busy === m.id ? "Forgetting…" : "Forget this"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
