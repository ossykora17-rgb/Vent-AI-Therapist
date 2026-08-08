import { classify } from "./intent";
import { selectTactic } from "./tactics";
import { selectMemory } from "./memory";
import { generateReply } from "./providers";
import { VENT_MODEL } from "./model";

/**
 * The four stages a vent passes through, and what each one costs.
 *
 * This file arrived as a sketch — intake, memory, somatic, weaver — and the
 * shape was right. Its implementation was not: three extra model calls per
 * message, three dependencies this repo does not have, and
 * `claude-sonnet-5-20250715`, a model id that does not exist and that had
 * already been found in production once and reverted.
 *
 * The shape survives because it is correct. What changed is that three of the
 * four stages turn out to need no model at all, and the ones that do are named
 * here rather than assumed:
 *
 *   1. INTAKE   — what kind of message is this, what pressure is behind it,
 *                 and is anybody in danger. `intent.classify()`. Regex and a
 *                 table. **Zero tokens**, and it must stay that way: crisis
 *                 routing is the one thing that has to work when the account
 *                 is empty, the network is down and the provider is 500ing.
 *                 A crisis path that costs money is a crisis path that fails
 *                 exactly when somebody needs it.
 *
 *   2. SOMATIC  — where it sits in the body. Also `intent.classify()`, which
 *                 reads the word they used, and then `tactics` gates the
 *                 somatic family behind it. **Zero tokens.** Asking a model to
 *                 map a sentence to HEAD/THROAT/CHEST/MID is paying for a
 *                 lookup — and worse, inventing a body part they never named,
 *                 which is the one thing the somatic gate exists to prevent.
 *
 *   3. MEMORY   — what they have said before. `memory.selectMemory()` over
 *                 rows the store already holds, filtered to vents and capped
 *                 at six turns. **Zero tokens.** Semantic recall over the
 *                 `memories` table (0006, pgvector) costs one embedding call
 *                 on the surfaces that use it, which is why it is listed at
 *                 its real price rather than as free.
 *
 *   4. WEAVER   — the only stage that speaks. One call, through the provider
 *                 chain, with a tactic chosen and the memory already in the
 *                 prompt. **One paid call per real vent, and never more.**
 *
 * That is the credit policy stated as a pipeline instead of as a paragraph,
 * and check 19 asserts it: if a stage marked free ever acquires a model call,
 * the build fails. `CLAUDE.md` says a change to the free paths that needs a
 * model call is a change that is wrong — this is where a script can finally
 * say so.
 */

export type StageCost = "free" | "one-embedding" | "one-completion";

export interface Stage {
  id: "intake" | "somatic" | "memory" | "weaver";
  /** What it decides. */
  does: string;
  /** The module that actually does it — imported, not described. */
  implementation: (...args: never[]) => unknown;
  cost: StageCost;
}

/**
 * The pipeline, as data.
 *
 * `implementation` holds the real function rather than its name, so this
 * cannot drift into describing a module that was deleted or renamed: a wrong
 * entry is a type error, not a stale comment.
 */
export const PIPELINE: readonly Stage[] = [
  {
    id: "intake",
    does: "intent, language, real-world pressure, and whether this is a crisis",
    implementation: classify,
    cost: "free",
  },
  {
    id: "somatic",
    does: "the body part they named, which gates every somatic tactic",
    implementation: classify,
    cost: "free",
  },
  {
    id: "memory",
    does: "their own words from earlier, vents only, six turns",
    implementation: selectMemory,
    cost: "free",
  },
  {
    id: "weaver",
    does: "the reply, with the tactic already chosen",
    implementation: generateReply,
    cost: "one-completion",
  },
] as const;

/** Stages that must never make a model call. The list check 19 enforces. */
export const FREE_STAGES = PIPELINE.filter((s) => s.cost === "free").map((s) => s.id);

/**
 * How many paid calls one message can possibly cost.
 *
 * One, or zero. Crisis, factual, greeting and meta never reach the weaver at
 * all, so most messages here cost nothing — which is the reason this product
 * can be free to the person using it.
 */
export const MAX_COMPLETIONS_PER_MESSAGE = PIPELINE.filter(
  (s) => s.cost === "one-completion",
).length;

/** For `/api/health`, so the pipeline is inspectable rather than asserted. */
export function describePipeline() {
  return {
    stages: PIPELINE.map((s) => ({ stage: s.id, does: s.does, cost: s.cost })),
    maxCompletionsPerMessage: MAX_COMPLETIONS_PER_MESSAGE,
    weaverModel: VENT_MODEL,
  };
}

// `selectTactic` sits between memory and the weaver and costs nothing either;
// it is not a stage because it makes no call and reads no store — it is a sort
// over a table. Named here so its absence above is a decision rather than an
// oversight.
export { selectTactic };
