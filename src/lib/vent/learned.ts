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
  /** The reply that caused it, in a few words. Evidence, not decoration. */
  found: string;
  /** ISO date the audit proposed it. */
  added: string;
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
 * The newest three, oldest dropped.
 *
 * Exported and pure so the audit's merge step and the eval suite agree about
 * what "keep the best three" means — the alternative is the script having its
 * own idea of it, which is how two implementations of one rule start.
 */
export function prune(rules: readonly LearnedRule[]): LearnedRule[] {
  return [...rules]
    .sort((a, b) => (a.added < b.added ? 1 : a.added > b.added ? -1 : 0))
    .slice(0, MAX_LEARNED);
}
