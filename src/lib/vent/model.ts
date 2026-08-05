import "server-only";
import { env } from "@/lib/env";

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
// Not a dated snapshot id. `claude-sonnet-5-20250715` was tried in production
// and Anthropic answered 404 not_found_error, naming the model — the probe in
// this file is what caught it. The unsuffixed id is the one that resolves.
export const VENT_MODEL = "claude-sonnet-5";
export const MAX_TOKENS = 220;

export type ModelStatus =
  | "ok"
  | "not_configured"
  | "unauthorized"
  | "model_not_found"
  | "rate_limited"
  | "insufficient_credit"
  | "upstream_down"
  | "timeout"
  | "unreachable";

export interface ModelVerdict {
  status: ModelStatus;
  /** The upstream message, truncated. The fastest route to the real cause. */
  detail: string | null;
  /** Only set when something is wrong. Never the key — only its shape. */
  keyShape?: KeyShape;
}

export type KeyShape = "ok" | "unexpected_prefix" | "short" | "absent";

/**
 * The shape of the key, never the key.
 *
 * `authentication_error` is the same answer for two very different mistakes:
 * a well-formed key that has been revoked or belongs to another workspace,
 * and a value that was never an Anthropic key at all — the wrong secret, or
 * one truncated by a copy that stopped early. They send you to different
 * places, so the health block distinguishes them.
 *
 * This reports a classification only. `/api/health` is public; nothing here
 * echoes any part of the secret.
 */
export function anthropicKeyShape(): KeyShape {
  const key = env.anthropicApiKey;
  if (!key) return "absent";
  if (!key.startsWith("sk-ant-")) return "unexpected_prefix";
  if (key.length < 40) return "short";
  return "ok";
}

/**
 * Read an SDK throw by its HTTP status rather than its class, so a change in
 * how the SDK packages errors cannot silently turn every fault into
 * "unreachable".
 */
export function classifyModelError(error: unknown): ModelVerdict {
  const e = error as { status?: number; message?: string; name?: string };
  const message = typeof e?.message === "string" ? e.message : "";
  // A thrown value with no message at all left `detail: null`, which is how
  // "unreachable" became a bucket with nothing in it — the same crime as
  // "Network dipped on my side". Always carry something back.
  const detail = message ? message.slice(0, 300) : (e?.name ?? String(error)).slice(0, 300);

  // AbortSignal.timeout throws a TimeoutError with no HTTP status, so it fell
  // to the default and was reported as unreachable. A clock and a network are
  // different problems: one is a number in this file, the other is not.
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return { status: "timeout", detail };
  }

  // Billing arrives as a 400 invalid_request_error and says so in words. It
  // is not a bad request, not a network fault, and no code change fixes it —
  // and it is invisible to a metadata read, which is how it hid for a week.
  if (/credit balance|purchase credits|plans & billing/i.test(message)) {
    return { status: "insufficient_credit", detail };
  }

  // A rejected model id arrives as 404 on some paths and 400 on others; the
  // message names the model either way.
  if (e?.status === 404 || (e?.status === 400 && /model/i.test(message))) {
    return { status: "model_not_found", detail };
  }
  if (e?.status === 401 || e?.status === 403) return { status: "unauthorized", detail };
  if (e?.status === 429) return { status: "rate_limited", detail };
  // 529 is Anthropic overloaded; any 5xx is their side, not the network. Calling
  // that "network dipped" sends somebody to check their wifi for an hour.
  if (typeof e?.status === "number" && e.status >= 500) {
    return { status: "upstream_down", detail };
  }
  return { status: "unreachable", detail };
}

/**
 * Probe the path the product actually uses.
 *
 * This called `models.retrieve` — a metadata read — and reported `ok` for a
 * week while every real vent failed, because metadata needs no credit and
 * inference does. A check that exercises a different shape than the product
 * is worse than no check: it is a green light over a broken road.
 *
 * So it is a real `messages.create` now, one token in and one out, cached for
 * a minute so a public endpoint cannot be used to spend an account down. That
 * is the smallest call that proves the key, the model id, the account's
 * credit and the network in one answer.
 */
export async function probeModel(): Promise<ModelVerdict> {
  const { configuredProviders, probeChain } = await import("./providers");
  if (!configuredProviders().length) return { status: "not_configured", detail: null };
  try {
    // The whole chain, because that is what a vent does. Probing only the
    // first reported "degraded" while the chatbot was working on the second.
    const { answered, lastError } = await probeChain();
    if (answered) return { status: "ok", detail: null };
    throw lastError;
  } catch (error) {
    // The shape is only worth reporting when the call failed — it is a hint
    // about where to look, not a verdict of its own. A key can be perfectly
    // shaped and still revoked.
    return { ...classifyModelError(error), keyShape: anthropicKeyShape() };
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
    case "insufficient_credit":
      return "The account behind me is out of credit. Not you, not your words — somebody has to top it up before I can go deep.";
    case "upstream_down":
      return "The model is down on its own side, not yours. Give it a minute and say that again.";
    case "timeout":
      return "That took too long on my side and I cut it off. Say it again — it usually lands.";
    case "unauthorized":
    case "model_not_found":
      return "My side is set up wrong — not busy, wrong. Saying it again won't get through, and that's on the setup, not on you.";
    default:
      return "Network dipped on my side. Say that again.";
  }
}
