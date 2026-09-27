import type { Classification, RealWorldTag } from "./intent";

/**
 * 30 tactics. The selector never returns one used in the last 3 turns — that
 * is the whole point. Repeating "drop your shoulders" every reply is the tell
 * that nothing is thinking; garbage in, garbage out.
 */

export type TacticFamily =
  | "validation"
  | "cognitive"
  | "duality"
  | "narrative"
  | "relational"
  /*
    For the person who can already see it all and has not moved.

    Its own family rather than a corner of "cognitive", because it is the
    one family defined by what it refuses to do: it never adds an
    interpretation. Filing it under cognitive would put it next to the
    moves it exists to replace.
  */
  | "observing";

export interface Tactic {
  id: string;
  family: TacticFamily;
  /** Shown to the model as the move to make, not as text to copy verbatim. */
  instruction: string;
  /** When this tactic is eligible at all. */
  fits: (ctx: TacticContext) => boolean;
  /** Higher wins among eligible tactics. */
  weight: (ctx: TacticContext) => number;
  /**
   * True only if this move is still right when nothing about the situation
   * can change.
   *
   * Almost everything here quietly assumes something can move — a thought can
   * be tested, a defence named, one small action taken tonight. None of that
   * is true of a terminal diagnosis or a burial, and reaching for it tells the
   * person you did not understand what they said.
   *
   * Absent means no, and that default is the point. The assumption is so
   * nearly universal in this file that forgetting the flag has to keep a new
   * tactic *away* from somebody's deathbed rather than send it there. Opt in
   * deliberately, and only after reading the instruction back as if it were
   * said out loud to somebody whose father died on Tuesday.
   */
  holdsWhenNothingMoves?: boolean;
  /**
   * The same move, phrased for a room rather than one person. A Keeper opens
   * a circle with this, so the intention and the private session draw on one
   * library instead of drifting into two.
   */
  hold?: string;
}

export interface TacticContext extends Classification {
  message: string;
  /** 0–100, from the Pressure slider. */
  pressure: number | null;
  /** 0–100, from the Duality slider. */
  duality: number | null;
  mood: number | null;
  ventCount: number;
  recentTactics: string[];
  /**
   * What has actually been working, from `lib/vent/efficacy`. Optional and
   * bounded: absent means the selector behaves exactly as it did before there
   * was anything to learn from, which is also what a cold start looks like.
   */
  efficacy?: ReadonlyMap<string, number>;
}

const words = (s: string) => s.trim().split(/\s+/).length;
const has = (re: RegExp) => (c: TacticContext) => re.test(c.message.toLowerCase());

const ANALYTICAL = /\b(because|therefore|the fact|statistic|logically|technically|percent)\b/;

/*
  Faith, as this market actually speaks it.

  Deliberately wide across traditions and deliberately including Pidgin,
  because the register that gets missed is never the formal one. It is
  "na God go do am" and "I don dey pray since", not "I am experiencing a
  crisis of faith".

  `\bpray` rather than `\bprayer\b` catches praying, prayed, prayers. `chi`
  is bounded tightly — it is a real Igbo concept and also three letters
  inside a hundred English words.
*/
const FAITH =
  /\b(god|allah|jesus|christ|lord|holy spirit|bible|quran|qur'an|koran|church|mosque|pastor|imam|priest|deacon|fellowship|prayer|pray(ing|ed|s)?|fast(ing|ed)?|anoint|blessing|blessed|testimony|faith|sin|repent|juju|chi|ori|orisha|babalawo|native doctor|shrine|ancestor)\b/;

/*
  Watching yourself, fluently, from a seat nothing reaches.

  This is not somebody who cannot see the pattern. It is somebody who can
  see it perfectly, name its origin, cite the mechanism — and has not moved
  an inch in two years. The research calls the combination hyperreflexivity:
  fusion and rumination as one thing, and it is a different animal from
  avoidance. They are not hiding from the feeling. They are *narrating* it,
  and the narration has become the place they live.

  What keeps it running is a belief, not a deficit — that thinking about it
  is how it gets solved. So understanding feels like progress, every pass
  feels like work, and the person is genuinely productive at a task that
  cannot finish.

  Why this lands hard in Lagos in particular: the profile is the sharp,
  well-read professional in a culture where open feeling is expensive and
  competence is currency. Analysis is the socially permitted form of having
  an emotion. "Let me explain what is happening to me" passes at a table
  where "I am not okay" does not. So the smartest people get the most
  fluent, and the most fluent get the most stuck, and everyone around them
  reads it as being sorted.

  The tell is not the analysis. It is the analysis *arriving with its own
  conclusion already attached* — insight offered as a finished object, with
  nothing asked of it.
*/
const SELF_NARRATION =
  /\b(i know (that )?i|i know say|i sabi (say|why)|i dey aware|i understand why|i'm aware|i am aware|self[- ]aware|i've analy[sz]ed|i have analy[sz]ed|i reali[sz]e (that )?i|part of me knows|intellectually i|my therapist|attachment style|trauma response|childhood|coping mechanism|defen[cs]e mechanism|projecting|self[- ]sabotage)\b/;

/*
  The gap itself, said out loud. "I know … but I still —".

  This is the strongest single signal in the whole detector, because it is
  the person reporting the failure of their own method while using it.
*/
const INSIGHT_GAP =
  /\b(i know|i sabi|i dey aware|i understand|i get it|i reali[sz]e|i'm aware|i am aware|even though i know|knowing this)\b[^.!?]{0,90}\b(but|still|and yet|yet i|anyway|regardless|e no dey change|e never change|nothing chang|i dey do am)/;

/**
 * The loop said plainly, which the pattern above cannot see.
 *
 * `INSIGHT_GAP` catches the articulate version — "I know why I do this and I
 * still do it" — and that is one presentation of Wells & Matthews' Cognitive
 * Attentional Syndrome, not the common one. The common one is somebody saying
 * flatly that they cannot stop thinking about it, and this file missed every
 * such sentence: "I have been going over this all day" and "I keep replaying
 * the conversation in my head" both returned false, so `FEEDS_THE_LOOP` never
 * fired and `socratic` — one more question to take away and turn over — was
 * reachable for exactly the people it damages.
 *
 * The markers are perseveration, never mere thinking. "Thinking about it" is
 * what everybody who opens this product is doing; "cannot stop", "over and
 * over", "round and round", "all day" are the process complaint, and the
 * process is the thing MCT treats. A bare `/think/` here would classify the
 * entire userbase as ruminating and route all of them away from content, which
 * would be a worse product than the bug.
 */
const PERSEVERATION = [
  /\b(can'?t|cannot|couldn'?t) (stop|switch off|shut off|turn off|quiet|get it out of my head)/,
  /\b(over and over|round and round|on a loop|on repeat|again and again)\b/,
  /\b(keep|keeps|kept|dey) (replaying|going over|going round|coming back|running)\b/,
  /\b(overthink|over-think|overanalys|over-analys|ruminat|spiral)/,
  /\b(going over|gone over|been over) (it|this|that|everything)\b/,
  /\b(all day|all night|every night|at 3 ?am|since morning)\b[^.!?]{0,40}\b(think|head|mind|it)\b/,
  /\b(stuck in my head|in my head all|my mind no dey rest|my head no dey quiet|e dey worry me)\b/,
];

/**
 * Is this person watching themselves rather than being here?
 *
 * Exported for the same reason `nothingCanMove` is: the selector and the
 * eval must not each keep a copy. A suite that asserts against its own regex
 * passes while the product regresses.
 */
export function watchingConfidence(message: string): 0 | 1 | 2 {
  const m = message.toLowerCase();
  // They reported the failure of their own method while using it. Nothing
  // else in the message is as informative as that.
  if (INSIGHT_GAP.test(m)) return 2;
  // Naming the loop is as confident as reporting the insight gap, and rather
  // more common. Somebody who says they cannot stop is not guessing.
  if (PERSEVERATION.some((re) => re.test(m))) return 2;
  const markers = m.match(new RegExp(SELF_NARRATION, "g"))?.length ?? 0;
  if (markers >= 2) return 2;
  return markers >= 1 && (ANALYTICAL.test(m) || words(m) > 25) ? 1 : 0;
}

/**
 * The loop itself, separate from watching oneself think.
 *
 * Related and not the same, which is why it is its own predicate. Watching
 * yourself is a *stance* — narrating your own patterns to a listener. The CAS
 * is a *process* — the thinking that will not stop — and MCT's whole finding
 * is that the process is what maintains distress regardless of what the
 * content happens to be. Somebody can be in one without the other.
 *
 * The probe library reads this one; `FEEDS_THE_LOOP` reads the broader stance.
 */
export function inTheLoop(message: string): boolean {
  const m = message.toLowerCase();
  return PERSEVERATION.some((re) => re.test(m)) || INSIGHT_GAP.test(m);
}

export function caughtWatchingSelf(message: string): boolean {
  const m = message.toLowerCase();
  if (INSIGHT_GAP.test(m)) return true;

  /*
    And the loop said plainly, which this used to miss entirely.

    `FEEDS_THE_LOOP` vetoes `socratic`, `thought_record` and `double_standard`
    for exactly one reason, written above it: "every one of them is a request
    to think about the thought — which is the activity the person cannot stop".
    Somebody typing "I cannot stop thinking about it" *is* that person, in the
    plainest words available, and this returned false for them — so the veto
    never fired and `socratic` reached the people it damages most.

    The articulate version was covered and the common version was not, which is
    the shape of most of the misses in this file.
  */
  if (PERSEVERATION.some((re) => re.test(m))) return true;

  /*
    Analysis alone is not the condition — plenty of people reason their way
    to something real. It is analysis *about oneself*, delivered whole.

    Counting the markers rather than merely finding one, because the first
    version wanted a marker plus either an analytical connective or length,
    and missed "I understand that my self-sabotage is a defence mechanism and
    I'm very self-aware about it, yet nothing changes" — nineteen words, no
    "because", and three separate tells. Somebody reaching for two of these
    in one breath is speaking the register; that is the signal, not the
    sentence length.
  */
  const markers = m.match(new RegExp(SELF_NARRATION, "g"))?.length ?? 0;
  if (markers >= 2) return true;
  return markers >= 1 && (ANALYTICAL.test(m) || words(m) > 25);
}

/*
  SPLIT AWARENESS — the two readings `caughtWatchingSelf` never made.

  The founder's core mechanism, in the founder's words: "Accurate
  self-observation (the capacity to be in the experience and see the experience
  at the same time) is the primary condition for clarity and change." Three
  stances follow from it, and this file already read one of them:

  - watching without being in it — analysis about themselves, delivered whole.
    `caughtWatchingSelf`, and the room takes them back under the words.
  - in it without watching — a verdict on themselves held as a fact.
    `fusedVerdict`: the room gives them one step back from the sentence.
  - both at once — feeling it and noticing it in the same breath.
    `seesWhileIn`: the room names the noticing, because that is the capacity.

  Described as what people do, never as a mechanism of the world. Nothing here
  is physics and nothing here is magic: the change is in what a person can see
  about themselves, and the reading is their own words.
*/

/**
 * Verdicts about the whole self. One list for the person's first person and the
 * room's second person — `quality.ts` builds the `verdict` grader from it —
 * because two detectors disagreeing about one question is this repository's
 * most-repeated bug. Each word is identity-level; an event ("I failed the exam")
 * or a state ("I'm tired") is not a verdict, and `stupid` and `a mess` are out
 * because "I'm so stupid, I left my keys" is a Tuesday.
 */
export const VERDICT_WORDS = String.raw`(?:a\s+|an\s+)?(?:failure|useless|worthless|nobody|burden|disappointment|pathetic|hopeless|broken(?![-\w])|fraud|joke|waste(?:\s+of\s+space)?|loser|unlovable|the\s+problem(?![-\w]|\s+solver)|bad\s+person|nothing(?!\s+like))`;

const VERDICT_INTENSIFIER = String.raw`(?:such\s+|so\s+|just\s+|completely\s+|totally\s+|really\s+|a\s+complete\s+|a\s+total\s+|nothing\s+but\s+)?`;

/**
 * A verdict word after a subject — one construction for both sides of the
 * conversation, so the router reading "I am useless" and the grader reading
 * "you're useless" cannot drift apart. The lookahead keeps a domain ("useless
 * at cooking") or a denial ("a burden to nobody") out of it.
 */
export function verdictAfter(subject: string, flags = ""): RegExp {
  return new RegExp(
    String.raw`\b${subject}\s+${VERDICT_INTENSIFIER}${VERDICT_WORDS}\b(?!\s+(?:at|with|when|to\s+(?:no\s*one|nobody))\b)`,
    flags,
  );
}

const FUSED = [
  verdictAfter(String.raw`i(?:'?m|\s+am)`),
  /\bi(?:'?m|\s+am)\s+not\s+(?:good\s+)?enough\b/,
  /\bi\s+(?:always|never)\s+(?:fail|ruin\s+everything|get\s+anything\s+right|do\s+anything\s+right)\b/,
  /\bi\s+(?:can'?t|cannot)\s+do\s+anything\s+right\b/,
  /\bi\s+(?:be|na)\s+(?:a\s+|one\s+)?(?:failure|useless|nobody|disappointment|burden|mumu|olodo)\b/,
  /\bi\s+no\s+(?:be|worth)\s+(?:anything|anybody|nothing)\b/,
  /\bi\s+no\s+good\s+for\s+anything\b/,
  /\bna\s+me\s+be\s+the\s+problem\b/,
  /\bi\s+(?:useless|worthless)\b/,
];

/**
 * The verdict is somebody else's voice already, or a condition rather than a
 * claim. "My dad says I'm useless" has the distance this move would offer;
 * "or I am not enough" is conditional worth, which `earned_worth` answers more
 * precisely — specificity outranks weight.
 */
const REPORTED = /\b(?:says?|said|tells?\s+me|told\s+me|calls?\s+me|called\s+me|thinks?)\s+(?:that\s+)?$/;
const CONDITIONAL = /\b(?:or|if|unless|until|otherwise|else)\s*$/;

/** In it without watching: a verdict on themselves, stated as a fact. */
export function fusedVerdict(message: string): boolean {
  const m = message.toLowerCase();
  return FUSED.some((re) => {
    for (const hit of m.matchAll(new RegExp(re.source, "g"))) {
      const clause = m.slice(0, hit.index).split(/[.!?]/).pop() ?? "";
      if (!REPORTED.test(clause) && !CONDITIONAL.test(clause)) return true;
    }
    return false;
  });
}

const SEES = [
  /\bi\s+(?:can\s+)?(?:notice|feel|see|hear)\s+(?:myself|my\s+(?:chest|throat|stomach|belly|heart|hands?|jaw|body|voice|breath(?:ing)?|head))\b/,
  /\bi\s+(?:just\s+)?noticed?\s+(?:that\s+)?i\b/,
  /\bi(?:'?m|\s+am)\s+(?:watching|noticing)\s+(?:myself|it\s+happen)\b/,
  /\bi\s+(?:catch|caught)\s+myself\b/,
  /\bas\s+i(?:'?m|\s+am)?\s+(?:type|typing|write|writing|say|saying)\s+(?:this|it|that)\b/,
  /\b(?:typing|writing|saying)\s+(?:this|it)\s+(?:out\s+)?(?:makes|made)\b/,
  /\bpart\s+of\s+me\b[^.!?]{0,60}\b(?:another|other)\s+part\b/,
  /\bas\s+i\s+dey\s+(?:type|write|talk)\b/,
  /\bi\s+dey\s+(?:see|notice)\s+(?:say\s+i|myself)\b/,
];

/**
 * Both at once: noticing themselves while they are in it. Present-tense and
 * about their own experience — the body, the voice, the act of writing this —
 * which is what separates it from the analysis `caughtWatchingSelf` reads:
 * "I know that I always…" explains from outside, "I can feel my chest go tight
 * as I type this" is inside and seeing.
 */
export function seesWhileIn(message: string): boolean {
  const m = message.toLowerCase();
  return SEES.some((re) => re.test(m));
}

/*
  An ending they are already sure of — the third thing the founder's principle
  names, after being in it and watching it: seeing what they expect while they
  expect it. "They'll laugh at me" is lived tonight as if it had happened, and
  the only thing that makes it visible is hearing it back as theirs.

  EVERY PART EARNED ITS PLACE BY WHAT IT EXCLUDES
  - A reaction needs an object: "they'll laugh at me", never "they'll laugh at
    the joke"; "they will fire me", never "fire the manager".
  - Certainty alone is not enough: "I know he'll be fine" is sure and not
    feared, so a sure clause needs something feared inside it.
  - Hopelessness is not this: "it will never get better" is owned by
    `exception_finding` and `meaning_stance`, and a rating asked of it is a
    number asked of despair.
  - Violence and death are never forecasts to rate. "How sure, out of ten?"
    asked of "he will beat me" is the room grading somebody's danger.
  - Heard, not expected: "he said he'll leave" is his sentence, not theirs.
  - "What if" is the loop turning, which `inTheLoop` owns.
  - Bare "I will fail" stays with `CATASTROPHE`, which named it first.
*/
const WHO = String.raw`(?:he|she|they|e|dem|him|everyone|everybody|people|nobody|my\s+(?:dad|daddy|papa|mum|mom|mummy|mama|mother|father|boss|oga|wife|husband|family|parents|people|friends?|brother|sister|landlord|pastor|in-laws|babe|girlfriend|boyfriend|manager|lecturer)|(?:the\s+)?(?:oga|boss|manager|landlord|lecturer|interviewers?))`;
const WILL = String.raw`(?:\s*'ll|\s+will|\s+(?:is|are|am)\s+going\s+to|'s\s+going\s+to|'re\s+going\s+to|'m\s+going\s+to|\s+gonna|\s+go)`;
const WONT = String.raw`(?:\s+won'?t|\s+wont|\s+will\s+not|\s+(?:is|are)\s+not\s+going\s+to|\s+no\s+go)`;
const JUDGED = String.raw`(?:so\s+|just\s+|too\s+|a\s+)?(?:lazy|weak|stupid|useless|failure|mad|crazy|joke|fraud|nothing|wicked|selfish|ungrateful|proud|bad|not\s+\w+)`;
const REACTION = String.raw`(?:say\s+no|laugh\s+(?:at\s+)?(?:me|us)|mock\s+(?:me|us)|judge\s+(?:me|us)|reject\s+(?:me|us|it|my)|dump\s+me|disown\s+(?:me|us)|abandon\s+(?:me|us)|leave\s+(?:me|us)|cut\s+me\s+off|hate\s+(?:me|us)|blame\s+(?:me|us)|shout|(?:sack|fire)\s+(?:me|us)|disgrace\s+(?:me|us)|look\s+down\s+on\s+(?:me|us)|talk(?!\s+to\b)(?:\s+about\s+me)?|find\s+out(?=\s*(?:$|[,.!?]|\s+about\s+(?:me|it|this)|\s+and\b))|see\s+(?:right\s+)?through\s+me|ignore\s+(?:me|us|my)|be\s+(?:so\s+|very\s+)?(?:angry|disappointed|ashamed|upset|furious|vexed)|vex|(?:think|say|feel)\s+(?:that\s+)?i'?m\s+${JUDGED}|never\s+(?:forgive|speak\s+to|talk\s+to|look\s+at|trust)\s+(?:me|us))`;
const REFUSAL = String.raw`(?:understand|believe\s+me|listen|forgive|come\s+back|accept|agree|gree|reply|answer|call|pick|help)`;
const OWN_LOSS = String.raw`(?:lose\s+(?:my\s+job|the\s+job|everything|am|him|her)|get\s+(?:fired|sacked|rejected)|be\s+(?:rejected|alone|found\s+out)|end\s+up\s+(?:alone|like|with\s+nothing)|mess\s+(?:it|this|everything)\s+up|embarrass\s+myself|never\s+(?:get|find|be\s+able|have|make|pass|marry))`;
const COLLAPSE = String.raw`(?:go\s+wrong|fall\s+apart|end\s+badly|blow\s+up|collapse|scatter|spoil|be\s+a\s+disaster|crash)`;
const SURE = String.raw`(?:i\s+(?:already\s+|just\s+)?know|i'?m\s+(?:so\s+|very\s+|100%?\s+)?(?:sure|certain)|i\s+am\s+(?:so\s+)?(?:sure|certain)|i\s+(?:know|sabi)\s+say|i\s+(?:dey\s+)?fear\s+say|i'?m\s+(?:so\s+)?(?:scared|afraid|terrified)|i\s+am\s+(?:so\s+)?(?:scared|afraid|terrified))`;

const FORECASTS: readonly RegExp[] = [
  new RegExp(String.raw`\b${WHO}${WILL}\s+(?:just\s+|definitely\s+|surely\s+|probably\s+|all\s+)?${REACTION}\b`),
  new RegExp(String.raw`\b${WHO}${WONT}\s+(?:ever\s+)?${REFUSAL}\b`),
  new RegExp(String.raw`\bnobody${WILL}\s+(?:ever\s+)?${REFUSAL}\b`),
  new RegExp(String.raw`\bi${WILL}\s+${OWN_LOSS}\b`),
  new RegExp(String.raw`\b(?:it|this|everything|e|all\s+of\s+it)${WILL}\s+${COLLAPSE}\b`),
  new RegExp(String.raw`\bi\s+(?:already\s+)?know\s+how\s+(?:this|it|that)\s+(?:ends|goes|will\s+end|is\s+going\s+to\s+end)\b`),
];
const SURE_OF_IT = new RegExp(
  String.raw`\b${SURE}\s+(?:that\s+)?(?:if\s+[^,.!?]{1,40},?\s+)?[^.!?]{0,40}?(?:${WILL}|${WONT})\s+(?:not\s+|never\s+)?\w+`,
);
const FEARED = /\b(?:not|never|no|won'?t|wont|fail\w*|lose|losing|wrong|bad|worse|leave|laugh|reject|hate|judge|sack|fire|end|ends|over|collapse|spoil|scatter|disappoint\w*|angry|vex|ashamed|alone|nothing|mess)\b/;
const NEVER_RATED = /\b(?:die[sd]?|dying|death|dead|funeral|pass(?:es|ed)?\s+away|beat(?:s|ing|en)?|kill(?:s|ed|ing)?|hit(?:s|ting)?|slap(?:s|ped|ping)?|hurt(?:s|ing)?|harm|rape[sd]?|flog(?:s|ged|ging)?|stab(?:s|bed|bing)?|abus(?:e|es|ed|ing)|weapon|gun|knife)\b/;
const HEARD_FROM_THEM = /\b(?:says?|said|tells?\s+me|told\s+me|threatened|swore|promised)\s+(?:that\s+)?$/;
const DESPAIR = /\b(?:no\s+go\s+better|won'?t\s+get\s+better|never\s+get\s+better|nothing\s+(?:will|go)\s+change|never\s+change)\b/;

/** In it, and already sure how it ends: a feared future stated as what will happen. */
export function forecasting(message: string): boolean {
  const m = message.toLowerCase();
  if (NEVER_RATED.test(m)) return false;
  const found = (re: RegExp, needsFear: boolean) => {
    for (const hit of m.matchAll(new RegExp(re.source, "g"))) {
      const at = hit.index ?? 0;
      const clause = m.slice(0, at).split(/[.!?\n]/).pop() ?? "";
      if (HEARD_FROM_THEM.test(clause) || /\bwhat\s+if\b/.test(clause)) continue;
      const span = m.slice(at, at + hit[0].length + 30);
      if (DESPAIR.test(span)) continue;
      if (needsFear && !FEARED.test(span)) continue;
      return true;
    }
    return false;
  };
  return FORECASTS.some((re) => found(re, false)) || found(SURE_OF_IT, true);
}
const CATASTROPHE = /\b(always|never|everything|nothing|ruin|disaster|end of|i will fail|i go fail)\b/;
const SELF_CRITIC = /\b(useless|stupid|failure|worthless|i'?m bad|i no good|weak)\b/;
const PARTS = /\b(part of me|one side|half of me|i want to but|i wan but)\b/;
const AVOIDANT = /\b(i'?m fine|it'?s fine|nothing|idk|i don'?t know|no be anything)\b/;
const HOPELESS = /\b(no point|hopeless|why bother|nothing go change|e no go better)\b/;
const ANGER = /\b(angry|vex|furious|mad|pissed|rage)\b/;

/*
  Five traditions the library did not have a move from.

  The rest of this file already covers CBT, Gestalt, IFS, narrative, DBT,
  somatic/polyvagal, person-centred and solution-focused. These are the gaps,
  and they go here rather than into the system prompt on purpose: a tactic
  costs nothing until it is selected, and the prompt costs ~3,035 tokens on
  every single vent. Psychology belongs in the selector.
*/

/**
 * The thing that cannot be fixed. Existential — Frankl, Yalom.
 *
 * Every other tactic in this file quietly assumes something can move: a
 * thought can be tested, a defence named, one small action taken tonight. A
 * parent's diagnosis moves nothing, and offering a 4-6 second micro action to
 * somebody whose father is dying is the app failing to understand what it was
 * told.
 */
const UNFIXABLE = [
  /\b(dying|died|death|passed away|cancer|terminal|test results?|stroke|hospital)\b/,
  /\b(nothing i can do|out of my hands|can'?t change|e don happen)\b/,
  // A stem, and it needs no trailing boundary. `diagnos\b` matched neither
  // "diagnosed" nor "diagnosis" — the only two forms it exists for — so this
  // list has never once fired on a diagnosis that did not also say "cancer".
  /\b(diagnos|palliativ|hospice|terminally)/,
];

/**
 * The other half of the unfixable: it already happened.
 *
 * The list above is written for the diagnosis — the thing arriving. A burial
 * is the same category and shared almost none of its words, so a person three
 * weeks after their mother's funeral, writing "the burial finished and the
 * house is quiet now", matched nothing and got offered a micro action.
 *
 * `lost` is deliberately never bare. "I lost my job" and "I lost my phone"
 * are Tuesdays, and the whole file's habit is that a word which means two
 * things has to be pinned by the word beside it.
 */
const BEREAVED = [
  /\b(funeral|burial|wake ?keeping|grief)\b/,
  // `griev` alone would take "grievance", which is an HR word and a Tuesday.
  /\b(griev(e|es|ed|ing)|mourn|bereave|bur(y|ied|ying))/,
  /\b(lost (my|our|her|his|their) (mum|mummy|mum?cy|mother|dad|daddy|father|papa|mama|son|daughter|child|baby|brother|sister|wife|husband|friend|granny|grandma|grandpa|grandmother|grandfather))\b/,
  /\b(miscarriage|miscarried|stillborn|still ?birth|lost the baby)\b/,
  /\b(widow)/,
  // Pidgin. "E don go" is how it is actually said, and no English list has it.
  /\b((e|she|he|dem) don go|don pass away|we don bury|dem don bury|e don finish)\b/,
];

/**
 * One question, asked in one place: can anything here move?
 *
 * Exported because the selector and the eval must not each keep their own
 * copy — a suite that asserts against its own regex passes while the product
 * regresses. Same reason the crisis list is imported rather than restated.
 */
export function nothingCanMove(message: string): boolean {
  const m = message.toLowerCase();
  return UNFIXABLE.some((re) => re.test(m)) || BEREAVED.some((re) => re.test(m));
}

/**
 * Obligation to people. Ubuntu, and the reason it is here.
 *
 * The history of psychology is overwhelmingly WEIRD — Western, Educated,
 * Industrialised, Rich, Democratic — and its instinct with family obligation
 * is to name it enmeshment and prescribe boundaries. For a Lagos firstborn
 * sending money home, personhood genuinely is constituted through the people
 * they are carrying: *umuntu ngumuntu ngabantu*. Telling them the obligation
 * is the pathology is not neutral advice, it is a foreign anthropology, and
 * it is why so much of this category reads as written for somebody else.
 *
 * So the move names the cost honestly and refuses to name the belonging as
 * the problem — then asks the question nobody asks them: who is holding you.
 */
const OBLIGATION =
  /\b(family|parents?|mum|mummy|mumcy|mama|mother|dad|daddy|papa|father|firstborn|first born|siblings?|brother|sister|send money|black tax|everybody depend|they depend|breadwinner|house people)\b|\b(responsib)/;
/*
  The bare relation words were missing — `daddy` was here and `dad` was not,
  `mummy` and not `mum`, no `mother`, no `father`, no `parents`. `iterated_game`
  three blocks up has always had them, so "my dad is dying" reached the payoff
  matrix and never reached the one move written to ask who is holding them.

  Widening this does not disturb the ordering check 15i guards: `ubuntu_frame`
  is 82 and `iterated_game` is 84, so everywhere they now both fit, the long
  game still wins and this stays reachable through the three-turn rotation.
*/

/** Wanting change and not doing it. Motivational interviewing. */
const STUCK_INTENT =
  /\b(i keep|i should|i need to stop|i have to stop|every time i say|i always say|i told myself|i for don)\b/;

const TACTICS: Tactic[] = [
  // ── Validation — they need to be heard before anything else ──────────────
  {
    id: "exact_mirror",
    family: "validation",
    instruction:
      "Mirror their exact two strongest words back, then name where they are holding it. e.g. \"Choke. And you dey hold am for chest make e no show.\"",
    hold: "Two words in what you wrote are carrying more than the rest. Where in your body are they sitting right now?",
    fits: (c) => c.ventCount <= 1 || c.pressure !== null && c.pressure > 60,
    weight: (c) => (c.ventCount <= 1 ? 90 : 40),
    // Saying their own words back promises nothing and fixes nothing.
    holdsWhenNothingMoves: true,
  },
  {
    id: "emotional_naming",
    family: "validation",
    instruction:
      "Name the emotion sitting underneath the one they showed. e.g. \"Na shame dey under that anger.\"",
    hold: "The anger is the loud one, and something quieter is standing under it. What is the one underneath?",
    fits: has(ANGER),
    weight: () => 75,
    // The emotion under the loud one is there whether or not anything moves.
    holdsWhenNothingMoves: true,
  },
  {
    id: "normalization",
    family: "validation",
    instruction:
      "Normalise without softening — anyone shaped this way would feel this. e.g. \"Anybody wey grow for house where love na performance go feel this.\"",
    hold: "That is not a flaw in you — it is arithmetic anyone in your seat would run. What went into the sum?",
    fits: has(/\b(crazy|mad|only me|am i normal|something wrong with me)\b/),
    weight: () => 80,
    // "Anybody would feel this" is the most useful sentence there is after a
    // death, and the one people are least often given.
    holdsWhenNothingMoves: true,
  },

  // ── Cognitive — a thinking trap, not a feeling problem ───────────────────
  /*
    The three moves for somebody watching themselves.

    None of them interpret. That is the whole design: an interpretation is
    another object for the watcher to pick up and turn over, and they are
    already very good at that. Handing insight to somebody drowning in
    insight is not help, it is more water.

    They are ordered the way a person can actually receive them — name the
    gap, then take the load off the thinking, then move something small.
  */
  {
    id: "insight_is_not_change",
    family: "observing",
    /*
      Say the true thing nobody says to them: the understanding is finished
      and it did not work.

      This has to be said without contempt. They did not fail at thinking —
      they succeeded at it, completely, and the success is the trap. The
      question at the end is the load-bearing part, and it is deliberately
      one they cannot answer by understanding harder.
    */
    instruction:
      "Tell them plainly that they already understand this, better than most people would — and that the understanding has not moved it, which is not their fault and is worth saying out loud. Do not add one new interpretation, not even a good one. End on the question that analysis cannot answer: what would they actually do tonight if they were never going to understand it? e.g. \"You don sabi this one finish. Wetin you go do tonight if the understanding no dey come?\"",
    hold: "You already understand it. What would you do tonight if you never did?",
    fits: (c) => caughtWatchingSelf(c.message),
    /*
      Both confident readings have to clear `exact_mirror`, which sits at 90
      on turn one. That is the whole point of this tactic: the mirror is the
      single thing this person has already had a thousand times, from every
      friend who ever said "that sounds really hard". Saying their sharpest
      words back to them is not contact here, it is the loop with better
      manners.

      A weak reading — one marker and a long sentence — stays below it. There
      the mirror probably *is* the right move and this is a guess.
    */
    weight: (c) => [70, 86, 93][watchingConfidence(c.message)],
    // It promises nothing and fixes nothing — it just stops pretending the
    // next lap will be the one.
    holdsWhenNothingMoves: true,
  },
  {
    id: "felt_sense",
    family: "observing",
    /*
      Gendlin. Go under the narrator.

      The watcher lives in words, so the one place it cannot follow is the
      part of the body that has not been worded yet. `body_map_drop_set`
      asks where it sits; this asks something harder and more useful — what
      it is like before there is a name for it, and it explicitly refuses
      the tidy label, because a tidy label is how the watcher takes the
      wheel back.
    */
    instruction:
      "Take them under the words. Ask what the thing in their body is like before it has a name — its shape, weight, temperature, whether it moves. If they answer with a label like 'anxiety' or 'stress', gently say that is the word for it and ask what it is actually like. Never interpret what the sensation means. e.g. \"No be the name. Wetin e resemble — heavy? sharp? e dey move?\"",
    hold: "Before the word for it — what is it like in there: its shape, its weight, whether it moves?",
    /*
      And the body's move, since `body_map_drop_set` was retired.

      The drop set answered "my chest is tight" with an instruction to breathe;
      the no-errands rule retired it, and for a commit nothing answered a named
      body at all — "chest + high pressure" went to `double_standard`, the room
      changing the subject on the one thing they had located. This tactic is
      what the spec asks for there: stay with what the body is doing and ask
      about it. So it takes the drop set's gate and its exact weights — 88 when
      the pressure is high, 72 when it is not — and keeps its own for the
      trigger it was written for. Same selection pressure on the same turns; a
      question where an instruction was.
    */
    fits: (c) => c.body !== null || caughtWatchingSelf(c.message),
    weight: (c) =>
      caughtWatchingSelf(c.message) ? (c.body ? 88 : 76) : c.pressure !== null && c.pressure > 70 ? 88 : 72,
    holdsWhenNothingMoves: true,
  },
  {
    id: "name_the_noticing",
    family: "observing",
    /*
      Both at once — the capacity itself. Somebody who can feel their chest go
      tight and watch it happen is doing the one thing every change here
      depends on, and nobody has ever told them it is a thing. Naming it is how
      it becomes findable again. No praise: praise makes it a performance.

      89: above `felt_sense`'s 88, because somebody already inside the body and
      watching it does not need taking under the words; below `exact_mirror`'s
      turn-one 90, because the mirror is the room's first act of showing them
      themselves; below `insight_is_not_change`'s confident 93, because
      noticing wrapped in analysis is the watcher again.
    */
    instruction:
      "They are feeling it and watching it at the same time — the capacity every change here depends on, so let them see they have it. Name what they noticed and that they noticed it, in their words, plainly: no praise, no lesson, no new interpretation. Then ask what the watching shows them that being inside it alone does not. e.g. \"You felt your chest go tight and you watched it happen. Wetin the watching dey show you?\"",
    hold: "You are feeling it and watching it at the same time. What does the watching show you?",
    fits: (c) => seesWhileIn(c.message),
    weight: () => 89,
    holdsWhenNothingMoves: true,
  },
  {
    id: "name_the_forecast",
    family: "observing",
    /*
      The ending they are already living, seen as theirs. Never argued down —
      odds are a debate and they will win it — and never promised away. The
      question does the rest: a number they chose is a number that is not ten,
      and a second ending they found is one nobody handed them.

      85: below a fused verdict (86), because a sentence about the whole self
      outweighs one about Tuesday; above `iterated_game` (84), which fits any
      family word and so loses to the more specific reading; far above
      `thought_record` (78), which argues with content this one only shows.
    */
    instruction:
      "They are already living an ending that has not happened. Say it back in their words as the ending they are sure of — never as what will happen, never argued down, never promised away. Then ask how sure it is right now, out of ten, or what else could happen: theirs to find, never yours to offer.",
    hold: "You are already living an ending that has not happened yet. How sure of it are you, right now, out of ten?",
    fits: (c) => forecasting(c.message),
    weight: () => 85,
  },
  {
    id: "socratic",
    family: "cognitive",
    instruction:
      "One Socratic question aimed at what the critical voice is trying to prove. e.g. \"Wetin that oga voice dey try prove say you no be?\"",
    hold: "That voice is trying to prove something. What is it trying to prove, and to whom?",
    fits: has(ANALYTICAL),
    weight: () => 70,
  },
  {
    id: "thought_record",
    family: "cognitive",
    // Same CBT bones, none of the worksheet. "Evidence for / evidence
    // against" is a clipboard talking; ask what has actually held up and what
    // they already survived, then hand them one smaller true sentence.
    instruction:
      "Take the exact sentence they just said to themselves and hold it up. Ask what has actually happened so far that backs it, and what they have already survived that says otherwise. Then ask them for the smaller, truer sentence that is still standing — theirs to find, never yours to hand over. Never say 'evidence for and against' — that is a clipboard talking.",
    hold: "The sentence you said to yourself is bigger than what has actually happened. What is a smaller one that is still true?",
    fits: has(CATASTROPHE),
    weight: () => 78,
  },
  {
    id: "reframe_power",
    family: "cognitive",
    instruction:
      "Hand the power back without excusing the other person. e.g. \"Oga no make you small — e just find the small pikin wey you already hide.\"",
    hold: "Some of this belongs to them, and you have been carrying it as yours. Which part was never yours?",
    fits: has(/\b(he made me|she made me|they made me|oga|boss|manager)\b/),
    weight: () => 74,
  },
  {
    id: "decatastrophize",
    family: "cognitive",
    instruction:
      "Put a number on it: if the worst actually lands, one to ten, how bad — and are they still standing at the end of that sentence? Ask it plainly, not as an exercise.",
    hold: "If the worst case lands, how bad is it, one to ten — and are you still standing at the end of that sentence?",
    fits: has(CATASTROPHE),
    weight: () => 68,
  },
  {
    id: "double_standard",
    family: "cognitive",
    instruction:
      "Turn it outward: if their closest friend said this about themselves, what would they tell them?",
    hold: "If your closest friend said that about themselves, what would you tell them?",
    fits: has(SELF_CRITIC),
    weight: () => 82,
  },

  /*
    ── WHERE THE SOMATIC AND BEHAVIORAL FAMILIES WENT ──────────────────────

    Nine tactics were retired together, by one rule: "You never assign
    external tasks, behavioral homework, or micro-errands of any kind" — the
    founder's spec, which overruled this library's older line that generic was
    the offence and task was not.

    Every one of the nine *was* a task, which is why none was rewritten. A
    process-level version of the drop-set breath is not a drop set, and keeping
    the id over a different move would make the efficacy loop score one tactic
    under another's name:

      behavioral  micro_action, opposite_action, behavioral_activation, micro_loop
      somatic     body_map_drop_set, grounding_54321, progressive_squeeze, orienting
      observing   postpone_the_loop — a scheduled worry window is an experiment

    The body is not abandoned. `felt_sense` stays, and it is what the spec asks
    for: a question about what the sensation is like, never an instruction to
    change it. The nothing-can-move pool went from fourteen to ten and every
    survivor is a presence move.

    The cost is written down rather than discovered. `grounding_54321` was the
    answer to panic, numbness and "not real"; the room now stays with that
    instead of walking somebody through it. And at mood ≤ 4,
    `behavioral_activation` won 15 of 72 authored messages — those turns now go
    to the rest of the library.
  */

  // ── Duality — two parts pulling ─────────────────────────────────────────
  {
    id: "duality_slider",
    family: "duality",
    instruction:
      "Name the two parts and ask which is louder right now, 0–100. e.g. impress the oga vs burn the office down.",
    hold: "Two parts of you are pulling on this. Which one is louder right now, zero to a hundred?",
    fits: (c) => PARTS.test(c.message.toLowerCase()) || c.duality !== null,
    weight: (c) => (c.duality !== null ? 84 : 70),
  },
  {
    id: "ifs_parts",
    family: "duality",
    instruction:
      "Find the young part carrying the rule — \"if I don't perform I'm not loved\" — and ask how old it is.",
    hold: "There is a rule you have been keeping. How old were you when you learned it?",
    fits: has(/\b(prove|earn|not enough|never good enough|since i was)\b|\b(perform)/),
    weight: () => 76,
  },
  {
    id: "two_chair",
    family: "duality",
    instruction:
      "Put the fear in the chair opposite. What does it say? Have them answer it here, in their own words.",
    hold: "If the fear sat across from you and spoke first, what would it say — and what would you say back?",
    fits: has(/\b(stuck|two minds|can'?t decide|torn|i dey confuse)\b/),
    weight: () => 72,
  },

  // ── Narrative + real world ──────────────────────────────────────────────
  {
    id: "externalization",
    family: "narrative",
    instruction:
      "Externalise the story — when did this 'failure' story first enter the house? Father, school, or the economy?",
    hold: "That story came into your house before it came into you. When did it first arrive — father, school, or the economy?",
    fits: (c) => words(c.message) > 45,
    weight: () => 74,
  },
  {
    id: "miracle_question",
    family: "narrative",
    instruction:
      "If they woke tomorrow and it had shifted slightly, what would they notice first in the body?",
    hold: "If it had shifted by morning, what is the first thing your body would notice?",
    fits: has(HOPELESS),
    weight: () => 76,
  },
  {
    id: "deepsearch_pattern",
    family: "narrative",
    instruction:
      "Lay the repetition out with their own past phrases and dates, then ask if it is the same pattern.",
    hold: "Is this the same question as earlier, wearing a new coat?",
    fits: (c) => c.ventCount >= 3,
    weight: (c) => 60 + Math.min(c.ventCount * 3, 25),
  },
  // ── The three engines, as moves rather than as prose ────────────────────
  //
  // The prompt describes how to think. A tactic is *chosen*, logged, and
  // scored by the efficacy loop — which is the difference between an idea the
  // model might use and one the product measurably runs. These three are the
  // engines made selectable, so they compete on evidence like everything else.
  {
    id: "iterated_game",
    family: "relational",
    instruction:
      "This is not one move — it is a long game with somebody they will still know next year. Put both payoffs where they can see them: avoiding it buys short relief and long dread; doing it costs short discomfort and buys long clarity. Show the matrix. NEVER say which one to pick — choosing for them is what undoes it.",
    hold: "This is a long game, not one hand. What does avoiding buy you, and what does it cost?",
    // Family and duty, where one-shot thinking does the most damage — you
    // cannot walk away from a mother the way you walk away from a deal.
    fits: (c) =>
      c.realWorldTag === "family" ||
      /\b(mum|mummy|mumcy|mama|dad|daddy|papa|brother|sister|wife|husband|family|parents?)\b/.test(
        c.message.toLowerCase(),
      ),
    weight: () => 84,
  },
  {
    id: "future_self",
    family: "cognitive",
    instruction:
      "Ask what the version of them that already has clarity on this can see that they cannot yet. Not 'it will be fine' — they can smell that. Ask what that one sees, never what that one would do: a plan is homework, and this room hands out none.",
    hold: "The version of you that already has clarity on this — what does that one see that you cannot yet?",
    // Stuck, not distraught. This asks somebody to move, and asking a person
    // in freefall to move is a demand dressed as a question.
    fits: (c) =>
      (c.pressure ?? 50) < 80 &&
      (HOPELESS.test(c.message.toLowerCase()) || /\b(stuck|don'?t know|idk|i no know)\b/.test(c.message.toLowerCase())),
    weight: () => 76,
  },
  {
    id: "here_and_now",
    family: "relational",
    instruction:
      "Pull them into the present — as they type this to you right now, what is happening in the belly?",
    hold: "Stop on this sentence. What is happening in your belly as you say it?",
    fits: has(ANALYTICAL),
    weight: () => 62,
    // Pure presence — the belly right now, not a plan for the situation.
    holdsWhenNothingMoves: true,
  },
  {
    id: "rupture_repair",
    family: "relational",
    instruction:
      "Let them go before they run. \"I go let you go before you run. Shrine dey when ready.\"",
    hold: "Nothing is owed here, and you can stop. What was the sentence you nearly typed?",
    fits: (c) => AVOIDANT.test(c.message.toLowerCase()) && words(c.message) <= 6,
    weight: () => 85,
    // Letting somebody go without a task is *more* right here, not less.
    holdsWhenNothingMoves: true,
  },

  {
    id: "faith_frame",
    family: "narrative",
    /*
      The frame most of this market actually thinks in, and the one the
      library had no move for.

      `meaning_stance` is Frankl and it is the right answer when nothing can
      move — a father's results, a death. But the ordinary register is not
      terminal and it is everywhere: "I don dey pray since", "God's time is
      the best", "I don't know if God is punishing me", "pastor said make I
      fast". Without a move for it, a spiritual sentence got answered with a
      cognitive worksheet — the WEIRD failure this file already names for
      family obligation, unaddressed one domain over.

      The clinical content is Pargament's religious coping, and specifically
      the part that matters here: faith can be a place to rest, or it can
      become one more examination somebody is failing. "If I had enough
      faith this would have lifted by now" turns a comfort into a second
      source of shame, on top of the thing that brought them. Naming that
      without touching the theology is the whole move.

      Four rules, and the reason each exists:

      - Use only the name they used. God, Allah, chi, the universe. Never
        introduce one, never swap one for another, never generalise it to
        "your faith" — that is a stranger renaming the most personal thing
        in the message.
      - Never affirm and never doubt the belief. This product is not a
        chaplain and it is not an atheist. Both readings lose half the room,
        and the standard the Breaking Room already sets is that a line must
        land for a Muslim, a Christian, a traditionalist and somebody who
        thinks all of it is nonsense.
      - Never prescribe practice. "Pray about it", "have you tried fasting",
        "give it to God" — advice, presumption, and not ours to give.
      - Never diagnose the belief as a coping mechanism. They did not ask.
    */
    instruction:
      "They have brought their faith into this, so answer inside it rather than around it — using only the name they used for it, never one you introduce. Do not affirm it and do not question it; that is not what is being asked and both cost you the room. The one thing worth asking is what it is doing for them right now: whether it is somewhere they get to rest, or whether it has quietly become one more thing they are failing at — the enough-faith exam. Never prescribe practice, never say everything happens for a reason, never tell them what it means. e.g. \"You talk say you don dey pray since. When you pray about this one, e dey feel like rest, or e don turn another exam wey you dey fail?\"",
    hold: "When you take this to God, is it somewhere to rest — or has it become one more thing to pass?",
    fits: (c) => FAITH.test(c.message.toLowerCase()),
    weight: () => 84,
    // It asks nothing of the situation and nothing of the belief. When the
    // ground is gone this still stands, because it only asks about now.
    holdsWhenNothingMoves: true,
  },

  // ── five traditions the library was missing ───────────────────────────────

  {
    id: "meaning_stance",
    family: "narrative",
    /*
      Frankl, and the one situation every other tactic in this file gets
      wrong. When a father's results come back, nothing can be reframed,
      tested, activated or actioned — and reaching for any of those tells the
      person you did not understand what they said. What is left is the only
      freedom Frankl claimed was never taken: not what happens, but the
      stance you take toward it. Asked, never asserted, because handing
      somebody a meaning for their father's illness is obscene.
    */
    instruction:
      "This one does not move, and you must not try to move it. Say plainly that nothing here can be fixed, so you are not going to pretend otherwise. Then ask the only question left: not what they can do about it, but who they want to be while it happens. Never offer them a meaning for it. Never say 'everything happens for a reason' or anything within a mile of it — they will leave and they will be right to.",
    hold: "Nothing here is fixable, and I am not going to pretend it is. Who do you want to be while it is happening?",
    fits: (c) => nothingCanMove(c.message),
    /*
      The weight is now the *second* thing that keeps this above a problem-
      solving move, and it used to be the only thing — which is why the
      comment that stood here ("when this fits, the others are wrong") was a
      guarantee the code kept for exactly one turn. `selectTactic` vetoes the
      fixing moves outright when nothing can move; this 92 only decides the
      order among the survivors.
    */
    weight: () => 92,
    holdsWhenNothingMoves: true,
  },

  {
    id: "ubuntu_frame",
    family: "relational",
    /*
      A person is a person through other persons. The Western instinct is to
      call this enmeshment and prescribe boundaries; for somebody whose
      personhood is genuinely constituted through the people they carry, that
      is a foreign anthropology dressed as clinical advice.

      Both halves are load-bearing. Name the weight as real — pretending it
      is light is its own insult — and refuse to name the belonging as the
      fault. Then ask the question nobody asks a firstborn.
    */
    instruction:
      "Name the weight exactly and do not call the obligation a problem — that is who they are, not a symptom, and telling a firstborn to set boundaries with their mother is advice from a different world. Say the cost out loud without saying they should put it down. Then ask the question nobody asks them: everybody is held by them, so who holds them.",
    hold: "You are carrying people, and that is not a fault to fix. Everybody leans on you — who do you lean on?",
    fits: has(OBLIGATION),
    /*
      Below `iterated_game` (84), deliberately, after trying it above.

      At 86 this displaced the long-game engine on every family message and
      orphaned it — solving my shadowing problem by creating the same one
      pointing the other way, which check 15i caught immediately. New moves
      do not get to outrank established ones just because they are new.

      Reachable the same way `defusion` and `change_talk` are: the three-turn
      rotation. Second in line is not dead, and it is the honest position for
      a move that has never been read by anybody in a real room.
    */
    weight: () => 82,
    /*
      Possibly the most important line in the file after a death, and in a
      Nigerian house especially: the bereaved is usually also the one running
      the burial, feeding the visitors and holding everybody else up. "Who
      holds you" is the question nobody in that room is asking them.
    */
    holdsWhenNothingMoves: true,
  },

  {
    id: "defusion",
    family: "cognitive",
    /*
      Hayes, and deliberately not `thought_record`. That one argues with the
      content of the thought; this one changes the relationship to it. "I am
      a failure" fought on its own terms concedes the premise that the
      sentence is a verdict to be litigated. Six words of distance does more.

      And first, when the verdict is fused. It used to come second, after
      `double_standard`, on any self-critical word. The founder's core
      mechanism makes the order a decision: seeing it while in it is the
      primary condition for change, so when somebody states a verdict on the
      whole self as a fact (`fusedVerdict`), one step back from the sentence
      comes before asking what they would tell a friend — the reframe argues
      with the content; this lets them see it. 86 keeps the room's other
      orders: the turn-one mirror (90) and a named body (88) still come first.
      A self-critical word without the verdict keeps the old order, at 80.
    */
    instruction:
      "Do not argue with the sentence. Put one inch between them and it: they are not the thing they said, they are the one having the thought that they are. Say it back with that gap in it, in their own words, once. Never explain the technique.",
    hold: "You are not that sentence. You are the one hearing it — so how long has it been saying that to you?",
    fits: (c) => has(SELF_CRITIC)(c) || fusedVerdict(c.message),
    weight: (c) => (fusedVerdict(c.message) ? 86 : 80),
  },

  {
    id: "earned_worth",
    family: "cognitive",
    /*
      The rule underneath "I am not enough", not the feeling on top of it.

      `defusion` puts distance between a person and a sentence.
      `thought_record` asks what has held up. Neither names the *rule* that
      made the sentence feel true, and for one family of message that rule is
      the entire content: somebody described as a machine that needs fixing is
      not sad, they are exhausted from earning their own worth.

      The mechanism is ordinary and nobody says it out loud — if being loved
      followed from functioning, then not functioning reads as not being
      lovable. That is a rule somebody was taught, not a fact about them, and
      saying which of the two it is does more than any amount of reflection.

      TWO THINGS THIS DELIBERATELY DOES NOT DO

      It does not use the words for it. "Conditional worth", "internalized
      instrumentalization" and "core belief" are the names the literature has,
      they are all shorter than the explanation, and a model reaches for the
      short thing — which is the same insight with the person removed from it.
      `quality.ts` grades that as `jargon` and spends a retry on it.

      And the counter-evidence is what is true in the room tonight rather than
      an argument: the light is on, they opened this instead of shutting down,
      they are breathing without producing anything. A rule that says worth is
      earned is not beaten by a better argument, it is beaten by a minute that
      contradicts it while they are sitting in it.

      Weight 76, not 90. Two entries at 90 have taken over a selector in this
      product — `exact_mirror` and `rogers_never_said` — and this one fits a
      recognisable family of message rather than a rare one, which is exactly
      the shape that becomes the only move that ever fires.
    */
    instruction:
      "Name the rule they were taught, in words a fourteen-year-old would follow, and say plainly that it is a rule and not a fact — never the word for it. Then give them one true thing in this room tonight that the rule cannot explain: they are here, doing nothing useful, and still here. If an action fits, it is a deliberately unproductive minute — no output, nothing to show for it — because that is what contradicts the rule; pick it out of what they told you, never from a list.",
    hold: "That is a rule you were taught, not a fact about you. You are producing nothing right now, and you are still here. Who taught you the rule?",
    fits: has(/\b(machine|robot|useless|not enough|no be enough|fixing|fix me|broken|failing|lazy|burden|productive|output|earn)\b/),
    weight: () => 76,
  },

  {
    id: "exception_finding",
    family: "narrative",
    /*
      de Shazer. `miracle_question` imagines the problem gone; this finds the
      hour it was already smaller, which is harder to dismiss because it
      actually happened. The specific move against "nothing ever changes" —
      one counter-example, in their own history, beats any argument.
    */
    instruction:
      "They said nothing changes. Find the hour it was five per cent less bad — not a good day, just less bad — and make them tell you what was different about it. Who was there, what time, what they had eaten. Specifics only; a vague 'sometimes it's better' is not an exception and does not count.",
    hold: "Was there one hour this week that was even slightly less heavy — and what was different about it?",
    fits: has(HOPELESS),
    weight: () => 80,
  },

  {
    id: "change_talk",
    family: "duality",
    /*
      Miller and Rollnick. The finding that made MI: an argument for change
      made by the listener produces resistance, and the same argument made by
      the person produces change. So the move is to shut up and let them make
      it — which is also the only version compatible with a room that has
      banned advice.
    */
    instruction:
      "They have said what they should do. Do not agree with it, do not encourage it, and do not add a reason — every reason you supply is one they now have to defend against. Ask them for theirs instead: what makes this worth doing, in their words, and what would be different by Friday if it happened. Their sentence, not yours.",
    hold: "You already said what you should do. Why does it matter to you — not to anybody else?",
    fits: has(STUCK_INTENT),
    weight: () => 74,
  },
];

/**
 * One tailored move per real-world pressure, only when detected — a shape and a
 * question, never a coping task.
 *
 * Eight of these nine were micro-errands until the founder's VENT spec was
 * integrated, a day *after* the no-errands spec that should already have
 * removed them: "cold water on the face for ten seconds", "outside the door
 * for 30 seconds", "one account to mute today. That is the whole task." They
 * walked past `errand()` because every hold opened on "Hold …", a verb that
 * detector had no reason to know — the fifth time a pattern written the way
 * its author would phrase a task met a task phrased another way. In production
 * only `rw_lonely` had fired, twice, which is two lonely people told to go and
 * stand outside a door.
 *
 * The ids stay, `rw_family`'s precedent: an id here names the pressure, not
 * the technique, and there are two rows of history under it.
 */
export const REAL_WORLD_TACTIC: Record<Exclude<RealWorldTag, null>, Tactic> = {
  economy: mk(
    "rw_economy",
    "Money pressure. Give it its real shape in their details — the sum, who it is owed to, what it is quietly deciding about them. No plan, no budget, nothing to control. Ask what it has cost them that is not money.",
    "The numbers stopped adding up, and you are the one standing inside the sum. What has it cost you that isn't money?",
  ),
  japa: mk(
    "rw_japa",
    "Japa. Staying costs something and leaving costs something, and the weighing is theirs — name both weights in their words, never a list, never which. Ask who they would be leaving, and who they would be staying for.",
    "Leaving costs something and staying costs something, and you are holding both. Who are you leaving, and who are you staying for?",
  ),
  ai_job: mk(
    "rw_ai_job",
    "The machine is coming for the work. No reassurance and no list of what AI cannot do: name what the fear is measuring — their worth by their output — and ask what they are before any job title.",
    "The job and you were never the same thing, and the fear treats them as one. What would you still be if the job went?",
  ),
  social: mk(
    "rw_social",
    "Comparison online: their whole footage against somebody's highlight reel. Say it with their details — never mute, log off or take a break. Ask whose life they are measuring theirs against.",
    "You are holding your whole footage up against somebody's highlight reel. Whose life are you measuring yours against?",
  ),
  /*
    This said: "Firstborn pressure — one boundary, ten words, to the person
    who needs to hear it."

    That is the highest-priority move this product has for family, at 95,
    outranking the entire general library — and it is imported anthropology.
    "Set a boundary" is the standard Western answer to obligation, and it
    assumes a self that exists prior to its relationships and is being
    encroached on. For a Lagos firstborn sending money home, personhood is
    partly constituted *by* the people they carry: umuntu ngumuntu ngabantu.

    Told to draw a line with their mother, that person does one of two
    things. They dismiss the app as not understanding their life, which is
    the good outcome. Or they take the advice, damage something load-bearing,
    and carry the guilt of that too.

    The cost is still named — pretending the weight is light is its own
    insult, and the drop is what this product measures. What changes is that
    the belonging stops being diagnosed as the fault, and the question turns
    around: everybody leans on them, and nobody has ever asked who they lean
    on.
  */
  family: mk(
    "rw_family",
    "Firstborn weight. Name what it costs them exactly, and do not call the obligation a problem or tell them to set a boundary — that is who they are, not a symptom, and it is advice from a different world. Then ask the question nobody asks them: everybody leans on them, so who do they lean on.",
    "You are carrying people, and that is not a fault to fix. Everybody leans on you — who do you lean on?",
  ),
  lonely: mk(
    "rw_lonely",
    "Loneliness, and the door. Send them nowhere and give them nothing to do. Say plainly what you are — a machine that cannot leave and cannot be in the room with them — so this is rehearsal, not company. Ask who the one person is that this sentence is really for.",
    "I'm a machine: I can't leave, and I can't be in the room with you either. Who is the one person you wish had read this instead?",
  ),
  traffic: mk(
    "rw_traffic",
    "Traffic. The road spends hours that were theirs — give it that arithmetic in their details, never a use for the time. Ask who gets what is left of them when they get home.",
    "The road spends your hours before you do, and somebody gets what is left. Who gets what's left of you when you get home?",
  ),
  climate: mk(
    "rw_climate",
    "Heat and no light. It turns the volume up on everything else — say so in their details, and never offer water, a fan or a cold anything. Ask what the heat is making louder tonight.",
    "The heat turns the volume up on everything else. What is it making louder tonight?",
  ),
  health: mk(
    "rw_health",
    "Health news. Name it exactly, in their words — no advice, no test, no call to make. Ask who else knows they are carrying it.",
    "What is not said gets to be bigger than it is. Who else knows you are carrying this?",
  ),
};

function mk(id: string, instruction: string, hold: string): Tactic {
  return {
    id,
    family: "narrative",
    instruction,
    hold,
    fits: () => true,
    // Beats every general tactic — a real-world pressure deserves its own tool.
    weight: () => 95,
  };
}

/** Above this, a tactic is a real-world tool and outranks the general library. */
const PRIORITY_BAND = 95;

/**
 * Picks the highest-weighted eligible tactic that has NOT been used in the
 * last three turns. Falls back progressively rather than repeating.
 *
 * Efficacy is applied *inside* a band, never across one. Sorting on
 * `weight + delta` alone would let a general tactic at 85 + 6 overtake a
 * real-world tactic at 95 − 6, which is the one ordering this file has always
 * guaranteed: a named pressure gets its own tool. Learning is allowed to
 * reorder peers and is not allowed to rewrite that.
 */
export function selectTactic(ctx: TacticContext): Tactic {
  const blocked = new Set(ctx.recentTactics.slice(-3));

  let pool: Tactic[] = [...TACTICS];
  if (ctx.realWorldTag) pool.push(REAL_WORLD_TACTIC[ctx.realWorldTag]);

  /*
    When nothing can move, the moves that assume it can are not outranked —
    they are gone.

    This used to be a weight. `meaning_stance` sat at 92 with a comment above
    it saying "when this fits, the others are wrong", and a weight cannot say
    that: it wins one contest, once. On turn two of a terminal diagnosis the
    three-turn block took it out of the running and the runner-up spoke —
    `iterated_game`, to somebody whose father was dying, offering to *show
    them the payoff matrix*. And a real-world tag beat it outright at any
    turn, so "my dad is dying and the hospital bill is 2 million" got the
    money-choke tool. The comment was true and the code was not.

    Filtered on the pool rather than on `eligible` on purpose. The stale
    fallback at the bottom of this function searches `pool` and ignores
    `fits` entirely, so a veto applied any later would be walked straight past
    on the one turn it mattered most — the third one, when everything good has
    already been said.
  */
  if (nothingCanMove(ctx.message)) {
    pool = pool.filter((t) => t.holdsWhenNothingMoves);
  }

  /*
    Somebody already watching themselves does not get handed a mirror.

    Same shape as the veto above, for the same reason: these are not moves
    that merely rank lower here, they are moves that make it worse. Every one
    of them is a request to think about the thought — which is the activity
    the person cannot stop, performed with the app's blessing.

    `socratic` was the live bug. It fires on ANALYTICAL at weight 70, so the
    most fluent self-analysts in the product were reliably answered with one
    more question to take away and turn over. Thirty-two tactics and the
    library's honest response to "I know exactly why I do this and I still do
    it" was to ask what the critical voice is trying to prove.

    Kept deliberately small. `here_and_now` also fires on ANALYTICAL and
    stays, because it goes to the belly rather than the argument — it was
    always the right instinct, just outranked.
  */
  if (caughtWatchingSelf(ctx.message)) {
    pool = pool.filter((t) => !FEEDS_THE_LOOP.has(t.id));
  }

  const rank = (t: Tactic) => {
    const base = t.weight(ctx);
    const band = base >= PRIORITY_BAND ? 1 : 0;
    return band * 1000 + base + (ctx.efficacy?.get(t.id) ?? 0);
  };

  const eligible = pool
    .filter((t) => t.fits(ctx))
    .sort((a, b) => rank(b) - rank(a));

  const fresh = eligible.find((t) => !blocked.has(t.id));
  if (fresh) return fresh;

  // Everything eligible is stale — take any unused tactic over a repeat.
  const anyFresh = pool.find((t) => !blocked.has(t.id));
  return anyFresh ?? eligible[0] ?? TACTICS[0];
}

/**
 * Moves that ask somebody to think about the thought — vetoed for anybody
 * already watching themselves think (see `selectTactic`). Exported so the suite
 * reads the set the selector uses rather than a copy of it.
 *
 * `name_the_forecast` joined it with the forecast reading: "how sure, out of
 * ten?" is exactly the evaluation a person caught in their own analysis cannot
 * stop running, and asked of them it is one more lap.
 */
export const FEEDS_THE_LOOP: ReadonlySet<string> = new Set([
  "socratic", "thought_record", "double_standard", "name_the_forecast",
]);

export const ALL_TACTIC_IDS = [
  ...TACTICS.map((t) => t.id),
  ...Object.values(REAL_WORLD_TACTIC).map((t) => t.id),
];

/**
 * Every tactic, for the eval suite and for anything that needs the library
 * rather than one selection. Exported so a check asserts the shipping table
 * instead of a copy of it.
 */
export const ALL_TACTICS: readonly Tactic[] = [
  ...TACTICS,
  ...Object.values(REAL_WORLD_TACTIC),
];

/**
 * A fallback is not a reply, and grading it as one is a lie.
 *
 * `quality.ts` learned this the expensive way: with no model key a vent gets
 * the tactic's authored `hold` — English prose, written for a room rather than
 * for this message — and graded as model output it produced ten "majors" on
 * the first run, every Pidgin case flagged for answering in English.
 *
 * The first version of this audit walked straight into it. Run against the
 * local store it reported five majors for "answered a Pidgin message in
 * English", and every one was an authored line from `tactics.ts` that no model
 * had ever seen.
 *
 * The store cannot say whether a model answered — there is no provider column,
 * and adding one would only help rows written after the migration. It does not
 * need one: the authored replies are a closed set, so an exact match against
 * the tactic library identifies them, retroactively, for every row already
 * stored.
 */
const AUTHORED: ReadonlySet<string> = new Set(
  ALL_TACTICS.map((t) => t.hold?.trim()).filter((h): h is string => Boolean(h)),
);

export function wasAuthored(reply: string | null): boolean {
  return Boolean(reply && AUTHORED.has(reply.trim()));
}

