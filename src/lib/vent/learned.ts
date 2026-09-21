import { bannedPhrase } from "./voice";

/**
 * What the room learned about itself, written down.
 *
 * "Runs a nightly self-audit, finds where it sounded generic, writes new rules
 * to itself, updates its own prompt." Every word of that is right except the
 * last four, and the difference is the whole design.
 *
 * A prompt that rewrites itself unsupervised has no floor. The failure is not
 * dramatic — it is a slow drift where each night's rule is individually
 * reasonable, the tenth contradicts the third, nobody can say when the voice
 * changed, and there is no version to go back to because there was never a
 * diff. This product's own history is the argument: the bugs that cost the
 * most were all *plausible* at the moment they were written, and every one was
 * caught by something that could fail a build.
 *
 * So the loop is: the audit *proposes*, this file *holds*, and the gate
 * *decides*. `npm run audit` writes proposals to a gitignored file. Applying
 * them edits this array, which is version-controlled — so every rule the room
 * gave itself is a diff somebody can read, blame and revert, and `npm run
 * gate` runs against it before it can reach anybody.
 *
 * The caps are not tuning, they are the prompt's token budget divided by what
 * a rule needs to say. Three rules at ninety characters is ~80 tokens a turn,
 * measured by check 24 against a list that is full and at the character limit
 * — because a ceiling measured against the empty list this ships with would
 * rise the first night the audit accepted anything. When a fourth is accepted
 * the oldest is dropped, so this stays the three things most worth
 * remembering rather than sediment nobody prunes.
 */

export interface LearnedRule {
  /** Stable, so a rule can be pinned in an eval check and blamed in git. */
  id: string;
  /** The instruction, as the prompt will carry it. */
  rule: string;
  /** ISO date the audit proposed it. */
  added: string;
  /**
   * What it did to the corpus when it was measured, or absent.
   *
   * Optional on purpose. A rule can arrive without a measurement — somebody
   * hand-writes one — and an unscored rule ranks as a delta of zero, so a rule
   * *proven* to help beats an assumed one and nothing silently outranks a
   * measurement by being newer. Every rule `--apply` merges carries one,
   * because the gate below refuses the merge otherwise.
   */
  fitness?: Fitness;
  /*
    THERE IS NO `found`, AND THE EVIDENCE RULE IT SERVED IS STILL ENFORCED

    This carried 160 characters of the reply that produced the rule, under a
    comment reading "Evidence, not decoration". The argument was right and it
    was written before this repository was public: a rule with no reply behind
    it is a rule the model reasoned its way to, which is the failure mode of
    asking a model what it did wrong.

    What changed is where the field lands. `LEARNED_RULES` is committed source
    in a public repo, and `--apply` writes it there; `data/audit/<date>.json`
    is uploaded by `audit.yml` with `actions/upload-artifact`, also public. So
    the field was a fragment of somebody's session in two public places — and
    read by nothing: `learnedBlock` renders `r.rule` and no other field, so it
    never reached the prompt, the product or a screen.

    The requirement lives in `parseProposals`, which still refuses a proposal
    that cannot point at a reply and then throws the quote away. Same shape as
    `classifyModelError` reading a provider's `.body` and discarding it, and
    as `Verdict.reject` carrying grader names: the gate keeps its input, the
    record does not.
  */
}

/**
 * What a candidate rule did to the corpus, measured against itself.
 *
 * WHY A DELTA AND NOT A SCORE
 *
 * An absolute score is not comparable across runs: a different sample, a
 * different day and a different model checkpoint all move it, so ranking
 * Monday's rule against Friday's would be comparing two measurements of two
 * different things. A **paired** delta — the same cases, the same model, the
 * same minute, once with the rule and once without — is the quantity that
 * survives being compared later.
 *
 * Negative is fewer findings, which is better. The sign is counter-intuitive
 * once and correct for ever after, because what is being counted is graders
 * that fired.
 */
export interface Fitness {
  /** Corpus cases scored, both with and without the rule, in one run. */
  cases: number;
  /** Per-grader change. Negative is fewer findings; better. */
  delta: Readonly<Record<string, number>>;
}

/**
 * Cases below which a delta is noise wearing a number.
 *
 * Eight. Not tuned — there is no labelled set to tune against — but it is the
 * floor at which a single flaky reply cannot decide the whole verdict, and it
 * is stated rather than left implicit. A candidate measured on fewer is
 * refused rather than believed.
 */
export const FITNESS_MIN_CASES = 8;

/** Graders that fired more, minus graders that fired less. */
export function totalDelta(f: Fitness | undefined): number {
  if (!f) return 0;
  return Object.values(f.delta).reduce((n, d) => n + d, 0);
}

/**
 * Is this a Pareto improvement, rather than a better average?
 *
 * THE DOMINANCE TEST IS THE WHOLE POINT, AND AN AVERAGE WOULD NOT DO IT
 *
 * A rule that removes four `jargon` findings and introduces one `diagnosis`
 * has a better total and is a strictly worse product: this file's neighbours
 * spend paragraphs on why a clinical label is not something a person can
 * un-hear. Summing first and judging second hides exactly that trade.
 *
 * So the test is dominance — **no grader may get worse**, and at least one
 * must get better. It is what GEPA means by keeping a Pareto frontier rather
 * than the best scalar, applied where this product's objectives actually live:
 * the fourteen graders, each of which is a separate promise.
 */
export function isImprovement(f: Fitness | undefined): boolean {
  if (!f) return false;
  if (f.cases < FITNESS_MIN_CASES) return false;
  const deltas = Object.values(f.delta);
  if (deltas.some((d) => d > 0)) return false;
  return deltas.some((d) => d < 0);
}

/** What the prompt's budget can carry. Raising it means raising that too. */
export const MAX_LEARNED = 3;
/** A rule longer than this is an essay, and an essay is not a rule. */
export const MAX_RULE_CHARS = 90;

/**
 * Empty, and that is the correct starting state.
 *
 * A seeded list would be rules nobody's session produced — the audit's whole
 * value is that these come from replies real people actually got.
 */
export const LEARNED_RULES: readonly LearnedRule[] = [];

/**
 * Why this rule cannot be accepted, or null if it can.
 *
 * The audit runs on a schedule with nobody watching, so this is the only thing
 * standing between a bad night and the prompt. Each refusal below is a way a
 * self-improving loop actually degrades in practice rather than in theory:
 *
 *   A rule containing a banned phrase teaches the model the phrase. The list
 *   is a list of things not to say, and a model reading "never say you've got
 *   this" has still read it — but worse, a rule that *quotes* the failure it
 *   is fixing is how a ban becomes an instruction after one bad parse.
 *
 *   A rule about the room rather than the reply is scope creep with a
 *   plausible face: "be more empathetic" is not falsifiable, cannot be graded,
 *   and displaces one of three slots a concrete rule could hold.
 *
 *   A rule that contradicts the house rules is the drift this file exists to
 *   stop. Advice, promises and diagnosis are settled; a night's observation
 *   does not get to reopen them.
 */
export function acceptable(rule: string): string | null {
  const text = rule.trim();
  if (text.length < 12) return "too short to be a rule";
  if (text.length > MAX_RULE_CHARS) return `over ${MAX_RULE_CHARS} characters`;

  /*
    A rule does not quote, and the paragraph above has said so since this file
    was written: "a rule that *quotes* the failure it is fixing is how a ban
    becomes an instruction after one bad parse." The only enforcement was
    `bannedPhrase` below, which catches a rule quoting one of *our* phrases
    and nothing else. A rule quoting the **person's** sentence — the one that
    lands in committed public source, in a public artifact and in the prompt —
    walked past it. A rule stated in a comment and implemented nowhere, in the
    file whose job is holding rules.

    Double quotes only. A straight `'` is an apostrophe far more often than a
    quotation mark here, and matching it would refuse `don't` and `they've` —
    `\bdon\b` again, from the other side. So the guard is narrow and says so:
    an unquoted paraphrase of somebody's sentence still passes, and nothing
    here can see it. What it closes is the shape a model actually writes when
    it is asked for evidence and puts the evidence in the rule.
  */
  if (/["\u201c\u201d\u201e\u00ab\u00bb]/.test(text)) return "quotes something";

  const banned = bannedPhrase(text);
  if (banned) return `contains a banned phrase: "${banned.match}"`;

  // Falsifiable, or it cannot be audited next month either.
  if (/\b(be more|try to|remember to|make sure to|always try)\b/i.test(text)) {
    return "an intention, not a rule";
  }
  if (/\b(empath|authentic|genuine|warm|caring|supportive)\b/i.test(text)) {
    return "asks for a quality, which nothing can check";
  }
  // The house rules are not up for revision by a nightly job.
  if (/\b(advice|advise|suggest they|tell them to|diagnos|promise|remember them)\b/i.test(text)) {
    return "reopens a house rule";
  }
  return null;
}

/**
 * The block, or nothing.
 *
 * Nothing is the common case and it must stay cheap: an empty list renders no
 * heading, so a deployment that has never run an audit carries not one token
 * for this.
 */
export function learnedBlock(rules: readonly LearnedRule[] = LEARNED_RULES): string | null {
  const keep = rules.slice(0, MAX_LEARNED);
  if (keep.length === 0) return null;
  return [
    "WHAT THIS ROOM GOT WRONG BEFORE — from replies people actually received:",
    ...keep.map((r) => `- ${r.rule}`),
  ].join("\n");
}

/**
 * The best three, worst dropped — and it used to be the newest three.
 *
 * WHAT WAS WRONG WITH RECENCY
 *
 * Three slots and a queue is a list that forgets its best rule the moment a
 * fourth arrives. The loop this feeds is reflective prompt evolution, and
 * every published version of that keeps a frontier of what *scored*, not a
 * window of what is recent — a generation that throws away its champion is
 * not evolution, it is drift with a changelog.
 *
 * Rank is `totalDelta` ascending, because negative is fewer findings. An
 * **unscored rule ranks as zero**, which is the load-bearing default: a rule
 * proven to help outranks an assumed one, an assumed one outranks nothing, and
 * a proven regression cannot exist here because `--apply` refuses to merge a
 * candidate that is not a Pareto improvement.
 *
 * Recency is the tie-break and not the rank, so with nothing scored this
 * returns exactly what it always returned.
 *
 * Exported and pure so the audit's merge step and the eval suite agree about
 * what "keep the best three" means — the alternative is the script having its
 * own idea of it, which is how two implementations of one rule start.
 */
export function prune(rules: readonly LearnedRule[]): LearnedRule[] {
  return [...rules]
    .sort((a, b) => {
      const byFitness = totalDelta(a.fitness) - totalDelta(b.fitness);
      if (byFitness !== 0) return byFitness;
      return a.added < b.added ? 1 : a.added > b.added ? -1 : 0;
    })
    .slice(0, MAX_LEARNED);
}
