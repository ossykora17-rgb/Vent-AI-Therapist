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
/** A gap shorter than this is the same sitting, not a return. */
export const RETURN_AFTER_HOURS = 12;

/** Inside a sitting, a gap this long is stepping away and coming back. */
export const PAUSE_MINUTES = 20;

/**
 * How long they were away, said the way a person says it — or null when there
 * is no gap worth naming. Twelve hours: the same night is still the same
 * sitting, and a gap measured in minutes is not a return. Shared by the
 * greeting below and the first-turn line in `arcBlock`, so the two cannot
 * disagree about whether somebody came back.
 */
export function awayFor(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined || !(hours >= RETURN_AFTER_HOURS)) return null;
  const days = Math.round(hours / 24);
  if (days <= 1) return "a day";
  if (days < 7) return `${["", "", "two", "three", "four", "five", "six"][days]} days`;
  if (days < 14) return "a week";
  return "a while";
}

export function openingLine(
  g: Grounding,
  language: "en" | "pidgin",
  carve: string | null,
  notes: readonly Note[] = [],
  sinceLastHours: number | null = null,
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
    /*
      The question points back at the thread. It was "What's new?" — a catch-up
      that drops the thing the line had just named, which is the generic
      check-in this opening exists not to be.
    */
    return pidgin
      ? `You don come back. Last time na ${thing}. Where e dey sit now?`
      : `Welcome back. Last time it was ${thing}. Where is that sitting now?`;
  }

  /*
    Back, with nothing specific to name — most people who return, since a carve
    needs a sitting that landed. They were answered as strangers. The gap is the
    only thing this names: a fact off their own record, never a word of theirs.
  */
  const away = awayFor(sinceLastHours);
  if (away) {
    return pidgin
      ? `You don come back after ${away}. Where e dey sit for you now?`
      : `You're back after ${away}. Where is it sitting now?`;
  }

  /*
    Back inside the same day. The presence directive: "after delays, re-enter
    with calm continuity" — and this branch used to fall through to the
    stranger's line, asking somebody who had talked two hours ago what made
    them open VENT today. A restart is the passivity the directive calls
    failure: it hands them the whole thread again. Under `PAUSE_MINUTES` it
    is the same conversation and says nothing about leaving.
  */
  if (sinceLastHours !== null && sinceLastHours !== undefined && sinceLastHours >= 0) {
    const stepped = sinceLastHours * 60 >= PAUSE_MINUTES;
    return pidgin
      ? `${stepped ? "You don come back. " : ""}Where e dey sit for you now?`
      : `${stepped ? "You're back. " : ""}Where is it sitting now?`;
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
 * (It said "what we talk about" until the presence directive's *"No 'we'"*:
 * there is one person here, and the room keeps what *they* said.)
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
      ? "Quick one: I dey keep wetin you tell me for here, so you no go start over. I be machine, no be person — but I dey here. You dey okay with am?"
      : "Quick thing: I keep what you tell me here, so you don't start over. I'm not a person — I'm a machine — but I'm here. You good with that?";
  }
  /*
    Nothing is being kept, so nothing is claimed. The sentence still gets said
    because the disclosure half of it is true in every shape, and a person is
    owed it either way.
  */
  return pidgin
    ? "Quick one: nothing wey you talk here dey saved for now — e go go when you close am. I be machine, no be person, but I dey here."
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
