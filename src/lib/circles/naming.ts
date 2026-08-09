/**
 * A room somebody would walk into, rather than a category they were filed in.
 *
 * The lobby showed "Money". "Leaving". "Work / AI". Those are correct and they
 * are a filing system — a taxonomy of pressures, rendered as a dropdown you
 * scroll past. Nobody has ever wanted to join a taxonomy.
 *
 * "Broke But Building" is the same room. "3AM Overthinkers" is the same room.
 * The difference is that one of them sounds like people are inside it.
 *
 * ## Nothing here is invented
 *
 * The name is a function of two facts the server already holds: what the room
 * is about, and what hour it opened in Lagos. That is the whole input. No
 * model call, no new column, and no claim about who is in there or what they
 * are like — a room named "Night Owls" at 3am is named for the clock, not for
 * a personality somebody has been assigned.
 *
 * This matters because the alternative is very tempting and very bad. A model
 * asked to name rooms would produce better names and would occasionally
 * produce a name that describes people who are not there, in a product whose
 * whole promise is that it does not make things up.
 *
 * ## On tone
 *
 * Warm, never jaunty, and the weight of the room decides which. "Broke But
 * Building" is a good name for money at noon because there is defiance in it
 * and people carrying that pressure recognise the defiance. The same
 * cleverness applied to a room about a diagnosis would be obscene, so health
 * and grief get plain names and keep them at every hour.
 */

/**
 * Lagos, always. The product is Nigerian in root, and a room named for 3am
 * has to mean 3am where the people in it are — not wherever the server woke
 * up. `toLocaleString` with a timeZone is the one way to get this right that
 * does not need a dependency.
 */
function lagosHour(iso: string): number {
  const h = new Date(iso).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    hour12: false,
  });
  const n = Number.parseInt(h, 10);
  return Number.isFinite(n) ? n % 24 : 12;
}

type Band = "late" | "morning" | "day" | "evening";

function bandFor(hour: number): Band {
  if (hour >= 0 && hour < 5) return "late";
  if (hour < 11) return "morning";
  if (hour < 17) return "day";
  return "evening";
}

/**
 * One name per pressure per band, and a plain name for the heavy ones.
 *
 * `health` is deliberately the same at every hour. A room where somebody is
 * waiting on a result does not get a nickname, and the small delight of a
 * clever name is not worth being clever at that person.
 */
const NAMES: Record<string, Partial<Record<Band, string>> & { any?: string }> = {
  economy: {
    late: "3AM Money Maths",
    morning: "Before The Day Starts",
    day: "Broke But Building",
    evening: "Counting It Again",
  },
  japa: {
    late: "The Ones Still Here",
    any: "The Ones Still Here",
  },
  ai_job: {
    late: "Will The Work Still Be There",
    any: "Will The Work Still Be There",
  },
  social: {
    late: "3AM Overthinkers",
    morning: "Already Comparing",
    day: "Everybody Else Is Fine",
    evening: "The Feed Is Lying",
  },
  family: {
    any: "House People",
  },
  lonely: {
    late: "Night Owls",
    morning: "Awake Before Anybody",
    day: "On Your Own With It",
    evening: "Nobody To Tell",
  },
  traffic: {
    any: "Still On The Road",
  },
  climate: {
    any: "The Heat",
  },
  // Plain, at every hour, on purpose.
  health: {
    any: "The Body And The Waiting",
  },
};

/** When there is no tag at all. Honest: the room is about whatever arrives. */
const UNTAGGED: Record<Band, string> = {
  late: "The 3AM Room",
  morning: "Early Room",
  day: "Open Room",
  evening: "Evening Room",
};

/**
 * The room's name. Deterministic, derived, and never generated.
 */
export function roomName(tag: string | null | undefined, createdAt: string): string {
  const band = bandFor(lagosHour(createdAt));
  if (!tag) return UNTAGGED[band];

  const entry = NAMES[tag];
  if (!entry) return UNTAGGED[band];
  return entry[band] ?? entry.any ?? UNTAGGED[band];
}

/**
 * Every name this can ever produce.
 *
 * Exported so the eval can hold the whole surface to the tone rules rather
 * than to whichever three names a test happened to think of — the same reason
 * the crisis list is asserted in both directions.
 */
export function allRoomNames(): string[] {
  const out = new Set<string>(Object.values(UNTAGGED));
  for (const entry of Object.values(NAMES)) {
    for (const v of Object.values(entry)) if (v) out.add(v);
  }
  return [...out];
}
