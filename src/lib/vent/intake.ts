import type { Grounding } from "./grounding";
import type { Note } from "./notes";

/**
 * The first three messages, and the one sentence that has to be earned.
 *
 * A real therapist builds alliance before they treat. Woebot opens with mood
 * tracking, Wysa opens with an exercise, and both are doing the second thing
 * first — which works on somebody who has already decided to be helped and
 * loses everybody else in ninety seconds.
 *
 * Nothing here is a form. There is no intake questionnaire, no "tell me about
 * yourself", and no list of ten questions, because the point of the first
 * three messages is that the person does not notice they are the first three.
 */

/**
 * The first thing the room says, and it branches on whether it knows them.
 *
 * Free. This is the greeting path — no model call, in any deployment shape —
 * which is also why it can be trusted to say the *right* one: the branch is
 * `carve !== null || notes.length > 0`, read from a store that answered, not
 * a guess about whether somebody looks familiar.
 *
 * The returning line names the thing. "Welcome back" alone is a doorman;
 * "welcome back, last time it was your dad" is somebody who was in the room.
 * If there is nothing specific to name, it falls through to the new-visitor
 * line rather than saying "welcome back" to a stranger — which is the
 * failure that makes every other product in this category feel fake.
 */
export function openingLine(
  g: Grounding,
  language: "en" | "pidgin",
  carve: string | null,
  notes: readonly Note[] = [],
): string {
  const pidgin = language === "pidgin";
  const specific = carve?.trim() || notes.find((n) => n.kind !== "loss")?.detail?.trim() || null;

  if (specific) {
    /*
      Their own words, not a summary of them — the carve is written in their
      language on purpose. Trimmed to a clause because the whole line has to
      stay under the reply cap, and because a long quotation read back is the
      file being recited rather than a person remembering.
    */
    const thing = specific.length > 48 ? `${specific.slice(0, 45)}…` : specific;
    return pidgin
      ? `You don come back. Last time na ${thing}. Wetin dey happen now?`
      : `Welcome back. Last time it was ${thing}. What's new?`;
  }

  return pidgin
    ? `How far. ${g.block === "night" ? "Late o" : `Good ${g.block}`}. Wetin make you open this one today?`
    : `Hey. ${g.block === "night" ? "Late one." : `Good ${g.block}.`} What made you open VENT today?`;
}

/**
 * The alliance sentence, said once and only when it is true.
 *
 * "Quick thing: I remember our conversations so we don't start over. I'm not
 * human but I'm here. Is that cool?"
 *
 * The first half of that is a **promise the code cannot keep** — and this
 * product's own grader bans `/I'?ll remember/` outright, because the worst bug
 * it ever shipped was a sentence claiming a save that never happened. It is
 * banned there because a model cannot know whether the write landed.
 *
 * The server can. `persisted` comes back from the write, not from the
 * configuration, and this sentence is emitted only when it came back true. In
 * a deployment with no store the room says the second half and drops the
 * first, because "I remember" said to somebody whose words are being dropped
 * is the exact failure CLAUDE.md lists first.
 *
 * The second half is not decoration either. Four US states now require a
 * product like this to say out loud that it is not a person; the always-
 * visible disclaimer says so on every screen, and a sentence inside the
 * conversation at the moment somebody has started trusting it is a different
 * and better thing.
 */
export const ALLIANCE_AT = 3;

export function allianceLine(persisted: boolean, language: "en" | "pidgin"): string {
  const pidgin = language === "pidgin";
  if (persisted) {
    return pidgin
      ? "Quick one: I dey keep wetin we talk, so we no go start over. I be machine, no be person — but I dey here. You dey okay with am?"
      : "Quick thing: I keep what we talk about, so we don't start over. I'm not a person — I'm a machine — but I'm here. You good with that?";
  }
  /*
    Nothing is being kept, so nothing is claimed. The sentence still gets said
    because the disclosure half of it is true in every shape, and a person is
    owed it either way.
  */
  return pidgin
    ? "Quick one: nothing wey we talk dey saved for now — e go go when you close am. I be machine, no be person, but I dey here."
    : "Quick thing: nothing here is being kept beyond this visit yet. I'm not a person — I'm a machine — but I'm here.";
}

/**
 * Whether this is the turn to say it.
 *
 * Exactly at the third exchange, once ever. Earlier is a disclaimer before
 * anybody has said anything worth disclosing about; later is after they have
 * already told the machine something they would not have told a machine.
 *
 * `alreadySaid` is the client's flag rather than a count, because the count
 * moves: a person who clears their id is a new person by construction and
 * should hear it again, and somebody who read it on Tuesday should not.
 */
export function shouldSayAlliance(exchanges: number, alreadySaid: boolean): boolean {
  return !alreadySaid && exchanges === ALLIANCE_AT;
}
