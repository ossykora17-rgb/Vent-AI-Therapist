/**
 * Intent + real-world classification. Pure keyword work — no classifier model,
 * so routing a message costs nothing. Only a real vent reaches the API.
 */

export type Intent = "crisis" | "factual" | "greeting" | "meta" | "vent";

export type RealWorldTag =
  | "economy"
  | "japa"
  | "ai_job"
  | "social"
  | "family"
  | "lonely"
  | "traffic"
  | "climate"
  | "health"
  | null;

export type Language = "en" | "pidgin";

/**
 * Checked before anything else and never sent to a model.
 * Ordering matters: a crisis message that also mentions work is still a crisis.
 */
const CRISIS = [
  /\bkill (myself|my self)\b/,
  /\bsuicide|suicidal\b/,
  /\bwant to die\b/,
  /\bend (my life|it all)\b/,
  /\bhurt(ing)? myself\b/,
  /\bmake e end\b/,
  /\bno reason to (live|dey)\b/,
  /\bbetter if i (was|were) (dead|gone)\b/,
  /\btake my (own )?life\b/,
];

const FACTUAL = [
  /what('?s| is)? (today('?s)? )?(the )?date/,
  /what day (is it|be today)/,
  /what('?s| is)? the time/,
  /what time (is it|be am)/,
  /\bwho are you\b/,
  /\bwetin you be\b/,
  /\bwhere am i\b/,
  /\btoday('?s)? date\b/,
];

const GREETING = [
  /^(hi|hey|hello|yo|howdy)\b/,
  /^how (are|far|you dey|body)\b/,
  /^good (morning|afternoon|evening)\b/,
  /^(thanks|thank you|thx|nice one|abeg thanks)\b/,
  /^(abeg )?how you dey\b/,
];

/**
 * Every one of these must point at the assistant. "It's the same thing every
 * week" is a person naming their own pattern — the single most valuable thing
 * they can say — and matching it here routed them to an apology for repeating
 * ourselves. Bare "same thing" and "same answer" are far too common in
 * ordinary speech to belong in this list.
 */
const META = [
  /\b(chatbot|bot) (shit|nonsense|talk)\b/,
  /\byou (keep|dey|just keep) (saying|repeating)\b/,
  /\byou said the same\b/,
  /\bsame (tactic|script|line) (again|twice)\b/,
  /\bare you (even )?(real|listening|a bot)\b/,
  /\b(this|that) is generic\b/,
  /\bstop (saying|repeating) (that|the same)\b/,
];

const REAL_WORLD: Array<[Exclude<RealWorldTag, null>, RegExp]> = [
  ["economy", /\b(fuel|subsidy|petrol|inflation|cost of living|price|expensive|broke|money no dey|salary no dey)\b/],
  ["japa", /\b(japa|relocat|visa|ielts|abroad|emigrat|leave the country|move out|canada|uk)\b/],
  ["ai_job", /\b(ai (go |will )?(take|replace)|lose my job to|automat|redundan|ai dey take)\b/],
  ["social", /\b(instagram|tiktok|twitter|snapchat|compar|everyone else|their life|online)\b/],
  ["family", /\b(firstborn|first born|mother|mama|father|papa|family pressure|church|relatives|black sheep)\b/],
  ["lonely", /\b(lonely|alone|nobody|no friend|isolat|by myself)\b/],
  ["traffic", /\b(traffic|danfo|hold ?up|lagos road|commute|third mainland|go slow)\b/],
  ["climate", /\b(heat|flood|hot|climate|rain no stop|too hot)\b/],
  ["health", /\b(sick|hospital|health|body dey pain|test result|diagnos)\b/],
];

const PIDGIN = [
  /\bdey\b/, /\bwetin\b/, /\babeg\b/, /\bna\b/, /\boga\b/, /\bpikin\b/,
  /\bwahala\b/, /\bshege\b/, /\bhow far\b/, /\bmake e\b/, /\bno be\b/,
  /\bgo dey\b/, /\bsabi\b/, /\bfit\b/, /\bbelle\b/,
];

const BODY: Array<["head" | "throat" | "chest", RegExp]> = [
  ["head", /\b(head|skull|brain|forehead|temple)\b/],
  ["throat", /\b(throat|neck|swallow|choke|choking|voice)\b/],
  ["chest", /\b(chest|heart|lungs|breath|ribs|belle|stomach)\b/],
];

const any = (patterns: RegExp[], text: string) => patterns.some((r) => r.test(text));

export interface Classification {
  intent: Intent;
  realWorldTag: RealWorldTag;
  language: Language;
  /** Where they said it sits, if they said. Drives somatic-vs-cognitive choice. */
  body: "head" | "throat" | "chest" | null;
}

export function classify(message: string): Classification {
  const m = message.toLowerCase().trim();

  const language: Language = any(PIDGIN, m) ? "pidgin" : "en";
  const body = BODY.find(([, re]) => re.test(m))?.[0] ?? null;
  const realWorldTag = REAL_WORLD.find(([, re]) => re.test(m))?.[0] ?? null;

  // Crisis wins over everything, always.
  if (any(CRISIS, m)) return { intent: "crisis", realWorldTag, language, body };
  if (any(FACTUAL, m)) return { intent: "factual", realWorldTag, language, body };
  if (any(META, m)) return { intent: "meta", realWorldTag, language, body };

  // A greeting only counts when it is the whole message — "hi, my oga is
  // making me feel small" is a vent wearing a greeting.
  if (any(GREETING, m) && m.split(/\s+/).length <= 6) {
    return { intent: "greeting", realWorldTag, language, body };
  }

  return { intent: "vent", realWorldTag, language, body };
}

export const CRISIS_RESPONSE =
  "I'm really concerned about you. You deserve support right now, from a person, not a screen. You are not alone.";

export const CRISIS_LINES = {
  nigeria: "0806 210 6493",
  emergency: "199",
} as const;
