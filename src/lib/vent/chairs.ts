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
