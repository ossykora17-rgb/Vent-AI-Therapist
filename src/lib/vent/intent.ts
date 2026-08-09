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
/*
  This list caught nine phrasings and missed the ones people actually use.

  Found by the first run of `npm run quality`, for zero tokens, on its first
  three cases. All of these routed to `vent` and were answered with a generic
  tactic instead of the crisis line:

    "i don't want to be here anymore, i have been thinking about ending it"
    "i no wan dey alive again, i don tire for this life"
    "work is fine but honestly some days i think everyone would be
     better off without me"
    "i wan die"
    "i don't want to live anymore"
    "better off without me"
    "no reason to go on"

  The Pidgin gap is the worst of it. This product is Nigerian in root, its own
  voice rules say people write in Pidgin, and **"i wan die" — the most direct
  sentence available in the language — was a generic tactic.** The old list
  required "want to die" in English, and had exactly two Pidgin patterns.

  ## Passive ideation counts

  Several of the additions are passive rather than active: wanting not to
  exist, wanting not to wake up, believing people would be better off. Every
  standard screening instrument treats those as positive, and they are how
  most people say it first — the explicit sentence usually comes later, if it
  comes at all. A router that waits for "kill myself" is waiting for the
  version many people never write down.

  ## On false positives

  Routing here gates the session, which is a real cost to somebody who meant
  something milder — and it is the right trade. The reply hands them a human
  and says they are not alone; the miss hands somebody a breathing exercise.
  These are kept to phrases whose plain reading is about not existing, not to
  general despair: "i'm tired" and "i can't do this anymore" are deliberately
  absent, because those are Tuesday for the person this is built for.
*/
const CRISIS = [
  // ── active, explicit ─────────────────────────────────────────────────────
  /\bkill (myself|my self)\b/,
  /\bsuicide|suicidal\b/,
  /\bwant(ing)? to die\b/,
  /\bend (my life|it all|things)\b/,
  /\b(thinking about|thought about|planning) end(ing)? it\b/,
  /\bhurt(ing)? myself\b/,
  /\bharm myself\b/,
  /\btake my (own )?life\b/,

  // ── passive: not wanting to exist ────────────────────────────────────────
  /\bdon'?t want to (be here|live|be alive|exist|wake up)\b/,
  /\bdo not want to (be here|live|be alive|exist|wake up)\b/,
  /\bnot want to be here\b/,
  /\bno reason to (live|dey|go on|carry on|keep going)\b/,
  /\bbetter (if i (was|were) (dead|gone)|off without me)\b/,
  /\b(everyone|everybody|they'?d all) (would be |be |)better off without me\b/,
  /\bwish i (was|were) (dead|gone|not here)\b/,
  // Bare only. "I want to disappear" is passive ideation; "I want to
  // disappear from that group chat" is a Tuesday, and the first draft of this
  // line gated it — caught by the false-positive probes, which exist because
  // a router that over-fires locks somebody out of the room for saying
  // something ordinary.
  /\bwant to disappear\b(?!\s+(from|off|out of|into)\b)/,

  // ── Pidgin ───────────────────────────────────────────────────────────────
  //
  // "i wan die" is the sentence this list existed for and did not have.
  /\bi (wan|won) die\b/,
  /\bmake i die\b/,
  /\bi no wan (dey alive|live|dey this world)\b/,
  /\bno wan dey alive\b/,
  /\bmake e end\b/,
  /\bi wan comot for this world\b/,
  /\btire for this life\b/,
  /\bi no fit continue this life\b/,
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

/**
 * "Work dey choke me" is not a throat.
 *
 * It is the most ordinary sentence in this product's vocabulary — it is in
 * check 1 of the eval suite as the example of a vent — and `\bchoke\b` was
 * reading it as a somatic report. That opens the somatic gate on a metaphor,
 * and the somatic gate exists for exactly one reason: never hand a breathing
 * instruction to somebody who never mentioned their body. A workload gets a
 * throat exercise, which is the "drop your shoulders for the third time"
 * failure the tactic library was built to avoid.
 *
 * Only the idiomatic spans are removed. "I feel like I'm choking" survives and
 * still routes to throat, because that one is a real sensation and often a
 * panic response — the thing you least want to miss.
 */
const BODY_IDIOM = /\b(?:\w+\s+)?dey\s+choke(?:\s+me)?\b|\bchoke\s+(?:me\s+)?(?:up\s+)?with\b/g;

/**
 * Whichever body word they said *first*, not whichever sits earliest in the
 * table above.
 *
 * `BODY.find` returned head before throat before chest no matter what the
 * sentence emphasised, so "my chest is tight and my head is fine" reported a
 * head. Reading position in their sentence is the only tie-break that is
 * actually about them.
 */
function bodyIn(m: string): "head" | "throat" | "chest" | null {
  const cleaned = m.replace(BODY_IDIOM, " ");
  let best: { at: number; part: "head" | "throat" | "chest" } | null = null;
  for (const [part, re] of BODY) {
    const at = cleaned.search(re);
    if (at !== -1 && (best === null || at < best.at)) best = { at, part };
  }
  return best?.part ?? null;
}

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
  const body = bodyIn(m);
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

/**
 * The one place these digits exist.
 *
 * They were written out by hand in six components, a metadata description and
 * a client-side fallback — nine copies of the number somebody calls when they
 * are in the worst hour of their life. Change it in one place and eight
 * surfaces keep quietly dialling the old one. `CLAUDE.md` already names this
 * shape ("chair tensions lived in four files once"); this is the same bug
 * wearing the highest stakes in the product.
 *
 * `tel:` wants no spaces and a reader wants them, so the dial string is
 * derived rather than typed a second time.
 */
export const CRISIS_LINES = {
  nigeria: "0806 210 6493",
  emergency: "199",
} as const;

/** What goes in `href="tel:…"`. Derived, so it cannot drift from the label. */
export const CRISIS_TEL = CRISIS_LINES.nigeria.replace(/\s/g, "");
export const EMERGENCY_TEL = CRISIS_LINES.emergency.replace(/\s/g, "");
