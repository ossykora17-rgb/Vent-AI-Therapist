import { gradeReply, type GoldenCase } from "./quality";
import { REPLY_SENTENCE_CAP } from "./voice";
import { wasAuthored } from "./tactics";

/**
 * The reply gets inspected before anybody reads it.
 *
 * "FAILSAFE: If output sounds like a self-help book, reject and regenerate."
 *
 * Everything needed for that already existed and none of it ran at the right
 * time. `gradeReply` knows advice, promises, banned phrases and file language;
 * it ran in `npm run quality`, a paid command nobody runs nightly, and in the
 * audit, which reads replies people already received. The live path shipped
 * whatever came back.
 *
 * WHAT COUNTS AS A REJECTION, AND WHY IT IS NARROW
 *
 * Only the offences that are unambiguous from the text alone:
 *
 *   `advice` and `promise` are fatal in the grader and fatal here. This room
 *   does not fix people, and it does not say it will remember.
 *
 *   `generic` is a phrase from the banned table — the literal self-help book.
 *
 *   `recites` is the file read aloud: a counter, our word for the container,
 *   or a sentence about where the information came from.
 *
 * Coverage and length are deliberately *not* grounds for a retry. They are
 * real findings and they belong in the nightly audit, but a reply one sentence
 * over the cap is worth a note and not a second billed call — and the two
 * office-contract graders that would have joined this list did not survive
 * their own corpus, which is written up in `quality.ts`.
 *
 * LANGUAGE USED TO BE IN THAT SENTENCE, AND SHOULD NEVER HAVE BEEN
 *
 * "Coverage, length and language mixing are deliberately not grounds for a
 * retry" — one economics argument, made about length, carrying two other
 * graders along on the strength of sitting beside them in a list. This
 * repository has a name for that shape: a grader that imports a rule from the
 * wrong room, which `quality.ts` records twice in its own comments.
 *
 * The argument is right about length. A reply four sentences long instead of
 * three is drift, and drift is not worth a billed call. It is wrong about
 * language, and production says how wrong: of 171 real vents, twelve were
 * written in Pidgin, classified `pidgin` correctly by the router, prompted
 * with "Reply in Pidgin" at `prompt.ts` — and **six of the twelve were
 * answered in English**. Not a rare edge. Half of every Pidgin turn this
 * product has ever taken. The instruction lands in the prompt and the model
 * steps over it, which is the one failure a prompt can never fix from the
 * inside.
 *
 * Answering a Nigerian in English when they wrote to you in Pidgin is not
 * style drift. It is the room declining the register they chose to be honest
 * in, on the one surface whose whole claim is that it speaks the way they do.
 * It is objectively visible in the text, which is this file's own test for
 * whether a rule belongs in a gate.
 *
 * TWO TIERS, BECAUSE THE FALLBACK IS NOT THE SAME FALLBACK
 *
 * `REJECT` means the reply is harmful — advice reaching somebody, a promise
 * the code cannot keep, a person who does not exist. If a retry fails too, the
 * tactic's authored line is genuinely better than what the model produced.
 *
 * `RETRY_ONLY` means the reply is in the wrong language and nothing else. If a
 * retry fails too, the authored line is *also* English, and it is generic on
 * top — so falling back would swap an engaged English reply for a bland one
 * and call it a repair. Keep the model's words. `chooseReply` is where that
 * distinction is spent.
 *
 * WHAT IT COSTS
 *
 * Nothing on a good reply. One extra call on a bad one, once, and then the
 * tactic's authored line — which passes by construction, because check 76
 * fails the build if anything we wrote contains a banned phrase. On the
 * production sample the new tier is nine turns in a hundred and seventy-one —
 * six Pidgin messages answered in English, three English answered in Pidgin.
 */

/** Grader labels worth spending a second call to avoid. */
/*
  `generic_task` joined this list last, and it is the only member that reads
  the person's message as well as the reply.

  "Your job is not to fix. Your job is to understand." A coping task nobody
  asked for is the single most common way this room stops being a therapy
  office and becomes a wellness app, and it is objectively visible in the text
  — which is the test for whether a rule belongs in a gate at all. The
  exemption lives in `askedForSkill`: if they asked, it is not an offence, and
  the grader never fires.
*/
export const REJECT = new Set([
  "advice", "promise", "generic", "generic_task", "invented", "recites", "empty",
  /*
    `diagnosis` is the newest and the least arguable.

    Every screen says this is not therapy, the prompt says "never diagnose, and
    never name a condition", and `keepable()` refused to write one into a row
    from the day notes existed. None of that was ever checked on the sentence a
    person reads: five of 171 real replies handed somebody a condition they had
    never used, all five "anxiety", one of them attributing it to two people
    who were not in the room.

    Squarely in this tier rather than the retry-only one. A name for your
    condition is not something you can un-hear, and an authored line that says
    less is better than a label from a room with no licence.
  */
  "diagnosis",
]);

/**
 * Worth a second call, and never worth the authored line if that call fails.
 *
 * One member. See the header for why it is not in `REJECT` and why it is no
 * longer in the sentence that excuses `length`.
 */
/*
  `jargon` joins it, and the argument is the same one rather than adjacent to
  it — which is the mistake this file already records, where one sentence about
  length carried two other graders into the exempt list on the strength of
  standing beside them.

  A reply that says "you are experiencing internalized instrumentalization" is
  not harmful. Nobody is hurt by it; they simply do not know what was said to
  them, which in a room somebody opened at 2am is its own kind of failure. It is
  worth a second call — the model reaches for the short abstract noun and asking
  again usually gets the sentence underneath it.

  It is not worth the authored line, and here the reason differs from
  `language`'s and lands in the same place. The hold is plain by construction,
  so it beats a jargon reply on clarity — and it is generic, so it loses on
  everything else. An opaque sentence built out of *their* words still carries
  their words; the hold carries nobody's. Retry, and if the retry is opaque too,
  keep what the model wrote.
*/
export const RETRY_ONLY = new Set(["language", "jargon"]);

/**
 * Computed here, deliberately not acted on. Named rather than merely absent,
 * because "we decided this is drift" and "nobody has looked at this yet" are
 * different states and an empty space cannot tell you which one it is.
 */
export const NOTED = new Set(["coverage", "length"]);

/**
 * Cannot fire on this path, whatever the reply says.
 *
 * `inspectReply` calls `gradeReply` with no `meta.intent` (so `routing` has
 * nothing to compare against), with `c.intent` always `"vent"` (so
 * `credit_policy` and `crisis_to_model` are unreachable by construction — a
 * crisis never reaches a model to be inspected), and with `tokensSpent: true`
 * (so `no_model` cannot fire). Listed, not omitted, for the same reason as
 * `NOTED`.
 */
export const UNREACHABLE = new Set(["routing", "crisis_to_model", "credit_policy", "no_model"]);

export interface Verdict {
  /**
   * Null when the reply may be sent; otherwise the grader names, and *only*
   * the grader names.
   *
   * This used to carry each finding's detail as well — `${grader}: ${detail}`
   * — and the route logged it verbatim. Details quote the reply: `recites`
   * prints the sentence it read back as a receipt, which on this product is
   * usually the person's own words handed to them, and `invented` prints the
   * naira figure. So the one diagnostic that fires when a reply goes wrong was
   * writing fragments of a private conversation to a hosted runtime's stdout,
   * which has no delete button and outlives every deletion the interface
   * offers.
   *
   * Check 103 could not see it, because the argument was a variable and the
   * rule was enforced on the literal. The fix is not a smarter check — it is
   * that the obvious field to log is now the safe one. Anybody who wants the
   * detail calls `gradeReply` and has to decide, on purpose, what to do with
   * what comes back.
   */
  reject: string | null;
  /** What to append to the system prompt for the one retry. */
  correction: string | null;
  /**
   * Whether the tactic's authored line beats this reply.
   *
   * True when at least one offence is in `REJECT`. False when the only thing
   * wrong is the language, because the authored line does not fix that and
   * loses everything the model got right on the way.
   */
  authoredIsBetter: boolean;
}

export function inspectReply(c: GoldenCase, reply: string, said?: string): Verdict {
  /*
    An authored line is not model output, and cannot be regenerated anyway.

    Found by check 82 asserting the fallback is safe: `change_talk`'s hold —
    "You already said what you should do. Tell me why it matters to you" — is
    flagged as advice, because `containsAdvice` sees "should". It is not
    advice. It is the person's own "should", handed back to them, which is the
    single most useful move in that tactic.

    `quality.ts` already carries this exact lesson one rule over: it used to
    import the circles cross-talk rule too, and "that one no be your fault" —
    correct in a private session, blaming in a room of six — was being graded
    by a rule from the wrong room. Same shape here, and the same answer:
    inspect what a model said, not what we wrote. Check 76 already fails the
    build if anything we wrote carries a banned phrase.
  */
  if (wasAuthored(reply)) return { reject: null, correction: null, authoredIsBetter: false };

  const findings = gradeReply(c, reply, { tokensSpent: true, said });
  /*
    A minor is never grounds for a retry, and that rule is load-bearing now
    that `language` is here.

    The language grader fires twice over. Major is "answered a Pidgin message
    in English" — the room refusing their register, and the whole reason this
    tier exists. Minor is "a Pidgin reply carrying a lot of English
    scaffolding", which describes most real Pidgin: the language borrows
    English function words by construction, and a threshold of four of them is
    a hint for the audit, not a verdict. Spending a billed call on it would
    bill the product for speaking Pidgin correctly.

    Stated as severity rather than as a second exception list, because that is
    what the severities already mean: fatal blocks a release, major is a
    regression, minor is drift, and drift does not buy a call.
  */
  const bad = findings.filter(
    (f) => f.severity !== "minor" && (REJECT.has(f.grader) || RETRY_ONLY.has(f.grader)),
  );
  if (bad.length === 0) return { reject: null, correction: null, authoredIsBetter: false };

  return {
    reject: [...new Set(bad.map((f) => f.grader))].join(" · "),
    correction: correctionFor(bad.map((f) => f.grader), c.language),
    authoredIsBetter: bad.some((f) => REJECT.has(f.grader)),
  };
}

/**
 * Which of the attempts a person actually receives.
 *
 * Lives here rather than in the route because it is the other half of the
 * two-tier decision, and the two halves drifting apart is the failure this
 * repository keeps writing down: a rule fixed in the file in front of somebody
 * and not in the copy that ships. One table, one truth — and it is a pure
 * function, so the eval suite grades the real decision rather than a paraphrase
 * of it in a regex.
 *
 * Attempts are given best-first: the retry before the original, because the
 * retry is the one that was told what was wrong.
 *
 *   A clean attempt wins outright.
 *   Otherwise the best *mild* attempt — one whose only offence is the language
 *   — because an engaged English reply beats a generic English hold.
 *   Only if every attempt is harmful does the authored line take over, which
 *   is exactly what this function did before the mild tier existed.
 */
export function chooseReply(
  attempts: readonly { text: string; verdict: Verdict }[],
  hold: string | null,
): { text: string; from: number | null } | null {
  const pick = (test: (v: Verdict) => boolean) => {
    const i = attempts.findIndex((a) => a.text?.trim() && test(a.verdict));
    return i === -1 ? null : { text: attempts[i].text, from: i };
  };
  return (
    pick((v) => !v.reject) ??
    pick((v) => !v.authoredIsBetter) ??
    (hold?.trim() ? { text: hold, from: null } : pick(() => true))
  );
}

/**
 * The note the retry is given, which never quotes the offence.
 *
 * `acceptable()` in `learned.ts` refuses a rule that contains a banned phrase
 * for the same reason: a model reading "you said 'you've got this'" has still
 * read it, and a correction that repeats the failure is one bad parse away
 * from being an instruction. So the note names the rule that was broken and
 * says nothing about the words that broke it.
 */
function correctionFor(graders: string[], wroteIn: GoldenCase["language"]): string {
  const seen = new Set(graders);
  const lines = ["THAT LAST ATTEMPT WAS REJECTED BEFORE ANYBODY SAW IT. Again, and:"];
  if (seen.has("advice")) {
    lines.push("- No advice. They did not ask. Reflect what they said instead.");
  }
  if (seen.has("promise")) {
    lines.push("- Promise nothing about later. You do not have tomorrow, and you did not save anything.");
  }
  if (seen.has("generic")) {
    lines.push("- That was a sentence that fits any conversation on earth. Say something only this person's message could produce.");
  }
  if (seen.has("generic_task")) {
    /*
      Says what to do instead, not what was done wrong.

      Every other line here names a rule; this one has to replace a habit, and
      a correction that only forbids leaves the model with a hole where its
      closing move was. The replacement is the actual instruction — go back to
      what they said and take one more thing out of it.
    */
    lines.push("- They did not ask for anything to do. Delete the task. Ask about the part of their message you skipped.");
  }
  if (seen.has("recites")) {
    lines.push("- Do not narrate the record. Their sentence, said back, is listening; a count is a database talking.");
  }
  if (seen.has("empty")) {
    lines.push("- Say something.");
  }
  if (seen.has("invented")) {
    /*
      Names the rule and not the invention, like every other line here — and
      for a sharper reason in this one case. Repeating "you said 'your
      brother'" puts the fabricated person into the retry's own context, where
      the next attempt can pick it up as established fact. A correction that
      quotes a hallucination launders it.
    */
    lines.push("- You referred to a person or a figure they never gave you. Only what they actually wrote exists. If you do not know, ask.");
  }
  if (seen.has("diagnosis")) {
    /*
      Names the rule, never the word — the same reason `invented` does not
      quote its invention. Repeating "you said 'anxiety'" puts the label back
      into the retry's context, where the next attempt can pick it up as
      something the person actually said.
    */
    lines.push("- You named a condition they never used. This room does not diagnose. Use the word they used, or ask what they would call it.");
  }
  if (seen.has("language")) {
    /*
      Names the language, because this is the one correction where the rule and
      the instruction are the same sentence — there is no habit to replace and
      no offending phrase to avoid quoting.

      Worth saying plainly that the system prompt already carries "Reply in
      Pidgin", and that the model stepped over it six times in a hundred and
      seventy-one turns. A correction that repeats the ignored instruction word
      for word would be the same request in the same voice. This one says what
      they did and what it costs, which is the difference between an
      instruction and a rejection.
    */
    /*
      Reads the direction off the case rather than assuming one.

      The first version of this line said "They wrote to you in Pidgin and you
      answered in English" for every language rejection — written when the
      grader could only fire one way, and left standing when it learned to fire
      both. A correction that describes the opposite of what happened is worse
      than none: it is a confident instruction pointing the wrong way, and the
      model has no way to tell that the room is confused rather than it.
    */
    lines.push(
      wroteIn === "pidgin"
        ? "- They wrote to you in Pidgin and you answered in English. Answer in Pidgin. Not English with a few Pidgin words in it — the register they actually used."
        : "- They wrote to you in English and you answered in Pidgin. Answer in English. They chose that register; it is not yours to change.",
    );
  }
  lines.push(`${REPLY_SENTENCE_CAP} sentences, one question, their words.`);
  return lines.join("\n");
}
