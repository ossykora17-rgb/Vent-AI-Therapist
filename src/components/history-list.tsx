"use client";

import * as React from "react";
import Link from "next/link";
import { anonId } from "@/lib/anon";
import { useToast } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface VentRow {
  id: string;
  user_message: string;
  ai_reply: string | null;
  mood_score: number | null;
  tension_before: number | null;
  tension_after: number | null;
  tactic_used: string | null;
  intent_type: string | null;
  real_world_tag: string | null;
  body_tapped: string | null;
  created_at: string;
}

export function HistoryList() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<VentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [persisted, setPersisted] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [minMood, setMinMood] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/vent?anonId=${encodeURIComponent(anonId())}`);
        const data = await res.json();
        if (cancelled) return;
        setRows(data.vents ?? []);
        setPersisted(data.persisted !== false);
      } catch {
        if (!cancelled) setPersisted(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filtering is client-side: the whole history is at most 100 rows.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (minMood > 1 && (r.mood_score ?? 0) < minMood) return false;
      if (!q) return true;
      return (
        r.user_message.toLowerCase().includes(q) ||
        (r.ai_reply ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, minMood]);

  async function remove(id: string) {
    setRows((r) => r.filter((row) => row.id !== id));
    try {
      await fetch(`/api/vent?anonId=${encodeURIComponent(anonId())}&id=${id}`, {
        method: "DELETE",
      });
      toast("Deleted.", "success");
    } catch {
      toast("Couldn't delete that.", "error");
    }
  }

  async function clearAll() {
    if (!window.confirm("Delete every vent permanently? This cannot be undone.")) return;
    setRows([]);
    try {
      await fetch(`/api/vent?anonId=${encodeURIComponent(anonId())}`, { method: "DELETE" });
      localStorage.removeItem("mw-anon-id");
      toast("All cleared. Fresh start.", "success");
    } catch {
      toast("Couldn't clear it all.", "error");
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mind-weave-vents-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/80 backdrop-blur-glass">
        <div className="mx-auto flex h-16 max-w-[640px] items-center justify-between gap-3 px-4">
          <div>
            <p className="label-mono leading-none">Mind Weave</p>
            <h1 className="font-display text-2xl font-bold leading-tight tracking-[-0.02em]">
              History
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/chat"
              className="flex h-11 items-center rounded-full border border-line/10 px-4 text-sm"
            >
              Vent
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[640px] flex-1 px-4 py-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="history-search" className="sr-only">
            Search your vents
          </label>
          <input
            id="history-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your words…"
            className="min-h-[48px] flex-1 rounded-card border border-line/15 bg-card/60 px-4 placeholder:text-ash"
          />
          <label className="flex min-h-[48px] items-center gap-2 rounded-card border border-line/15 px-3">
            <span className="label-mono shrink-0">Mood ≥ {minMood}</span>
            <input
              type="range"
              min={1}
              max={10}
              value={minMood}
              onChange={(e) => setMinMood(Number(e.target.value))}
              aria-label="Minimum mood score"
              className="w-24"
            />
          </label>
        </div>

        {loading && (
          <div className="mt-4 space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass h-24 animate-pulse p-4" />
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="glass mt-4 p-6 text-center">
            <p className="font-display text-xl font-bold">No vents yet</p>
            <p className="mt-2 text-sm text-ash">Come in. Say small. Hear plenty.</p>
            {!persisted && (
              <p className="mt-3 text-[13px] text-ash">
                Storage isn&apos;t connected on this deployment, so nothing is
                being kept between visits yet.
              </p>
            )}
            <Link
              href="/chat"
              className="mt-5 inline-flex min-h-[48px] items-center rounded-card bg-gold px-6 text-sm font-semibold text-ink"
            >
              Come in
            </Link>
          </div>
        )}

        {!loading && rows.length > 0 && filtered.length === 0 && (
          <p className="glass mt-4 p-5 text-center text-sm text-ash">
            Nothing matches that. Loosen the filter.
          </p>
        )}

        <ol className="mt-4 space-y-3">
          {filtered.map((r) => {
            const open = openId === r.id;
            const drop =
              r.tension_before != null && r.tension_after != null
                ? r.tension_before - r.tension_after
                : null;

            return (
              <li key={r.id}>
                <div className="glass p-4">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.id)}
                    aria-expanded={open}
                    className="w-full min-h-[44px] text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="label-mono">
                        {new Date(r.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {r.mood_score != null && (
                        <Tag>mood {r.mood_score}/10</Tag>
                      )}
                      {drop != null && drop > 0 && <Tag>−{drop} tension</Tag>}
                      {r.real_world_tag && <Tag>{r.real_world_tag}</Tag>}
                      {r.body_tapped && <Tag>{r.body_tapped}</Tag>}
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-[15px] leading-[1.6]",
                        !open && "line-clamp-2",
                      )}
                    >
                      {r.user_message}
                    </p>
                  </button>

                  {open && (
                    <div className="mt-3 border-t border-line/10 pt-3">
                      <p className="label-mono mb-2">Vent</p>
                      <p className="text-[15px] leading-[1.6]">
                        {r.ai_reply ?? "—"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.tactic_used && <Tag>{r.tactic_used}</Tag>}
                        {r.intent_type && <Tag>{r.intent_type}</Tag>}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(r.ai_reply ?? "");
                            toast("Copied.", "success");
                          }}
                          className="min-h-[44px] flex-1 rounded-card border border-line/15 text-sm"
                        >
                          Copy reply
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(r.id)}
                          className="min-h-[44px] rounded-card border border-line/15 px-4 text-sm text-ash"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {rows.length > 0 && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={exportJson}
              className="min-h-[48px] flex-1 rounded-card border border-line/15 text-sm"
            >
              Export my data (JSON)
            </button>
            <button
              type="button"
              onClick={() => void clearAll()}
              className="min-h-[48px] flex-1 rounded-card border border-line/15 text-sm text-ash"
            >
              Delete everything
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line/15 px-2 py-[2px] font-mono text-[11px] uppercase tracking-[0.08em] text-ash">
      {children}
    </span>
  );
}
