import "server-only";
import { env } from "@/lib/env";

/**
 * Embeddings, for the half of memory that is about meaning rather than recency.
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
      console.error("[embeddings] upstream said no", r.status, (await r.text()).slice(0, 200));
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
    console.error("[embeddings] unreachable", error);
    return null;
  }
}

/** pgvector's text form. `[0.1,0.2,...]` — not JSON, no spaces. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
