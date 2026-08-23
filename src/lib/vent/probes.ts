/**
 * Fifty questions, and not one of them is in the system prompt.
 *
 * "Your job is not to fix. Your job is to understand." The office contract has
 * said the shape for a while — *answer what they actually said, then ask one
 * thing you do not know the answer to* — and only the first half had anything
 * behind it. `tactics.ts` supplies the move. Nothing supplied the question, so
 * the model invented one every turn, and an invented question at temperature
 * drifts toward the four or five that fit any conversation on earth.
 *
 * WHY THIS IS A TABLE AND NOT A PROMPT SECTION
 *
 * A list of fifty questions in front of a model is a list of fifty sentences it
 * has just read. That is not a hypothetical: `prompt.ts` used to hand over
 * eleven tactic instructions ending in worked examples, and what came back was
 * the example with two words changed — the product's opening line was a
 * template for months. `OFFICE_RULES` had the same problem in reverse, listing
 * banned phrases and thereby showing them.
 *
 * So the fifty live here, one is selected per turn by a predicate over the
 * person's own words, and only that one is sent. Same machinery as the tactic
 * library, for the same reason, with the same three-turn block — because the
 * second most obvious way to sound like a script is to ask the same good
 * question every Tuesday.
 *
 * WHY THESE FIFTY
 *
 * Three traditions, and no workbook. Motivational Interviewing supplies the
 * ones that go looking for the person's own argument for change, because MI's
 * whole finding is that the argument only works when they make it. Yalom
 * supplies the here-and-now and the four givens — the questions that treat the
 * conversation itself as material. Rogers supplies the ones that check whether
 * we have understood at all, which is the only school here that treats being
 * wrong as a normal event.
 *
 * What is deliberately absent: anything from a workbook. No thought records, no
 * scaling of "how helpful was that", no homework. `GENERIC_TASKS` in `voice.ts`
 * fails the build over the task version of this, and check 88 fails the build
 * if any question below is a task wearing a question mark.
 *
 * Which deployment shape makes this false? None. No store, no key, no network
 * — a table and two pure functions, identical in production with nothing
 * configured.
 */

/** Where the question comes from. Recorded so a losing school is visible. */
export type School = "mi" | "yalom" | "rogers";

export interface Probe {
  id: string;
  school: School;
  /**
   * The question, as asked.
   *
   * Content-free on purpose. Every one of these is a scaffold with a hole in it
   * where *their* material goes — which is what makes it safe to hand a model
   * verbatim, and is the exact distinction the tactic examples got wrong. "Na
   * shame dey under that anger" is a fabricated specific and gets copied as
   * one. "What word would you use for it?" cannot be copied wrongly, because it
   * carries nothing to copy.
   */
  ask: string;
  /** What it opens. Documentation — never sent to a model. */
  opens: string;
  fits: (m: string) => boolean;
  weight: number;
}

const on = (re: RegExp) => (m: string) => re.test(m);
/** Always eligible. Ranking and the three-turn block do the rest. */
const always = () => true;

const CHANGE = /\b(stop|quit|change|different|better|start|try|should i|fix|leave|move|japa)\b/i;
const STUCK = /\b(stuck|same|again|always|keep|never|every time|can'?t|no fit)\b/i;
const OTHERS = /\b(mum|mummy|mama|mother|dad|daddy|papa|father|wife|husband|partner|boyfriend|girlfriend|sister|brother|friend|boss|oga|colleague|family|them|they)\b/i;
const SELF_BLAME = /\b(my fault|i failed|i'?m stupid|useless|i should have|i ruined|na me)\b/i;
const MONEY = /\b(money|rent|salary|pay|broke|debt|fees|naira|black tax|bill)\b/i;
const NUMB = /\b(numb|blank|nothing|empty|tired|exhausted|don'?t care|whatever)\b/i;
// `test results` earns its place: it is the golden set's own unfixable case,
// and every list in this repo that forgot it sent a coping move to somebody
// whose father was dying. `diagnos` is a stem for the same reason it is one in
// `tactics.ts` — `diagnos\b` matches neither "diagnosed" nor "diagnosis".
const BIG = /\b(dying|died|death|cancer|terminal|funeral|burial|grief|hospital|test results?)\b|\b(diagnos|palliativ|hospice)/i;
const PERFORM = /\b(fine|okay|it'?s nothing|no big deal|anyway|whatever|i'?m good)\b/i;
const WANT = /\b(want|wish|hope|dream|if only|supposed to|meant to)\b/i;

/**
 * Motivational Interviewing — Miller & Rollnick.
 *
 * The finding this school is built on: a person argues themselves into change
 * and cannot be argued into it by anybody else. So none of these tells them
 * anything. Every one is a way of asking them to say the thing out loud, which
 * is why MI questions read as almost passive and are not.
 *
 * The rulers (`importance`, `confidence`) are the two that look most like a
 * workbook and are the least like one: the move is not the number, it is
 * *"why not lower"* — which forces them to state their own case for change
 * without ever being asked to.
 */
const MI: Probe[] = [
  { id: "mi_importance", school: "mi", weight: 84,
    ask: "Zero to ten — how much does changing this actually matter to you? And why not lower?",
    opens: "their own case for change, in their own mouth",
    fits: on(CHANGE) },
  { id: "mi_confidence", school: "mi", weight: 80,
    ask: "If you decided tonight, zero to ten, how sure are you that you could? What would move it up one?",
    opens: "the gap between wanting and believing",
    fits: on(CHANGE) },
  { id: "mi_desire", school: "mi", weight: 78,
    ask: "What do you want to be different about it?",
    opens: "desire — the D in change talk, and the cheapest one to get",
    fits: on(CHANGE) },
  { id: "mi_ability", school: "mi", weight: 72,
    ask: "What part of this do you already know you can do?",
    opens: "ability, without handing them any",
    fits: on(STUCK) },
  { id: "mi_reasons", school: "mi", weight: 74,
    ask: "What are the two best reasons to change it? Yours, not the obvious ones.",
    opens: "reasons they will still believe tomorrow",
    fits: on(CHANGE) },
  { id: "mi_need", school: "mi", weight: 76,
    ask: "If nothing about this changes for another year, what does that year cost you?",
    opens: "need — the one that lands hardest and should be used least",
    fits: on(STUCK) },
  { id: "mi_double_sided", school: "mi", weight: 86,
    ask: "Part of you wants out and part of you is still holding it. Which one typed this?",
    opens: "ambivalence held as two true things, not resolved for them",
    fits: on(/\b(but|although|part of me|torn|two minds|and yet|still)\b/i) },
  { id: "mi_values", school: "mi", weight: 82,
    ask: "What kind of person did you think you'd be by now?",
    opens: "the discrepancy between the life and the values — MI's engine",
    fits: on(/\b(supposed to|meant to|by now|my age|everyone else|behind)\b/i) },
  { id: "mi_looking_back", school: "mi", weight: 70,
    ask: "What were you like before this started?",
    opens: "a self that predates the problem, which they usually forget exists",
    fits: on(STUCK) },
  { id: "mi_looking_forward", school: "mi", weight: 72,
    ask: "Five years on, exactly as it is now — what have you lost by then?",
    opens: "consequence, without a warning attached",
    fits: on(STUCK) },
  { id: "mi_exception", school: "mi", weight: 88,
    ask: "When was the last time it didn't happen? What was different that day?",
    opens: "the exception, which is data they already own",
    fits: on(/\b(always|never|every time|constantly|all the time|every day)\b/i) },
  { id: "mi_permission", school: "mi", weight: 90,
    ask: "Do you want me to just hear this, or do you want me to push?",
    opens: "consent, asked once, before anything is offered",
    fits: on(/\b(what should i|what do i do|advice|tell me|help me|i don'?t know what)\b/i) },
  { id: "mi_elaborate", school: "mi", weight: 66,
    ask: "What's the part you went quickest past?",
    opens: "the clause they buried mid-sentence",
    fits: always },
  { id: "mi_worst", school: "mi", weight: 68,
    ask: "What's the worst thing it has cost you so far?",
    opens: "consequence already paid, which is harder to argue with than a prediction",
    fits: on(STUCK) },
  { id: "mi_best", school: "mi", weight: 64,
    ask: "If it went well — actually well — what would that look like on an ordinary Tuesday?",
    opens: "a picture concrete enough to want",
    fits: on(WANT) },
  { id: "mi_who_noticed", school: "mi", weight: 70,
    ask: "Who else has noticed?",
    opens: "whether they are carrying it alone or only feel that way",
    fits: on(OTHERS) },
  { id: "mi_willing", school: "mi", weight: 78,
    ask: "What are you actually willing to do? Not should. Willing.",
    opens: "commitment language, which is the only kind that predicts anything",
    fits: on(/\b(should|need to|have to|ought|must)\b/i) },
];

/**
 * Yalom — existential and interpersonal.
 *
 * Two ideas, and both are unusual in a product like this. The first is the
 * here-and-now: what is happening *between* the two parties is the most
 * reliable material in the room, because it is the only thing neither of them
 * is reporting second-hand. The second is the four givens — death, freedom,
 * isolation, meaninglessness — which is why several of these are questions no
 * wellness app would ever ask, and why `yalom_death` is gated hard.
 *
 * The here-and-now ones are gated too, and on the assistant rather than on a
 * topic: "what is it like typing this to a machine" is a real question at turn
 * six and an affectation at turn one.
 */
const YALOM: Probe[] = [
  { id: "yalom_here_now", school: "yalom", weight: 80,
    ask: "What's it like, typing this to a machine at this hour?",
    opens: "the room itself as material — the only thing here nobody is reporting second-hand",
    fits: on(/\b(machine|ai|robot|talking to|typing|weird|strange|even here|why am i)\b/i) },
  { id: "yalom_not_saying", school: "yalom", weight: 86,
    ask: "There's a part of this you've walked around twice. What is it?",
    opens: "the avoided clause, named without naming it for them",
    fits: on(PERFORM) },
  { id: "yalom_freedom", school: "yalom", weight: 78,
    ask: "Where in this did you actually have a choice?",
    opens: "freedom, which is the given people most want to give back",
    fits: on(/\b(had to|no choice|forced|stuck with|nothing i could)\b/i) },
  { id: "yalom_responsibility", school: "yalom", weight: 82,
    ask: "What's your part in it? Not the blame — the part.",
    opens: "responsibility assumption, split cleanly from guilt",
    fits: on(OTHERS) },
  { id: "yalom_death", school: "yalom", weight: 88,
    ask: "What does the time you've got have to do with this?",
    opens: "mortality, and only where it is already in the room",
    fits: on(BIG) },
  { id: "yalom_isolation", school: "yalom", weight: 84,
    ask: "Who knows this about you?",
    opens: "existential isolation — usually answered with a number, and the number is zero",
    fits: always },
  { id: "yalom_meaning", school: "yalom", weight: 74,
    ask: "What was this supposed to be for?",
    opens: "the meaning it was carrying before it broke",
    fits: on(/\b(pointless|what'?s the point|why bother|meaningless|waste)\b/i) },
  { id: "yalom_wish", school: "yalom", weight: 80,
    ask: "What do you actually want here? Not the reasonable version.",
    opens: "the wish under the plan — Yalom's wish-block",
    fits: on(WANT) },
  { id: "yalom_wanting_aloud", school: "yalom", weight: 76,
    ask: "What stops you saying that out loud?",
    opens: "the block between wishing and willing",
    fits: on(WANT) },
  { id: "yalom_ripple", school: "yalom", weight: 62,
    ask: "Who has learned something from you without you meaning to teach it?",
    opens: "the ripple — the one consolation in this school that is not a lie",
    fits: on(BIG) },
  { id: "yalom_would_you_tell_me", school: "yalom", weight: 70,
    ask: "If I just said the wrong thing, would you tell me?",
    opens: "rupture made speakable before it happens",
    fits: on(/\b(no|not really|that'?s not it|you don'?t|wrong|whatever)\b/i) },
  { id: "yalom_legacy", school: "yalom", weight: 64,
    ask: "What would they say you were like?",
    opens: "self seen from outside, which is cheaper to answer honestly",
    fits: on(OTHERS) },
  { id: "yalom_regret_forward", school: "yalom", weight: 82,
    ask: "What will you regret not having said?",
    opens: "anticipated regret, which moves people when consequence does not",
    fits: on(BIG) },
  { id: "yalom_what_from_me", school: "yalom", weight: 88,
    ask: "What do you want from me right now — honestly?",
    opens: "the ask, made explicit instead of guessed at",
    fits: on(/\b(i don'?t know why i'?m|why am i telling|what do you|can you)\b/i) },
  { id: "yalom_only_here", school: "yalom", weight: 72,
    ask: "Does this happen with other people, or only here?",
    opens: "whether the pattern is theirs or belongs to one relationship",
    fits: on(OTHERS) },
  { id: "yalom_first_time", school: "yalom", weight: 78,
    ask: "When did you first learn to do that?",
    opens: "the origin of a defence, asked as history rather than diagnosis",
    fits: on(/\b(always been|since i was|growing up|as a child|my whole life)\b/i) },
  { id: "yalom_instead_of", school: "yalom", weight: 68,
    ask: "If we weren't talking about this, what would we be talking about?",
    opens: "the thing the presenting problem is standing in front of",
    fits: always },
];

/**
 * Rogers — person-centred.
 *
 * The only school here that treats *being wrong* as a normal event rather than
 * a failure, which is why half of these are checks rather than questions. A
 * room that never asks whether it has understood is a room that has decided it
 * has, and the person on the other side learns very quickly not to correct it.
 *
 * `rogers_check` and `rogers_own_words` are the two that matter most and read
 * as the smallest. Handing back a word and asking whether it fits is the
 * entire mechanism of unconditional positive regard as an *operation* rather
 * than an attitude — and it is the one thing in this file that cannot be
 * faked, because a wrong guess gets corrected out loud.
 */
const ROGERS: Probe[] = [
  { id: "rogers_check", school: "rogers", weight: 84,
    ask: "Am I getting it, or am I off?",
    opens: "permission to correct us, offered rather than assumed",
    fits: always },
  { id: "rogers_own_words", school: "rogers", weight: 86,
    ask: "What word would you use for it? Mine isn't right.",
    opens: "their vocabulary, which outranks ours in every case",
    fits: always },
  { id: "rogers_means_what", school: "rogers", weight: 76,
    ask: "What does that word mean when you say it?",
    opens: "the private meaning inside a public word",
    fits: on(/\b(disrespect|betrayed|failure|useless|selfish|weak|strong|proud)\b/i) },
  { id: "rogers_felt_sense", school: "rogers", weight: 78,
    ask: "What's happening in you as you write it?",
    opens: "present experience, not the account of it",
    fits: always },
  { id: "rogers_not_think", school: "rogers", weight: 82,
    ask: "What do you not want me to think about you?",
    opens: "the shame under the telling, asked directly and once",
    fits: on(SELF_BLAME) },
  { id: "rogers_true_version", school: "rogers", weight: 84,
    ask: "Is that the true version, or the tidy one?",
    opens: "congruence — and it works because it assumes there is a true one",
    fits: on(PERFORM) },
  { id: "rogers_whose_should", school: "rogers", weight: 86,
    ask: "Whose voice is the 'should' in that sentence?",
    opens: "conditions of worth, located in a person rather than in them",
    fits: on(/\b(should|supposed to|meant to|expected|have to)\b/i) },
  { id: "rogers_not_arguing", school: "rogers", weight: 74,
    ask: "What does the part of you that isn't arguing want?",
    opens: "the organismic valuing process, without the vocabulary",
    fits: on(/\b(but|logically|i know|rationally|makes sense|obviously)\b/i) },
  { id: "rogers_supposed_to_be", school: "rogers", weight: 78,
    ask: "Who were you supposed to be?",
    opens: "the ideal self, which is usually somebody else's",
    fits: on(/\b(supposed to|expected|firstborn|first born|proud of me|disappoint)\b/i) },
  { id: "rogers_to_be_loved", school: "rogers", weight: 88,
    ask: "What did you have to do to be loved in that house?",
    opens: "conditions of worth at their source",
    fits: on(/\b(house|home|family|parents?|mum|dad|growing up|childhood)\b/i) },
  { id: "rogers_deleted", school: "rogers", weight: 80,
    ask: "What did you almost type and delete?",
    opens: "the sentence they nearly sent — the most valuable one available",
    fits: always },
  { id: "rogers_nobody_needed", school: "rogers", weight: 72,
    ask: "What would happen if nobody needed you to fix it?",
    opens: "relief from the fixing role, for people who only exist inside it",
    fits: on(/\b(everyone depends|they need me|firstborn|breadwinner|responsib|carry)\b/i) },
  { id: "rogers_feeling_not_explanation", school: "rogers", weight: 82,
    ask: "That's the explanation. What's the feeling?",
    opens: "experience under the account of experience",
    fits: on(/\b(because|the reason|basically|so what happened|essentially|the thing is)\b/i) },
  { id: "rogers_which_moment", school: "rogers", weight: 84,
    ask: "Which exact moment do you keep going back to?",
    opens: "one scene instead of a summary — the difference between memory and report",
    fits: always },
  { id: "rogers_this_hour", school: "rogers", weight: 68,
    ask: "What do you want to do with this hour?",
    opens: "direction handed back, which is the whole of the non-directive stance",
    fits: on(NUMB) },
  { id: "rogers_never_said", school: "rogers", weight: 90,
    ask: "What's the part of this you've never said to anybody?",
    opens: "the thing the product exists for",
    fits: always },
];

/** All fifty, in one place, so nothing keeps a second copy. */
export const PROBES: readonly Probe[] = [...MI, ...YALOM, ...ROGERS];

/**
 * Whether a question fits everybody.
 *
 * Eight of the fifty are eligible on any message — "what would you call it",
 * "who knows this about you", "what have you never said to anybody". They are
 * the best questions in the file and they must never be the first choice,
 * which is not a contradiction: a question that fits everybody is by
 * definition not a question about *this* person's message.
 */
export function isBroad(p: Probe): boolean {
  return p.fits === always;
}

/**
 * One question, chosen by their words, never the same one twice in three turns.
 *
 * SPECIFICITY OUTRANKS WEIGHT, AND THAT IS THE WHOLE FUNCTION
 *
 * The first version sorted on weight alone, and `rogers_never_said` — weight
 * 90, eligible on everything — answered four of five test messages. That is
 * `exact_mirror` again, exactly: the highest-weighted broad entry becomes the
 * default move, and the product ships one question wearing fifty names. It took
 * five printed lines to see and would have taken a month in production.
 *
 * So the ranking is tiered. Anything that matched their actual words beats
 * anything that would have matched anybody, and weight only ever breaks ties
 * inside a tier. The broad eight are the floor, not the ceiling — reached when
 * a message genuinely offers no handle, which happens and is fine.
 *
 * The three-turn block is not a nicety either. The second most obvious way to
 * sound like a script is to ask the same good question every week, and a weight
 * alone cannot prevent that: it wins every contest it enters, forever.
 *
 * `recent` is the ids already asked, most recent last. Null means "ask your
 * own", which the caller renders as no line at all rather than as a blank.
 */
export function selectProbe(message: string, recent: readonly string[] = []): Probe | null {
  const blocked = new Set(recent.slice(-3));
  const rank = (p: Probe) => (isBroad(p) ? 0 : 1000) + p.weight;
  const eligible = PROBES
    .filter((p) => p.fits(message))
    .sort((a, b) => rank(b) - rank(a));
  return eligible.find((p) => !blocked.has(p.id)) ?? eligible[0] ?? null;
}

/**
 * The one line the prompt gets.
 *
 * Framed as a direction rather than a script, because the office contract
 * already says the reply is "deliberately not a template" and a question handed
 * over as an instruction is a template with a question mark. Their own better
 * question outranks this one, and the line says so — which is not politeness,
 * it is the difference between a probe and a form.
 */
export function probeBlock(p: Probe | null): string | null {
  if (!p) return null;
  /*
    Three lines, and the third one was four words longer until check 24 said so.

    It read "ask it in your own words, in their language" — and the language
    instruction is already in `HOW YOU SPEAK` and again in the prompt's closing
    line, so this was its third copy. Six tokens over budget, paid for by
    deleting a duplicate rather than by raising the ceiling, which is the rule
    that check exists to enforce.
  */
  return `THE QUESTION TO GO AFTER\n${p.ask}\nYour words, not these. A better question in their message wins.`;
}
