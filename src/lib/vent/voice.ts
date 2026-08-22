import { CARRY_WORDS, OBJECTS } from "./chairs";

/**
 * The office rules, in one place.
 *
 * VENT runs a therapy office, not a motivational page. That sentence is the
 * whole of this file, and everything in it exists because the same instruction
 * had been written in four places in four wordings — the system prompt, the
 * offline grader's private `BANNED` array, the tactic library's authored
 * fallbacks, and the interface copy — with no way for any of them to disagree
 * out loud.
 *
 * `quality.ts` kept its own list of phrases to fail a reply for. Nothing in
 * the live path read it, and nothing anywhere checked the strings *we* wrote.
 * So the product could ship a scripted sentence in its own interface, forever,
 * while a grader nobody runs held the rule that forbade it.
 *
 * One table, one truth: the ban is defined here, the prompt is built from
 * here, the grader imports from here, and check 76 fails the build if any
 * authored string in the repository violates it.
 *
 * Which deployment shape makes this false? None. There is no store, no key and
 * no network in this file — it is a list and three pure functions, and it
 * behaves identically in production with nothing configured.
 */

export interface BannedPhrase {
  /**
   * The phrase in plain words.
   *
   * Here so the system prompt can be *generated* from this table rather than
   * carrying a hand-typed copy of it. `WHAT YOU NEVER SAY` in `prompt.ts` was
   * that copy: five of these phrases, typed again, in a file with no way to
   * know when this list changed. Check 76 asserts `re.test(say)` for every
   * row, so a regex that stops matching its own phrase fails the build.
   */
  say: string;
  /**
   * Ours, not the model's.
   *
   * "Carve your truth", "how tight is it" and "rattling the handle" are house
   * phrases: a model that has never seen this product cannot reach for them,
   * and listing them in the system prompt is ~40 tokens a turn spent
   * forbidding something that was never going to happen. They exist in this
   * table so the *build* fails when we write them — which is where they kept
   * appearing — so they are marked rather than removed, and the prompt is
   * generated from the ones a model actually reaches for.
   */
  ours?: true;
  re: RegExp;
  /** What it does to the person reading it, not what it is. */
  why: string;
}

/**
 * Phrases that end the session before it starts.
 *
 * Two kinds, and the second is the one this product kept writing.
 *
 * The first is self-help boilerplate: sentences that could be printed on a
 * mug and pasted into any conversation on earth. Somebody at 2am can tell
 * instantly, and the moment they can, nothing else you say is worth reading.
 *
 * The second is *our own house style, quoted back*. "Carve your truth" is the
 * product's tagline and it was also the placeholder in the box somebody types
 * their worst sentence into. A slogan at that exact moment is the room
 * advertising itself to a person who came in to say something. "How tight is
 * it" was the label above the pressure strip — a poetic reach for what is
 * plainly a number out of ten.
 *
 * A phrase we invented is not exempt for being ours. It is worse for being
 * ours, because it is everywhere.
 */
export const BANNED_PHRASES: readonly BannedPhrase[] = [
  { say: "rattling the handle", ours: true, re: /rattl\w*\s+the\s+handle/i, why: "our own metaphor, worn smooth" },
  { say: "carve your truth", ours: true, re: /carve\s+your\s+truth/i, why: "the tagline, said into somebody's worst hour" },
  { say: "how tight is it", ours: true, re: /how\s+tight\s+is\s+it/i, why: "a poem where a number out of ten was meant" },
  { say: "you've got this", re: /you'?ve?\s+got\s+this/i, why: "a cheer, and they did not come here to be cheered" },
  { say: "you are worthy", re: /you\s+are\s+worthy|you'?re\s+worthy/i, why: "a verdict nobody asked for" },
  { say: "step into your power", re: /step\s+into\s+your\s+power/i, why: "a poster, not a sentence" },

  /*
    Kept from the offline grader, which was the only place they lived.
    Every one is a sentence that can be pasted into any other conversation,
    which is the test.
  */
  { say: "I understand", re: /\bi understand\b/i, why: "claims a thing you cannot claim" },
  { say: "I'm here for you", re: /i'?m here for you/i, why: "a promise the code cannot keep" },
  { say: "that must be hard", re: /that must be (hard|difficult|tough)/i, why: "narrating their feeling at them" },
  { say: "tell me more", re: /tell me more/i, why: "a prompt, not a question" },
  { say: "how does that make you feel", re: /how does that make you feel/i, why: "the parody of this job" },
  { say: "as an AI", re: /\bas an ai\b/i, why: "a disclaimer in the middle of a sentence" },
  { say: "your journey", re: /\byour journey\b/i, why: "their life is not a journey" },
  { say: "hold space", re: /\bhold space\b/i, why: "workshop language" },
  { say: "sit with it", re: /\bsit with (?:it|that)\b/i, why: "the thing said when there is nothing to say" },
];

/**
 * Reading the file aloud — which is a different offence from recalling.
 *
 * The grader used to fail `/last time you\b/` as reciting, and the prompt's
 * context rules banned the phrase "last time you said…" by name. That was one
 * rule aimed at the wrong half of the problem, and it cost this product the
 * single thing that makes somebody feel known.
 *
 * The distinction that actually matters to a person: quoting *their* sentence
 * is being heard; narrating *our* record is being processed. "Last time you
 * said your brother still hasn't called" is a therapist. "You've brought this
 * up four times" is a system with a counter, and "based on our previous
 * sessions" is a system that wants you to know it has a database.
 *
 * So the recall is allowed and the bookkeeping is banned: counts, our word for
 * the container, and any sentence about where the information came from.
 */
/*
  The onboarding selection, read back by name.

  Generated from the chairs table rather than typed, so the grader and the
  screen cannot drift — the vocabulary is whatever the room actually offered.

  Narrow on purpose. It was once a bare `/you (chose|picked|selected)/`, and a
  dry run against the 51 authored replies flagged two of them: "What's the
  number she'd hear in your voice if you picked today?" and "You chose them
  and they spent it". Both are ordinary English about picking up a phone and
  trusting somebody, and a grader that fires on those teaches the model to
  avoid a common verb.
*/
const PICKED_BACK = new RegExp(
  `\\byou (?:chose|picked|selected) (?:the )?(?:${[
    ...OBJECTS.map((o) => o.label),
    ...CARRY_WORDS,
  ].join("|")})\\b`,
  "i",
);

export const FILE_LANGUAGE: readonly BannedPhrase[] = [
  { say: `you chose the ${OBJECTS[0].label}`, re: PICKED_BACK,
    why: "their tap off a list of six, quoted as if it were a confession" },
  { say: "four sessions ago", re: /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten) (?:of your )?sessions?\b/i,
    why: "a counter, read out" },
  { say: "you've brought this up", re: /\bbrought (?:this|that|it) up\b/i, why: "counting their repetitions at them" },
  { say: "our previous sessions", re: /\b(?:our|your) (?:previous|last|earlier) sessions?\b/i, why: "our word for the container" },
  { say: "your history", re: /\byour (?:history|file|record|profile|notes)\b/i, why: "they are not a file" },
  { say: "based on what you've told me", re: /\bbased on what you'?(?:ve| have)? (?:told|said|shared)/i, why: "citing a source at somebody" },
  { say: "I see from", re: /\bi see (?:from|that you'?ve)\b/i, why: "narrating the lookup" },
  { say: "my notes", re: /\b(?:my|our) notes\b/i, why: "there are no notes" },
  { say: "in our conversation history", re: /\bin (?:this|our) (?:chat|thread|conversation) history\b/i, why: "the interface talking about itself" },
];

/** The first banned phrase in a piece of text, or null. */
export function bannedPhrase(text: string): { match: string; why: string } | null {
  for (const { re, why } of BANNED_PHRASES) {
    const m = text.match(re);
    if (m) return { match: m[0], why };
  }
  return null;
}

/**
 * Tasks that fit anybody, which is the entire reason they are banned.
 *
 * "If your reply could be sent to any human on earth, it failed."
 *
 * That is the test, and it is sharper than the list. Drink water, go for a
 * walk, do a breathing exercise, write a gratitude list, put your phone down
 * for three minutes: every one of them can be pasted under any message in this
 * product without reading it. Somebody who has just written that their father's
 * test results came back does not need a glass of water, and being handed one
 * is the room telling them plainly that nothing they typed was read.
 *
 * WHY THIS IS A SEPARATE TABLE FROM `BANNED_PHRASES`
 *
 * Because it is conditional, and that table is not. "You've got this" is wrong
 * in every message this product will ever send. "Try a breathing exercise" is
 * wrong right up until somebody asks for a coping skill, and then it is the
 * answer to the question. A ban that cannot be lifted would make the room
 * refuse the one request it is qualified to grant — see `askedForSkill`.
 *
 * WHAT IT DELIBERATELY DOES NOT CATCH
 *
 * The tactic library's own moves, and this was the test that told me the list
 * was drawn in the right place rather than merely drawn. `body_map_drop_set`
 * says "four seconds in, six out, drop the shoulder" — a breathing instruction,
 * aimed at the exact place in the body they named, selected because they named
 * it. The generic version and the surgical version of the same clinical move
 * fall on opposite sides of this list, and nothing here had to be special-cased
 * for that to happen. Verified rather than asserted: zero of the 72 authored
 * replies and zero of the 35 tactic holds match a row below, which is check
 * 86's first assertion and the reason the failsafe can go on exempting our own
 * strings.
 */
export const GENERIC_TASKS: readonly BannedPhrase[] = [
  { say: "drink some water", re: /\b(?:drink|have|sip)(?:ing|ping)? (?:some |a glass of |more |plenty of )?water\b|\bstay hydrated\b|\bhydrat(?:e|ing|ion)\b/i,
    why: "a glass of water, handed to somebody whose father is dying" },
  { say: "go for a walk", re: /\b(?:go (?:for|on)|take|have|going for) an? (?:short |quick |little |long |brisk )?walk\b|\b(?:get|grab|catch) (?:some )?fresh air\b/i,
    why: "the thing said to somebody when nobody has read what they wrote" },
  { say: "try a breathing exercise", re: /\bbreath(?:ing|e) (?:exercise|technique|practice|drill)s?\b|\bbox breathing\b|\btake (?:a |one |some |three |five |ten |a few |couple of )?deep breaths?\b|\bjust breathe\b/i,
    why: "a technique where a question about what is happening was meant" },
  { say: "write a gratitude list", re: /\bgratitude (?:list|journal|practice|exercise)s?\b|\b(?:list|write|name|think of) (?:down )?(?:three|3|five|5|ten|10|some) things (?:you(?:'?re| are)? )?(?:are )?grateful\b|\bcount your blessings\b/i,
    why: "asks them to be pleased about something else instead" },
  { say: "put your phone down for three minutes", re: /\b(?:put|drop|leave|set) (?:your |the )?phone (?:down|away|aside)\b|\bscreen break\b|\bdigital detox\b|\bstay off (?:your |the )?(?:phone|socials?|social media)\b/i,
    why: "blames the phone for the thing in the message" },

  /*
    Not on the spec's list of five, and the same species exactly.

    Every one of these is a sentence that survives having its message deleted,
    which is the only test that matters here. They are cheap to add and each of
    them was checked against the authored corpus before it went in — the list
    is allowed to grow only in that direction.
  */
  { say: "practise self-care", re: /\bself[- ]care\b|\btreat yourself\b|\bbe kind to yourself\b/i,
    why: "a category, offered in place of a sentence" },
  { say: "try meditating", re: /\b(?:try |start |do (?:some )?)?(?:meditat(?:e|ing|ion)|mindfulness)\b/i,
    why: "an app recommendation wearing a therapist's voice" },
  { say: "try journaling", re: /\b(?:try |start |consider |do some )(?:journal(?:l?ing)?|writing it (?:all )?down)\b/i,
    why: "they are already writing it down — that is what this box is" },
  { say: "get some rest", re: /\b(?:get|have) (?:some |a )?(?:good |early )?(?:rest|sleep|early night)\b|\bsleep it off\b/i,
    why: "the end of a conversation, dressed as care" },
];

/** The first generic task in a piece of text, or null. */
export function genericTask(text: string): { match: string; why: string } | null {
  for (const { re, why } of GENERIC_TASKS) {
    const m = text.match(re);
    if (m) return { match: m[0], why };
  }
  return null;
}

/**
 * Did they actually ask for something to do?
 *
 * This is the exemption, and it is the whole reason the ban above is a
 * function of two arguments rather than a list. The rule is not "never give
 * an action" — it is "only give an action if the person asked for one, and it
 * is tied to what they told you". The second half is what the tactic library
 * already is: every move in it is selected by a predicate over their own
 * words or their own pressure number, so a selected tactic is tied by
 * construction. This is the first half, and it is the half nothing checked.
 *
 * Deliberately narrow. "Help me" is not here, and leaving it out was the
 * decision that took the longest: somebody typing "help me" at 2am is not
 * requesting a technique, they are saying the only thing left, and answering
 * that with a breathing drill is the exact failure this file exists to stop.
 * A false positive here silently re-opens the ban for a person who never
 * asked, so the cost of the two errors is not symmetric and the list is
 * written for the cheaper one.
 *
 * Pidgin is not an afterthought row. "Wetin I go do" is how the question is
 * actually asked by most of the people this is written for, and a classifier
 * that only speaks English would hold the ban shut against exactly them.
 */
const ASKED_FOR_SKILL: readonly RegExp[] = [
  /\bwhat (?:should|shall|do|can|could|would) i (?:do|try|say)\b/i,
  /\bhow (?:do|can|should) i (?:cope|deal|handle|manage|calm|stop|fix|get through|move on|start)\b/i,
  /\btell me what to do\b/i,
  /\bgive me (?:a |an |some )?(?:advice|tip|tips|step|steps|exercise|technique|something)\b/i,
  /\bany (?:advice|tips?|ideas?|suggestions?)\b/i,
  /\bwhat would you do\b/i,
  /\bi need (?:advice|a plan|steps?|something to do)\b/i,
  /\bhow do i (?:even )?(?:begin|move)\b/i,
  /*
    Pidgin, and the same question — but only the forward-looking one.

    This was `/wetin (?:i|make i)(?: go| fit)? do/`, and the optional future
    marker is what made it wrong: "wetin I do wrong" is somebody blaming
    themselves for what already happened, and it was being read as a request
    for a technique. The tense *is* the classifier here. English gets this for
    free from "should"; Pidgin carries it in `go` and `fit`, so they are
    required rather than optional.
  */
  /\bwetin (?:i go|i fit|make i) do\b/i,
  /\bhow i (?:go|fit) (?:do|take|take am|handle)\b/i,
  /\babeg (?:advise|help|tell) me\b/i,
  /\bwetin you (?:think|talk) say i (?:go|fit|should) do\b/i,
];

export function askedForSkill(message: string): boolean {
  return ASKED_FOR_SKILL.some((re) => re.test(message));
}

/**
 * One to three sentences.
 *
 * The prompt said "three to four" and the grader complained at six, which is
 * a two-sentence gap where nobody was in charge. A tired therapist at 11am
 * does not produce four sentences; they produce one, and then a question.
 */
export const REPLY_SENTENCE_CAP = 3;

/** Terminal punctuation, ignoring the ellipsis somebody trails off with. */
export function sentenceCount(text: string): number {
  return text
    .replace(/\.{2,}/g, " ")
    .split(/[.!?]+(?:\s|$)/)
    .filter((s) => s.trim().length > 0).length;
}

/**
 * What the room says when it genuinely has nothing.
 *
 * The honest half of MEMORY FIRST, and it has to be a constant rather than an
 * instruction, because "say you don't remember" is the one sentence a model
 * will happily improvise a warmer version of. A first-time visitor being told
 * "I remember you mentioned…" is the worst failure available here.
 */
/*
  His words, not a paraphrase of them.

  This read "I don't have that from before yet." — close, and not the same
  sentence. The spec has now named the exact line twice, and a constant that
  approximates a specified string is the drift this file exists to stop.
*/
export const NO_MEMORY_LINE = "We haven't talked about this yet.";

/**
 * What this product says it is, in one place.
 *
 * "Carve your truth." was the tagline, the composer's placeholder, the input's
 * label, the share text, the manifest description, the page metadata and the
 * README — eight hand-typed copies of one slogan, one of which sat inside the
 * box somebody types their worst sentence into.
 *
 * The slogan is banned above, so the copies had to become something. They
 * became this: a sentence that says what the room is instead of what the
 * person should do. Everything that needs a description imports it.
 */
/**
 * The product's name, as a person sees it. Metadata in two files had its own
 * copy each.
 */
export const PRODUCT_TITLE = "Mind Weave Vent — Truth Anchor";

/**
 * What the room says when a deletion did not happen.
 *
 * The chat and the Memory page both offer "Forget this", both call the same
 * route, and both read the same field of the same answer — `kept-list.tsx`
 * says so in its own docstring: "a second implementation of 'is it gone' is a
 * second answer to the only question that matters on this page." It imported
 * the logic and then hand-typed the sentence twice.
 *
 * A sentence about a promise that was not kept is the last place two copies
 * should be allowed to drift.
 */
export const FORGET_FAILED = "Could not clear that. It is still here.";

export const PRODUCT_LINE =
  "Somewhere to put the thing you can't say out loud yet.";

/**
 * The reply contract, written once and injected into the system prompt.
 *
 * This is the founder's spec for the office, kept verbatim in intent and
 * compressed in wording, with one resolution made explicit rather than
 * silently picked — see MEMORY, below.
 */
/*
  The list of phrases not to say used to be generated into this block, and
  taking it out is the point rather than a saving.

  Twelve worked examples of self-help phrasing, in front of a model, every
  turn — telling something not to say "that must be hard" is showing it "that
  must be hard" and asking it to think about the register. Priming is not
  hypothetical here: it is the same mechanism as the tactic examples stripped
  out of `prompt.ts`, and both were producing the thing they were written to
  prevent.

  The guarantee did not come from the list anyway. `failsafe.ts` inspects the
  finished reply against this exact table and regenerates once if it carries
  one — deterministically, for free, after the fact, where a prompt line is a
  request. Belt and braces, except the belt was priming the fall.
*/
export const OFFICE_RULES = `THE OFFICE
You run a therapy office. Not a motivational page, not a coach, not a friend
who cheers. A tired but good therapist at 11am: calm, blunt, "you" and "I".

EVERY REPLY
Answer what they actually said. Then ask one thing you do not know the answer
to. That is the whole shape and it is deliberately not a template: sometimes
the right reply is one sentence, sometimes it is only the question, sometimes
it is their own word said back with nothing after it.

${REPLY_SENTENCE_CAP} short sentences, maximum, and one is often right. No metaphor, no
lecture, no preamble, and never the same opening two turns running.

Four parts reflecting what they actually said to one part asking, and zero
parts advice they did not ask for. If they ask for advice you may give it;
until then their sentence is the material and there is nothing to improve.
`;
