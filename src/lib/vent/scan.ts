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

  // Earliest mention, not table order.
  //
  // `BODY.find` returns HEAD before THROAT before CHEST no matter what the
  // sentence emphasises — the exact bug `intent.ts` already had and had
  // fixed, reintroduced here three weeks later in a new file. Reading
  // position in their sentence is the only tie-break that is about them.
  let somatic: Somatic | null = null;
  let earliest = Infinity;
  for (const [part, re] of BODY) {
    const at = lower.search(re);
    if (at !== -1 && at < earliest) {
      earliest = at;
      somatic = part;
    }
  }

  return { clauses, affect, effort, somatic };
}

export interface Coverage {
  /**
   * 0–1, or **null for no opinion**.
   *
   * Null below `SCOREABLE_MIN` scored clauses, and it is the most important
   * value here. Most messages are two clauses long; on those, one unechoed
   * clause is 50% and two is 0%, which is noise wearing a decimal point.
   * A metric that reports a number for every input reports nonsense for most
   * of them.
   */
  score: number | null;
  /** The clauses that came back unanswered, in their words. */
  missed: string[];
  total: number;
}

/**
 * Below this many scoreable clauses, there is no signal — only a small
 * denominator producing confident-looking fractions.
 *
 * Found by writing 51 authored examples and scoring them: twelve "failed",
 * and every one was a good reply on a short message. The examples falsified
 * the metric on their first run, which is most of why they were worth
 * writing.
 */
export const SCOREABLE_MIN = 3;

/**
 * How much of what they said came back.
 *
 * A clause counts as reflected when the reply contains one of its content
 * words. This measures **lexical echo**, and it is critical to say what that
 * is not: it is not quality, and a low score is not a bad reply.
 *
 * "work don finish me, i dey do 6am to 10pm" answered with "Sixteen hours."
 * scores zero and is better than any reply that echoed the words back. A
 * scorer taken as a quality signal would push the model toward parroting,
 * which is the opposite of the voice — so this is never wired to
 * regeneration and never shown to anybody as a grade.
 *
 * What it is good for: a long, multi-clause message that comes back with
 * nothing of itself in it has almost certainly been answered by its last
 * noun. That is the one failure this catches, and it is the one that
 * prompted the whole file.
 *
 * Clauses of one content word are excluded from the denominator. Holding a
 * reply to "results" as a separate obligation is scoring noise.
 */
export function coverage(message: string, reply: string): Coverage {
  const { clauses } = scan(message);
  const scored = clauses.filter((c) => c.keys.length >= 2);
  if (scored.length < SCOREABLE_MIN) return { score: null, missed: [], total: scored.length };

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
 * Below this, on a message long enough to score, something went wrong.
 *
 * A third, not two thirds. The first draft of this file said 0.67 and it was
 * wrong: a good reply compresses, transforms, and reaches for the better word
 * — "sixteen hours" for "6am to 10pm" — and every one of those reads as a
 * miss here. Set where only a reply that echoed almost nothing of a long
 * message trips it, which is the single failure this can actually detect.
 */
export const COVERAGE_FLOOR = 0.34;

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
