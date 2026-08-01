import { NextResponse } from "next/server";
import { z } from "zod";
import { buildFlavour } from "@/lib/flavour/profile";
import { run, STAGE_ORDER, type RitualStage } from "@/lib/trinity";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userMessages: z.array(z.string().min(1).max(4000)).min(1).max(60),
  stage: z.enum(["vent", "see", "dig", "tool", "seal"]),
});

/**
 * Memory extraction runs every 5 turns — vibe and trigger, not just facts.
 * "You felt small after the partner meeting" beats "user is a lawyer".
 */
const TRIGGER_PATTERNS: Array<[RegExp, string]> = [
  [/partner|boss|manager|oga|lecturer/i, "authority figure"],
  [/meeting|standup|review|appraisal|court/i, "being assessed"],
  [/money|salary|rent|broke|owe/i, "money pressure"],
  [/family|mum|mom|dad|home|village/i, "family expectation"],
  [/alone|nobody|myself|by myself/i, "carrying it alone"],
  [/tired|exhausted|drained|burnt/i, "running on empty"],
];

const VIBE_PATTERNS: Array<[RegExp, string]> = [
  [/small|invisible|unseen|dismissed/i, "felt small"],
  [/angry|pissed|vex|furious|mad/i, "was angry and had nowhere to put it"],
  [/scared|afraid|anxious|panic/i, "was scared and calling it stress"],
  [/numb|blank|flat|nothing/i, "went numb"],
  [/guilty|ashamed|stupid|failure/i, "turned it on themselves"],
];

/**
 * Fires from turn 3. The ritual is only five stages, so a turn-5 threshold
 * would mean the pill never appears inside a single session — recall has to
 * be visible the first day, not just on the return visit.
 */
function extractMemory(userMessages: string[]): string[] {
  if (userMessages.length < 3) return [];

  const text = userMessages.join(" ");
  const memory: string[] = [];

  const vibe = VIBE_PATTERNS.find(([re]) => re.test(text));
  const trigger = TRIGGER_PATTERNS.find(([re]) => re.test(text));

  if (vibe && trigger) {
    memory.push(`They ${vibe[1]} around ${trigger[1]}.`);
  } else if (vibe) {
    memory.push(`They ${vibe[1]}.`);
  } else if (trigger) {
    memory.push(`${trigger[1]} keeps coming up.`);
  }

  // A name, if they gave one — never asked for, only caught.
  const name = text.match(/\b(?:i'?m|i am|call me|my name is)\s+([A-Z][a-z]{2,15})\b/);
  if (name) memory.push(`Their name is ${name[1]}.`);

  return memory;
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  const { userMessages, stage } = parsed.data;

  // Flavour is recomputed every turn from the first three messages onward —
  // pure local heuristics, so this costs nothing.
  const flavour = buildFlavour(userMessages.slice(0, Math.max(3, userMessages.length)));
  const memory = extractMemory(userMessages);

  const result = run({
    stage,
    userMessage: userMessages[userMessages.length - 1],
    flavour,
    memory,
    turn: userMessages.length,
  });

  const nextStage: RitualStage | null =
    STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1] ?? null;

  return NextResponse.json(
    { ...result, flavour, memory, nextStage },
    { headers: { "cache-control": "no-store" } },
  );
}
