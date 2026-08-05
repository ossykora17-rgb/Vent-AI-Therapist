import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getStore, type Store, type VentRow } from "@/lib/store";
import { env, isAnthropicConfigured } from "@/lib/env";
import { answerFactual, groundNow } from "@/lib/vent/grounding";
import { classify, CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { selectTactic, type TacticContext } from "@/lib/vent/tactics";
import { buildSystemPrompt, localReply, type MemoryRow } from "@/lib/vent/prompt";
import { MEMORY_TURNS, memoryFetchSize, selectMemory } from "@/lib/vent/memory";
import { noModelKeyReply } from "@/lib/vent/fallback";
import {
  MAX_TOKENS,
  VENT_MODEL,
  classifyModelError,
  modelFailureReply,
} from "@/lib/vent/model";
import { buildFlavour } from "@/lib/flavour/profile";
import { withStore } from "@/lib/http/with-store";

export const dynamic = "force-dynamic";
// A model call is the one slow thing here. The platform default can be short
// enough to kill it mid-answer, which surfaces as a network fault and sends
// everyone looking at their wifi.
export const maxDuration = 60;

// Depth costs money, so only a real vent reaches it. VENT_MODEL and the
// failure vocabulary live in @/lib/vent/model so /api/health probes the model
// the product actually calls, rather than a second copy of the name.

const RATE_PER_MINUTE = 10;
const RATE_PER_DAY = 100;
const HISTORY_LIMIT = 100;

const bodySchema = z.object({
  anonId: z.string().min(8).max(64),
  message: z.string().trim().min(1).max(4000),
  chairPicked: z.enum(["tight_edge", "sunk", "half_off"]).nullish(),
  bodyTapped: z.enum(["head", "throat", "chest"]).nullish(),
  pressure: z.number().min(0).max(100).nullish(),
  duality: z.number().min(0).max(100).nullish(),
  mood: z.number().int().min(1).max(10).nullish(),
});

type Input = z.infer<typeof bodySchema>;

async function handlePOST(request: Request) {
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
  const store = getStore();

  // ── 1. CRISIS. Checked before anything else, never sent to a model. ──────
  if (classification.intent === "crisis") {
    let saved = false;
    if (store) {
      // A store that throws must never cost somebody in crisis their reply.
      // The lines are local constants and this path spends nothing, so the
      // only thing a database failure can take away here is the record.
      try {
        const userId = await store.ensureUser(input.anonId, {
          chairPicked: input.chairPicked ?? undefined,
        });
        if (userId) {
          saved = await tryPersist(
            store, userId, input, classification, CRISIS_RESPONSE, null, grounding.iso, true,
          );
        }
      } catch (error) {
        console.error("[vent] store unreachable on the crisis path", error);
      }
    }
    return NextResponse.json(
      {
        intent: "crisis",
        reply: CRISIS_RESPONSE,
        crisis: { ...CRISIS_LINES, gated: true },
        // What happened, not what was configured. A store that exists and
        // then throws had reported `true` here.
        persisted: saved,
        storage: store?.kind ?? "none",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // ── 2. Identify + rate limit. ───────────────────────────────────────────
  let userId: string | null = null;
  let history: MemoryRow[] = [];
  let recentTactics: string[] = [];

  if (store) {
    // Configured is not the same as reachable, and the store now says which
    // by throwing StoreUnavailableError rather than returning an empty array.
    // A vent is the one surface that should not 503 on that: the reply is
    // worth more than the record. Degrade to the no-store shape instead —
    // the session still works, and because userId stays null the reply tells
    // them nothing is being saved, which by then is true.
    //
    // The circles routes make the opposite choice, and both are right: there
    // is no circle without its transcript, but there is still a person here.
    try {
      userId = await store.ensureUser(input.anonId, {
        chairPicked: input.chairPicked ?? undefined,
      });

      if (userId) {
        const now = Date.now();
        const [inMinute, inDay] = await Promise.all([
          store.countVentsSince(userId, new Date(now - 60_000)),
          store.countVentsSince(userId, new Date(now - 86_400_000)),
        ]);

        if (inMinute >= RATE_PER_MINUTE || inDay >= RATE_PER_DAY) {
          return NextResponse.json(
            { error: "rate_limited", reply: "Small small — breathe. Try again in a minute." },
            { status: 429, headers: { "cache-control": "no-store" } },
          );
        }

        // Asking the date is not a vent — `selectMemory` is where that rule
        // lives, so the eval suite measures the real filter and not a copy.
        const recent = await store.recentVents(userId, memoryFetchSize(MEMORY_TURNS));
        const rows = selectMemory(recent, MEMORY_TURNS);

        history = rows as unknown as MemoryRow[];
        recentTactics = rows
          .map((r) => r.tactic_used)
          .filter((t): t is string => Boolean(t));
      }
    } catch (error) {
      console.error("[vent] store unreachable — continuing without it", error);
      userId = null;
      history = [];
      recentTactics = [];
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
    const saved =
      store && userId
        ? await tryPersist(store, userId, input, classification, local, null, grounding.iso)
        : false;
    return NextResponse.json(
      {
        intent: classification.intent,
        reply: local,
        tactic: null,
        realWorldTag: classification.realWorldTag,
        grounding: { date: grounding.date, time: grounding.time },
        tokensSpent: false,
        persisted: saved,
        storage: store?.kind ?? "none",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // ── 4. A real vent. The only path that spends tokens. ───────────────────
  const tactic = selectTactic(ctx);

  // Flavour is read from everything they have said here — pure local
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
    // No key yet: still move the session forward rather than 500ing. The
    // selected tactic already exists — selecting one costs nothing — so when
    // it carries an authored room phrasing, that is a real move to offer
    // instead of a shrug. What it may claim about saving depends on whether
    // this deployment can. See noModelKeyReply.
    reply = noModelKeyReply(Boolean(store && userId), tactic.hold);
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
      // Every model failure used to read "Network dipped on my side", which
      // names one cause out of four and invites a retry that a rejected key
      // or a wrong model id can never satisfy. The status is on the response
      // so /api/health is not the only place the truth exists.
      const verdict = classifyModelError(error);
      console.error("[vent] model call failed", verdict.status, verdict.detail);
      const failure = modelFailureReply(verdict.status);

      // Their words are kept even when the answer cannot be. This path
      // returned before it wrote, so a model outage silently dropped
      // everything anyone said during it — the storage looked broken because
      // the model was, and the two symptoms had one cause.
      const held =
        store && userId
          ? await tryPersist(store, userId, input, classification, failure, tactic.id, grounding.iso)
          : false;

      return NextResponse.json(
        {
          error: "model_unavailable",
          reason: verdict.status,
          detail: verdict.detail,
          persisted: held,
          reply: failure,
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  }

  const saved =
    store && userId
      ? await tryPersist(store, userId, input, classification, reply, tactic.id, grounding.iso)
      : false;

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
      persisted: saved,
      storage: store?.kind ?? "none",
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** History for the History tab. Scoped server-side by anon_id. */
async function handleGET(request: Request) {
  const anonId = new URL(request.url).searchParams.get("anonId");
  if (!anonId || anonId.length < 8) {
    return NextResponse.json({ error: "Invalid anonId" }, { status: 422 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ vents: [], persisted: false, storage: "none" });

  const userId = await store.findUserId(anonId);
  if (!userId) {
    return NextResponse.json({ vents: [], persisted: true, storage: store.kind });
  }

  return NextResponse.json(
    {
      vents: await store.listVents(userId, HISTORY_LIMIT),
      persisted: true,
      storage: store.kind,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * Deletes one vent, or everything for this anon_id. "Delete anytime" has to
 * be a button, not a promise on a privacy page.
 */
async function handleDELETE(request: Request) {
  const url = new URL(request.url);
  const anonId = url.searchParams.get("anonId");
  const ventId = url.searchParams.get("id");

  if (!anonId || anonId.length < 8) {
    return NextResponse.json({ error: "Invalid anonId" }, { status: 422 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ deleted: 0, persisted: false, storage: "none" });

  const userId = await store.findUserId(anonId);
  if (!userId) return NextResponse.json({ deleted: 0, persisted: true, storage: store.kind });

  if (ventId) await store.deleteVent(userId, ventId);
  else await store.deleteAll(userId);

  return NextResponse.json(
    { deleted: ventId ? 1 : "all", persisted: true, storage: store.kind },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * A write that failed is a write that did not happen.
 *
 * Every caller reports `persisted` from what this returns rather than from
 * whether a store was configured, so a database that accepts a connection and
 * then rejects the insert cannot make the response claim otherwise. It also
 * means a store failing mid-request costs the record and not the reply.
 */
async function tryPersist(...args: Parameters<typeof persist>): Promise<boolean> {
  try {
    await persist(...args);
    return true;
  } catch (error) {
    console.error("[vent] store write failed", error);
    return false;
  }
}

async function persist(
  store: Store,
  userId: string,
  input: Input,
  classification: ReturnType<typeof classify>,
  reply: string,
  tacticId: string | null,
  isoDate: string,
  safetyFlagged = false,
) {
  await store.insertVent({
    user_id: userId,
    user_message: input.message,
    ai_reply: reply,
    mood_score: input.mood ?? null,
    tension_before: input.pressure != null ? Math.round(input.pressure) : null,
    tension_after: null,
    language: classification.language,
    duality_value: input.duality ?? null,
    body_tapped: input.bodyTapped ?? classification.body,
    chair_picked: input.chairPicked ?? null,
    pressure_value: input.pressure ?? null,
    tactic_used: tacticId,
    intent_type: classification.intent,
    real_world_tag: classification.realWorldTag,
    real_date_used: isoDate,
    safety_flagged: safetyFlagged,
  } satisfies Parameters<Store["insertVent"]>[0] as Parameters<Store["insertVent"]>[0]);
}

// The `id` and `created_at` columns are generated by whichever store answers.
export type { VentRow };

// A store that stops answering is a 503 here, not a 404 and not a 500.
export const POST = withStore(handlePOST);
export const GET = withStore(handleGET);
export const DELETE = withStore(handleDELETE);
