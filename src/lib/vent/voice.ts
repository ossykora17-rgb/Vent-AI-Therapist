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

  /*
    FOUR MORE, FROM A REPLY SOMEBODY ACTUALLY RECEIVED

    Not from a list of therapy clichés — from one production screenshot, which
    is the only instrument that finds these. The reply read, in full:

      "Being treated like a broken machine is its own kind of exhaustion. When
       that voice starts, write down one plain sentence about what is actually
       true. Do you want me to just witness this with you, or push?"

    Three sentences, and the person had just said they were being treated like
    a machine that needs fixing. The room answered with a task, a piece of
    therapy vocabulary, and a menu of what it might do next. Every one of those
    survives having the message deleted, which is this file's whole test.

    Each regex below was run against all 464 authored strings this product can
    emit — the holistic examples, the golden set, every tactic hold and
    instruction, every probe — before it went in. Zero hits, which is the only
    direction this list is allowed to grow in.
  */
  { say: "I hear you", re: /\bi hear you\b|\bi hear how (?:hard|heavy|much)\b/i,
    why: "the same claim as 'I understand', one verb over" },
  { say: "safe space", re: /\b(?:this is a |a )?safe space\b/i,
    why: "a promise about the room, made by the room" },
  { say: "the weight you're carrying", re: /\bheavy weight\b|\bthe weight (?:that )?you(?:'?re| are) carrying\b/i,
    why: "narrating their feeling back at them as an object" },
  { say: "witness this with you", re: /\bwitness (?:this|that|it) with you\b|\bi(?:'?ll| will) (?:just )?witness\b/i,
    why: "workshop language, and a job description nobody asked to hear" },
  { say: "what is actually true", re: /\bwhat(?:'?s| is) (?:actually|really) true\b|\bthe (?:actually|really) true thing\b/i,
    why: "a framing exercise offered instead of a question about their life" },

  /*
    AGREEMENT USED INSTEAD OF ENGAGEMENT

    A different offence from the rest of this table. "You've got this" is a
    cheer; these are *agreement* — they feel supportive, they cost the room
    nothing, and they leave somebody exactly where they were. The spec that
    prompted them puts it well: avoid over-validating in ways that lock the
    person into the problem.

    They fail this file's own test more plainly than anything else here.
    "Anyone would feel that way" survives having the message deleted — it is
    true of every human alive, which is precisely what makes it worthless to
    the one who wrote in. `THE ROOM` asks for weight over warmth and stillness
    over cheer, and this is warmth with nothing underneath it.

    `that must be hard` has been banned for a long time and reads
    `/that must be (hard|difficult|tough)/` — a fixed opener, required. So
    "that sounds incredibly hard" walked straight past it, which is the
    journaling regex again: a pattern written the way its author would phrase
    it, meeting the way a model actually phrases it. Fourth time.

    Checked against all 202 strings this product can author before going in.
    Zero hits.
  */
  { say: "anyone would feel that way", re: /\b(?:anyone|anybody|any ?one) would (?:feel|be|react|do)\b/i,
    why: "true of everybody, and therefore about nobody" },
  { say: "completely valid", re: /\b(?:completely|totally|absolutely|perfectly|entirely) (?:valid|understandable|normal|justified|reasonable)\b|\b(?:that'?s|it'?s|this is) (?:so |really |very |such )?(?:valid|understandable)\b/i,
    why: "a verdict on their feeling, where a question about their life was meant" },
  { say: "of course you feel", re: /\bof course you (?:feel|felt|would feel|are)\b/i,
    why: "agreement that closes the sentence instead of opening it" },
  { say: "you have every right to", re: /\byou have every right to\b|\byou'?re not wrong (?:to|for)\b/i,
    why: "a ruling nobody asked for — the same shape as 'you are worthy'" },
  { say: "that sounds incredibly hard", re: /\bsounds? (?:so |really |incredibly |unbelievably |beyond )(?:hard|difficult|tough|painful|exhausting|awful)\b|\bno wonder (?:you|that)\b/i,
    why: "'that must be hard' with an intensifier, which the older pattern could not see" },
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
 * WHAT IT USED TO DELIBERATELY NOT CATCH, AND WHY THAT IS NOW `errand()`'S JOB
 *
 * This table is still the vocabulary of tasks that fit anybody, and it is still
 * read first. What changed is the rule around it: the room hands out no task at
 * all now — generic or aimed, asked for or not — and `errand()` below is the
 * one detector every surface asks. The paragraph that follows is kept because
 * it is the argument that was *overruled*, not a mistake: the aimed version of
 * a clinical move really is better than the generic one. The founder's spec
 * decided that neither belongs in this room, and a record of what was given up
 * is worth more than a tidy file.
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

  /*
    THE IMPERATIVE, WHICH THE JOURNALING ROW ABOVE CANNOT SEE

    `try journaling` reads `/(?:try |start |consider |do some )(?:journal…|writing
    it down)/` — it requires a hedging verb in front. A model asked for an
    instruction does not hedge. It writes "write down one plain sentence", and
    that walks past every grader in this product, which is how it reached
    somebody.

    Same species as `make you` and `\bdon\b` in `intent.ts`: a pattern written
    in the shape the author would phrase it, meeting text phrased the way a
    model actually phrases it.

    NARROW ON PURPOSE, AND THE NARROWNESS IS THE ARGUMENT

    This does *not* ban writing something down. `holisticExamples.jsonl` has
    "Write down the one it keeps returning to, on paper, next to the bed" —
    aimed at somebody whose mind loops before sleep, and next-to-the-bed is the
    actual CBT-I protocol rather than a gesture. By this file's own stated line
    that passes: aimed at the exact thing they named, so task is not the
    offence and generic is.

    What is banned is the *empty object*. "One plain sentence" names nothing,
    ties to nothing they said, and could be appended to any message on earth.
    The difference between the two is not the paper. It is whether the thing
    being written down came out of their message.
  */
  { say: "write down one plain sentence",
    re: /\b(?:write|jot|put) (?:down |out )?(?:just )?(?:one|a|a single) (?:plain|simple|single|short|honest|true) (?:sentence|line|thing|statement)\b|\bname (?:one|a) (?:plain|simple|true) thing\b/i,
    why: "an instruction with nothing of theirs in it — homework, not a move" },
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
 * Anything handed to them to do. Generic or aimed, asked for or not.
 *
 * THE RULE, AND WHERE IT CAME FROM
 *
 * "You never assign external tasks, behavioral homework, or micro-errands of
 * any kind" — the founder's spec, and it overrules this file's older line that
 * generic was the offence and task was not. The room's moves are its own:
 * reflect, name the process keeping them stuck, name their part in it without
 * blame, stay with the moment, show what the current solution costs, ask one
 * question. None of those is an instruction to the person, so the test is the
 * grammar of the sentence rather than the quality of the advice.
 *
 * Production said how often, before this was written: 18 of 113 English
 * replies carried one — seven of them "…tonight, you can / try…", which is
 * the spec's own example, and six "say it … out loud", which is a hold from
 * this library read back verbatim. It was not the model misbehaving. The
 * system prompt's first engine told it to close on "one small repeatable
 * thing … small enough that they will actually do it tonight."
 *
 * WHAT IS LEFT OUT ON PURPOSE
 *
 * The conversation continuing. "Tell me", "say more", "go on", "go back to",
 * "take your time", and a bare "name it" or "say it" in a room whose only
 * channel is the box they are typing in — those ask for the next sentence
 * *here*, which is the one thing this room is for. "Say it out loud", "say it
 * to her" and "say it again as if" leave the conversation, and are in.
 *
 * "Call it what it is" is naming, not dialling, and "make you go" is English
 * causative everywhere except the front of a sentence, where it is Pidgin's
 * command — the `make you` collision this repository has already paid for.
 * And "just go" is not here at all: "you just go quiet" is English, and it hit
 * an English production row the one time it was tried.
 *
 * The safety floor is not a move and is not graded here: the crisis lines and
 * the age gate's referral to a trusted adult are what the room does when it is
 * the wrong place to be, not what it says to somebody inside a conversation.
 */
const ERRAND_VERBS =
  "write|jot|text|call|message|ring|send|go|take|drink|eat|sleep|breathe|walk|try|start|stop|make|set|schedule|list|spend|watch|put|leave|plan|book|reach out|drop|unclench|relax|rest|place|press|count|close|notice|imagine|picture|remind yourself|ask yourself|let yourself|allow yourself|give yourself|practi[cs]e|find|pick|choose|repeat|tell|talk";
const CLAUSE = String.raw`(?:^|[.!?:;]\s+|—\s*|\n\s*)(?:and |then |now |just |first,? |so )?`;
const ERRAND_FRAMES: ReadonlyArray<readonly [string, RegExp]> = [
  /*
    Two exclusions the corpus forced, both shapes this repository has paid for.
    "Rest is being held hostage by a belief" opens on a verb that is a noun,
    and a copula straight after it says so. And "Make we leave the why tonight"
    is Pidgin's hortative — `make we / I / e / dem` — which this file keeps in
    `PIDGIN_GRAMMAR` on purpose and which `fused` already exempts by name.
  */
  ["an instruction", new RegExp(`${CLAUSE}(?:${ERRAND_VERBS})\\b(?! me\\b| more\\b| on\\b| back\\b| your time\\b| it what\\b| we\\b| i\\b| e\\b| dem\\b| us\\b|'s\\b|\\s+(?:is|was|isn't|wasn't|has|had|feels|felt|becomes|keeps|can|could|will|won't|would|does|doesn't|comes|sounds|seems)\\b)`, "i")],
  ["something to say out loud", /\b(?:say|repeat|read) (?:it|that|them|this|those|the \w+(?: \w+)?)\b[^.?!]{0,30}\b(?:out loud|aloud|to yourself)\b/i],
  ["an exercise", /\bsay it (?:again )?(?:with|as if|as though)\b/i],
  ["something for later", /\b(?:tonight|tomorrow|this week|next time|before (?:you )?(?:bed|sleep)|when you get home|in the morning|over the weekend)\b[^.?!]{0,50}\b(?:you (?:can|could|might|should|will)|try|do one|write|call|text)\b/i],
  ["a suggestion", /\b(?:you (?:could|might want to|may want to) (?:try|write|call|text|tell|take|go|start|make|put|reach|talk)|it (?:might|may|could) help to|how about (?:you|trying)|why not (?:try|write|call|tell))\b/i],
  ["a step", /\bone (?:small |tiny |little )?(?:step|thing to do|action|thing to try)\b|\b(?:next|small|first|tiny) step\b/i],
  ["a plan", /\bwhat(?:'s| is) (?:one|the) (?:small(?:est)? |next |first |earliest )?(?:thing|step|hour)\b[^?]{0,40}\byou (?:could|can|will|might|would) (?:do|stop|take|try|change|start|drop|tell|say|give)\b|\bwhat (?:could|will|can) you do (?:tonight|tomorrow|next|about)\b/i],
  /*
    At the front of a clause only. "You no dey talk to anybody for house" is
    the room handing their own sentence back — the best move it has — and an
    unanchored match read it as an instruction to go and find somebody.
  */
  ["somebody to contact", new RegExp(`${CLAUSE}(?:(?:reach out to|talk to|text|call|message|ring) (?:someone|somebody|a friend|a person|anybody|anyone)|say (?:it|that|this) to (?:her|him|them|your \\w+))\\b`, "i")],
  ["a Pidgin instruction", new RegExp(`\\babeg (?:go|try|drink|rest|call|text|sleep|waka|write)\\b|${CLAUSE}make you (?:go|try|call|text|drink|rest|sleep|write|waka)\\b`, "i")],
];

/** The first thing this text hands them to do, or null. */
export function errand(text: string): { match: string; why: string } | null {
  const generic = genericTask(text);
  if (generic) return generic;
  for (const [what, re] of ERRAND_FRAMES) {
    const m = text.match(re);
    if (m) return { match: m[0].trim(), why: `hands them ${what}` };
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
 * One to four sentences.
 *
 * The prompt said "three to four" and the grader complained at six, which is
 * a two-sentence gap where nobody was in charge. A tired therapist at 11am
 * does not produce four sentences; they produce one, and then a question.
 *
 * Raised from 3 to 4 by decision, not by drift. The argument above is still
 * the argument — one sentence and a question is usually right, and this is a
 * ceiling rather than a target. What moved is the ceiling: a fourth sentence
 * is now allowed rather than noted, which costs up to a third more output
 * tokens on the replies that use it and nothing on the replies that do not.
 *
 * Every reader imports this constant — the prompt, the failsafe's retry
 * instruction and the `length` grader — so the number lives here and only
 * here. It was nearly written into the prompt as a word twice.
 */
export const REPLY_SENTENCE_CAP = 4;

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
parts advice or tasks — nothing to do after this, even when they ask; then
the asking is the material, and there is nothing to improve.
`;

/*
  WHAT IS NOT IN THE PROMPT ABOVE, AND WHY

  A rule was written for this block and did not go in: "when you do give an
  action, it happens in the room they are in, in under a minute, out of what
  they told you — no paper, no notebook, no tomorrow morning."

  It is a good rule. It came from a production reply that told somebody to
  write down one plain sentence, and it is now enforced — as the
  `write down one plain sentence` row in `GENERIC_TASKS`, which the failsafe
  rejects and regenerates.

  It is not in the prompt because the prompt has no room. Check 24 measures the
  heaviest possible assembly at exactly 3,600 tokens against a 3,600 ceiling,
  and that check's own comment settled the question before this one came up:
  "the next block pays by removal ... whoever raises this number next should
  have deleted something." This rule replaces nothing. `THE ONE RULE ABOUT THE
  BODY` is the closest thing to it and is the *more* specific of the two, which
  by this repository's own ranking makes it the one that stays.

  So the instruction is enforced where it can be measured and absent where it
  would only be hoped for — which is the split this file already makes for
  everything else. If the ceiling is ever raised, this is drafted and ready.
*/
