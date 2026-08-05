import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { classifyModelError, type ModelVerdict } from "./model";

/**
 * More than one way to answer, so one empty account cannot silence the room.
 *
 * A single provider means a single point of failure, and this product's whole
 * proposition is that somebody in a bad moment gets an answer. An empty credit
 * balance took the chatbot down for a week; a chain would have carried it.
 *
 * Nearly every provider worth having speaks the OpenAI request shape — Gemini,
 * Groq, OpenRouter, Cerebras, DeepSeek, Together, Mistral, a local Ollama — so
 * one adapter covers all of them and adding another is four lines in the table
 * below. Anthropic has its own shape and its own SDK, so it gets its own.
 *
 * Order is deliberate and overridable with VENT_PROVIDER_ORDER. A provider
 * with no key is skipped, never attempted, never reported as broken.
 */

export interface ProviderCall {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
}

export interface Provider {
  /** Stable id — appears in /api/health and in the vent response. */
  id: string;
  /** The model this provider will use, after env overrides. */
  model: string;
  configured: boolean;
  send: (call: ProviderCall) => Promise<string>;
}

/**
 * Default model ids, each overridable by env.
 *
 * They are defaults, not promises: a provider renames a model eventually and
 * nothing here can know when. That is exactly why /api/health probes each one
 * and prints the upstream message — a stale default shows up as
 * `model_not_found` naming the id, which is a two-minute fix instead of a
 * week of guessing. It has already cost this project a week once.
 */
const MODEL = {
  anthropic: process.env.VENT_MODEL_ANTHROPIC || "claude-sonnet-5",
  gemini: process.env.VENT_MODEL_GEMINI || "gemini-2.5-flash",
  groq: process.env.VENT_MODEL_GROQ || "llama-3.3-70b-versatile",
  openrouter: process.env.VENT_MODEL_OPENROUTER || "meta-llama/llama-3.3-70b-instruct:free",
  cerebras: process.env.VENT_MODEL_CEREBRAS || "llama-3.3-70b",
};

/**
 * Errors carry the upstream status so one classifier reads every provider.
 *
 * Written without a parameter property on purpose: Node's type stripping
 * rejects those, and the eval suite loads this module directly.
 */
class ProviderError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

/**
 * Model ids resolved at runtime, keyed by provider.
 *
 * A hardcoded id is a guess with a shelf life. `claude-sonnet-5-20250715` did
 * not exist and `gemini-2.5-flash` was retired for new accounts — two dead
 * ends, both discovered by a person in production rather than by anything
 * here. Providers publish what they have; asking beats guessing.
 */
const resolved: Record<string, string> = {};

/**
 * Headroom for models that think before they speak.
 *
 * The reply itself is three or four sentences — a couple of hundred tokens at
 * most. The rest of this is the reasoning budget a Gemini-class model spends
 * silently first, and `reasoning_effort: "none"` is not honoured everywhere.
 * Unused headroom costs nothing; too little costs somebody an answer.
 */
const THINKING_BUDGET = 1400;

/**
 * Ask the provider what it actually offers, and pick the best chat model.
 *
 * Preference is by keyword, then by version number, with previews and "lite"
 * variants ranked below a stable full model. Anything that plainly is not a
 * chat model is dropped — an embedding model would answer nobody.
 */
async function discoverModel(
  baseUrl: string,
  apiKey: string,
  prefer: string[],
): Promise<string | null> {
  const r = await fetch(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) return null;

  let body: { data?: Array<{ id?: string }> };
  try {
    body = JSON.parse(await r.text());
  } catch {
    return null;
  }

  const chat = (body.data ?? [])
    .map((m) => (m.id ?? "").replace(/^models\//, ""))
    .filter(Boolean)
    .filter((id) => !/embed|aqa|imagen|veo|tts|whisper|guard|rerank|vision/i.test(id));

  const score = (id: string) => {
    const version = parseFloat(id.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "0");
    let s = version * 100;
    if (/lite|mini|8b/i.test(id)) s -= 30;
    if (/preview|exp|beta/i.test(id)) s -= 20;
    return s;
  };

  for (const keyword of prefer) {
    const hits = chat.filter((id) => id.toLowerCase().includes(keyword));
    if (hits.length) return hits.sort((a, b) => score(b) - score(a))[0];
  }
  return chat.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * One adapter for every OpenAI-shaped API. The system prompt becomes the first
 * message because that is how they all take it.
 */
function openAiCompatible(
  id: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  prefer: string[] = ["flash", "chat", "instruct"],
  /** Ask a reasoning model not to think. See THINKING_BUDGET. */
  noThinking = false,
): Provider {
  const attempt = async (
    useModel: string,
    { system, messages, maxTokens }: ProviderCall,
  ): Promise<string> => {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: useModel,
          // A reasoning model spends the budget on thinking before it says a
          // word. At 220 it thought for 217 and shipped "Tired. Na" — a
          // fragment in front of somebody who had just said they were tired.
          // Ask it not to think, and leave room in case it does anyway.
          max_tokens: Math.max(maxTokens, THINKING_BUDGET),
          temperature: 0.7,
          ...(noThinking ? { reasoning_effort: "none" } : {}),
          messages: [{ role: "system", content: system }, ...messages],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const body = await r.text();
      if (!r.ok) throw new ProviderError(r.status, `${r.status} ${body.slice(0, 300)}`);

      let parsed: {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new ProviderError(502, `${id} returned a body that is not JSON`);
      }

      const choice = parsed.choices?.[0];
      const text = choice?.message?.content?.trim();
      // An empty completion is a failure, not an answer. Returning "" here
      // would put a blank bubble in front of somebody mid-sentence.
      if (!text) throw new ProviderError(502, `${id} returned an empty completion`);

      // Neither is half a sentence. A reply cut off at the budget is the
      // model being interrupted, and showing the stub is worse than saying
      // plainly that it could not answer.
      if (choice?.finish_reason === "length" && text.split(/\s+/).length < 12) {
        throw new ProviderError(
          502,
          `${id} was cut off before it finished a sentence (${text.length} chars)`,
        );
      }
      return text;
  };

  return {
    id,
    get model() {
      return resolved[id] ?? model;
    },
    configured: Boolean(apiKey),
    async send(call) {
      try {
        return await attempt(resolved[id] ?? model, call);
      } catch (error) {
        // A retired or renamed model is the one failure worth a second try,
        // because the provider can be asked which ones it still has. Anything
        // else — rate limit, quota, auth — retrying would only repeat.
        const status = (error as { status?: number }).status;
        if (status !== 404 && status !== 400) throw error;

        const found = await discoverModel(baseUrl, apiKey, prefer);
        if (!found || found === (resolved[id] ?? model)) throw error;

        console.warn(`[providers] ${id}: ${resolved[id] ?? model} rejected, using ${found}`);
        resolved[id] = found;
        return attempt(found, call);
      }
    },
  };
}

function anthropicProvider(): Provider {
  const apiKey = env.anthropicApiKey;
  return {
    id: "anthropic",
    model: MODEL.anthropic,
    configured: Boolean(apiKey),
    async send({ system, messages, maxTokens }) {
      const client = new Anthropic({ apiKey });
      const completion = await client.messages.create({
        model: MODEL.anthropic,
        max_tokens: maxTokens,
        temperature: 0.7,
        system,
        messages,
      });
      const text = completion.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text) throw new ProviderError(502, "anthropic returned an empty completion");
      return text;
    },
  };
}

/** Every provider this build knows, configured or not, in default order. */
export function allProviders(): Provider[] {
  const table: Provider[] = [
    anthropicProvider(),
    openAiCompatible(
      "gemini",
      "https://generativelanguage.googleapis.com/v1beta/openai",
      env.geminiApiKey,
      MODEL.gemini,
      ["flash", "gemini"],
      true,
    ),
    openAiCompatible("groq", "https://api.groq.com/openai/v1", env.groqApiKey, MODEL.groq, [
      "llama-3.3",
      "llama",
    ]),
    openAiCompatible(
      "openrouter",
      "https://openrouter.ai/api/v1",
      env.openrouterApiKey,
      MODEL.openrouter,
    ),
    openAiCompatible(
      "cerebras",
      "https://api.cerebras.ai/v1",
      env.cerebrasApiKey,
      MODEL.cerebras,
    ),
  ];

  const order = (process.env.VENT_PROVIDER_ORDER || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!order.length) return table;

  // Named ones first in the order given; anything unnamed keeps its place after.
  const named = order.map((id) => table.find((p) => p.id === id)).filter(Boolean) as Provider[];
  return [...named, ...table.filter((p) => !order.includes(p.id))];
}

/** Only the ones that could actually answer. */
export function configuredProviders(): Provider[] {
  return allProviders().filter((p) => p.configured);
}

export interface Answered {
  text: string;
  provider: string;
  model: string;
  /** Providers that were tried and failed before this one answered. */
  fellThrough: Array<{ provider: string; status: ModelVerdict["status"] }>;
}

/**
 * Walk the chain until one answers.
 *
 * A provider that is rate-limited, out of credit or down is a reason to try
 * the next one, not a reason to tell somebody their words could not be heard.
 * If every configured provider fails, the last verdict is thrown so the route
 * still names a real cause rather than a guess.
 */
export async function generateReply(call: ProviderCall): Promise<Answered> {
  const providers = configuredProviders();
  if (!providers.length) throw new ProviderError(401, "no provider configured");

  const fellThrough: Answered["fellThrough"] = [];
  let last: unknown = new ProviderError(502, "no provider attempted");

  for (const p of providers) {
    try {
      const text = await p.send(call);
      return { text, provider: p.id, model: p.model, fellThrough };
    } catch (error) {
      last = error;
      fellThrough.push({ provider: p.id, status: classifyModelError(error).status });
    }
  }
  throw last;
}
