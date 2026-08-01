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

const TACTICS: Tactic[] = [
  // ── Validation — they need to be heard before anything else ──────────────
  {
    id: "exact_mirror",
    family: "validation",
    instruction:
      "Mirror their exact two strongest words back, then name where they are holding it. e.g. \"Choke. And you dey hold am for chest make e no show.\"",
    fits: (c) => c.ventCount <= 1 || c.pressure !== null && c.pressure > 60,
    weight: (c) => (c.ventCount <= 1 ? 90 : 40),
  },
  {
    id: "emotional_naming",
    family: "validation",
    instruction:
      "Name the emotion sitting underneath the one they showed. e.g. \"Na shame dey under that anger.\"",
    fits: has(ANGER),
    weight: () => 75,
  },
  {
    id: "normalization",
    family: "validation",
    instruction:
      "Normalise without softening — anyone shaped this way would feel this. e.g. \"Anybody wey grow for house where love na performance go feel this.\"",
    fits: has(/\b(crazy|mad|only me|am i normal|something wrong with me)\b/),
    weight: () => 80,
  },

  // ── Cognitive — a thinking trap, not a feeling problem ───────────────────
  {
    id: "socratic",
    family: "cognitive",
    instruction:
      "One Socratic question aimed at what the critical voice is trying to prove. e.g. \"Wetin that oga voice dey try prove say you no be?\"",
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
    fits: has(CATASTROPHE),
    weight: () => 78,
  },
  {
    id: "reframe_power",
    family: "cognitive",
    instruction:
      "Hand the power back without excusing the other person. e.g. \"Oga no make you small — e just find the small pikin wey you already hide.\"",
    fits: has(/\b(he made me|she made me|they made me|oga|boss|manager)\b/),
    weight: () => 74,
  },
  {
    id: "decatastrophize",
    family: "cognitive",
    instruction:
      "Put a number on it: if the worst actually lands, one to ten, how bad — and are they still standing at the end of that sentence? Ask it plainly, not as an exercise.",
    fits: has(CATASTROPHE),
    weight: () => 68,
  },
  {
    id: "double_standard",
    family: "cognitive",
    instruction:
      "Turn it outward: if their closest friend said this about themselves, what would they tell them?",
    fits: has(SELF_CRITIC),
    weight: () => 82,
  },

  // ── Somatic — ONLY when the body was mentioned or pressure is high ───────
  {
    id: "body_map_drop_set",
    family: "somatic",
    instruction:
      "Name the exact place they said, then one drop set: 4 secs inhale, 6 secs exhale, drop the shoulder. Tell them to do it now.",
    fits: (c) => c.body !== null,
    weight: (c) => (c.pressure !== null && c.pressure > 70 ? 88 : 72),
  },
  {
    id: "grounding_54321",
    family: "somatic",
    instruction:
      "5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste — have them call it out now.",
    fits: has(/\b(panic|numb|blank|floating|not real|dissociat|idk|i don'?t know)\b/),
    weight: () => 80,
  },
  {
    id: "progressive_squeeze",
    family: "somatic",
    instruction:
      "Clench the fist 5 secs, release, notice the difference — then do it for the shoulder.",
    fits: (c) => (c.pressure ?? 0) > 70,
    weight: () => 66,
  },
  {
    id: "orienting",
    family: "somatic",
    instruction:
      "Look slowly left, slowly right — where did the eye want to rest? Is that place safe?",
    fits: has(/\b(anxious|on edge|jumpy|can'?t settle|watching|scared)\b/),
    weight: () => 64,
  },

  // ── Duality — two parts pulling ─────────────────────────────────────────
  {
    id: "duality_slider",
    family: "duality",
    instruction:
      "Name the two parts and ask which is louder right now, 0–100. e.g. impress the oga vs burn the office down.",
    fits: (c) => PARTS.test(c.message.toLowerCase()) || c.duality !== null,
    weight: (c) => (c.duality !== null ? 84 : 70),
  },
  {
    id: "ifs_parts",
    family: "duality",
    instruction:
      "Find the young part carrying the rule — \"if I don't perform I'm not loved\" — and ask how old it is.",
    fits: has(/\b(perform|prove|earn|not enough|never good enough|since i was)\b/),
    weight: () => 76,
  },
  {
    id: "two_chair",
    family: "duality",
    instruction:
      "Put the fear in the chair opposite. What does it say? Have them answer it out loud.",
    fits: has(/\b(stuck|two minds|can'?t decide|torn|i dey confuse)\b/),
    weight: () => 72,
  },

  // ── Behavioral — stuck, needs one tiny win ──────────────────────────────
  {
    id: "micro_action",
    family: "behavioral",
    instruction:
      "One micro action, ten words or fewer, doable in under a minute. e.g. \"Send one text: 'I go late small.'\" Tell them to do it now.",
    fits: has(/\b(avoid|procrastinat|putting off|haven'?t|can'?t start|no fit start)\b/),
    weight: () => 80,
  },
  {
    id: "opposite_action",
    family: "behavioral",
    instruction:
      "DBT opposite action — they want to withdraw, so send them out the door for 30 seconds.",
    fits: has(WITHDRAW),
    weight: () => 82,
  },
  {
    id: "behavioral_activation",
    family: "behavioral",
    instruction:
      "Ask which chair they are in today, then one thing that would make them stand up out of it.",
    fits: (c) => (c.mood ?? 10) <= 4,
    weight: () => 78,
  },

  // ── Narrative + real world ──────────────────────────────────────────────
  {
    id: "externalization",
    family: "narrative",
    instruction:
      "Externalise the story — when did this 'failure' story first enter the house? Father, school, or the economy?",
    fits: (c) => words(c.message) > 45,
    weight: () => 74,
  },
  {
    id: "miracle_question",
    family: "narrative",
    instruction:
      "If they woke tomorrow and it had shifted slightly, what would they notice first in the body?",
    fits: has(HOPELESS),
    weight: () => 76,
  },
  {
    id: "deepsearch_pattern",
    family: "narrative",
    instruction:
      "Lay the repetition out with their own past phrases and dates, then ask if it is the same pattern.",
    fits: (c) => c.ventCount >= 3,
    weight: (c) => 60 + Math.min(c.ventCount * 3, 25),
  },
  {
    id: "here_and_now",
    family: "relational",
    instruction:
      "Pull them into the present — as they type this to you right now, what is happening in the belly?",
    fits: has(ANALYTICAL),
    weight: () => 62,
  },
  {
    id: "rupture_repair",
    family: "relational",
    instruction:
      "Let them go before they run. \"I go let you go before you run. Shrine dey when ready.\"",
    fits: (c) => AVOIDANT.test(c.message.toLowerCase()) && words(c.message) <= 6,
    weight: () => 85,
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
  family: mk(
    "rw_family",
    "Firstborn pressure — one boundary, ten words, to the person who needs to hear it.",
    "Hold one line — ten words — for the person who needs to hear it.",
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

/**
 * Picks the highest-weighted eligible tactic that has NOT been used in the
 * last three turns. Falls back progressively rather than repeating.
 */
export function selectTactic(ctx: TacticContext): Tactic {
  const blocked = new Set(ctx.recentTactics.slice(-3));

  const pool: Tactic[] = [...TACTICS];
  if (ctx.realWorldTag) pool.push(REAL_WORLD_TACTIC[ctx.realWorldTag]);

  const eligible = pool
    .filter((t) => t.fits(ctx))
    .sort((a, b) => b.weight(ctx) - a.weight(ctx));

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
