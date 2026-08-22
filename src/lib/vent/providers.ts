import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { classifyModelError, wasCutOff, type ModelVerdict } from "./model";

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

/**
 * The default a call gets when its caller does not name one.
 *
 * Exported so a route can be checked against it rather than against a number
 * somebody remembered — see check 64.
 */
export const PROVIDER_DEADLINE_MS = 50_000;

export interface ProviderCall {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  /**
   * How much brain this message earns, from `depthFor` in `./depth`.
   *
   * Reorders the chain rather than swapping models inside a provider: the
   * failover, the dead-provider skipping and the discovery logic are all
   * unchanged, and a fast turn simply starts at the cheap end. Omitted means
   * `deep`, so nothing that forgets to pass it silently gets downgraded — the
   * default has to be the expensive, safe one.
   */
  depth?: "fast" | "deep";
  /**
   * How long this particular call may take, in milliseconds.
   *
   * Defaulted rather than fixed, because a deadline is a property of the
   * caller and this file had it as a property of the adapter. `/api/carve`
   * declared `maxDuration = 30` — deliberately, it is background work and
   * check 22 holds it to that — while every call it made was permitted fifty
   * seconds. So the platform killed the function before the code could fail:
   * no classifier, no fallthrough, no log line, and a session quietly not
   * remembered.
   *
   * The rule is arithmetic: a call may not outlast the route that makes it.
   */
  deadlineMs?: number;

  /**
   * Where to put words as they arrive, when somebody is waiting on them.
   *
   * Absent means what this file has always done: one request, one string, at
   * the end. Present means the adapter asks the provider to stream and hands
   * each fragment over the moment it lands.
   *
   * The reason is not novelty. A vent reply is four sentences and the chain
   * spends two to eight seconds producing them, during which the person who
   * has just typed the hardest thing they will type today watches the word
   * "Thinking". That silence is the longest part of this product's experience
   * and it was the part nothing had ever been done about.
   *
   * What it must never become is a promise. The fragments are a preview: the
   * return value of `send` is still the answer, still passes `wasCutOff`,
   * still falls through to the next provider on failure. Everything a caller
   * *commits to* comes from the resolved string, never from what was streamed
   * — because a stream that dies at the third sentence has shown somebody
   * three sentences that this file is about to refuse.
   */
  onDelta?: (chunk: string) => void;
  /**
   * Throw away everything streamed so far.
   *
   * Called when a provider fails after it had begun speaking and the chain
   * moves to the next one. Without it the second provider's answer would be
   * appended to the first one's abandoned half-sentence, which is the failure
   * mode of every naive streaming fallback: two voices, spliced, neither of
   * them the answer.
   */
  onRestart?: () => void;
}

export interface Provider {
  /** Stable id — appears in /api/health and in the vent response. */
  id: string;
  /** The model this provider will use, after env overrides. */
  model: string;
  configured: boolean;
  /**
   * Why it is not configured, when it is not.
   *
   * `configured: false` is a failure bucket with nothing in it. Production
   * reported openrouter unconfigured while the dashboard plainly showed
   * OPENROUTER_API_KEY set for Production — and there was no way, from the
   * outside, to tell apart the three things that produce that same false:
   *
   *   missing  the variable does not exist in this runtime at all — wrong
   *            name, wrong project, wrong environment, or never redeployed
   *   blank    it exists and its value is empty or whitespace, which is what
   *            saving the field without pasting into it leaves behind
   *   present  it is there and this is not the problem
   *
   * Never the value, never a prefix, never a length. Those three words are
   * the whole answer and none of them leaks a secret.
   */
  keyState: "missing" | "blank" | "present";
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
/* Exported so nothing else keeps a second copy of a model id. The last two
   hardcoded strings in this repo were both models that did not exist. */
export const MODEL = {
  anthropic: process.env.VENT_MODEL_ANTHROPIC || "claude-sonnet-5",
  // An alias, not a snapshot. The comment sixty lines down already recorded
  // that `gemini-2.5-flash` was retired for new accounts — and the default
  // stayed pointed at it anyway, so every cold start spent a 404 and a
  // discovery round-trip to learn what the file already knew. A default that
  // contradicts its own postmortem is not a default, it is a note nobody read.
  gemini: process.env.VENT_MODEL_GEMINI || "gemini-flash-latest",
  groq: process.env.VENT_MODEL_GROQ || "llama-3.3-70b-versatile",
  openrouter: process.env.VENT_MODEL_OPENROUTER || "meta-llama/llama-3.3-70b-instruct:free",
  cerebras: process.env.VENT_MODEL_CEREBRAS || "llama-3.3-70b",
  /*
    `deepseek-chat` (V3), not `deepseek-reasoner` (R1).

    R1 thinks before it speaks, and this file already has a scar from that:
    220 tokens of budget, 217 spent deliberating, three tokens of "Tired. Na"
    handed to somebody who had just written that they were tired. The
    reasoning variant would be the better model on a benchmark and the worse
    one in a room.
  */
  deepseek: process.env.VENT_MODEL_DEEPSEEK || "deepseek-chat",
  /*
    GLM-4-Flash. Free, not cheap — the distinction that matters here.

    DeepSeek bills per token once the signup credit runs out; this one is
    published as free on Zhipu's open platform. For a product being run with
    no money at all, "free" and "cheap" are different categories, and the
    chain should reach the free one first.
  */
  zhipu: process.env.VENT_MODEL_ZHIPU || "glm-4-flash",
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
 * Providers to stop trying for a while, and why.
 *
 * An empty credit balance is not a blip — it stays empty until somebody pays.
 * With Anthropic first in the chain and out of credit, every single message
 * paid a full round-trip to be refused before Gemini was even asked. That is
 * latency a person feels, on every turn, for an answer nobody could give.
 *
 * A rate limit is different and deliberately not here: it clears on its own,
 * often within a minute, and refusing to try would throw away a provider that
 * is about to work again.
 */
const DEAD_FOR_MS = 10 * 60 * 1000;
const dead = new Map<string, { until: number; why: string }>();

const NON_TRANSIENT = new Set(["unauthorized", "insufficient_credit", "model_not_found"]);

function isDead(id: string): boolean {
  const entry = dead.get(id);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    dead.delete(id);
    return false;
  }
  return true;
}

/** For /api/health — what is being skipped, and why, without probing it. */
export function skipped(): Array<{ provider: string; why: string; secondsLeft: number }> {
  const now = Date.now();
  return [...dead.entries()]
    .filter(([, e]) => e.until > now)
    .map(([provider, e]) => ({
      provider,
      why: e.why,
      secondsLeft: Math.round((e.until - now) / 1000),
    }));
}

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

  /*
    Rank by version, and a parameter count is not a version.

    `parseFloat(id.match(/(\d+(?:\.\d+)?)/))` takes the first number in the
    id, and in half of all model names the first number is the size. So
    `openai/gpt-oss-120b` scored 12000 and `llama-3.3-70b-versatile` scored
    330, and the biggest model on the account won every fallback by a factor
    of forty — not because it was newer, because "120b" was read as version
    one hundred and twenty.

    That is exactly how production came to be answering vents on a reasoning
    model nobody chose. Groq retired llama-3.3, the prefer list stopped
    matching, the fallback ran, and the arithmetic handed it the largest
    number in the room.

    Sizes are stripped first — `120b`, `70b`, `8x7b`, `4b` — and what is left
    is the version if there is one. A model with no version scores zero and
    ranks below any model with one, which is the correct order: `gpt-oss` and
    `llama-3.3` are not comparable on a number, and when there is nothing to
    compare, the named preference above has already had its say.
  */
  const score = (id: string) => {
    const withoutSize = id.replace(/\b\d+x?\d*\.?\d*\s*b\b/gi, " ");
    const version = parseFloat(withoutSize.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "0");
    let s = version * 100;
    if (/lite|mini|8b|tiny|small/i.test(id)) s -= 30;
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
 *
 * Exported so the eval suite can build one against a stubbed fetch. Every
 * failure that reached a real person this week — a retired model id, a reply
 * truncated mid-sentence, an empty completion, a rate limit — happened in a
 * shape no check ever ran. They run here now.
 */
/**
 * Read an OpenAI-shaped event stream, handing each fragment on as it lands.
 *
 * One reader for six providers, because the wire format is the one thing they
 * genuinely all agree on: `data: {json}` per event, a blank line between,
 * `data: [DONE]` at the end.
 *
 * Three details that are not obvious and each of which produces a bug:
 *
 * A chunk boundary is a network artefact, not a message boundary. TCP will
 * split `data: {"choi` from `ces":[...]}` and a reader that parses per chunk
 * throws on perfectly good JSON. Hence the carry buffer: only complete lines
 * are parsed, and whatever is left over waits for the next read.
 *
 * A malformed event is skipped, not fatal. Providers interleave keep-alive
 * comments and usage records into the same stream, and taking the whole reply
 * down because one line was not the shape expected would be the strictest
 * possible reading of the least important part.
 *
 * And `finish_reason` arrives on its own event, after the last content — so it
 * is captured across the loop rather than read off the final frame. That is
 * the field `wasCutOff` needs, and a stream that loses it silently disables
 * the guard that exists because somebody was handed half a sentence.
 */
async function readSse(
  id: string,
  r: Response,
  onDelta: (chunk: string) => void,
): Promise<{ text: string; finishReason?: string }> {
  const body = r.body;
  if (!body) throw new ProviderError(502, `${id} streamed no body`);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let text = "";
  let finishReason: string | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });

    const lines = carry.split("\n");
    // The last element is either an incomplete line or an empty string; both
    // belong to the next read.
    carry = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let event: {
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      const choice = event.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const piece = choice?.delta?.content;
      if (piece) {
        text += piece;
        onDelta(piece);
      }
    }
  }

  return { text, finishReason };
}

/**
 * Does this model think before it speaks?
 *
 * `noThinking` is a constructor argument — decided once, by whoever wrote the
 * provider table, about the model that was current then. The model is not
 * decided then. `discoverModel` replaces it at runtime whenever a default is
 * retired, and it has no notion of what kind of model it is picking.
 *
 * Which is how production ended up here: groq was registered with the hint
 * off, because `llama-3.3-70b-versatile` answers immediately and has nothing
 * to deliberate about. Groq retired it, discovery substituted
 * `openai/gpt-oss-120b` — a reasoning model — and the request kept being
 * built for the model that was written down rather than the one being called.
 *
 * That is this repo's oldest habit turned inward: a decision correct from
 * where the author sat, wrong from where the request sat. The scar it points
 * at is the sharpest one in the file — `max_tokens: 220`, 217 spent thinking,
 * three tokens of "Tired. Na" handed to somebody who had just written that
 * they were tired. The ceiling is 600 now, so the same substitution costs
 * money and latency rather than a mutilated sentence, and it is the same
 * mistake either way.
 *
 * So the hint follows the model. Matched on family rather than on exact ids,
 * because an exact list is a list that goes stale — which is the thing that
 * caused this.
 *
 * Asking a model that does not reason not to reason is free: the parameter is
 * ignored, and when it is rejected outright the adapter already retries once
 * without it and remembers. There is no cost to being wrong in this
 * direction, and a truncated reply is the cost of being wrong in the other.
 */
const REASONS_FIRST =
  /gpt-oss|(?:^|[^a-z])o[1-4](?:[^a-z]|$)|reasoner|qwq|qwen3|magistral|thinking|deepseek-r|glm-4\.[56]|grok-.*mini/i;

export function thinksFirst(model: string): boolean {
  return REASONS_FIRST.test(model);
}

export function openAiCompatible(
  id: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  /** The env var this key came from, so a false can say which kind. */
  keyVar: string,
  prefer: string[] = ["flash", "chat", "instruct"],
  /** Ask a reasoning model not to think. See THINKING_BUDGET. */
  noThinking = false,
): Provider {
  /*
    Whether this provider tolerates the thinking hint.

    Per provider, remembered for the life of the process. The first 400 turns
    it off and every call after that skips straight to the request that works,
    so the fallback costs one wasted round trip ever rather than one per
    message.
  */
  let hintRejected = false;

  const attempt = async (
    useModel: string,
    call: ProviderCall,
    /*
      An optional tuning parameter must never be why a provider is unusable.

      `reasoning_effort: "none"` is how a reasoning model is asked to answer
      rather than deliberate — it exists because one shipped "Tired. Na" after
      spending 217 tokens thinking. The comment on THINKING_BUDGET already
      said it "is not honoured everywhere", and the assumption underneath that
      was: not honoured means ignored.

      It does not mean ignored. Google's OpenAI-compatible layer *rejects* the
      value outright — `400 INVALID_ARGUMENT`, no field named — so a hint
      meant to improve one answer was instead taking a whole free provider out
      of the chain on every single message. Production showed gemini
      "unreachable" with a 400 while the key was valid and the model was fine.

      So: send it, and if the request comes back 400 while it was attached,
      send the same request again without it. Optional means optional.
    */
    /*
      Defaulted from the model in hand, not from the table.

      `= noThinking` meant "whatever was true of the model this provider was
      registered with", and the model being called is `useModel` — which
      discovery may have replaced with something of an entirely different
      class. See `thinksFirst`.
    */
    withHint = noThinking || thinksFirst(useModel),
  ): Promise<string> => {
      const { system, messages, maxTokens } = call;
      const streaming = Boolean(call.onDelta);
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
          ...(streaming ? { stream: true } : {}),
          ...(withHint && !hintRejected ? { reasoning_effort: "none" } : {}),
          messages: [{ role: "system", content: system }, ...messages],
        }),
        // A model that reasons before it speaks needs longer than a normal
        // API call. Gemini resolved its id, then timed out at thirty seconds
        // and was reported unreachable — the network was fine, the clock was
        // wrong. maxDuration on the route is 60s, so this fits inside it.
        signal: AbortSignal.timeout(call.deadlineMs ?? PROVIDER_DEADLINE_MS),
      });

      // An error is JSON on both paths — a provider that refuses a streamed
      // request refuses it with an ordinary body, not with an event stream —
      // so the failure branch reads the same way it always has. Only success
      // is shaped differently.
      if (!r.ok) {
        const body = await r.text();
        // The one retry that is not a retry: the same call, minus the hint
        // that was never required. Once only, and remembered.
        if (r.status === 400 && withHint && !hintRejected) {
          hintRejected = true;
          console.warn(
            `[providers] ${id}: rejected reasoning_effort, retrying without it`,
          );
          return attempt(useModel, call, false);
        }
        throw new ProviderError(r.status, `${r.status} ${body.slice(0, 300)}`);
      }

      let text: string | undefined;
      let finishReason: string | undefined;

      if (streaming) {
        const read = await readSse(id, r, call.onDelta!);
        text = read.text.trim();
        finishReason = read.finishReason;
      } else {
        const body = await r.text();
        let parsed: {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        };
        try {
          parsed = JSON.parse(body);
        } catch {
          throw new ProviderError(502, `${id} returned a body that is not JSON`);
        }
        const choice = parsed.choices?.[0];
        text = choice?.message?.content?.trim();
        finishReason = choice?.finish_reason;
      }

      // An empty completion is a failure, not an answer. Returning "" here
      // would put a blank bubble in front of somebody mid-sentence.
      if (!text) throw new ProviderError(502, `${id} returned an empty completion`);

      // Neither is half a sentence. A reply cut off at the budget is the
      // model being interrupted, and showing the stub is worse than saying
      // plainly that it could not answer.
      //
      // This used to add `&& text.split(/\s+/).length < 12`, which reads as
      // "a stub is bad" and means "a long reply cut mid-sentence is fine".
      // The reply that sent somebody looking was fifty-two words. One rule
      // now, in model.ts, asked by both adapters.
      if (wasCutOff(text, finishReason === "length")) {
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
    keyState: keyStateOf(keyVar, apiKey),
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
    keyState: keyStateOf("ANTHROPIC_API_KEY", apiKey),
    async send({ system, messages, maxTokens, onDelta }) {
      const client = new Anthropic({ apiKey });
      const params = {
        model: MODEL.anthropic,
        max_tokens: maxTokens,
        /*
          Two parameters this call used to get wrong, both of them silent.

          `thinking` was not sent at all. Omitting it does not mean "no
          thinking" on claude-sonnet-5 — it means adaptive, which is on by
          default. So every vent paid for a silent reasoning pass and then
          published whatever was left of a 220-token ceiling, which is how
          somebody got a reply ending "If you". A vent reply is three or four
          warm sentences to a person having a bad day; there is nothing here
          to deliberate about. Off is both the correct answer and the cheapest
          one — it is the only change in this file that lowers a bill.

          `temperature: 0.7` was rejected outright: non-default sampling
          parameters are a 400 on this model. Not a degraded reply, a refused
          request — this provider was failing every time and the chain was
          quietly answering from further down. The warmth was never coming
          from the temperature anyway. It comes from the prompt.
        */
        thinking: { type: "disabled" as const },
        system,
        messages,
      };

      /*
        `.stream()` and `.create()`, and the same object comes back from both.

        The SDK's stream helper resolves to the assembled message — including
        `stop_reason` — so everything below this line is untouched by which
        branch ran. That matters more than it looks: the cut-off guard is the
        fix for the reply that ended "If you", and a streaming path that got
        its own bespoke completion handling is exactly how that guard comes
        back off on one path only.
      */
      const completion = onDelta
        ? await client.messages
            .stream(params)
            .on("text", (t) => onDelta(t))
            .finalMessage()
        : await client.messages.create(params);

      const text = completion.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text) throw new ProviderError(502, "anthropic returned an empty completion");

      // The guard the OpenAI path already had, on the path that shipped the
      // fragment. Asking is free; not asking cost a sentence.
      if (wasCutOff(text, completion.stop_reason === "max_tokens")) {
        throw new ProviderError(
          502,
          `anthropic was cut off before it finished a sentence (${text.length} chars)`,
        );
      }
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
      "GEMINI_API_KEY",
      ["flash", "gemini"],
      true,
    ),
    openAiCompatible(
      "groq",
      "https://api.groq.com/openai/v1",
      env.groqApiKey,
      MODEL.groq,
      "GROQ_API_KEY",
      ["llama-3.3", "llama"],
    ),
    /*
      Zhipu, immediately after groq, and that position is the whole point.

      Groq is free and has been carrying every message. When it rate-limits —
      and a free tier does — the next thing tried should be another free one
      rather than a provider that bills. This is a product being run with no
      money, so the order of this list is a budget decision, not a taste one.

      OpenAI-compatible like the rest, so no new adapter. The endpoint is in
      mainland China, so a request from Vercel's US region has further to
      travel; the 50-second timeout upstream already covers it, and a slow
      free answer beats a fast refusal.
    */
    openAiCompatible(
      "zhipu",
      "https://open.bigmodel.cn/api/paas/v4",
      env.zhipuApiKey,
      MODEL.zhipu,
      "ZHIPU_API_KEY",
    ),
    /*
      DeepSeek, after the known-good free tier and before the empty seats.

      OpenAI-compatible, so it needs no new adapter — the same `fetch`, the
      same bearer, the same shape. Placed below groq because groq is the one
      that has actually been carrying every message, and an untested provider
      does not get promoted above a working one on reputation.

      Cheap is not free: DeepSeek bills per token after whatever signup credit
      exists. `/api/health` will say `keyState:"present"` and whether it
      answers; it will not say whether there is money behind it, and nothing
      here should pretend otherwise.
    */
    openAiCompatible(
      "deepseek",
      "https://api.deepseek.com/v1",
      env.deepseekApiKey,
      MODEL.deepseek,
      "DEEPSEEK_API_KEY",
    ),
    openAiCompatible(
      "openrouter",
      "https://openrouter.ai/api/v1",
      env.openrouterApiKey,
      MODEL.openrouter,
      "OPENROUTER_API_KEY",
    ),
    openAiCompatible(
      "cerebras",
      "https://api.cerebras.ai/v1",
      env.cerebrasApiKey,
      MODEL.cerebras,
      "CEREBRAS_API_KEY",
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

/**
 * What the runtime actually holds for a key, without ever saying what it is.
 *
 * `env.ts` trims on read, so a whitespace-only value arrives here as "" and is
 * indistinguishable from unset — which is exactly the confusion this reports
 * its way out of. The raw `process.env` lookup is the only way to tell "never
 * set" from "set to nothing".
 */
export function keyStateOf(
  name: string,
  trimmed: string | undefined,
): "missing" | "blank" | "present" {
  if (trimmed) return "present";
  return process.env[name] === undefined ? "missing" : "blank";
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
/**
 * Cheap-first providers, for the ordinary 80%.
 *
 * Small Llamas on Groq and Cerebras answer a normal vent well and cost a
 * fraction of a frontier model. The ordering is a preference, not a
 * restriction: everything configured is still tried, and a fast turn that
 * exhausts the cheap end falls through to the same providers a deep turn
 * starts at. Nobody is refused an answer to save money — that is the point of
 * the whole file.
 */
const FAST_FIRST = ["cerebras", "groq", "openrouter", "gemini", "anthropic"];

export async function generateReply(call: ProviderCall): Promise<Answered> {
  const all = configuredProviders();
  if (!all.length) throw new ProviderError(401, "no provider configured");

  // Skip what is known to be out of credit or holding a rejected key. If that
  // leaves nothing, try everything anyway — a stale note is a worse reason to
  // refuse somebody than a slow answer.
  const live = all.filter((p) => !isDead(p.id));
  const usable = live.length ? live : all;

  // Ordinary vents start cheap; anything the router called deep keeps the
  // chain's authored order, which leads with the strongest model.
  const providers =
    call.depth === "fast"
      ? [...usable].sort(
          (a, b) =>
            (FAST_FIRST.indexOf(a.id) === -1 ? 99 : FAST_FIRST.indexOf(a.id)) -
            (FAST_FIRST.indexOf(b.id) === -1 ? 99 : FAST_FIRST.indexOf(b.id)),
        )
      : usable;

  const fellThrough: Answered["fellThrough"] = [];
  let last: unknown = new ProviderError(502, "no provider attempted");

  for (const p of providers) {
    try {
      const text = await p.send(call);
      dead.delete(p.id);
      return { text, provider: p.id, model: p.model, fellThrough };
    } catch (error) {
      last = error;
      // This provider may have spoken before it failed. Anything it streamed
      // is now somebody else's half-sentence sitting above the real answer —
      // so it goes, and the next provider starts on a clean line.
      call.onRestart?.();
      const { status } = classifyModelError(error);
      if (NON_TRANSIENT.has(status)) {
        dead.set(p.id, { until: Date.now() + DEAD_FOR_MS, why: status });
      }
      fellThrough.push({ provider: p.id, status });
    }
  }
  throw last;
}

/**
 * Can this deployment answer at all?
 *
 * /api/health probed only the first provider, so with Anthropic first and out
 * of credit it reported `degraded` while the chatbot was working perfectly on
 * Gemini. The product tries the chain; the check has to try the chain, or it
 * is measuring something nobody experiences.
 */
export async function probeChain(): Promise<{
  answered: string | null;
  model: string | null;
  tried: Array<{ provider: string; status: string; detail?: string | null }>;
  lastError: unknown;
}> {
  const tried: Array<{ provider: string; status: string; detail?: string | null }> = [];
  let lastError: unknown = null;

  for (const p of configuredProviders()) {
    try {
      // "." asked a reasoning model to work out what was wanted, and some of
      // them spend the whole budget doing it. Ask for the shortest possible
      // real completion instead — still the product's path, over in a breath.
      await p.send({
        system: "Reply with exactly one word: ok",
        messages: [{ role: "user", content: "ok" }],
        maxTokens: 8,
      });
      tried.push({ provider: p.id, status: "ok" });
      return { answered: p.id, model: p.model, tried, lastError: null };
    } catch (error) {
      lastError = error;
      // The label alone said "unreachable" and nothing else, which is exactly
      // the shape that cost a week. Carry the upstream words.
      const verdict = classifyModelError(error);
      tried.push({ provider: p.id, status: verdict.status, detail: verdict.detail });
    }
  }
  return { answered: null, model: null, tried, lastError };
}
