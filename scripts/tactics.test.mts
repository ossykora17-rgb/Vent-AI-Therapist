/**
 * Selector guarantees, run without installing a test runner:
 *   node --experimental-strip-types scripts/tactics.test.mts
 */
import { selectTactic, ALL_TACTIC_IDS } from "../src/lib/vent/tactics.ts";

const base = {
  intent: "vent" as const,
  realWorldTag: null,
  language: "en" as const,
  body: null,
  message: "my oga makes me feel useless and stupid, i always fail at everything",
  pressure: 75,
  duality: null,
  mood: 3,
  ventCount: 4,
  recentTactics: [] as string[],
};

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) { ok++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

console.log(`tactic library size: ${ALL_TACTIC_IDS.length}`);

// Ten consecutive turns must never repeat inside any window of three.
const recent: string[] = [];
const picked: string[] = [];
for (let i = 0; i < 10; i++) {
  const t = selectTactic({ ...base, recentTactics: [...recent] });
  picked.push(t.id);
  recent.push(t.id);
}
const violations = picked.filter((id, i) =>
  picked.slice(Math.max(0, i - 3), i).includes(id),
).length;
check("no tactic repeats inside a 3-turn window", violations === 0, `violations=${violations}`);
console.log(`  sequence: ${picked.join(" -> ")}`);

const noBody = selectTactic({ ...base, body: null, pressure: 30, recentTactics: [] });
check("no somatic tactic without a body mention", noBody.family !== "somatic", `got ${noBody.id}`);

const withBody = selectTactic({ ...base, body: "chest", pressure: 85, recentTactics: [] });
check("body + high pressure selects the body map", withBody.id === "body_map_drop_set", `got ${withBody.id}`);

const econ = selectTactic({ ...base, realWorldTag: "economy", recentTactics: [] });
check("economy tag routes to its own coping tool", econ.id === "rw_economy", `got ${econ.id}`);

const econBlocked = selectTactic({ ...base, realWorldTag: "economy", recentTactics: ["rw_economy"] });
check("blocked real-world tactic falls back", econBlocked.id !== "rw_economy", `got ${econBlocked.id}`);

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
