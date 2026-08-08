import { detectHobby, detectOccupation, detectTemperament } from "./detect";
import {
  type FlavourProfile,
  type Hobby,
  type Occupation,
  type Temperament,
} from "./types";

/**
 * 4 temperaments × 5 occupations = 20 named flavours, then hobby swings the
 * analogies and the regulation tool. The name is never shown as a category —
 * it exists so the system prompt has a spine.
 */
const NAMES: Record<Temperament, Record<Exclude<Occupation, "unknown">, string>> =
  {
    fire: {
      lawyer: "The Sharp Guy",
      nine_to_five: "The Pressure Cooker",
      entrepreneur: "The Bulldozer",
      creative: "The Live Wire",
      student_japa: "The Sprinter",
    },
    water: {
      lawyer: "The Quiet Advocate",
      nine_to_five: "The Deep Well",
      entrepreneur: "The Long Game",
      creative: "The Feeler",
      student_japa: "The Homesick Scholar",
    },
    air: {
      lawyer: "The Open Brief",
      nine_to_five: "The Juggler",
      entrepreneur: "The Idea Storm",
      creative: "The Kite",
      student_japa: "The Scatter Plot",
    },
    earth: {
      lawyer: "The Steady Hand",
      nine_to_five: "The Anchor",
      entrepreneur: "The Builder",
      creative: "The Craftsman",
      student_japa: "The Patient One",
    },
  };

const VOICE: Record<Temperament, FlavourProfile["voice"]> = {
  fire: {
    pace: "fast, no preamble",
    sentenceLength: "short. cut the fat.",
    challenge: "push back immediately — they respect friction, not agreement",
  },
  water: {
    pace: "slow, let silence sit",
    sentenceLength: "longer, but never soft",
    challenge: "name the pattern gently, then hold it there",
  },
  air: {
    pace: "steady — you are the ballast",
    sentenceLength: "short and concrete, one thing at a time",
    challenge: "narrow them to one thread and refuse the others",
  },
  earth: {
    pace: "level, unhurried",
    sentenceLength: "plain, practical",
    challenge: "disturb the routine — calm can be avoidance",
  },
};

const ANALOGY: Record<Hobby, string> = {
  football: "football — form, benching, second half, playing out of position",
  gym: "the gym — progressive overload, rest days, form breaking under load",
  music: "the studio — mixing, a verse that won't land, mastering",
  gaming: "gaming — respawns, grinding ranked, tilt, save points",
  fashion: "clothes — tailoring, what you wear to be read a certain way",
  unknown: "plain concrete images from their own day",
};

const REGULATION: Record<Hobby, string> = {
  football: "frame the 24hr tool as a drill before a match",
  gym: "frame the 24hr tool as one set, with a rest day attached",
  music: "frame the 24hr tool as a take — you can re-record tomorrow",
  gaming: "frame the 24hr tool as clearing one level, not the campaign",
  fashion: "frame the 24hr tool as laying out one fit the night before",
  unknown: "frame the 24hr tool as one concrete action before this time tomorrow",
};

/**
 * What the job actually does to somebody, as opposed to what it is called.
 *
 * This was reachable only from a second `buildSystemPrompt` that lived in
 * this file and that nothing in the product called — a whole parallel system
 * prompt, in the file anybody working on personality would open first. The
 * live block named the occupation ("occupation lawyer") and stopped there,
 * so the model knew a job title and not one thing about the pressure under
 * it. That is the difference between a form field and knowing somebody.
 *
 * Exported now, and read by `flavourBlock` in `@/lib/vent/prompt` — the
 * block the product actually assembles. The dead prompt is gone.
 */
export const OCCUPATION_PRESSURE: Record<Occupation, string> = {
  lawyer: "billable hours, partners who never say well done, adversarial days",
  nine_to_five: "a manager's mood, invisible work, salary that never moves",
  entrepreneur: "runway, being the last line of defence, no one to escalate to",
  creative: "taste outrunning skill, feedback that reads as a verdict on them",
  student_japa: "exams, visa limbo, watching everyone else leave",
  unknown: "whatever is loading them right now — ask, don't assume",
};

export function buildFlavour(userMessages: string[]): FlavourProfile {
  const temperament = detectTemperament(userMessages);
  const occupation = detectOccupation(userMessages);
  const hobby = detectHobby(userMessages);

  const name =
    occupation.value === "unknown"
      ? `The Unnamed ${temperament.value[0].toUpperCase()}${temperament.value.slice(1)}`
      : NAMES[temperament.value][occupation.value];

  return {
    temperament,
    occupation,
    hobby,
    name,
    tagline: taglineFor(temperament.value, hobby.value),
    voice: VOICE[temperament.value],
    analogySource: ANALOGY[hobby.value],
    regulation: REGULATION[hobby.value],
  };
}

function taglineFor(t: Temperament, h: Hobby): string {
  const base: Record<Temperament, string> = {
    fire: "Says it fast, means it faster.",
    water: "Carries it quietly, and it is heavy.",
    air: "Ten things at once, none of them finished.",
    earth: "Steady enough that nobody checks on them.",
  };
  const tail: Record<Hobby, string> = {
    football: " Speaks in matches.",
    gym: " Speaks in sets.",
    music: " Speaks in takes.",
    gaming: " Speaks in levels.",
    fashion: " Speaks in fits.",
    unknown: "",
  };
  return base[t] + tail[h];
}
