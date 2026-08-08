/**
 * Read every word, and prove it afterwards.
 *
 * The failure this exists to end: somebody writes four clauses and gets a
 * reply about the last noun. "My dad's test results came back and honestly I
 * don't know, I've been in communication with mumcy but I'm holding am for
 * mind" — and the answer is about mumcy, because mumcy was nearest the full
 * stop. Every clause in that sentence is load-bearing and three of them were
 * dropped.
 *
 * Two halves, both free:
 *
 *   SCAN      what to look for, given to the model as a procedure it runs
 *             before writing — literal, affective, effort, unsaid, somatic.
 *   COVERAGE  what actually came back, scored locally afterwards, so "reflect
 *             every clause" is measured rather than hoped for.
 *
 * Zero tokens. This is regex, a lexicon and set arithmetic — no model call
 * anywhere in this file, and there must never be one. A scorer that costs a
 * completion to run doubles the price of the one path that costs anything.
 */

/** Where a feeling sits in the body. MID is the gut — dread lives there. */
export type Somatic = "HEAD" | "THROAT" | "CHEST" | "MID";

/**
 * Words that are not the point, and would make any reply look like it
 * reflected any message. Coverage that counts "the" is coverage that passes
 * a reply about nothing.
 */
const STOP = new Set([
  "the","a","an","and","but","so","or","if","of","to","in","on","at","for","is",
  "am","are","was","were","be","been","being","i","im","i'm","me","my","you",
  "your","it","its","that","this","there","here","with","as","by","from","he",
  "she","they","them","his","her","we","us","our","have","has","had","do","did",
  "does","not","no","can","will","would","just","really","very","dey","na","don",
  "go","wey","sha","abeg","o","sef","una","make","fit","e","wetin","how","what",
  "when","then","now","because","about","up","down","out","all","any","some",
]);

/**
 * Affect under the surface. The left side is what people type; the right is
 * what it costs them to type it.
 *
 * "Honestly" is the one worth understanding. Nobody says honestly about a
 * fact — they say it before something that exposes them, and it is a request
 * for the reply not to make them regret it.
 */
export const AFFECT: Array<[RegExp, string]> = [
  [/\bhonestly\b|\bto be honest\b|\btruth be told\b/, "vulnerability — they braced before saying it"],
  [/\bi don'?t know\b|\bidk\b|\bi no know\b|\bno idea\b/, "confusion carrying guilt — not-knowing feels like failing somebody"],
  [/\btired\b|\bexhausted\b|\bdrained\b|\bweak\b/, "depletion, not laziness"],
  [/\bholding\b|\bcarrying\b|\bbearing\b/, "load they have not put down"],
  [/\bfine\b|\bit'?s fine\b|\bi'?m okay\b|\bnothing\b/, "the lid, not the contents"],
  [/\bscared\b|\bafraid\b|\bfear\b|\bworried\b|\banxious\b/, "fear naming itself, which is already progress"],
  [/\bangry\b|\bvex\b|\bmad\b|\bpissed\b/, "anger, usually standing in front of grief"],
  [/\balone\b|\blonely\b|\bnobody\b/, "isolation — check whether it is true or felt"],
  [/\bsorry\b|\bmy fault\b|\bi should have\b/, "guilt reaching for repair"],
  [/\bshould\b|\bsupposed to\b|\bexpected\b/, "an obligation they did not choose"],
];

/**
 * What they are already doing. This is the most under-read signal in the
 * corpus: a person listing their coping as if it were nothing.
 *
 * "I've been in communication with mumcy" is active coping. Answering it as
 * though they are doing nothing is the fastest way to lose somebody who is
 * already trying.
 */
export const EFFORT: RegExp[] = [
  /\bi'?ve been\b|\bi have been\b|\bi been\b/,
  /\bi (called|texted|messaged|asked|told|spoke|talked|tried|started|kept)\b/,
  /\bin communication\b|\bkeeping in touch\b|\breaching out\b/,
  /\bevery day\b|\bevery night\b|\bstill\b/,
  /\bi dey (try|call|do)\b|\bi don try\b/,
];

/**
 * Body mapping. "I don't know" is head-spin, not a shrug — the loop is
 * running upstairs and cannot land. "Holding am for mind" is chest.
 */
const BODY: Array<[Somatic, RegExp]> = [
  ["HEAD", /\bi don'?t know\b|\bidk\b|\bi no know\b|\bconfus|\boverthink|\bcan'?t think\b|\bhead\b|\bspinning\b|\bloop/],
  ["THROAT", /\bthroat\b|\bswallow\b|\bcan'?t say\b|\bcouldn'?t tell\b|\bvoice\b|\bchoking\b/],
  ["CHEST", /\bchest\b|\bheart\b|\bheavy\b|\bholding\b|\bcarrying\b|\btight\b|\bbreath/],
  ["MID", /\bstomach\b|\bbelle\b|\bgut\b|\bsick\b|\bdread\b|\bnausea/],
];

export interface Clause {
  /** Their words, verbatim. Typos kept — they are data. */
  text: string;
  /** Content words, lowercased, stop words removed. */
  keys: string[];
}

export interface Scan {
  clauses: Clause[];
  affect: string[];
  effort: string[];
  somatic: Somatic | null;
}

const SPLIT = /\s*(?:,|;|\.|\band\b|\bbut\b|\bso\b|\bthough\b|\balthough\b|\bwhile\b)\s*/i;

const keysOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/**
 * Break a message into the things it is actually saying.
 *
 * Clauses shorter than two content words are folded away — "and honestly" on
 * its own is not a clause to reflect, it is a hinge.
 */
export function scan(message: string): Scan {
  const lower = message.toLowerCase();

  const clauses: Clause[] = message
    .split(SPLIT)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ text, keys: keysOf(text) }))
    .filter((c) => c.keys.length > 0);

  const affect = AFFECT.filter(([re]) => re.test(lower)).map(([, meaning]) => meaning);
  const effort = EFFORT.filter((re) => re.test(lower)).map((re) => {
    const m = lower.match(re);
    return m ? m[0] : "";
  }).filter(Boolean);

  const somatic = BODY.find(([, re]) => re.test(lower))?.[0] ?? null;

  return { clauses, affect, effort, somatic };
}

export interface Coverage {
  /** 0–1. What share of their clauses the reply actually touched. */
  score: number;
  /** The clauses that came back unanswered, in their words. */
  missed: string[];
  total: number;
}

/**
 * How much of what they said came back.
 *
 * A clause counts as reflected when the reply contains one of its content
 * words. That is deliberately shallow: this measures *attention*, not
 * comprehension, and a shallow measure that is honest beats a deep one that
 * is guessing. A reply can echo a word and still miss the point — but a reply
 * that echoes nothing has definitively missed the clause.
 *
 * Clauses of one content word are excluded from the denominator. Holding a
 * reply to "results" as a separate obligation is scoring noise.
 */
export function coverage(message: string, reply: string): Coverage {
  const { clauses } = scan(message);
  const scored = clauses.filter((c) => c.keys.length >= 2);
  if (scored.length === 0) return { score: 1, missed: [], total: 0 };

  const replyKeys = new Set(keysOf(reply));
  // Loose stemming, both directions: "holding" reflects "hold", "results"
  // reflects "result". Not a stemmer, and does not pretend to be one.
  const hit = (k: string) =>
    replyKeys.has(k) ||
    [...replyKeys].some(
      (r) => (r.length > 3 && k.startsWith(r.slice(0, 4))) || (k.length > 3 && r.startsWith(k.slice(0, 4))),
    );

  const missed = scored.filter((c) => !c.keys.some(hit)).map((c) => c.text);
  return {
    score: (scored.length - missed.length) / scored.length,
    missed,
    total: scored.length,
  };
}

/**
 * Below this, the reply answered a different message.
 *
 * Two thirds rather than everything. A good reply compresses — it will not
 * name every clause, and demanding it would produce a checklist read aloud,
 * which is the exact opposite of the voice. Missing a third is compression;
 * missing more than a third is not having read it.
 */
export const COVERAGE_FLOOR = 0.67;

/** The scan, written for the model to run before it writes anything. */
export function scanBlock(s: Scan): string | null {
  if (s.clauses.length === 0) return null;

  const lines = [
    "WHAT THEY ACTUALLY SAID — every clause is load-bearing",
    ...s.clauses.map((c, i) => `${i + 1}. "${c.text}"`),
  ];

  if (s.affect.length) lines.push("", `UNDER IT: ${s.affect.join("; ")}.`);
  if (s.effort.length) {
    lines.push(
      "",
      `ALREADY DOING: "${s.effort.join('", "')}" — this is coping, not nothing. Name it as effort before you touch anything else, or you will sound like somebody who thinks they are doing nothing.`,
    );
  }
  if (s.somatic) lines.push("", `SITS IN: ${s.somatic}.`);

  lines.push(
    "",
    "Answer every numbered clause. Not the last noun — the last noun is where",
    "the sentence ended, not where the weight is. If you can only carry three,",
    "carry the three that cost them the most to type.",
    "",
    "Do not open with a name they mentioned. Open with the state they are in.",
  );

  return lines.join("\n");
}
