import "server-only";
import fs from "node:fs";
import path from "node:path";
import { env, isPerspectiveConfigured } from "@/lib/env";
import { cached, type CacheEntry } from "./cache";

/**
 * The outside world, four narrow windows onto it.
 *
 * Rules that hold for every source here:
 *
 * 1. **Server-side only.** The browser never talks to Google, Arbeitnow or a
 *    rates API, so an `anon_id` is never handed to a third party and no CORS
 *    problem exists to work around.
 * 2. **Every failure returns `null`.** Not a default, not last week's number,
 *    not a plausible-looking one. Callers omit the sentence instead. Silence
 *    beats a guess is already how flavour works below its confidence floor;
 *    this is the same rule applied to the exchange rate.
 * 3. **Timeouts are short and absolute.** A person waiting on a circle should
 *    never wait on a rates API. Three seconds, then it is not happening.
 * 4. **Zero dependencies.** `fetch`, `AbortSignal.timeout`, nothing else.
 */

const TIMEOUT_MS = 3_000;

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/**
 * Recorded upstream payloads, for the eval suite and for any network where
 * these hosts are not reachable. A fixture is a *recorded response shape*, not
 * invented data, and it is only ever consulted when the env var points at it —
 * production cannot accidentally serve one.
 */
const FIXTURES = process.env.VENT_EXTERNAL_FIXTURE || "";

function fixture<T>(name: string): T | null {
  if (!FIXTURES) return null;
  try {
    return JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), FIXTURES, `${name}.json`), "utf8"),
    ) as T;
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    // Unreachable, blocked, slow, or malformed. All the same answer: nothing.
    return null;
  }
}

// ── 1. Perspective — the Guardian's second opinion ─────────────────────────

export interface ToxicityScores {
  toxicity: number;
  insult: number;
  threat: number;
}

const ATTRS = ["TOXICITY", "INSULT", "THREAT"] as const;

interface PerspectiveResponse {
  attributeScores?: Record<string, { summaryScore?: { value?: number } }>;
}

/**
 * The keyword list catches "I want to die". It does not catch "you are
 * useless and everyone here knows it", which is the thing that actually ends
 * a circle. Perspective scores the paraphrase.
 *
 * Text is sent, an identifier never is. Google sees a sentence with nothing
 * attached to it — no `anon_id`, no circle id, no session.
 */
interface PerspectiveFixture {
  default: ToxicityScores;
  match: Array<{ contains: string; scores: ToxicityScores }>;
}

export async function scoreToxicity(text: string): Promise<ToxicityScores | null> {
  // A recorded classifier still has to behave like one: the same answer for
  // every sentence would block an entire room, which is how a fixture stops
  // testing anything and starts hiding things.
  const recorded = fixture<PerspectiveFixture>("perspective");
  if (recorded) {
    const lower = text.toLowerCase();
    return recorded.match.find((m) => lower.includes(m.contains))?.scores ?? recorded.default;
  }
  if (!isPerspectiveConfigured) return null;

  const body = {
    comment: { text: text.slice(0, 3000) },
    languages: ["en"],
    doNotStore: true,
    requestedAttributes: Object.fromEntries(ATTRS.map((a) => [a, {}])),
  };

  const data = await getJson<PerspectiveResponse>(
    `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${encodeURIComponent(env.perspectiveApiKey)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!data?.attributeScores) return null;

  const at = (a: string) => data.attributeScores?.[a]?.summaryScore?.value;
  const toxicity = at("TOXICITY");
  if (typeof toxicity !== "number") return null;

  return {
    toxicity,
    insult: at("INSULT") ?? 0,
    threat: at("THREAT") ?? 0,
  };
}

// ── 2. The money, and the work ─────────────────────────────────────────────

export interface EconomyContext {
  /** Naira per dollar. The one number everybody in Lagos already feels. */
  usdNgn: number;
  /** Gold, per ounce, in naira — a second reading on the same squeeze. */
  goldNgn: number | null;
  asOf: string;
}

interface RatesResponse {
  rates?: Record<string, number>;
  date?: string;
}

/**
 * exchangerate.host for the rate. Gold is a second source and entirely
 * optional: if it is down, the rate still goes out on its own rather than the
 * whole sentence disappearing because a nice-to-have failed.
 */
export async function economyContext(): Promise<CacheEntry<EconomyContext> | null> {
  return cached<EconomyContext>("economy", HOUR, "exchangerate.host", async () => {
    const recorded = fixture<EconomyContext>("economy");
    if (recorded) return recorded;

    const rates = await getJson<RatesResponse>(
      "https://api.exchangerate.host/latest?base=USD&symbols=NGN,XAU",
    );
    const usdNgn = rates?.rates?.NGN;
    if (typeof usdNgn !== "number" || usdNgn <= 0) return null;

    // XAU is ounces per dollar, so the naira price of an ounce is a division.
    const xau = rates?.rates?.XAU;
    const goldNgn = typeof xau === "number" && xau > 0 ? Math.round(usdNgn / xau) : null;

    return { usdNgn: Math.round(usdNgn), goldNgn, asOf: rates?.date ?? new Date().toISOString().slice(0, 10) };
  });
}

export interface Job {
  title: string;
  company: string;
  location: string;
  url: string;
  remote: boolean;
}

interface ArbeitnowResponse {
  data?: Array<{
    title?: string;
    company_name?: string;
    location?: string;
    url?: string;
    remote?: boolean;
  }>;
}

/**
 * Three real jobs beat "three things AI cannot do" every time. The tactic
 * asks someone to name what they can still do; this shows them somebody
 * currently paying for it.
 */
export async function jobsContext(): Promise<CacheEntry<Job[]> | null> {
  return cached<Job[]>("jobs", DAY, "arbeitnow.com", async () => {
    const recorded = fixture<Job[]>("jobs");
    if (recorded) return recorded.slice(0, 3);

    const data = await getJson<ArbeitnowResponse>("https://arbeitnow.com/api/job-board-api");
    const rows = (data?.data ?? [])
      .filter((j) => j.remote && j.title && j.url)
      .slice(0, 3)
      .map((j) => ({
        title: String(j.title),
        company: String(j.company_name ?? "—"),
        location: String(j.location ?? "Remote"),
        url: String(j.url),
        remote: true,
      }));
    return rows.length ? rows : null;
  });
}

// ── 3. One quote, Stoic, and only at the door ──────────────────────────────

export interface Quote {
  text: string;
  author: string;
}

/**
 * Stoicism only, and the Closing only. A quote in the middle of a vent is the
 * wellness-app reflex this product exists to avoid — somebody says their
 * mother rang three times and a screen answers with a philosopher. At the
 * door, on the way out, holding one line about what is yours to control, it
 * rhymes with "one thing you can control today, down to ten naira".
 */
export async function stoicQuote(): Promise<CacheEntry<Quote> | null> {
  return cached<Quote>("quote", DAY, "stoic-quotes.com", async () => {
    const recorded = fixture<Quote>("quote");
    if (recorded) return recorded;

    const data = await getJson<{ text?: string; author?: string }>(
      "https://stoic-quotes.com/api/quote",
    );
    if (!data?.text) return null;
    return { text: String(data.text), author: String(data.author ?? "Unknown") };
  });
}
