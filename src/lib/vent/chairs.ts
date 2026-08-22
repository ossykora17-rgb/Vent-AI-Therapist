/**
 * Where you sit, and what that reads as.
 *
 * This table was copied into four files — onboarding, the circles list, the
 * circle room, and the tension maths — so "Tight edge is 78" was true four
 * separate times and could quietly stop being true in one of them. One table
 * now, imported everywhere, and the eval suite asserts against this file
 * rather than against its own copy of the numbers.
 */

export type ChairId = "tight_edge" | "sunk" | "half_off";

export interface Chair {
  id: ChairId;
  label: string;
  /** Said the way a person would say it, not the way a form would ask. */
  hint: string;
  /** Opening tension reading, 0–100. The chair is the measurement. */
  tension: number;
}

/**
 * The question, asked once.
 *
 * Hand-typed in the circle lobby and again in the circle room — the same
 * question, in the two places somebody meets it, with nothing connecting
 * them. Every table in this file exists because chair tensions lived in four
 * files once; the sentence that introduces the table had the same problem and
 * nobody noticed because it is prose.
 */
export const CHAIR_QUESTION = "Which chair are you today?";

export const CHAIRS: readonly Chair[] = [
  { id: "tight_edge", label: "Tight edge", hint: "Perched. Ready to leave.", tension: 78 },
  { id: "sunk", label: "Sunk in", hint: "Heavy. Not moving.", tension: 62 },
  { id: "half_off", label: "Half off", hint: "One foot out the door.", tension: 55 },
];

export const CHAIR_TENSION = Object.fromEntries(
  CHAIRS.map((c) => [c.id, c.tension]),
) as Record<ChairId, number>;

export function chairLabel(id: string | null): string {
  return CHAIRS.find((c) => c.id === id)?.label ?? "A chair";
}

export function tensionForChair(id: string | null, fallback = 62): number {
  return CHAIRS.find((c) => c.id === id)?.tension ?? fallback;
}

/**
 * What it feels like in the hand, and the two words either side of it.
 *
 * The same table treatment the chairs got, and for a sharper reason: these
 * three answers were being collected and thrown away. Onboarding asked which
 * object it is, what you are carrying, and what you came to put down —
 * thirty seconds of the truest, least-defended things a person says here —
 * and `completeOnboarding` read `tension` off the chair and dropped the rest
 * on the floor. The room asked who you were and then behaved like a stranger.
 *
 * The vocabulary lives here so the screen and the prompt cannot drift, and so
 * the server never has to accept free text from a client and put it in a
 * system prompt. The wire carries an id; the phrasing is looked up here.
 */
export type ObjectId =
  | "heavy_stone"
  | "tight_knot"
  | "buzzing_wire"
  | "empty_bowl"
  | "spinning_top"
  | "cold_block";

export interface CarriedObject {
  id: ObjectId;
  label: string;
  /** How it behaves, for the prompt. Not shown on screen. */
  reads: string;
}

export const OBJECTS: readonly CarriedObject[] = [
  { id: "heavy_stone", label: "Heavy stone", reads: "dense and still — it does not move, it is just carried" },
  { id: "tight_knot", label: "Tight knot", reads: "tangled — pulling one end tightens the rest" },
  { id: "buzzing_wire", label: "Buzzing wire", reads: "live and humming — no rest in it, nothing to hold" },
  { id: "empty_bowl", label: "Empty bowl", reads: "hollow — the weight is what is missing, not what is there" },
  { id: "spinning_top", label: "Spinning top", reads: "moving fast to stay upright — stopping is the fear" },
  { id: "cold_block", label: "Cold block", reads: "numb and set — feeling nothing is the symptom, not the relief" },
];

export const OBJECT_IDS = OBJECTS.map((o) => o.id) as readonly ObjectId[];

export function objectReads(id: string | null | undefined): string | null {
  return OBJECTS.find((o) => o.id === id)?.reads ?? null;
}

export function objectLabel(id: string | null | undefined): string | null {
  return OBJECTS.find((o) => o.id === id)?.label ?? null;
}

/**
 * The six words offered for "what are you carrying" and "what do you want to
 * put down". A closed list, because the server puts them in a prompt.
 */
export const CARRY_WORDS = [
  "Guilt",
  "Proof",
  "Anger",
  "Hope",
  "Silence",
  "Tiredness",
] as const;

export type CarryWord = (typeof CARRY_WORDS)[number];

export const isCarryWord = (v: unknown): v is CarryWord =>
  typeof v === "string" && (CARRY_WORDS as readonly string[]).includes(v);

/**
 * The closing reading, from a 1–10 mood. Ten is nothing left on you; one is
 * everything still on you. Deliberately the same arithmetic in the private
 * session and in a circle — the drop has to mean one thing.
 */
export function tensionNow(mood: number): number {
  return Math.max(0, Math.min(100, (10 - mood) * 10));
}

/** What came off. Never negative — leaving heavier is not a smaller number. */
export function tensionDrop(seeded: number, mood: number): number {
  return Math.max(0, seeded - tensionNow(mood));
}
