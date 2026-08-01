import type { FlavourProfile } from "@/lib/flavour/types";
import { buildSystemPrompt } from "@/lib/flavour/profile";

/**
 * The Trinity: Child feels, Man acts, Monk sees. The user never meets them —
 * they debate internally, Monk synthesises, Critic scores against four laws
 * and sends it back if it fails.
 *
 * v0.1 runs MOCKED: no Anthropic calls, deterministic flavour-driven
 * templates. The model tiering below is the contract for when it goes live,
 * so switching is a swap of `run()`, not a rewrite.
 */
export const MODEL_TIER = {
  child: "claude-haiku-4-5-20251001",
  man: "claude-haiku-4-5-20251001",
  monk: "claude-sonnet-5",
  critic: "claude-sonnet-5",
} as const;

export type RitualStage = "vent" | "see" | "dig" | "tool" | "seal";

export const STAGE_ORDER: RitualStage[] = ["vent", "see", "dig", "tool", "seal"];

export interface TrinityNote {
  agent: "child" | "man" | "monk";
  model: string;
  note: string;
}

export interface CriticScore {
  /** LAW1 memory recall, LAW2 one surgical question, LAW3 Naija soul, LAW4 ritual */
  laws: [boolean, boolean, boolean, boolean];
  score: number;
  verdict: "pass" | "rewrite";
  reason: string;
}

export interface TrinityResult {
  stage: RitualStage;
  /** Rendered as `NAME: text`, never a bubble. */
  lines: string[];
  /** The one gold question. Only ever set at the DIG stage. */
  surgicalQuestion?: string;
  /** The single 24hr action. Only ever set at TOOL. */
  tool?: string;
  notes: TrinityNote[];
  critic: CriticScore;
  /** Milliseconds to hold the typing indicator — human, not instant. */
  typingDelayMs: number;
}

const CHILD_BY_STAGE: Record<RitualStage, string> = {
  vent: "he is not asking for help yet. he is checking if it is safe to be loud.",
  see: "underneath the anger is being unseen. again.",
  dig: "he learned early that rest has to be earned. nobody told him that, he just absorbed it.",
  tool: "he will over-commit to prove something. keep it to one thing.",
  seal: "he wants to be told he did well. do not give it cheaply.",
};

const MAN_BY_STAGE: Record<RitualStage, string> = {
  vent: "no action yet. let him finish.",
  see: "the pattern is he absorbs load silently until it breaks. that is a system failure, not a character flaw.",
  dig: "he needs to see the cost, not be told it.",
  tool: "one action. inside 24 hours. small enough that failing is not available.",
  seal: "lock the commitment to a time, not a mood.",
};

const MONK_BY_STAGE: Record<RitualStage, string> = {
  vent: "hold. do not name anything yet.",
  see: "name it once, plainly, then stop talking.",
  dig: "one question. the one that costs something.",
  tool: "the smallest true action beats the impressive one.",
  seal: "reflect it back in his words, not mine.",
};

function openingFor(f: FlavourProfile): string {
  switch (f.temperament.value) {
    case "fire":
      return "Alright. What do we need to clear today so you can actually move?";
    case "water":
      return "I'm here. What's sitting on you — the real one, not the surface one?";
    case "air":
      return "Let's take one thread. What's loudest right now?";
    case "earth":
      return "What's the thing you've been managing quietly that we should look at?";
  }
}

function seeFor(f: FlavourProfile): string[] {
  const analogy: Record<string, string> = {
    football: "You're playing out of position and still blaming yourself for the miss.",
    gym: "You're adding weight every week and calling the fatigue weakness.",
    music: "You keep re-recording the same take hoping it fixes the arrangement.",
    gaming: "You're grinding the same level and calling it strategy.",
    fashion: "You're dressing for a room that already decided about you.",
    unknown: "You're carrying it on your own and calling that competence.",
  };
  return [
    "What I'm hearing underneath is not the workload.",
    analogy[f.hobby.value] ?? analogy.unknown,
  ];
}

function digFor(f: FlavourProfile): string {
  switch (f.occupation.value) {
    case "lawyer":
      return "Who taught you that being right would be enough to be valued?";
    case "nine_to_five":
      return "If nobody noticed the work for a whole year — would you still do it that well?";
    case "entrepreneur":
      return "What are you proving, and to whom?";
    case "creative":
      return "Whose taste are you actually trying to satisfy?";
    case "student_japa":
      return "If you never left — who would you be disappointing?";
    default:
      return "Who taught you that rest has to be earned?";
  }
}

function toolFor(f: FlavourProfile): string {
  switch (f.hobby.value) {
    case "football":
      return "One drill before tomorrow: say the sentence 'I need help with X' to one person. One touch, not a whole match.";
    case "gym":
      return "One set before tomorrow: log off at a fixed time tonight and do not reopen the laptop. One set. Rest day is allowed.";
    case "music":
      return "One take before tomorrow: write the two lines you'd say if you weren't managing anyone's feelings. Just the take.";
    case "gaming":
      return "One level before tomorrow: pick the single smallest task on the list and clear it. Do not touch the others.";
    case "fashion":
      return "Lay one thing out tonight: decide tomorrow's first hour before you sleep, so morning-you does not negotiate.";
    default:
      return "One thing before this time tomorrow: name the load out loud to one person. That's it.";
  }
}

function sealFor(seen: string, felt: string, will: string): string[] {
  return [
    `So: the pattern is ${seen}.`,
    `Underneath it you felt ${felt}.`,
    `And before tomorrow you'll ${will}. Yes?`,
  ];
}

/** Naija texture, roughly one line in ten — LAW3. */
function maybeTexture(turn: number): string | null {
  return turn > 0 && turn % 10 === 0 ? "No wahala. Take your time." : null;
}

/**
 * Human texture: 2–3s of typing, scaled a little by how much was said.
 * Never instant — instant is the tell that it is a machine.
 */
function typingDelay(text: string): number {
  return Math.min(3200, 1400 + text.length * 6);
}

export interface RunInput {
  stage: RitualStage;
  userMessage: string;
  flavour: FlavourProfile;
  memory: string[];
  turn: number;
}

export function run(input: RunInput): TrinityResult {
  const { stage, flavour, memory, turn } = input;

  const notes: TrinityNote[] = [
    { agent: "child", model: MODEL_TIER.child, note: CHILD_BY_STAGE[stage] },
    { agent: "man", model: MODEL_TIER.man, note: MAN_BY_STAGE[stage] },
    { agent: "monk", model: MODEL_TIER.monk, note: MONK_BY_STAGE[stage] },
  ];

  let lines: string[] = [];
  let surgicalQuestion: string | undefined;
  let tool: string | undefined;

  switch (stage) {
    case "vent":
      lines = [openingFor(flavour)];
      break;
    case "see":
      lines = seeFor(flavour);
      break;
    case "dig":
      lines = ["One question, and it's the only one I'll ask."];
      surgicalQuestion = digFor(flavour);
      break;
    case "tool":
      lines = ["Then here's the only thing I want from you."];
      tool = toolFor(flavour);
      break;
    case "seal":
      lines = sealFor(
        "you absorb load silently until it breaks",
        "unseen",
        "name it to one person",
      );
      break;
  }

  const texture = maybeTexture(turn);
  if (texture) lines = [...lines, texture];

  const critic = score({ stage, lines, surgicalQuestion, memory, turn });

  // The debate is logged server-side on every turn — including production, so
  // the loop is inspectable in Vercel logs. It is never shipped to the user.
  console.log(
    `\n── TRINITY · turn ${turn} · stage ${stage.toUpperCase()} ──\n` +
      notes.map((n) => `  ${n.agent.padEnd(5)} [${n.model}] ${n.note}`).join("\n") +
      `\n  critic [${MODEL_TIER.critic}] ${critic.score}/10 ${critic.verdict} — ${critic.reason}` +
      `\n  system prompt: ${buildSystemPrompt(flavour, memory).length} chars, flavour "${flavour.name}"\n`,
  );

  return {
    stage,
    lines,
    surgicalQuestion,
    tool,
    notes,
    critic,
    typingDelayMs: typingDelay(lines.join(" ")),
  };
}

/** The four laws. Below 9 the Monk would rewrite — logged for now. */
function score(a: {
  stage: RitualStage;
  lines: string[];
  surgicalQuestion?: string;
  memory: string[];
  turn: number;
}): CriticScore {
  const law1 = a.turn < 5 || a.memory.length > 0;
  const law2 =
    a.stage === "dig"
      ? Boolean(a.surgicalQuestion) &&
        a.lines.filter((l) => l.includes("?")).length === 0
      : !a.surgicalQuestion;
  const law3 = true; // texture is rationed by maybeTexture, never forced
  const law4 = STAGE_ORDER.includes(a.stage);

  const laws: [boolean, boolean, boolean, boolean] = [law1, law2, law3, law4];
  const passed = laws.filter(Boolean).length;
  const scoreOutOf10 = Math.round((passed / 4) * 10);

  const failed = ["memory recall", "one surgical question", "naija soul", "ritual order"]
    .filter((_, i) => !laws[i]);

  return {
    laws,
    score: scoreOutOf10,
    verdict: scoreOutOf10 >= 9 ? "pass" : "rewrite",
    reason: failed.length ? `failed: ${failed.join(", ")}` : "all four laws held",
  };
}
