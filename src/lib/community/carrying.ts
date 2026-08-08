import type { VentRow } from "@/lib/store";

/**
 * What the house is carrying this week.
 *
 * A circle keeps nothing. That is a hard rule and it is the right one — the
 * transcript is deleted on close and the pipeline is forbidden from ever
 * reading it. But it leaves the product with no community at all: every room
 * is the first room, the lobby is empty until somebody else happens to be
 * awake, and a person arrives at 2am to a screen that suggests they are the
 * only one who has ever felt this.
 *
 * They are not, and that is the single most useful true thing peer support
 * has to offer. "Am I the only one" is the loneliest question a person brings
 * here, and it has an answer that costs nothing to give.
 *
 * So: the room remembers nothing, and the house remembers how many. Counts by
 * pressure, over a week, across everybody. No message text, no reply text, no
 * identity, no circle transcripts — the same three-column discipline the
 * efficacy loop runs on, for the same reason. There is nothing in the output
 * a stranger could not have guessed, which is what makes it safe to show on
 * a public page.
 *
 * It is also the honest fix for a cold start. A social product with nobody in
 * it looks dead, and the usual answer is to fake activity. This does not fake
 * anything: it counts real rows and says nothing at all when there are too
 * few, which is the only version of this that survives contact with the first
 * week.
 */

/** Below this, a count is not a community — it is one person and a rounding. */
export const CARRYING_FLOOR = 8;

/**
 * Per-tag floor. A single pressure needs its own weight before it is named,
 * or the page tells somebody "3 people are carrying money" and quietly means
 * "you, twice, and somebody's test message".
 */
export const TAG_FLOOR = 3;

/** Seven days. Long enough to have a shape, short enough to still be now. */
export const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface Carrying {
  /** People-sessions in the window, across every pressure. */
  total: number;
  /** Ranked, floored, never empty when present. */
  tags: Array<{ tag: string; count: number }>;
}

/**
 * Counts, or null.
 *
 * Null means the page says nothing — no "0 circles this week", no empty
 * chart, no placeholder. An absent sentence, exactly like a flavour below its
 * confidence floor and an exchange rate that did not fetch. Announcing that
 * nobody is here is worse for the person reading it than saying nothing, and
 * it is the one thing a lonely screen must not do.
 */
export function whatIsCarried(
  vents: readonly VentRow[],
  now = Date.now(),
): Carrying | null {
  const since = now - WINDOW_MS;
  const recent = vents.filter((v) => {
    const at = new Date(v.created_at).getTime();
    return Number.isFinite(at) && at >= since;
  });
  if (recent.length < CARRYING_FLOOR) return null;

  const counts = new Map<string, number>();
  for (const v of recent) {
    if (!v.real_world_tag) continue;
    counts.set(v.real_world_tag, (counts.get(v.real_world_tag) ?? 0) + 1);
  }

  const tags = [...counts.entries()]
    .filter(([, count]) => count >= TAG_FLOOR)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));

  // A total with no nameable pressure behind it is a number with nothing to
  // say. Better to stay quiet than to print "41 this week" over blank space.
  if (tags.length === 0) return null;

  return { total: recent.length, tags };
}

/** The plain words for a pressure. Shared with the pattern sentence. */
export const CARRYING_WORDS: Record<string, string> = {
  economy: "money",
  japa: "leaving",
  ai_job: "work",
  social: "comparing",
  family: "family",
  lonely: "being alone",
  traffic: "the road",
  climate: "the heat",
  health: "health",
};

export const carryingWord = (tag: string) => CARRYING_WORDS[tag] ?? tag;
