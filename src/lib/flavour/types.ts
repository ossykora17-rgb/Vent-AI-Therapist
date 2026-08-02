/** Temperament × Occupation × Hobby. The product surface is the flavour. */

export type Temperament = "fire" | "water" | "air" | "earth";
export type Occupation =
  | "lawyer"
  | "nine_to_five"
  | "entrepreneur"
  | "creative"
  | "student_japa"
  | "unknown";
export type Hobby =
  | "football"
  | "gym"
  | "music"
  | "gaming"
  | "fashion"
  | "unknown";

export interface Signal<T> {
  value: T;
  /** 0–1. Below CONFIDENCE_FLOOR the engine keeps listening instead of guessing. */
  confidence: number;
  /** The words that actually triggered the call — shown in the debug panel. */
  evidence: string[];
}

export interface FlavourProfile {
  temperament: Signal<Temperament>;
  occupation: Signal<Occupation>;
  hobby: Signal<Hobby>;
  /** e.g. "The Sharp Guy" */
  name: string;
  /** One line the user could read without feeling categorised. */
  tagline: string;
  /** How the assistant speaks. */
  voice: {
    pace: string;
    sentenceLength: string;
    challenge: string;
  };
  /** Where analogies come from. */
  analogySource: string;
  /** The 24hr tool is phrased in this idiom. */
  regulation: string;
}

export const CONFIDENCE_FLOOR = 0.34;

export const TEMPERAMENT_LABEL: Record<Temperament, string> = {
  fire: "Fire",
  water: "Water",
  air: "Air",
  earth: "Earth",
};

export const OCCUPATION_LABEL: Record<Occupation, string> = {
  lawyer: "Lawyer",
  nine_to_five: "9–5",
  entrepreneur: "Entrepreneur",
  creative: "Creative",
  student_japa: "Student / Japa",
  unknown: "Still listening",
};

export const HOBBY_LABEL: Record<Hobby, string> = {
  football: "Football",
  gym: "Gym",
  music: "Music",
  gaming: "Gaming",
  fashion: "Fashion",
  unknown: "Still listening",
};
