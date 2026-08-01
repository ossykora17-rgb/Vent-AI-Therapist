import {
  CONFIDENCE_FLOOR,
  type Hobby,
  type Occupation,
  type Signal,
  type Temperament,
} from "./types";

/**
 * Detection is pure local heuristics — no model call, so reading the user
 * costs nothing per message. The Trinity spends tokens; the Flavour Engine
 * does not.
 */

type Lexicon<T extends string> = Record<Exclude<T, "unknown">, string[]>;

const OCCUPATION_WORDS: Lexicon<Occupation> = {
  lawyer: [
    "court", "case", "brief", "chambers", "partner", "client", "filing",
    "hearing", "judge", "affidavit", "counsel", "litigation", "call to bar",
  ],
  nine_to_five: [
    "office", "manager", "standup", "deadline", "salary", "hr", "boss",
    "appraisal", "shift", "commute", "kpi", "report", "my oga",
  ],
  entrepreneur: [
    "runway", "investor", "burn", "launch", "customers", "pitch", "founder",
    "startup", "traction", "revenue", "co-founder", "raise", "my business",
  ],
  creative: [
    "design", "write", "shoot", "edit", "brand", "portfolio", "client brief",
    "studio", "draft", "gig", "creative", "art", "brief",
  ],
  student_japa: [
    "school", "exam", "semester", "lecturer", "visa", "ielts", "japa",
    "admission", "hostel", "project defence", "cgpa", "relocate", "abroad",
  ],
};

const HOBBY_WORDS: Lexicon<Hobby> = {
  football: [
    "arsenal", "chelsea", "united", "liverpool", "match", "ball", "league",
    "striker", "penalty", "derby", "champions league", "goal",
  ],
  gym: [
    "gym", "reps", "sets", "lift", "deadlift", "squat", "bench", "cardio",
    "trainer", "gains", "leg day", "pr",
  ],
  music: [
    "studio", "beat", "guitar", "playlist", "afrobeats", "producer", "verse",
    "album", "song", "amapiano", "spotify",
  ],
  gaming: [
    "fifa", "cod", "console", "ranked", "ps5", "xbox", "grind", "lobby",
    "controller", "gta", "steam",
  ],
  fashion: [
    "fit", "drip", "thrift", "sneakers", "outfit", "tailor", "ankara",
    "wardrobe", "style", "fabric", "kicks",
  ],
};

const FIRE_WORDS = [
  "just", "fix", "now", "abeg", "seriously", "done", "tired of", "enough",
  "cut", "sharp", "move", "shift", "wetin", "sharp sharp",
];
const WATER_WORDS = [
  "feel", "felt", "always", "never", "deep", "inside", "since", "childhood",
  "heavy", "small", "empty", "wonder", "somehow", "quiet",
];
const AIR_WORDS = [
  "and then", "also", "anyway", "random", "everywhere", "so many", "plus",
  "sha", "or maybe", "scattered", "everything at once",
];
const EARTH_WORDS = [
  "plan", "steady", "okay", "manage", "step", "slowly", "fine", "handle",
  "routine", "consistent", "no wahala", "we go dey alright",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word/phrase hits only — "pr" must not match "practice". */
function hits(text: string, words: string[]): string[] {
  return words.filter((w) =>
    new RegExp(`(^|[^a-z])${escape(w)}([^a-z]|$)`, "i").test(text),
  );
}

function pick<T extends string>(
  scores: Array<[T, string[]]>,
  fallback: T,
): Signal<T> {
  const total = scores.reduce((sum, [, ev]) => sum + ev.length, 0);
  if (total === 0) return { value: fallback, confidence: 0, evidence: [] };

  const [best, evidence] = scores.reduce((a, b) =>
    b[1].length > a[1].length ? b : a,
  );
  const confidence = evidence.length / total;

  return confidence >= CONFIDENCE_FLOOR
    ? { value: best, confidence, evidence }
    : { value: fallback, confidence, evidence };
}

/**
 * Temperament reads *shape* as much as vocabulary: Fire is short and clipped,
 * Water is long and inward, Air jumps, Earth is level.
 */
export function detectTemperament(messages: string[]): Signal<Temperament> {
  const text = messages.join(" \n ").toLowerCase();
  if (!text.trim()) {
    return { value: "water", confidence: 0, evidence: [] };
  }

  const fire = hits(text, FIRE_WORDS);
  const water = hits(text, WATER_WORDS);
  const air = hits(text, AIR_WORDS);
  const earth = hits(text, EARTH_WORDS);

  const sentences = text.split(/[.!?\n]+/).filter((s) => s.trim().length > 0);
  const avgWords =
    sentences.reduce((n, s) => n + s.trim().split(/\s+/).length, 0) /
    Math.max(sentences.length, 1);

  // Shape signals count as evidence so punctuation and rhythm carry weight.
  if (avgWords < 9) fire.push("clipped sentences");
  if (avgWords > 22) water.push("long unbroken thought");
  if ((text.match(/\?/g) ?? []).length >= 3) air.push("stacked questions");
  if ((text.match(/!/g) ?? []).length >= 2) fire.push("raised voice");
  if ((text.match(/\.\.\./g) ?? []).length >= 2) air.push("trailing off");
  if (avgWords >= 12 && avgWords <= 20 && earth.length > 0) {
    earth.push("even pacing");
  }

  return pick<Temperament>(
    [
      ["fire", fire],
      ["water", water],
      ["air", air],
      ["earth", earth],
    ],
    "water",
  );
}

/** Gist, not a form — occupation is inferred from how they talk about work. */
export function detectOccupation(messages: string[]): Signal<Occupation> {
  const text = messages.join(" \n ").toLowerCase();
  return pick<Occupation>(
    (Object.entries(OCCUPATION_WORDS) as Array<[Occupation, string[]]>).map(
      ([key, words]) => [key, hits(text, words)],
    ),
    "unknown",
  );
}

export function detectHobby(messages: string[]): Signal<Hobby> {
  const text = messages.join(" \n ").toLowerCase();
  return pick<Hobby>(
    (Object.entries(HOBBY_WORDS) as Array<[Hobby, string[]]>).map(
      ([key, words]) => [key, hits(text, words)],
    ),
    "unknown",
  );
}
