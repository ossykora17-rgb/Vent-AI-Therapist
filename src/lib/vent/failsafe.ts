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
 * Coverage, length and language mixing are deliberately *not* grounds for a
 * retry. They are real findings and they belong in the nightly audit, but a
 * reply one sentence over the cap is worth a note and not a second billed
 * call — and the two office-contract graders that would have joined this list
 * did not survive their own corpus, which is written up in `quality.ts`.
 *
 * WHAT IT COSTS
 *
 * Nothing on a good reply. One extra call on a bad one, once, and then the
 * tactic's authored line — which passes by construction, because check 76
 * fails the build if anything we wrote contains a banned phrase.
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
const REJECT = new Set(["advice", "promise", "generic", "generic_task", "invented", "recites", "empty"]);

export interface Verdict {
  /** Null when the reply may be sent. */
  reject: string | null;
  /** What to append to the system prompt for the one retry. */
  correction: string | null;
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
  if (wasAuthored(reply)) return { reject: null, correction: null };

  const findings = gradeReply(c, reply, { tokensSpent: true, said });
  const bad = findings.filter((f) => REJECT.has(f.grader));
  if (bad.length === 0) return { reject: null, correction: null };

  return {
    reject: bad.map((f) => `${f.grader}: ${f.detail}`).join(" · "),
    correction: correctionFor(bad.map((f) => f.grader)),
  };
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
function correctionFor(graders: string[]): string {
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
  lines.push(`${REPLY_SENTENCE_CAP} sentences, one question, their words.`);
  return lines.join("\n");
}
