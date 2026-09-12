import "server-only";
import { errorKind } from "@/lib/errors";
import { env } from "@/lib/env";

/**
 * Embeddings, for the half of memory that is about meaning rather than recency.
 *
 * **NOTHING IMPORTS THIS FILE.** Read the next four paragraphs before you
 * become the first thing that does.
 *
 * Zero dependencies — one fetch to Gemini's embedding endpoint, which is on
 * the same free key the chain already uses. Anthropic has no embedding API and
 * Groq has none either, so this is deliberately single-provider rather than
 * pretending the fallback chain applies.
 *
 * Everything here fails soft. An embedding that does not come back means the
 * memory is stored without one and is still readable, listable and deletable —
 * it simply will not be found by similarity until it is re-embedded. A vent
 * must never fail because a vector service was slow.
 *
 * WHAT WIRING IT COSTS, WHICH IS NOT WHAT THE REPOSITORY USED TO SAY
 *
 * `orchestrator.ts` described the MEMORY stage as costing "one embedding call
 * on the surfaces that use it", and `CLAUDE.md` called this "the one request
 * here that sends somebody's words to a third party to be vectorised" — in the
 * present tense, in a paragraph about a real leak. Both read as an approved,
 * existing path. There is no such path and there never has been: memory is
 * `selectMemory()` over six stored turns, free, and the doc comment on `embed`
 * below says "the caller stores what it has" about a caller that does not
 * exist.
 *
 * The destination is the problem, not this file. `memories.user_id` is
 * `uuid not null references auth.users(id) on delete cascade` (0006), and
 * every RLS policy on the table is `auth.uid() = user_id`. Anonymous venters
 * are not in that id space — which is the entire finding of 0011, where the
 * carve was moved to `vent_users.carve` for exactly this reason. So calling
 * `embed()` and inserting the result today buys one Gemini call per vent and
 * a foreign-key rejection per vent, for ever, silently: the per-message cost
 * doubles and not one row lands.
 *
 * Wiring it therefore means a migration first, and the pipeline pricing it
 * second. Check 127 will fail the build until both happen — see `UNPAID_COSTS`
 * in `orchestrator.ts`. That is not an obstacle to the feature; it is the
 * feature's first two steps, written down where the next person will be
 * standing.
 */

/** Must match the `vector(768)` column in 0006_memory_vectors.sql. */
export const EMBED_DIMS = 768;

const EMBED_MODEL = process.env.VENT_EMBED_MODEL || "text-embedding-004";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const isEmbeddingConfigured = () => Boolean(env.geminiApiKey);

/**
 * One vector for one piece of text, or null.
 *
 * Null is a first-class answer here, exactly as it is for the outside-world
 * sources: the caller stores what it has and says nothing it cannot back up.
 */
export async function embed(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed || !env.geminiApiKey) return null;

  try {
    const r = await fetch(
      `${ENDPOINT}/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(env.geminiApiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: trimmed.slice(0, 8000) }] },
          outputDimensionality: EMBED_DIMS,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!r.ok) {
      /*
        The status, and not the body.

        This logged 200 characters of the response, on the one request in this
        product that sends somebody's vent to a third party for the express
        purpose of turning it into a vector. Nothing tells us what a provider
        puts in a validation error, and several echo the input they refused.
        stdout has no delete button, so the safe assumption about an
        uncontrolled upstream string is the only assumption available.
      */
      console.error("[embeddings] upstream said no", r.status);
      return null;
    }

    const body = (await r.json()) as { embedding?: { values?: number[] } };
    const values = body.embedding?.values;

    // A vector of the wrong width would be rejected by Postgres anyway, and
    // the error there would name the column rather than the cause. Catch it
    // where the cause is obvious.
    if (!Array.isArray(values) || values.length !== EMBED_DIMS) {
      console.error("[embeddings] expected", EMBED_DIMS, "dims, got", values?.length);
      return null;
    }
    return values;
  } catch (error) {
    console.error("[embeddings] unreachable", errorKind(error));
    return null;
  }
}

/** pgvector's text form. `[0.1,0.2,...]` — not JSON, no spaces. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
