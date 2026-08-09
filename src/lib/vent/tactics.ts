import type { Classification, RealWorldTag } from "./intent";

/**
 * 30 tactics. The selector never returns one used in the last 3 turns — that
 * is the whole point. Repeating "drop your shoulders" every reply is the tell
 * that nothing is thinking; garbage in, garbage out.
 */

export type TacticFamily =
  | "validation"
  | "cognitive"
  | "somatic"
  | "duality"
  | "behavioral"
  | "narrative"
  | "relational";

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
const CATASTROPHE = /\b(always|never|everything|nothing|ruin|disaster|end of|i will fail|i go fail)\b/;
const SELF_CRITIC = /\b(useless|stupid|failure|worthless|i'?m bad|i no good|weak)\b/;
const PARTS = /\b(part of me|one side|half of me|i want to but|i wan but)\b/;
const AVOIDANT = /\b(i'?m fine|it'?s fine|nothing|idk|i don'?t know|no be anything)\b/;
const HOPELESS = /\b(no point|hopeless|why bother|nothing go change|e no go better)\b/;
const WITHDRAW = /\b(isolat|withdraw|stay in|lock myself|no wan see anybody|hide)\b/;
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
const UNFIXABLE =
  /\b(dying|died|death|passed away|cancer|diagnos|terminal|test results?|stroke|hospital|nothing i can do|out of my hands|can'?t change|e don happen)\b/;

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
  /\b(family|mama|papa|mumcy|mummy|daddy|firstborn|first born|siblings?|brother|sister|send money|black tax|everybody depend|they depend|responsib|breadwinner|house people)\b/;

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
    hold: "Say the two heaviest words again, out loud. Then name where in the body they sit.",
    fits: (c) => c.ventCount <= 1 || c.pressure !== null && c.pressure > 60,
    weight: (c) => (c.ventCount <= 1 ? 90 : 40),
  },
  {
    id: "emotional_naming",
    family: "validation",
    instruction:
      "Name the emotion sitting underneath the one they showed. e.g. \"Na shame dey under that anger.\"",
    hold: "Name the one underneath the anger. Not the loud one — the one beneath it.",
    fits: has(ANGER),
    weight: () => 75,
  },
  {
    id: "normalization",
    family: "validation",
    instruction:
      "Normalise without softening — anyone shaped this way would feel this. e.g. \"Anybody wey grow for house where love na performance go feel this.\"",
    hold: "Nothing is wrong with you for feeling this. Anybody shaped the same way would.",
    fits: has(/\b(crazy|mad|only me|am i normal|something wrong with me)\b/),
    weight: () => 80,
  },

  // ── Cognitive — a thinking trap, not a feeling problem ───────────────────
  {
    id: "socratic",
    family: "cognitive",
    instruction:
      "One Socratic question aimed at what the critical voice is trying to prove. e.g. \"Wetin that oga voice dey try prove say you no be?\"",
    hold: "Ask that voice what it is trying to prove. Just the question tonight. No answer yet.",
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
      "Take the exact sentence they just said to themselves and hold it up. Ask what has actually happened so far that backs it, and what they have already survived that says otherwise. Then give them one smaller, truer sentence to carry instead of the big one. Never say 'evidence for and against' — that is a clipboard talking.",
    hold: "Take the sentence you said to yourself. Find one smaller one that is still true.",
    fits: has(CATASTROPHE),
    weight: () => 78,
  },
  {
    id: "reframe_power",
    family: "cognitive",
    instruction:
      "Hand the power back without excusing the other person. e.g. \"Oga no make you small — e just find the small pikin wey you already hide.\"",
    hold: "Two short lists — what is theirs, what is yours. Short ones. Do not pad either.",
    fits: has(/\b(he made me|she made me|they made me|oga|boss|manager)\b/),
    weight: () => 74,
  },
  {
    id: "decatastrophize",
    family: "cognitive",
    instruction:
      "Put a number on it: if the worst actually lands, one to ten, how bad — and are they still standing at the end of that sentence? Ask it plainly, not as an exercise.",
    hold: "Put a number on the worst case, one to ten. Then say whether you are still standing.",
    fits: has(CATASTROPHE),
    weight: () => 68,
  },
  {
    id: "double_standard",
    family: "cognitive",
    instruction:
      "Turn it outward: if their closest friend said this about themselves, what would they tell them?",
    hold: "Say it again as if your closest friend said it about themselves. Then answer them.",
    fits: has(SELF_CRITIC),
    weight: () => 82,
  },

  // ── Somatic — ONLY when the body was mentioned or pressure is high ───────
  {
    id: "body_map_drop_set",
    family: "somatic",
    instruction:
      "Name the exact place they said, then one drop set: 4 secs inhale, 6 secs exhale, drop the shoulder. Tell them to do it now.",
    hold: "Four seconds in, six out, drop the shoulder. Once, now, before the next sentence.",
    fits: (c) => c.body !== null,
    weight: (c) => (c.pressure !== null && c.pressure > 70 ? 88 : 72),
  },
  {
    id: "grounding_54321",
    family: "somatic",
    instruction:
      "5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste — have them call it out now.",
    hold: "Five you can see, four you can touch, three you can hear. Out loud, now.",
    fits: has(/\b(panic|numb|blank|floating|not real|dissociat|idk|i don'?t know)\b/),
    weight: () => 80,
  },
  {
    id: "progressive_squeeze",
    family: "somatic",
    instruction:
      "Clench the fist 5 secs, release, notice the difference — then do it for the shoulder.",
    hold: "Fist tight for five, then let go. Notice the difference. That is the whole task.",
    fits: (c) => (c.pressure ?? 0) > 70,
    weight: () => 66,
  },
  {
    id: "orienting",
    family: "somatic",
    instruction:
      "Look slowly left, slowly right — where did the eye want to rest? Is that place safe?",
    hold: "Look slow to the left, slow to the right. Where did your eyes want to stop?",
    fits: has(/\b(anxious|on edge|jumpy|can'?t settle|watching|scared)\b/),
    weight: () => 64,
  },

  // ── Duality — two parts pulling ─────────────────────────────────────────
  {
    id: "duality_slider",
    family: "duality",
    instruction:
      "Name the two parts and ask which is louder right now, 0–100. e.g. impress the oga vs burn the office down.",
    hold: "Name the two parts pulling. Then say which is louder right now, zero to a hundred.",
    fits: (c) => PARTS.test(c.message.toLowerCase()) || c.duality !== null,
    weight: (c) => (c.duality !== null ? 84 : 70),
  },
  {
    id: "ifs_parts",
    family: "duality",
    instruction:
      "Find the young part carrying the rule — \"if I don't perform I'm not loved\" — and ask how old it is.",
    hold: "Find the rule you have been keeping. Then ask how old you were when you learned it.",
    fits: has(/\b(perform|prove|earn|not enough|never good enough|since i was)\b/),
    weight: () => 76,
  },
  {
    id: "two_chair",
    family: "duality",
    instruction:
      "Put the fear in the chair opposite. What does it say? Have them answer it out loud.",
    hold: "Put the fear in the chair across from you. Let it talk first. Then answer it.",
    fits: has(/\b(stuck|two minds|can'?t decide|torn|i dey confuse)\b/),
    weight: () => 72,
  },

  // ── Behavioral — stuck, needs one tiny win ──────────────────────────────
  {
    id: "micro_action",
    family: "behavioral",
    instruction:
      "One micro action, ten words or fewer, doable in under a minute. e.g. \"Send one text: 'I go late small.'\" Tell them to do it now.",
    hold: "One thing, under a minute, doable now. Ten words or fewer. Then go and do it.",
    fits: has(/\b(avoid|procrastinat|putting off|haven'?t|can'?t start|no fit start)\b/),
    weight: () => 80,
  },
  {
    id: "opposite_action",
    family: "behavioral",
    instruction:
      "DBT opposite action — they want to withdraw, so send them out the door for 30 seconds.",
    hold: "Thirty seconds outside the door. Not an hour, not a plan. Thirty seconds.",
    fits: has(WITHDRAW),
    weight: () => 82,
  },
  {
    id: "behavioral_activation",
    family: "behavioral",
    instruction:
      "Ask which chair they are in today, then one thing that would make them stand up out of it.",
    hold: "Say which chair you are in today. Then one thing that would get you standing.",
    fits: (c) => (c.mood ?? 10) <= 4,
    weight: () => 78,
  },

  // ── Narrative + real world ──────────────────────────────────────────────
  {
    id: "externalization",
    family: "narrative",
    instruction:
      "Externalise the story — when did this 'failure' story first enter the house? Father, school, or the economy?",
    hold: "Ask when that story first entered your house. Father, school, or the economy.",
    fits: (c) => words(c.message) > 45,
    weight: () => 74,
  },
  {
    id: "miracle_question",
    family: "narrative",
    instruction:
      "If they woke tomorrow and it had shifted slightly, what would they notice first in the body?",
    hold: "If it had shifted by morning, what would the body notice first? Only the first thing.",
    fits: has(HOPELESS),
    weight: () => 76,
  },
  {
    id: "deepsearch_pattern",
    family: "narrative",
    instruction:
      "Lay the repetition out with their own past phrases and dates, then ask if it is the same pattern.",
    hold: "Say what has come back more than once. Then ask if it is the same thing again.",
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
    hold: "This is a long game, not one hand. Hold both columns tonight: what avoiding buys you, and what it costs.",
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
      "Ask what the version of them that already has clarity on this would do in the next two hours. Not 'it will be fine' — they can smell that. The one who already solved it exists; what is that one doing before tonight?",
    hold: "The version of you that already has clarity on this — what is that one doing in the next two hours?",
    // Stuck, not distraught. This asks somebody to move, and asking a person
    // in freefall to move is a demand dressed as a question.
    fits: (c) =>
      (c.pressure ?? 50) < 80 &&
      (HOPELESS.test(c.message.toLowerCase()) || /\b(stuck|don'?t know|idk|i no know)\b/.test(c.message.toLowerCase())),
    weight: () => 76,
  },
  {
    id: "micro_loop",
    family: "behavioral",
    instruction:
      "Close on one repeatable loop, shaped as a trigger and an action: 'when [the thing that starts it], I will [one small action].' Name the trigger. Make the action small enough that they will actually do it tonight. One loop — never a list. Repetition is what changes a groove; insight is gone by morning.",
    hold: "One loop to carry out: when the thing starts tonight, you do one small thing. Name both before you go.",
    // Late in a session, when something has actually been named — a loop
    // handed over before anybody has said what they came to say is homework.
    fits: (c) => c.ventCount >= 2,
    weight: (c) => 64 + Math.min(c.ventCount * 2, 14),
  },
  {
    id: "here_and_now",
    family: "relational",
    instruction:
      "Pull them into the present — as they type this to you right now, what is happening in the belly?",
    hold: "Stop on this sentence. What is happening in your belly as you say it?",
    fits: has(ANALYTICAL),
    weight: () => 62,
  },
  {
    id: "rupture_repair",
    family: "relational",
    instruction:
      "Let them go before they run. \"I go let you go before you run. Shrine dey when ready.\"",
    hold: "You can stop here. Nothing is owed. The room stays open for whenever.",
    fits: (c) => AVOIDANT.test(c.message.toLowerCase()) && words(c.message) <= 6,
    weight: () => 85,
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
    fits: has(UNFIXABLE),
    // Above every problem-solving move. When this fits, the others are wrong.
    weight: () => 92,
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
  },

  {
    id: "defusion",
    family: "cognitive",
    /*
      Hayes, and deliberately not `thought_record`. That one argues with the
      content of the thought; this one changes the relationship to it. "I am
      a failure" fought on its own terms concedes the premise that the
      sentence is a verdict to be litigated. Six words of distance does more.
    */
    instruction:
      "Do not argue with the sentence. Put one inch between them and it: they are not the thing they said, they are the one having the thought that they are. Say it back with that gap in it, in their own words, once. Never explain the technique, never use the word 'defusion' or 'thought' as jargon.",
    hold: "You are not that sentence. You are the person hearing it. Say it again with 'I notice' in front.",
    fits: has(SELF_CRITIC),
    weight: () => 80,
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
    hold: "Find one hour this week it was even slightly less heavy. What was different about that hour?",
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
    hold: "You already said what you should do. Tell me why it matters to you — not to anybody else.",
    fits: has(STUCK_INTENT),
    weight: () => 74,
  },
];

/** One tailored coping move per real-world pressure, only when detected. */
export const REAL_WORLD_TACTIC: Record<Exclude<RealWorldTag, null>, Tactic> = {
  economy: mk(
    "rw_economy",
    "Fuel up three times this month — name one thing they can still control today, down to ten naira.",
    "Hold one thing you can control today, down to ten naira. Not the whole market.",
  ),
  japa: mk(
    "rw_japa",
    "Japa fear — three things they'd miss, three they'd gain. Written, not felt.",
    "Hold both lists tonight — three you'd miss, three you'd gain. Not one side.",
  ),
  ai_job: mk(
    "rw_ai_job",
    "List three things they do that AI cannot do. Three, not one.",
    "Hold three things you do that a machine cannot. Three, not one.",
  ),
  social: mk(
    "rw_social",
    "Instagram is a highlight reel — one account to mute today.",
    "Hold your eyes today. One account, muted. That is the whole task.",
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
    "Opposite action — outside the door for 30 seconds. Loneliness lies about how long that takes.",
    "Hold thirty seconds outside the door. Loneliness lies about how long that is.",
  ),
  traffic: mk(
    "rw_traffic",
    "Traffic doesn't define them — one thing they can do inside the danfo.",
    "Hold one thing that is yours inside the danfo. The road does not get to name you.",
  ),
  climate: mk(
    "rw_climate",
    "Cold water on the face for ten seconds. Heat makes everything feel worse than it is.",
    "Hold ten seconds of cold water on the face. The heat is making it louder than it is.",
  ),
  health: mk(
    "rw_health",
    "Name the fear precisely — 'I'm scared of X' — then the one call they've been avoiding.",
    "Hold the fear by its exact name tonight. Then the one call you have been avoiding.",
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

  const pool: Tactic[] = [...TACTICS];
  if (ctx.realWorldTag) pool.push(REAL_WORLD_TACTIC[ctx.realWorldTag]);

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
