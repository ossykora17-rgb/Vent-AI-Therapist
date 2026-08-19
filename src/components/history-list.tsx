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
  const [testimony, setTestimony] = React.useState<string | null>(null);
  const [held, setHeld] = React.useState<Array<{ text: string; at: string }>>([]);
  /* The Breaking Room's answers, with the question each one belongs to. */
  const [answers, setAnswers] = React.useState<
    Array<{ q: string; a: string; at: string; text: string | null }>
  >([]);
  const [pattern, setPattern] = React.useState<{
    sentence: string;
    dropHere: number | null;
    dropElsewhere: number | null;
    firstWords: string | null;
    latestWords: string | null;
  } | null>(null);
  /*
    Set together or not at all. The route only sends a sentence when it also
    has somewhere verified to point, so these two can never disagree — and
    the card below reads the sentence, never the count, so it cannot render
    a diagnosis with nothing under it.
  */
  const [handoff, setHandoff] = React.useState<{
    sentence: string;
    referrals: Array<{ org: string; what: string; tel?: string; label?: string; url?: string; hours?: string; free: boolean }>;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        /*
          Three side reads, beside the history rather than before it.

          Counted, not generated — see lib/vent/pattern. None of them blocks
          the list, and each fails to silence on its own: a card with nothing
          in it is the correct rendering of a question nobody has answered.

          Separate statements, and they were not.

          The first two ended in a comma, which made all three one expression
          joined by the comma operator — legal, evaluated in order, and doing
          the right thing by accident. Adding a fourth in the same style would
          go on working right up until somebody put a `return` or an `await`
          in the middle of it. Lint has been calling it "an expression" for as
          long as it has been there.
        */
        void fetch(`/api/held?anonId=${encodeURIComponent(anonId())}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!cancelled && Array.isArray(d?.held)) setHeld(d.held);
          })
          .catch(() => {});

        void fetch(`/api/breaking?anonId=${encodeURIComponent(anonId())}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!cancelled && Array.isArray(d?.answers)) setAnswers(d.answers);
          })
          .catch(() => {});

        void fetch(`/api/pattern?anonId=${encodeURIComponent(anonId())}`)
          .then((r) => r.json())
          .then((d) => {
            if (!cancelled && d.testimonySentence) {
              setTestimony(d.testimonySentence as string);
            }
            if (!cancelled && d.pattern && d.sentence) {
              setPattern({ sentence: d.sentence, ...d.pattern });
            }
            if (!cancelled && d.handoffSentence && d.referrals?.length) {
              setHandoff({ sentence: d.handoffSentence, referrals: d.referrals });
            }
          })
          .catch(() => {});

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

  /*
    Deletion is the one promise this product cannot be loose about.

    This said "Deleted." on the strength of having asked. It did not check
    `res.ok`, so a 500 or a dropped connection reported success; and it never
    read the body, which is the sharper half — the route answers 200 with
    `deleted: 0` when there is no store and when the anon id is unknown. So in
    the shape with no Supabase configured, which is what a fresh Vercel
    project is and what real people were using, pressing delete removed the
    row from the screen, said "Deleted.", deleted nothing, and handed it all
    back on the next refresh.

    The route was written carefully for this. Its own comment says every
    caller should report from what it returns rather than from whether a store
    was configured. This caller was the one that did not — and twelve lines
    away in vent-chat.tsx the same fix already exists, with a comment saying
    "Kept" is never said on the strength of having asked.

    The row is now put back when the delete did not happen, because a screen
    that hides what the database still holds is the lie that matters here.
  */
  async function remove(id: string) {
    const removed = rows.find((row) => row.id === id);
    setRows((r) => r.filter((row) => row.id !== id));
    const restore = () => {
      if (removed) setRows((r) => (r.some((x) => x.id === id) ? r : [removed, ...r]));
    };

    try {
      const res = await fetch(`/api/vent?anonId=${encodeURIComponent(anonId())}&id=${id}`, {
        method: "DELETE",
      });
      const body = res.ok ? await res.json().catch(() => null) : null;

      if (!res.ok || !body) {
        restore();
        toast("Couldn't delete that. It is still here.", "error");
        return;
      }
      /*
        `deleted: 0` is the route being honest that it found nothing to
        delete — no store, or an anon id it has never seen. The comment above
        said exactly that and the code below it then reported the second case
        as a failure anyway, which is the sharpest version of this bug in the
        repo: the diagnosis was written down and the branch was still wrong.

        And here it is worse than a wrong sentence. `restore()` puts the row
        back on the screen, so somebody watches their vent reappear while
        being told it is still here — a product demonstrating, apparently
        physically, that it kept what they asked it to destroy. It had not.

        Nothing there means nothing to put back. The row stays gone, and the
        sentence says which of the two happened.
      */
      if (!body.deleted) {
        const nothingToDelete = body.persisted === false || body.had === false;
        if (!nothingToDelete) restore();
        toast(
          nothingToDelete
            ? "Nothing was stored, so there was nothing to delete."
            : "Couldn't delete that. It is still here.",
          "info",
        );
        return;
      }
      toast("Deleted.", "success");
    } catch {
      restore();
      toast("Couldn't delete that. It is still here.", "error");
    }
  }

  async function clearAll() {
    if (!window.confirm("Delete every vent permanently? This cannot be undone.")) return;
    /*
      Everything read off that person, not just the list.

      This cleared `rows` alone, and the four cards above it — what held, what
      they answered, the pattern, the record — kept rendering their contents
      over a toast that said "All cleared. Fresh start." The rows really were
      gone: `deleteAll` drops the `vent_users` row and every jsonb column on
      it goes with the person, which is the whole argument for keeping them
      there. But the screen went on showing sentences it had already been told
      to forget, until somebody reloaded.

      "Delete everything" is a promise this product makes on its front page,
      and a promise kept in the database and broken on the screen is the one a
      person actually experiences. The state goes with the request.
    */
    /*
      And the order matters more than the clearing did.

      This fired the request, never looked at the answer, and then removed
      the anon id — which is the only key that reaches that person's rows.
      So a wipe that failed left the data on the server *and* threw away the
      one handle that could ever delete it. Silently, under "All cleared.
      Fresh start."

      Destroying the key to data you did not delete is strictly worse than
      not deleting it. The id is dropped only once the server has said, in
      the body rather than in a status code, that there was something and it
      is gone.
    */
    const previous = { rows, held, answers, pattern, testimony, handoff };
    setRows([]);
    setHeld([]);
    setAnswers([]);
    setPattern(null);
    setTestimony(null);
    // The fifth card. The bug this whole block exists for was four cards
    // still rendering over a toast that said "All cleared."
    setHandoff(null);

    const putBack = () => {
      setRows(previous.rows);
      setHeld(previous.held);
      setAnswers(previous.answers);
      setPattern(previous.pattern);
      setTestimony(previous.testimony);
      setHandoff(previous.handoff);
    };

    try {
      const res = await fetch(`/api/vent?anonId=${encodeURIComponent(anonId())}`, {
        method: "DELETE",
      });
      const body = res.ok ? await res.json().catch(() => null) : null;

      if (!res.ok || !body) {
        putBack();
        toast("Couldn't clear it. Everything is still here.", "error");
        return;
      }
      /*
        An absent record is not a failed deletion.

        `deleted` is a count, and a count of zero has two completely different
        causes: the delete did not work, or there was nothing there. This read
        both as the first and said *"Couldn't clear it. Everything is still
        here."* — to somebody for whom nothing is here at all.

        It is reachable: wipe from one tab, come back to this one, tap Clear
        all. The id is gone, the row is gone, the route answers `deleted: 0`,
        and the screen tells them their history survived. In a product whose
        entire argument is that you can take your words back, "we still have
        it" is the most alarming sentence available — and this one is false.

        Every other face of this bug in CLAUDE.md is a promise made without its
        answer. This is the mirror: a denial made without its answer. Same
        defect, and this direction is worse, because somebody acts on it. They
        go looking for a way to delete a thing that is already deleted.

        So the route says whether there was anything, and this reads it. Two
        causes, two sentences, and neither of them guesses.
      */
      if (!body.deleted) {
        putBack();
        const nothingToClear = body.persisted === false || body.had === false;
        toast(
          nothingToClear
            ? "Nothing was stored, so there is nothing to clear."
            : "Couldn't clear it. Everything is still here.",
          "info",
        );
        return;
      }

      // A full wipe makes them a new person here: drop the id AND the
      // onboarding flag, so the chair question seeds their tension again
      // rather than starting the next session at a meaningless default.
      // Only now — before the answer, this line was destroying the key.
      localStorage.removeItem("mw-anon-id");
      localStorage.removeItem("mw-onboarded");
      toast("All cleared. Fresh start.", "success");
    } catch {
      putBack();
      toast("Couldn't clear it. Everything is still here.", "error");
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
      <header className="sticky top-0 z-30 border-b border-line/10 bg-paper/95 backdrop-blur-glass">
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
        {/*
          Whether it has been working, in the numbers they gave it themselves.

          Every anchored sitting stores a tension the person set on the slider
          on the way in and one derived from the mood they gave on the way out.
          That loop has fed the tactic selector since it shipped and was
          visible only to the machine — the one who supplied both numbers never
          saw what they added up to.

          The room's plate and the room's voice, because this is VENT speaking
          rather than a statistic panel. Silent below the floor, silent when
          the news is thin, and it never quotes anybody's worst sentence back
          at them. See `lib/vent/testimony`.
        */}
        {testimony && (
          <section className="presence arrive mb-5 p-6 sm:p-8">
            <p className="nameplate mb-4">What has actually happened</p>
            <p className="reply" data-numeric>
              {testimony}
            </p>
            {/* The count is the claim. Anything past it is the product taking
                credit for somebody else's week. */}
            <p className="mt-3 text-[15px] leading-[1.6] text-ash">
              You set both of those numbers. That is your own record, not a
              score we gave you.
            </p>
          </section>
        )}

        {/*
          What held, in their own words.

          The one thing in this product safe to quote back at somebody. A
          crisis sentence returned unannounced is a re-exposure — which is why
          `testimony.ts` counts rather than quotes, and why the carve is never
          shown to them at all. This is the inversion: they wrote it on
          purpose, while they were alright, knowing it would be kept. Handing
          it back on a bad Thursday is the whole point of having asked.

          No religion in either direction. Everybody has an answer to "what
          held" and nobody is being addressed in somebody else's language.
        */}
        {held.length > 0 && (
          <section className="glass mb-5 p-5 sm:p-6">
            <p className="label-mono mb-3">What held</p>
            <ul className="space-y-3">
              {held.map((h) => (
                <li key={h.at} className="border-l-2 border-gold/40 pl-4">
                  <p className="reply">{h.text}</p>
                  <p className="label-mono mt-1">
                    {new Date(h.at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          What they answered when the room asked something heavy.

          The reason the answers are stored at all. A question answered into a
          void is a question that was never worth asking — somebody wrote the
          hardest sentence of their week and it went nowhere, which is worse
          than never having been asked, because now they know the room was not
          listening.

          Safe to show back for exactly one reason, and it is the same reason
          "what held" is: they wrote it, on purpose, to a question they were
          asked and could decline. The carve is never shown to them because a
          model wrote it. `testimony.ts` counts instead of quoting because
          nobody chose to be quoted. This one they chose.

          The question comes down with the answer rather than being stored
          beside it — the wording is ours and may improve, and freezing an old
          draft into somebody's record would make an edit of ours look like an
          answer of theirs. A question we have since retired leaves `text`
          null, and their words still show, because hiding what somebody said
          behind a change we made to our own copy would be indefensible.
        */}
        {answers.length > 0 && (
          <section className="glass mb-5 p-5 sm:p-6">
            <p className="label-mono mb-3">What you answered</p>
            <ul className="space-y-5">
              {answers.map((entry) => (
                <li key={entry.q} className="border-l-2 border-gold/40 pl-4">
                  {entry.text && (
                    <p className="mb-1 text-[15px] leading-[1.6] text-ash">
                      {entry.text}
                    </p>
                  )}
                  <p className="reply">{entry.a}</p>
                  <p className="label-mono mt-1">
                    {new Date(entry.at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          The Pattern. Counted from their own rows, never generated — and only
          shown once there is enough to count, because a pattern claimed from
          four data points is a horoscope. Everyone else in this category draws
          a mood line, which answers a question nobody was asking.
        */}
        {/*
          When this is bigger than a vent.

          Rendered from `handoff.sentence` rather than from a count, because
          the route only sends a sentence when it also has somewhere verified
          to point. So this card cannot appear over an empty list — naming
          somebody's stuckness and then offering nothing is the cruellest
          version of this feature, and it is unreachable by construction.

          Deliberately not styled as an alarm. It is not a warning and it is
          not a diagnosis; it is a count they gave us, read back, next to
          people who do this properly and do not charge.
        */}
        {handoff && (
          <section className="glass settle mb-5 border-line/20 p-5 sm:p-6">
            <p className="label-mono mb-3">Something to consider</p>
            <p className="reply">{handoff.sentence}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {handoff.referrals.map((r) => (
                <li key={r.org} className="border-t border-line/10 pt-3">
                  <p className="text-[15px] font-semibold">{r.org}</p>
                  <p className="mt-1 text-[14px] leading-[1.55] text-ash">{r.what}</p>
                  <p className="mt-1 text-[13px] text-ash">
                    {r.tel && (
                      <a href={`tel:${r.tel}`} className="underline underline-offset-2">
                        {r.label ?? r.tel}
                      </a>
                    )}
                    {r.url && !r.tel && (
                      <a href={r.url} className="underline underline-offset-2" rel="noreferrer">
                        {r.label ?? r.url}
                      </a>
                    )}
                    {r.hours && <span> · {r.hours}</span>}
                    {r.free && <span> · free</span>}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pattern && (
          <section className="glass settle mb-5 border-gold/40 p-5 sm:p-6">
            <p className="label-mono mb-3">What keeps coming back</p>
            <p className="reply" data-numeric>
              {pattern.sentence}
            </p>

            {pattern.dropHere !== null && pattern.dropElsewhere !== null && (
              <p className="reply mt-3 text-ash" data-numeric>
                {pattern.dropHere < pattern.dropElsewhere
                  ? `It shifts less than everything else you bring here — ${pattern.dropHere} points against ${pattern.dropElsewhere}.`
                  : `It shifts about as much as everything else — ${pattern.dropHere} points against ${pattern.dropElsewhere}.`}
              </p>
            )}

            {pattern.firstWords && pattern.latestWords && (
              <dl className="mt-4 space-y-2 border-l-2 border-line/15 pl-3">
                <div>
                  <dt className="label-mono">First</dt>
                  <dd className="text-[15px] leading-[1.6] text-ash">{pattern.firstWords}</dd>
                </div>
                <div>
                  <dt className="label-mono">Latest</dt>
                  <dd className="text-[15px] leading-[1.6] text-ash">{pattern.latestWords}</dd>
                </div>
              </dl>
            )}

            {/* Their words, their meaning. Naming what somebody's life is about
                is the one thing this product will not do for them. */}
            <p className="mt-4 text-[15px] leading-[1.6] text-ash">
              That is the count, not the meaning. The meaning is yours.
            </p>
          </section>
        )}

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
              className="mt-5 inline-flex min-h-[48px] items-center rounded-card bg-gold px-6 text-sm font-semibold text-on-gold"
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

        {/*
          A chronicle, not a table.

          This was rows of identical glass cards with a mono timestamp set at
          the same weight as the sentence under it — the heaviest things a
          person has ever typed, rendered as search results. And the two
          biggest controls on the page were "Export my data (JSON)" and
          "Delete everything": admin, sitting where the content should be.

          The thread runs down it now, the same spine as the session. In the
          chat it means one sitting; here it means all of them, which is the
          truer reading of the same line. Entries hang off it with no plate of
          their own, so what you see going down the page is your own words,
          in order, on a lit thread.
        */}
        <ol className="thread mt-5 space-y-7">
          {filtered.map((r) => {
            const open = openId === r.id;
            const drop =
              r.tension_before != null && r.tension_after != null
                ? r.tension_before - r.tension_after
                : null;

            return (
              <li key={r.id} className="settle pl-5">
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.id)}
                    aria-expanded={open}
                    className="focusable w-full min-h-[44px] rounded-card text-left"
                  >
                    {/*
                      The date is where you are, not what you came for — but
                      it is demoted by size and order, never by opacity.

                      The first version faded this row to 70%, which took the
                      timestamp to 2.64:1 and the tags with it. That is the
                      same rule the visitor's words in the chat are held to,
                      broken in the same file that states it: recede by scale
                      and position, never by legibility.
                    */}
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
                    <p className={cn("said mt-2", !open && "line-clamp-2")}>
                      {r.user_message}
                    </p>
                  </button>

                  {/* The reply, set the way they first read it.
                      This used plain 15px/1.6 while the live surface uses
                      .reply — longer leading, a 62ch measure, pretty wrapping.
                      So a sentence that landed one way in the room came back
                      looking like a log entry, and the gold spine that means
                      "this is the room speaking" everywhere else was missing.
                      Reading your own session back should look like the
                      session. */}
                  {open && (
                    <div className="mt-4">
                      <div className="presence p-5 sm:p-6">
                        <p className="nameplate mb-3">Vent</p>
                        <p className="reply whitespace-pre-wrap">
                          {r.ai_reply ?? "—"}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.tactic_used && <Tag>{r.tactic_used}</Tag>}
                        {r.intent_type && <Tag>{r.intent_type}</Tag>}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          /*
                            `void` plus an unconditional toast is the same
                            bug one size down. writeText rejects on a denied
                            permission, an unfocused document, or an insecure
                            context — and "Copied." was said either way, so
                            somebody pastes nothing into a message they meant
                            to send to a person.
                          */
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(r.ai_reply ?? "");
                              toast("Copied.", "success");
                            } catch {
                              toast("Couldn't copy — long-press to select it.", "info");
                            }
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
          /*
            Demoted on purpose.

            These were two full-width bordered buttons directly under the last
            entry — the largest, most deliberate-looking controls on a page
            whose subject is what somebody has been carrying. Nobody arrives
            here to export JSON. Both are still one tap and still meet the
            44px floor; they have simply stopped competing with the words.
          */
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line/10 pt-5">
            <button
              type="button"
              onClick={exportJson}
              className="focusable min-h-[44px] rounded-card text-[13px] text-ash underline underline-offset-4"
            >
              Export my data
            </button>
            <button
              type="button"
              onClick={() => void clearAll()}
              className="focusable min-h-[44px] rounded-card text-[13px] text-ash underline underline-offset-4"
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
