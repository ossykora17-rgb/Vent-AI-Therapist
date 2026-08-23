import { gradeReply, worstOf, type Finding as Note, type GoldenCase } from "./quality";
import { acceptable, MAX_RULE_CHARS, type LearnedRule } from "./learned";
import { wasAuthored } from "./tactics";
import { echoesThem } from "./echo";

/**
 * The nightly self-audit, minus the part that costs money.
 *
 * Everything here is pure and free. `scripts/audit.mjs` is the thin shell that
 * reads the store and makes the one model call; this file decides *which*
 * replies are worth a call, and what may come back from it.
 *
 * That split is the whole cost argument. The naive build asks a model to read
 * fifty conversations and say where they were generic — fifty conversations of
 * input, nightly, to rediscover things `gradeReply` already knows for nothing.
 * The graders are deterministic and they run first: advice, promises, reciting
 * context, banned phrases, coverage, length, language mixing. Only what
 * survives them — replies that broke no stated rule and are still flat — is
 * worth asking about, and on a good night that is zero and the job spends
 * nothing at all.
 */

export interface AuditRow {
  id: string;
  user_message: string;
  ai_reply: string | null;
  created_at: string;
  intent_type: string | null;
  /** The column, when the row has one. The audit never re-detects it. */
  language?: string | null;
  tactic_used?: string | null;
  /**
   * Whose turn this was.
   *
   * Optional because a fixture handed to `VENT_AUDIT_ROWS` may not carry it,
   * and the audit must still run on one. Where it exists the invention grader
   * gets evidence; where it does not, that grader skips itself rather than
   * guessing — see `evidenceFor`.
   */
  user_id?: string | null;
  mood_score?: number | null;
  tension_before?: number | null;
  tension_after?: number | null;
}

export interface Finding {
  id: string;
  reply: string;
  /** Every grader label that fired, worst first. */
  problems: string[];
  severity: "fatal" | "major" | "minor";
}

/**
 * Replies that broke a rule the product already states.
 *
 * Free, and the answer most nights. A finding here needs no model to explain
 * it — the grader that fired already names the rule, and the fix is a code
 * change rather than a new instruction.
 */
/**
 * Everything this person had written by the time that reply was sent.
 *
 * The evidence the `invented` grader checks a reply against, and the audit was
 * running without it — so the one **fatal** grader in `quality.ts` never fired
 * in the nightly job, and the report printed "broke a rule: 0" while being
 * structurally unable to see a fabricated brother. A green light over a road
 * the probe does not take, which is the oldest entry in CLAUDE.md's list and
 * the third time it has been this file's turn.
 *
 * Two scopes, and both are load-bearing.
 *
 * **Same person.** A brother mentioned by somebody else must not excuse an
 * invention here, or the grader launders every hallucination through the
 * busiest user in the corpus.
 *
 * **Up to that moment.** A reply can only legitimately name what had already
 * been said. "The room said 'your brother' on Monday and they first mentioned
 * a brother on Friday" is still an invention on Monday, and a corpus read
 * whole would forgive it.
 *
 * Returns undefined rather than an empty string when the row carries no
 * `user_id`: empty is falsy and would read as "no evidence", which is the same
 * outcome by accident rather than on purpose, and the check that swept the
 * authored corpus already made that mistake once.
 */
function evidenceFor(r: AuditRow, corpus: readonly AuditRow[]): string | undefined {
  if (!r.user_id) return undefined;
  const said = corpus
    .filter((x) => x.user_id === r.user_id && x.created_at <= r.created_at)
    .map((x) => x.user_message);
  return said.length > 0 ? said.join("\n") : undefined;
}

/**
 * @param corpus every stored row, not only the graded slice — the evidence for
 * a reply is the whole conversation behind it, and the audit grades the last
 * fifty turns out of however many exist.
 */
export function knownProblems(
  rows: AuditRow[],
  grade = gradeReply,
  corpus: readonly AuditRow[] = rows,
): Finding[] {
  const out: Finding[] = [];
  for (const r of rows) {
    if (!r.ai_reply || r.intent_type !== "vent") continue;
    if (wasAuthored(r.ai_reply)) continue;
    /*
      A stored row rebuilt into the shape the grader already speaks, rather
      than a second grader that reads rows. The suite's oldest rule: anything
      asserted must come from the module the product uses, or the copy passes
      while the original regresses.
    */
    const asCase: GoldenCase = {
      id: r.id,
      message: r.user_message,
      // The column when the row has one; the markers only when it does not.
      language: (r.language ?? "").startsWith("pid") || (!r.language && PIDGIN.test(r.user_message))
        ? "pidgin"
        : "en",
      intent: "vent",
      probes: "nightly audit",
    };
    const notes: Note[] = grade(asCase, r.ai_reply, {
      tokensSpent: true,
      said: evidenceFor(r, corpus),
    });
    const worst = worstOf(notes);
    if (worst === "skipped" || worst === null) continue;
    out.push({
      id: r.id,
      reply: r.ai_reply,
      problems: notes.filter((n) => n.severity !== "skipped").map((n) => n.detail),
      severity: worst,
    });
  }
  return out;
}

/** Markers, not a language detector — the same set the grader uses. */
const PIDGIN = /\b(dey|na|abeg|wetin|don|sabi|wahala|oga|make i|e go)\b/i;


/**
 * Replies that broke nothing and still went nowhere.
 *
 * This is the set worth a model call, and the definition is deliberately
 * cheap and mechanical rather than clever: a reply that asked nothing, or one
 * that a person rated low after a sitting that started high. Both are things
 * a grader cannot see — "flat" is not a rule violation, it is an absence — and
 * both are countable without reading a word.
 *
 * Sorted worst-first and capped by the caller, because the point is to spend
 * one call on the ten worst nights rather than fifty calls on everything.
 */
export function flatReplies(rows: AuditRow[], limit = 10): AuditRow[] {
  const scored = rows
    .filter((r) => r.ai_reply && r.intent_type === "vent" && !wasAuthored(r.ai_reply))
    .map((r) => {
      const reply = r.ai_reply ?? "";
      let weight = 0;
      // The office contract asks for exactly one question. None is a reply
      // that stopped the conversation it was supposed to continue.
      if (!reply.includes("?")) weight += 2;
      // Their own words, absent. The cheapest possible proxy for "generic":
      // a reply that shares no uncommon word with what it is answering.
      if (!echoesThem(r.user_message, reply)) weight += 2;
      // They said it did not help, and they had said it was bad going in.
      if (r.mood_score !== null && r.mood_score !== undefined && r.mood_score <= 3) weight += 2;
      if (
        r.tension_before != null &&
        r.tension_after != null &&
        r.tension_after >= r.tension_before
      ) {
        weight += 3;
      }
      return { row: r, weight };
    })
    .filter((s) => s.weight >= 3)
    .sort((a, b) => b.weight - a.weight);

  return scored.slice(0, limit).map((s) => s.row);
}

/**
 * Read the audit's answer, and refuse most of it.
 *
 * Same shape and the same reason as `parseTechnique` in `research.ts`: what
 * comes back from a model on a schedule with nobody watching is a proposal,
 * not a decision. Every rejection here is a rule that would otherwise have
 * been in front of somebody at 2am tonight.
 */
export function parseProposals(text: string, today: string): {
  accepted: LearnedRule[];
  rejected: Array<{ rule: string; why: string }>;
} {
  const accepted: LearnedRule[] = [];
  const rejected: Array<{ rule: string; why: string }> = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
  } catch {
    return { accepted, rejected: [{ rule: text.slice(0, 60), why: "not JSON" }] };
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const { rule, found } = raw as { rule?: unknown; found?: unknown };
    if (typeof rule !== "string") {
      rejected.push({ rule: String(rule).slice(0, 60), why: "no rule text" });
      continue;
    }
    const why = acceptable(rule);
    if (why) {
      rejected.push({ rule: rule.slice(0, MAX_RULE_CHARS), why });
      continue;
    }
    /*
      Evidence is required, and this is not bureaucracy. A rule with no reply
      behind it is a rule the model reasoned its way to rather than observed,
      which is exactly the failure mode of asking a model what it did wrong.
    */
    if (typeof found !== "string" || found.trim().length < 8) {
      rejected.push({ rule: rule.slice(0, MAX_RULE_CHARS), why: "no evidence" });
      continue;
    }
    accepted.push({
      id: slug(rule),
      rule: rule.trim(),
      found: found.trim().slice(0, 160),
      added: today,
    });
  }
  return { accepted, rejected };
}

function slug(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** What the model is asked, once, about the replies the graders could not judge. */
export function auditPrompt(samples: Array<{ said: string; reply: string }>): string {
  return [
    "These are replies a therapy chatbot gave. Every one of them broke no",
    "stated rule and still went nowhere: no question asked, none of the",
    "person's own words used, or the person rated the session worse than they",
    "arrived.",
    "",
    "Find at most two patterns across them. For each, write ONE rule that",
    `would have prevented it, under ${MAX_RULE_CHARS} characters, in the`,
    "imperative.",
    "",
    "Return JSON only:",
    '[{"rule": "<the instruction>", "found": "<the phrase in these replies',
    'that shows it>"}]',
    "",
    "A rule must be checkable by reading a reply. Not 'be more empathetic',",
    "not 'try to connect' — those cannot be graded and they displace a rule",
    "that could. Never quote a phrase you are banning inside the rule itself.",
    "If these replies share no pattern, return [].",
    "",
    ...samples.map((s, i) => `--- ${i + 1}\nThey said: ${s.said}\nIt replied: ${s.reply}`),
  ].join("\n");
}
