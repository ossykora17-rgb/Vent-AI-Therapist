import { gradeReply, type Finding, type GoldenCase } from "./quality";
import type { Fitness } from "./learned";

/**
 * What a candidate rule did, measured instead of assumed.
 *
 * WHAT THIS CLOSES
 *
 * `--apply` merged whatever the nightly model proposed, as long as
 * `acceptable()` did not refuse it on shape. That is a spelling check standing
 * where a fitness function belongs: it can tell you a rule is short, concrete
 * and does not reopen a house rule, and it cannot tell you whether the rule
 * makes a single reply better. Every published version of reflective prompt
 * evolution has a scorer in that slot — the reflection proposes, the *score*
 * decides, and a generation with no score is a random walk with a changelog.
 *
 * So the loop is now: the audit proposes, this measures, the gate decides, a
 * person reads the diff. Four steps and only one of them is a model.
 *
 * WHERE IT MUST NOT LIVE
 *
 * Not in `npm run gate`. The suite makes zero model calls by construction and
 * that property is metered rather than promised — a check that generated a
 * reply would spend real money on every gate run and print `0 model calls`
 * underneath. The measurement is paid, so it lives in the paid path: inside
 * `--apply`, below the no-key exit, with the same key the proposal cost.
 *
 * What lives *here* is the free half — the arithmetic over two sets of replies
 * that have already been generated. It is pure, it is deterministic, and the
 * suite grades it directly rather than grading the script's copy of it.
 * `countsAsSpend` is the precedent and the reason is the same: a predicate
 * re-implemented at a call site is a predicate no check is grading.
 */

/**
 * One case answered twice by the same model in the same minute.
 *
 * WHY PAIRED, AND WHY THAT IS THE ONLY HONEST SHAPE
 *
 * An absolute score is not comparable across runs: a different sample, a
 * different day and a different checkpoint all move it. The only quantity that
 * survives being compared later is a difference taken against itself — same
 * case, same model, same minute, once with the rule in the prompt and once
 * without.
 *
 * WHAT IT CANNOT REMOVE, STATED RATHER THAN GLOSSED
 *
 * The sampler. `providers.ts` records that non-default sampling parameters are
 * a **400** on this model — "not a degraded reply, a refused request" — so the
 * temperature cannot be pinned to zero and two identical prompts do not give
 * two identical replies. Some of every delta here is noise, and the only lever
 * on it is more cases.
 *
 * That is survivable in exactly one direction, which is why the test below is
 * dominance and not an average. Noise mostly produces a **false refusal**,
 * which costs a re-run. A false accept costs one neutral rule in one of three
 * slots, in a diff that `npm run gate` runs against and a person reads before
 * it reaches anybody. The asymmetry is the design, not an accident of it.
 */
export interface ScoredPair {
  /** The held-out case both arms were asked. */
  case: GoldenCase;
  /** What the prompt without the rule produced. */
  without: string;
  /** What the prompt with the rule produced. */
  with: string;
  /**
   * Everything this person had written, for the `invented` grader.
   *
   * Absent means that grader does not run — which is the bug CLAUDE.md records
   * about the nightly audit calling `gradeReply` without it and printing
   * "broke a rule: 0" over the only fatal grader in the file. Asked of any
   * grader run in a second place: *is it being given everything the first
   * place gives it?*
   */
  said?: string;
}

/**
 * Graders that fired, by name, once each.
 *
 * SEVERITY IS DELIBERATELY NOT WEIGHTED
 *
 * A `fatal` and a `minor` both count one. That looks wrong for half a second
 * and is the correct construction, because the dominance test below is what
 * severity weighting would have been for: a candidate that introduces a single
 * `diagnosis` finding puts +1 on that grader's line and is refused outright, no
 * matter how many `jargon` findings it removed. Weighting first and comparing
 * second is the thing that hides that trade — it is how four small wins buy one
 * clinical label.
 *
 * A `skipped` grader is one that did not run — `gradeReply` emits it when no
 * tokens were spent — and there is deliberately **no guard against it here**,
 * because a guard that cannot fire is worse than an absence. Both arms of a
 * pair are billed identically by construction: the harness calls the model
 * twice inside one `try` and drops the whole pair if either call throws, so a
 * `skipped` grader fires in both arms or in neither, cancels to zero, and is
 * removed by the dropped-zero rule below.
 *
 * The first version of this file did carry that guard, with a paragraph
 * explaining what it protected. The mutation pass is what said otherwise:
 * deleting it changed nothing any check could see, because nothing it stood in
 * front of could ever reach it. The day one arm can be billed and the other
 * not — a harness that falls back to an authored reply rather than dropping
 * the pair — this needs a per-arm flag, and until then it needs a sentence.
 */
function fired(findings: readonly Finding[]): string[] {
  return [...new Set(findings.map((f) => f.grader))];
}

/**
 * What the rule did, per grader, over the pairs it was measured on.
 *
 * Negative is fewer findings, which is better. The sign is counter-intuitive
 * once and correct for ever after, because what is being counted is graders
 * that fired.
 *
 * **Graders that did not move are left out.** A wall of `"advice": 0` is not
 * evidence, and this object is committed to `learned.ts` by `--apply` — the
 * record is what changed, the same way `Verdict.reject` carries the graders
 * that fired and nothing else. Nothing in it is anybody's words: grader names
 * and integers, which is exactly what CLAUDE.md's stdout rule allows and the
 * reason this can be written to a public file at all, one field after the one
 * that was deleted for not being.
 */
export function fitnessOf(pairs: readonly ScoredPair[]): Fitness {
  const delta: Record<string, number> = {};
  const move = (grader: string, by: number) => {
    delta[grader] = (delta[grader] ?? 0) + by;
  };

  for (const p of pairs) {
    const meta = { tokensSpent: true, said: p.said };
    for (const g of fired(gradeReply(p.case, p.with, meta))) move(g, 1);
    for (const g of fired(gradeReply(p.case, p.without, meta))) move(g, -1);
  }

  for (const [grader, d] of Object.entries(delta)) {
    if (d === 0) delete delta[grader];
  }
  return { cases: pairs.length, delta };
}

/**
 * How many held-out cases a candidate is measured on.
 *
 * Twelve, at two calls each, so one candidate costs twenty-four replies —
 * cents, against a rule that would otherwise reach everybody who uses this on
 * the strength of a model's opinion of its own output.
 *
 * Above `FITNESS_MIN_CASES` on purpose: the floor is where a delta stops being
 * a single flaky reply, and a measurement sitting exactly on its own floor has
 * no room to lose a case to a transport error.
 */
export const FITNESS_CASES = 12;

/**
 * Which held-out cases, and *held-out* is the load-bearing word.
 *
 * The candidate was proposed from flat production replies. Measuring it on
 * those same replies is fitting the rule to its own sample, which this
 * repository has already paid for once: `earned_worth` was weighted on a
 * sample of three, and CLAUDE.md's note on it — "tuning a new entry until it
 * beats three established ones, on a sample of three, so that an assertion
 * written an hour earlier goes green, is fitting the code to the test" — is
 * the whole argument. The authored corpus is the set the rule has never seen.
 *
 * Stratified over file order rather than the first N, because the first twelve
 * rows of a hand-written file are twelve rows one person wrote in one sitting.
 * Deterministic and seedless, so two runs of the same candidate are measured on
 * the same cases and a re-run means something.
 */
export function sampleCases<T>(all: readonly T[], take = FITNESS_CASES): T[] {
  if (all.length <= take) return [...all];
  const step = all.length / take;
  return Array.from({ length: take }, (_, i) => all[Math.floor(i * step)]);
}
