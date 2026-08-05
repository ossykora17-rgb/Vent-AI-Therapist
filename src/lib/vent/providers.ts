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
 * One adapter for every OpenAI-shaped API. The system prompt becomes the first
 * message because that is how they all take it.
 */
function openAiCompatible(
  id: string,
  baseUrl: string,
  apiKey: string,
  model: string,
): Provider {
  return {
    id,
    model,
    configured: Boolean(apiKey),
    async send({ system, messages, maxTokens }) {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.7,
          messages: [{ role: "system", content: system }, ...messages],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const body = await r.text();
      if (!r.ok) throw new ProviderError(r.status, `${r.status} ${body.slice(0, 300)}`);

      let parsed: { choices?: Array<{ message?: { content?: string } }> };
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new ProviderError(502, `${id} returned a body that is not JSON`);
      }

      const text = parsed.choices?.[0]?.message?.content?.trim();
      // An empty completion is a failure, not an answer. Returning "" here
      // would put a blank bubble in front of somebody mid-sentence.
      if (!text) throw new ProviderError(502, `${id} returned an empty completion`);
      return text;
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
    ),
    openAiCompatible("groq", "https://api.groq.com/openai/v1", env.groqApiKey, MODEL.groq),
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
