import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { cached } from "@/lib/external/cache";
import { MODEL } from "./providers";

/**
 * The outside world, for the office.
 *
 * "Search the internet for new therapy approaches" is the right instinct and
 * the wrong implementation nine times out of ten. The obvious build — search
 * the web on every message, paste the results into the prompt — fails three
 * rules this product already has written down, and it fails them at the worst
 * possible moment:
 *
 *   CREDIT DISCIPLINE. A search per turn is a second billed call per turn on
 *   a product whose whole economic argument is that most messages never reach
 *   a model at all. What somebody is carrying does not change between minute
 *   four and minute five, and neither does the literature.
 *
 *   SILENCE BEATS A GUESS. A model asked "what does the research say about X"
 *   with no sources will produce a fluent paragraph either way. Anything that
 *   comes back without a citation is dropped here rather than softened.
 *
 *   NEVER INVENT A FACT. This is the one that decides the shape. What comes
 *   back is a *technique*, never a claim, a statistic or a study result — the
 *   model is handed a move to make, not a finding to repeat. A person at 2am
 *   being told "a 2024 trial found that..." by a chatbot is exactly the thing
 *   CLAUDE.md forbids, and it would be forbidden even if the trial were real.
 *
 * So the lookup is keyed to the *pressure*, not the person, cached for a day,
 * and shared by everybody carrying that pressure. Ten keys, ten lookups a day,
 * and the room is current.
 *
 * WHICH DEPLOYMENT SHAPE MAKES THIS FALSE? No Anthropic key — which is the
 * common one, since the chain reaches Groq and Zhipu first when Anthropic is
 * empty. `research()` returns null and `researchBlock()` renders nothing. The
 * reply is exactly what it is today. Nothing in the room degrades, and nothing
 * anywhere says a technique was consulted when it was not.
 */

/** What a lookup is allowed to come back with. Anything else is dropped. */
export interface Technique {
  /** One imperative sentence: the move, in a form a reply can use. */
  move: string;
  /** Where it came from. No URL, no technique — this is the whole guard. */
  source: string;
  /** The pressure it was looked up for, so a stale key is legible. */
  tag: string;
}

/**
 * Only these, and this is a deliberate ceiling rather than a starting point.
 *
 * The tags are the product's own taxonomy of what presses on people here, and
 * a closed list means the search string is never assembled from something
 * somebody typed. A free-text query built from a vent would send a stranger's
 * sentence to a search engine, which is the opposite of every promise on the
 * landing page.
 */
export const QUERIES: Record<string, string> = {
  economy: "evidence-based counselling techniques for financial stress and debt anxiety",
  japa: "therapy techniques for migration ambivalence and decision paralysis",
  ai_job: "counselling approaches for job insecurity and occupational identity threat",
  social: "clinical techniques for social comparison and self-worth",
  family: "family systems techniques for obligation and enmeshment in adults",
  lonely: "evidence-based approaches for chronic loneliness in adults",
  traffic: "brief interventions for daily commute stress and irritability",
  climate: "counselling approaches for heat stress and environmental distress",
  health: "counselling techniques for health anxiety and uncertainty",
  grief: "current grief therapy approaches for bereaved adults",
};

/** A day. The literature does not move faster than this, and nor do we. */
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Domains worth reading, and everything else refused.
 *
 * An open web search for therapy techniques lands on content farms and
 * life-coach blogs, which is precisely the register this product exists to
 * avoid — a search that returns a motivational page has made the fail state
 * *more* likely, not less. The allowlist is the difference between consulting
 * the literature and consulting the internet.
 */
export const ALLOWED = [
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "apa.org",
  "psychiatry.org",
  "nice.org.uk",
  "who.int",
  "cochranelibrary.com",
  "bps.org.uk",
  "nimh.nih.gov",
];

const ASK = `You are briefing a therapist before a session. Search for current,
evidence-based techniques for the presenting pressure below.

Return ONE technique, as JSON and nothing else:
{"move": "<one imperative sentence a therapist could act on in the next
minute>", "source": "<the URL you took it from>"}

Rules:
- The move is a THING TO DO in a conversation, not a finding to report. Never
  a statistic, a study result, a percentage or a claim about what research
  shows. It will be acted on, never quoted.
- If nothing usable came back from the search, return {"move": null}. Do not
  answer from memory. An absent technique is the correct answer and costs
  nothing; an invented one reaches somebody at 2am.
- No preamble, no explanation, no markdown fence. JSON only.`;

/**
 * One technique for one pressure, or null.
 *
 * Never throws. Every failure — no key, no network, a refusal, a malformed
 * answer, a technique with no URL behind it — is the same outcome as no
 * search at all, because the room must not depend on this. Fail open on the
 * second opinion, closed on the first: this is a second opinion.
 */
export async function research(tag: string | null): Promise<Technique | null> {
  if (!tag || !QUERIES[tag]) return null;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const entry = await cached<Technique>(`research:${tag}`, TTL_MS, "anthropic:web_search", async () => {
    try {
      const client = new Anthropic({ apiKey: key });
      const res = await client.messages.create({
        model: MODEL.anthropic,
        max_tokens: 1024,
        system: ASK,
        tools: [
          {
            /*
              The dynamic-filtering variant. Runs code execution under the
              hood, which is why `code_execution` is deliberately NOT also
              declared here — a second execution environment confuses the
              model about which one it is in.
            */
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 3,
            allowed_domains: ALLOWED,
          },
        ],
        messages: [{ role: "user", content: `Presenting pressure: ${QUERIES[tag]}` }],
      });

      /*
        A server tool that fails does not throw. It answers 200 with a result
        block whose content is an error *object* where a success is an
        *array* — so a caller that indexes before branching reads a field off
        an error and carries on as though it had a result.
      */
      const searched = res.content.some(
        (b) => b.type === "web_search_tool_result" && Array.isArray(b.content),
      );
      if (!searched) return null;

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      return parseTechnique(text, tag);
    } catch {
      // Rate limit, dead key, network, refusal. All the same to the room.
      return null;
    }
  });

  return entry?.value ?? null;
}

/**
 * Read what came back, and refuse most of it.
 *
 * Exported for the eval suite, which asserts on the refusals rather than on
 * the happy path — every one of these branches is a sentence that would
 * otherwise reach somebody, and none of them can be reached with a live key
 * in a test that spends nothing.
 */
export function parseTechnique(text: string, tag: string): Technique | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const { move, source } = parsed as { move?: unknown; source?: unknown };
  if (typeof move !== "string" || move.trim().length < 12) return null;
  // No URL, no technique. The whole point of searching rather than asking.
  if (typeof source !== "string" || !/^https?:\/\//.test(source)) return null;

  /*
    A move, not a finding. The prompt asks for this and a model under pressure
    to be useful will hand back "studies show that…" anyway, so it is refused
    here as well — the prompt is a request and this is the guard.
  */
  if (/\b(study|studies|research|trial|meta-analysis|\d+\s?%|participants)\b/i.test(move)) {
    return null;
  }

  return { move: move.trim(), source: source.trim(), tag };
}

/**
 * What the model is told, which is a move and never a source.
 *
 * The URL is kept on the object and deliberately left out of the prompt. It
 * exists so a person auditing this can see where a move came from; putting it
 * in front of a model is handing it a citation to quote, and a reply that
 * cites a paper at somebody is the failure state with a footnote.
 */
export function researchBlock(t: Technique | null): string | null {
  if (!t) return null;
  return [
    "ONE MOVE FROM OUTSIDE, for this pressure:",
    t.move,
    "Use it only if it fits what they said. Never say where it came from.",
  ].join("\n");
}
