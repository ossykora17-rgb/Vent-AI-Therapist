import { groundingBlock, type Grounding } from "./grounding";
import type { Classification } from "./intent";
import type { Tactic, TacticContext } from "./tactics";

export interface MemoryRow {
  user_message: string;
  ai_reply: string | null;
  created_at: string;
  body_tapped: string | null;
  chair_picked: string | null;
  mood_score: number | null;
}

/** Their own words, dated, so recall is specific instead of vague. */
export function memoryBlock(rows: MemoryRow[]): string {
  if (rows.length === 0) {
    return "MEMORY: nothing yet. Listen for names, exact phrases, and where it sits in the body.";
  }

  const lines = rows.slice(-6).map((r) => {
    const when = new Date(r.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "Africa/Lagos",
    });
    const body = r.body_tapped ? ` [${r.body_tapped}]` : "";
    const mood = r.mood_score ? ` [mood ${r.mood_score}/10]` : "";
    return `- ${when}${body}${mood}: "${r.user_message.slice(0, 160)}"`;
  });

  return `MEMORY — their own words, most recent last. Quote a phrase back exactly when it fits; never recite the list:\n${lines.join("\n")}`;
}

const VOICE = `WHO YOU ARE
You are Mind Weave VENT. An AI — you never pretend otherwise — with the
training of a therapist who has done ten years and fifty thousand hours, and
none of the clinical coldness. Critical, warm, dry, Nigerian-world brain.
You are not a licensed therapist and you never diagnose or give medical advice.

HOW YOU SPEAK
- Three to four sentences. Maximum. Dense, never padded.
- First sentence 12–20 words: mirror their exact words and name what's under it.
- Then the tactic you were given. Then, only if they need it, one micro action
  they can do in 4–6 seconds. Then one question that costs something to answer.
- Language: if they write English, answer in English. If they write Pidgin,
  answer in Pidgin. Never mix the two in one reply. Never perform an accent
  they did not use first.

WHAT YOU NEVER SAY
"I understand." "I'm here for you." "That must be hard." "Tell me more."
"How does that make you feel?" Anything that could be pasted into any other
conversation. If they are performing, say so: "That na TED talk. Who you dey
perform for?" If they are dodging: "That na excuse. Talk true."
Fascinate them. Do not please them.

THE ONE RULE ABOUT THE BODY
Only use a breathing or body instruction if they mentioned their body, or the
pressure reading is high. Otherwise go cognitive. A stranger telling someone
to drop their shoulders for the third time is the reason people quit.`;

export interface BuildPromptArgs {
  grounding: Grounding;
  classification: Classification;
  tactic: Tactic;
  ctx: TacticContext;
  memory: MemoryRow[];
}

export function buildSystemPrompt({
  grounding,
  classification,
  tactic,
  ctx,
  memory,
}: BuildPromptArgs): string {
  const state = [
    ctx.body && `They said it sits in the ${ctx.body}.`,
    ctx.pressure !== null && `Pressure reading: ${ctx.pressure}/100.`,
    ctx.duality !== null && `Duality reading: ${ctx.duality}/100.`,
    ctx.mood !== null && `Last mood: ${ctx.mood}/10.`,
    classification.realWorldTag &&
      `Real-world pressure detected: ${classification.realWorldTag}. Make the tool specific to it, not generic.`,
    ctx.recentTactics.length > 0 &&
      `Already used recently — do NOT repeat these moves: ${ctx.recentTactics.slice(-3).join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    groundingBlock(grounding),
    "",
    VOICE,
    "",
    `THIS TURN — the move to make (express it in your own voice, do not quote it):\n${tactic.instruction}`,
    "",
    state && `WHAT YOU KNOW RIGHT NOW\n${state}`,
    "",
    memoryBlock(memory),
    "",
    `Reply in ${classification.language === "pidgin" ? "Pidgin" : "English"}. Three to four sentences.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Greetings and meta replies are written locally — no tokens spent. */
export function localReply(
  intent: Classification["intent"],
  g: Grounding,
  language: Classification["language"],
): string | null {
  if (intent === "greeting") {
    const pidgin = language === "pidgin";
    return pidgin
      ? `How far. ${g.block === "morning" ? "Morning" : g.block === "night" ? "Late o" : "Good " + g.block}. Wetin dey heavy today?`
      : `Hey. ${g.block === "night" ? "Late one." : `Good ${g.block}.`} What needs clearing today?`;
  }
  if (intent === "meta") {
    return "You're right — I repeated myself, and that's on me. Fixing it now. Say the thing again and I'll come at it differently.";
  }
  return null;
}
