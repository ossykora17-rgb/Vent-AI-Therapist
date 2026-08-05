import type { VentRow } from "@/lib/store";

/**
 * The thing that keeps bringing somebody back, counted.
 *
 * Every other app in this category draws a mood line. A mood line tells you
 * that Tuesday was worse than Monday, which you already knew on Tuesday. It
 * answers a question nobody was asking.
 *
 * The question people actually arrive with — usually without words for it —
 * is *"is this the same thing again, and is it moving?"* `CLAUDE.md` already
 * names "it's the same thing every week" as the most valuable sentence in the
 * corpus. This is that sentence, computed rather than waited for.
 *
 * Nothing here is generated and nothing is inferred. It counts rows the person
 * wrote and subtracts two numbers they gave. If there is not enough to count,
 * it returns null and the surface says nothing — the same rule the outside
 * world follows. A pattern claimed from four data points is a horoscope.
 */

/** Below this, a "pattern" is noise wearing a confident sentence. */
export const PATTERN_FLOOR = 5;

export interface Pattern {
  /** The pressure that recurs most. Null when nothing recurs enough. */
  tag: string | null;
  /** How many times they have written about it. */
  times: number;
  /** Days between the first and the most recent, so "again" has a scale. */
  spanDays: number;
  /** Mean drop on this tag, and everywhere else, both or neither. */
  dropHere: number | null;
  dropElsewhere: number | null;
  /** Their words, first and latest — quoted back, never paraphrased. */
  firstWords: string | null;
  latestWords: string | null;
}

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function drops(rows: VentRow[]): number[] {
  return rows
    .filter((v) => v.tension_before !== null && v.tension_after !== null)
    .map((v) => (v.tension_before as number) - (v.tension_after as number));
}

/** First eight words, so it is recognisably theirs without being the whole thing. */
function opening(v: VentRow | undefined): string | null {
  if (!v) return null;
  const words = v.user_message.trim().split(/\s+/);
  return words.length <= 8 ? words.join(" ") : `${words.slice(0, 8).join(" ")}…`;
}

export function findPattern(vents: VentRow[]): Pattern | null {
  const tagged = vents.filter((v) => v.real_world_tag);
  if (tagged.length < PATTERN_FLOOR) return null;

  const byTag = new Map<string, VentRow[]>();
  for (const v of tagged) {
    const tag = v.real_world_tag as string;
    byTag.set(tag, [...(byTag.get(tag) ?? []), v]);
  }

  // The one that recurs most. A tie goes to neither — if two pressures are
  // level there is no single thing bringing them back, and saying there is
  // would be the invention this file exists to avoid.
  const ranked = [...byTag.entries()].sort((a, b) => b[1].length - a[1].length);
  if (!ranked.length) return null;
  const [tag, rows] = ranked[0];
  if (rows.length < PATTERN_FLOOR) return null;
  if (ranked[1] && ranked[1][1].length === rows.length) return null;

  const ordered = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = ordered[0];
  const latest = ordered[ordered.length - 1];
  const spanDays = Math.max(
    1,
    Math.round(
      (new Date(latest.created_at).getTime() - new Date(first.created_at).getTime()) /
        86_400_000,
    ),
  );

  const here = drops(rows);
  const elsewhere = drops(tagged.filter((v) => v.real_world_tag !== tag));

  return {
    tag,
    times: rows.length,
    spanDays,
    // Three is the floor for a mean worth printing. Two readings and an
    // outlier is not an average, it is an anecdote with a decimal point.
    dropHere: here.length >= 3 ? Number((mean(here) as number).toFixed(1)) : null,
    dropElsewhere:
      elsewhere.length >= 3 ? Number((mean(elsewhere) as number).toFixed(1)) : null,
    firstWords: opening(first),
    latestWords: opening(latest),
  };
}

const TAG_WORDS: Record<string, string> = {
  economy: "money",
  japa: "leaving",
  ai_job: "the work going away",
  social: "comparing",
  family: "what the family expects",
  lonely: "being on your own with it",
  traffic: "the road",
  climate: "the heat",
  health: "your body",
};

/**
 * The sentence, written here rather than by a model.
 *
 * It states the count and stops. It does not tell them what the pattern means,
 * because that is theirs to say — and a machine announcing what somebody's
 * life is about would be the exact overreach this product refuses.
 */
export function patternSentence(p: Pattern): string {
  const thing = TAG_WORDS[p.tag ?? ""] ?? p.tag;
  const span = p.spanDays === 1 ? "today" : `over ${p.spanDays} days`;
  return `${p.times} times ${span}, about ${thing}.`;
}
