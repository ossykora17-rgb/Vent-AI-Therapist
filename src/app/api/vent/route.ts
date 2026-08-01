import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, isAnthropicConfigured } from "@/lib/env";
import { answerFactual, groundNow } from "@/lib/vent/grounding";
import { classify, CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { selectTactic, type TacticContext } from "@/lib/vent/tactics";
import { buildSystemPrompt, localReply, type MemoryRow } from "@/lib/vent/prompt";
import { buildFlavour } from "@/lib/flavour/profile";

export const dynamic = "force-dynamic";

/** Depth costs money, so only a real vent reaches it. */
const VENT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 220;

const RATE_PER_MINUTE = 10;
const RATE_PER_DAY = 100;

const bodySchema = z.object({
  anonId: z.string().min(8).max(64),
  message: z.string().trim().min(1).max(4000),
  chairPicked: z.enum(["tight_edge", "sunk", "half_off"]).nullish(),
  bodyTapped: z.enum(["head", "throat", "chest"]).nullish(),
  pressure: z.number().min(0).max(100).nullish(),
  duality: z.number().min(0).max(100).nullish(),
  mood: z.number().int().min(1).max(10).nullish(),
});

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
  const input = parsed.data;

  const grounding = groundNow();
  const classification = classify(input.message);
  const supabase = createAdminClient();

  // ── 1. CRISIS. Checked before anything else, never sent to a model. ──────
  if (classification.intent === "crisis") {
    if (supabase) {
      const userId = await ensureUser(supabase, input.anonId, input.chairPicked);
      if (userId) {
        await supabase.from("vents").insert({
          user_id: userId,
          user_message: input.message,
          ai_reply: CRISIS_RESPONSE,
          intent_type: "crisis",
          safety_flagged: true,
          language: classification.language,
          real_date_used: grounding.iso,
        });
      }
    }
    return NextResponse.json(
      {
        intent: "crisis",
        reply: CRISIS_RESPONSE,
        crisis: { ...CRISIS_LINES, gated: true },
        persisted: Boolean(supabase),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // ── 2. Identify + rate limit. ───────────────────────────────────────────
  let userId: string | null = null;
  let history: MemoryRow[] = [];
  let recentTactics: string[] = [];

  if (supabase) {
    userId = await ensureUser(supabase, input.anonId, input.chairPicked);

    if (userId) {
      const limited = await isRateLimited(supabase, userId);
      if (limited) {
        return NextResponse.json(
          { error: "rate_limited", reply: "Small small — breathe. Try again in a minute." },
          { status: 429, headers: { "cache-control": "no-store" } },
        );
      }

      // One round trip covers both memory and the tactic no-repeat window.
      const { data } = await supabase
        .from("vents")
        .select(
          "user_message, ai_reply, created_at, body_tapped, chair_picked, mood_score, tactic_used",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6);

      const rows = (data ?? []).reverse();
      history = rows as MemoryRow[];
      recentTactics = rows
        .map((r) => (r as { tactic_used: string | null }).tactic_used)
        .filter((t): t is string => Boolean(t));
    }
  }

  const ctx: TacticContext = {
    ...classification,
    message: input.message,
    pressure: input.pressure ?? null,
    duality: input.duality ?? null,
    mood: input.mood ?? null,
    ventCount: history.length,
    recentTactics,
  };

  // ── 3. Free paths. No model call — this is the credit policy in code. ───
  const factual =
    classification.intent === "factual"
      ? answerFactual(input.message, grounding)
      : null;
  const local =
    factual ?? localReply(classification.intent, grounding, classification.language);

  if (local) {
    await persist(supabase, userId, input, classification, local, null, grounding.iso);
    return NextResponse.json(
      {
        intent: classification.intent,
        reply: local,
        tactic: null,
        realWorldTag: classification.realWorldTag,
        grounding: { date: grounding.date, time: grounding.time },
        tokensSpent: false,
        persisted: Boolean(userId),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // ── 4. A real vent. The only path that spends tokens. ───────────────────
  const tactic = selectTactic(ctx);

  // Flavour is read from everything they have ever said here — pure local
  // heuristics, so personalising the delivery costs nothing.
  const flavour = buildFlavour([
    ...history.map((h) => h.user_message),
    input.message,
  ]);

  const systemPrompt = buildSystemPrompt({
    grounding,
    classification,
    tactic,
    ctx,
    memory: history,
    flavour,
  });

  let reply: string;
  let tokensSpent = false;

  if (!isAnthropicConfigured) {
    // No key yet: still move the session forward rather than 500ing.
    reply =
      "I'm running without my model key right now, so I can't go deep on that yet — but I've saved it, word for word. Say the next part.";
  } else {
    try {
      const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
      const completion = await anthropic.messages.create({
        model: VENT_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          ...history.flatMap((h) =>
            h.ai_reply
              ? [
                  { role: "user" as const, content: h.user_message },
                  { role: "assistant" as const, content: h.ai_reply },
                ]
              : [],
          ),
          { role: "user", content: input.message },
        ],
      });

      reply = completion.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      tokensSpent = true;
    } catch (error) {
      console.error("[vent] model call failed", error);
      return NextResponse.json(
        { error: "model_unavailable", reply: "Network dipped on my side. Say that again." },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  }

  await persist(supabase, userId, input, classification, reply, tactic.id, grounding.iso);

  return NextResponse.json(
    {
      intent: "vent" as const,
      reply,
      tactic: tactic.id,
      tacticFamily: tactic.family,
      realWorldTag: classification.realWorldTag,
      language: classification.language,
      grounding: { date: grounding.date, time: grounding.time },
      flavour: {
        name: flavour.name,
        temperament: flavour.temperament.value,
        occupation: flavour.occupation.value,
        hobby: flavour.hobby.value,
      },
      memoryUsed: history.length,
      tokensSpent,
      persisted: Boolean(userId),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** History for the History tab. Scoped server-side by anon_id. */
export async function GET(request: Request) {
  const anonId = new URL(request.url).searchParams.get("anonId");
  if (!anonId || anonId.length < 8) {
    return NextResponse.json({ error: "Invalid anonId" }, { status: 422 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ vents: [], persisted: false });

  const { data: user } = await supabase
    .from("vent_users")
    .select("id")
    .eq("anon_id", anonId)
    .maybeSingle();

  if (!user) return NextResponse.json({ vents: [], persisted: true });

  const { data } = await supabase
    .from("vents")
    // Everything the user gave us comes back out — export is real ownership,
    // not a summary of what we felt like sharing.
    .select(
      "id, user_message, ai_reply, mood_score, tension_before, tension_after, language, duality_value, pressure_value, chair_picked, tactic_used, intent_type, real_world_tag, real_date_used, body_tapped, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json(
    { vents: data ?? [], persisted: true },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * Deletes one vent, or everything for this anon_id. "Delete anytime" has to
 * be a button, not a promise on a privacy page.
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const anonId = url.searchParams.get("anonId");
  const ventId = url.searchParams.get("id");

  if (!anonId || anonId.length < 8) {
    return NextResponse.json({ error: "Invalid anonId" }, { status: 422 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ deleted: 0, persisted: false });

  const { data: user } = await supabase
    .from("vent_users")
    .select("id")
    .eq("anon_id", anonId)
    .maybeSingle();

  if (!user) return NextResponse.json({ deleted: 0, persisted: true });

  // Always scoped by user_id, so an id from another user deletes nothing.
  const query = supabase.from("vents").delete().eq("user_id", user.id);
  const { error } = ventId ? await query.eq("id", ventId) : await query;

  if (error) {
    console.error("[vent] delete failed", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  // Clearing everything means clearing the person too.
  if (!ventId) await supabase.from("vent_users").delete().eq("id", user.id);

  return NextResponse.json(
    { deleted: ventId ? 1 : "all", persisted: true },
    { headers: { "cache-control": "no-store" } },
  );
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function ensureUser(
  supabase: Admin,
  anonId: string,
  chairPicked: string | null | undefined,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("vent_users")
    .upsert(
      {
        anon_id: anonId,
        ...(chairPicked ? { chair_picked: chairPicked } : {}),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "anon_id" },
    )
    .select("id")
    .single();

  if (error) {
    console.error("[vent] ensureUser failed", error);
    return null;
  }
  return data.id;
}

async function isRateLimited(supabase: Admin, userId: string): Promise<boolean> {
  const now = Date.now();
  const [minute, day] = await Promise.all([
    supabase.rpc("vent_rate_count", {
      p_user_id: userId,
      p_since: new Date(now - 60_000).toISOString(),
    }),
    supabase.rpc("vent_rate_count", {
      p_user_id: userId,
      p_since: new Date(now - 86_400_000).toISOString(),
    }),
  ]);

  return (minute.data ?? 0) >= RATE_PER_MINUTE || (day.data ?? 0) >= RATE_PER_DAY;
}

async function persist(
  supabase: Admin | null,
  userId: string | null,
  input: z.infer<typeof bodySchema>,
  classification: ReturnType<typeof classify>,
  reply: string,
  tacticId: string | null,
  isoDate: string,
) {
  if (!supabase || !userId) return;

  const { error } = await supabase.from("vents").insert({
    user_id: userId,
    user_message: input.message,
    ai_reply: reply,
    mood_score: input.mood ?? null,
    tension_before: input.pressure != null ? Math.round(input.pressure) : null,
    language: classification.language,
    duality_value: input.duality ?? null,
    body_tapped: input.bodyTapped ?? classification.body,
    chair_picked: input.chairPicked ?? null,
    pressure_value: input.pressure ?? null,
    tactic_used: tacticId,
    intent_type: classification.intent,
    real_world_tag: classification.realWorldTag,
    real_date_used: isoDate,
  });

  if (error) console.error("[vent] persist failed", error);
}
