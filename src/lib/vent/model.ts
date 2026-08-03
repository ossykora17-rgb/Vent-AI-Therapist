import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, isAnthropicConfigured } from "@/lib/env";

/**
 * The model, and the truth about whether it actually answers.
 *
 * `/api/health` reported `anthropic: true` for "the env var is set" — the
 * same flaw the database check was built to avoid, left in place one field
 * over. A key that is present and rejected looked identical to a key that
 * works, so the only symptom was every vent coming back "Network dipped on
 * my side", which names a cause that may have nothing to do with it.
 *
 * A wrong key, a wrong model id, a rate limit and a real network fault need
 * four different fixes. Collapsing them into one sentence sends you looking
 * in the wrong place — the same reason /api/health separates `misconfigured`
 * from `unreachable`.
 */
export const VENT_MODEL = "claude-sonnet-5";
export const MAX_TOKENS = 220;

export type ModelStatus =
  | "ok"
  | "not_configured"
  | "unauthorized"
  | "model_not_found"
  | "rate_limited"
  | "unreachable";

export interface ModelVerdict {
  status: ModelStatus;
  /** The upstream message, truncated. The fastest route to the real cause. */
  detail: string | null;
}

/**
 * Read an SDK throw by its HTTP status rather than its class, so a change in
 * how the SDK packages errors cannot silently turn every fault into
 * "unreachable".
 */
export function classifyModelError(error: unknown): ModelVerdict {
  const e = error as { status?: number; message?: string };
  const message = typeof e?.message === "string" ? e.message : "";
  const detail = message ? message.slice(0, 300) : null;

  // A rejected model id arrives as 404 on some paths and 400 on others; the
  // message names the model either way.
  if (e?.status === 404 || (e?.status === 400 && /model/i.test(message))) {
    return { status: "model_not_found", detail };
  }
  if (e?.status === 401 || e?.status === 403) return { status: "unauthorized", detail };
  if (e?.status === 429) return { status: "rate_limited", detail };
  return { status: "unreachable", detail };
}

/**
 * Zero-token probe. `models.retrieve` is a metadata read, not an inference
 * call, so health can ask "does this key work, and does this exact model
 * exist for it" without spending anything. It checks VENT_MODEL itself —
 * checking some other model would answer a question nobody asked.
 */
export async function probeModel(): Promise<ModelVerdict> {
  if (!isAnthropicConfigured) return { status: "not_configured", detail: null };
  try {
    const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
    await anthropic.models.retrieve(VENT_MODEL);
    return { status: "ok", detail: null };
  } catch (error) {
    return classifyModelError(error);
  }
}

/**
 * What to say to the person when the model does not answer.
 *
 * "Say that again" is only true when saying it again could work. A rejected
 * key or a missing model is not transient, and inviting a retry that cannot
 * succeed is a promise the code cannot keep.
 */
export function modelFailureReply(status: ModelStatus): string {
  switch (status) {
    case "rate_limited":
      return "Too many at once on my side. Give it a minute, then say that again.";
    case "unauthorized":
    case "model_not_found":
      return "My side is set up wrong — not busy, wrong. Saying it again won't get through, and that's on the setup, not on you.";
    default:
      return "Network dipped on my side. Say that again.";
  }
}
