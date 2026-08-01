/**
 * What counts as memory.
 *
 * Asking the date is not a vent. Neither is "hi", neither is telling us we
 * repeated ourselves. Those turns were eating slots in a six-turn window, so
 * a person who had said four real things got a model that could only see two
 * of them. Pull wider, keep only the turns that said something.
 *
 * Scaling laws, at the only place they touch a product this size: quality
 * tokens per parameter. Six turns of noise costs more and carries less than
 * four turns of signal, and the four are cheaper at inference too.
 */

export interface MemoryCandidate {
  intent_type: string | null;
}

export const MEMORY_TURNS = 6;

/**
 * @param recent Most-recent-first, as every store returns them.
 * @returns Oldest-first, ready for the prompt.
 */
export function selectMemory<T extends MemoryCandidate>(recent: T[], turns = MEMORY_TURNS): T[] {
  return recent
    .filter((r) => r.intent_type === "vent")
    .slice(0, turns)
    .reverse();
}

/** How wide to read so the filter has something to throw away. */
export const memoryFetchSize = (turns = MEMORY_TURNS) => turns * 4;
