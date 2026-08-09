import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore, type Store, type VentRow } from "@/lib/store";
import { isModelConfigured } from "@/lib/env";
import { answerFactual, groundNow } from "@/lib/vent/grounding";
import { classify, CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { CARRY_WORDS, OBJECT_IDS } from "@/lib/vent/chairs";
import { selectTactic, type TacticContext } from "@/lib/vent/tactics";
import { getEfficacy } from "@/lib/vent/efficacy";
import { findPattern, type Pattern } from "@/lib/vent/pattern";
import { coverage, COVERAGE_FLOOR } from "@/lib/vent/scan";
import { buildSystemPrompt, localReply, type MemoryRow } from "@/lib/vent/prompt";
import { MEMORY_TURNS, memoryFetchSize, selectMemory } from "@/lib/vent/memory";
import { noModelKeyReply } from "@/lib/vent/fallback";
import { MAX_TOKENS, classifyModelError, modelFailureReply } from "@/lib/vent/model";
import { generateReply } from "@/lib/vent/providers";
import { depthFor, depthBadge } from "@/lib/vent/depth";
import { circleInvite, soundsAlone } from "@/lib/community/invite";
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
  /*
    What onboarding collected, for the session it was collected in.

    Enums, not strings. This is the only field on this route whose contents
    reach a system prompt as prose rather than as a number or a tag, so the
    wire carries an id and `@/lib/vent/chairs` owns the phrasing. A free-text
    field here would be a client writing directly into the model's
    instructions.

    Nullish throughout: Escape is always available on that screen, and
    somebody who skipped has answered nothing rather than answered wrong.
  */
  openingObject: z.enum(OBJECT_IDS as unknown as [string, ...string[]]).nullish(),
  openingCarrying: z.enum(CARRY_WORDS as unknown as [string, ...string[]]).nullish(),
  openingPutDown: z.enum(CARRY_WORDS as unknown as [string, ...string[]]).nullish(),
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
  // Where in the arc. Null unless the store actually answers — a session that
  // cannot be counted gets no claim about how long it has been going.
  let turnsToday: number | null = null;
  // What recurs, from the same twenty-four rows the memory block already
  // fetched. Computed, never generated, and null below the floor.
  let pattern: Pattern | null = null;

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

        // The rate limiter already paid for this number; the prompt gets it
        // for nothing rather than counting the same rows a second time.
        turnsToday = inDay;

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

        pattern = findPattern(recent);

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
      pattern = null;
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
  //
  // Efficacy is read here and nowhere earlier: every free path has already
  // returned, so nothing anybody gets for nothing waits on it. It is cached on
  // a half-hour clock and fails open to "no opinion", which is also what a
  // product with no usage yet looks like.
  const tactic = selectTactic({ ...ctx, efficacy: await getEfficacy(store) });

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
    turnsToday,
    pattern,
    message: input.message,
    // Free when there is no store and null on every failure inside the store,
    // so a session simply opens knowing nothing — which is what it did before
    // the Carver existed.
    carve: store && userId ? await store.getCarve(userId) : null,
    opening: {
      object: input.openingObject,
      carrying: input.openingCarrying,
      putDown: input.openingPutDown,
    },
  });

  const verdict = depthFor({
    classification,
    message: input.message,
    ventCount: history.length,
    pressure: input.pressure ?? null,
  });

  let reply: string;
  let tokensSpent = false;
  let answeredBy: string | null = null;
  let keyless = false;

  if (!isModelConfigured) {
    // No key yet: still move the session forward rather than 500ing. The
    // selected tactic already exists — selecting one costs nothing — so when
    // it carries an authored room phrasing, that is a real move to offer
    // instead of a shrug.
    //
    // Only the body is set here. The sentence that claims a save is composed
    // after the write, below, out of what the write returned — this passed
    // `Boolean(store && userId)`, which is a claim about the deployment and
    // not about the row. See noModelKeyReply.
    //
    // Empty when the tactic carries no hold, and empty is what gets stored:
    // nothing was said, so nothing is recorded as having been said. It also
    // keeps the status line out of the history that gets replayed to the
    // model on later turns, once there is a key to replay it to.
    keyless = true;
    reply = tactic.hold ?? "";
  } else {
    try {
      // The chain, not one provider. A rate limit or an empty balance on the
      // first is a reason to try the next, not a reason to tell somebody
      // mid-sentence that they cannot be heard.
      const answered = await generateReply({
        system: systemPrompt,
        maxTokens: MAX_TOKENS,
        // Cheap for the ordinary 80%, everything for the edge. Decided by a
        // regex pass over a message that is already classified — this product
        // does not spend a model call to size a model call.
        depth: verdict.depth,
        messages: [
          ...history.flatMap((h) =>
            h.ai_reply
              ? [
                  { role: "user" as const, content: h.user_message },
                  { role: "assistant" as const, content: h.ai_reply },
                ]
              : [],
          ),
          { role: "user" as const, content: input.message },
        ],
      });

      reply = answered.text;
      answeredBy = answered.provider;
      if (answered.fellThrough.length) {
        console.warn("[vent] fell through", JSON.stringify(answered.fellThrough));
      }
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

  /*
    The door to the peer room, opened only when there is one.

    This product has two surfaces and had no bridge between them: somebody
    writing "nobody knows this, i'm alone with it" got a real answer and was
    never told a circle was open with free seats on the other side of the same
    app.

    Read here rather than described to the model. A model told that circles
    exist can invent one — a tag, a time, a seat count — and arriving at a room
    that was never there is worse than never being offered it. This is rows the
    server actually read, and it costs the prompt nothing.

    Only when they sound alone, only when a real room has a real seat with real
    time left, and never after a crisis turn — that path returned long ago,
    because somebody handed a helpline is not being redirected to strangers.
  */
  let invite = null;
  if (store && soundsAlone(input.message)) {
    try {
      invite = circleInvite(
        input.message,
        await store.listOpenCircles(),
        classification.realWorldTag,
      );
    } catch {
      // A circles table that is down is not an invitation to nothing. The
      // vent already succeeded; this stays silent.
      invite = null;
    }
  }

  // Composed here and nowhere earlier, because the sentence it adds makes a
  // claim about the line directly above it. `saved` is what `tryPersist`
  // returned, not what the deployment looked capable of.
  if (keyless) reply = noModelKeyReply(saved, tactic.hold);

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
      // How much of what they said came back.
      //
      // Scored locally — regex and set arithmetic, zero tokens — and reported
      // rather than acted on. The obvious next step is to regenerate below the
      // floor, and that is deliberately not wired: it doubles the cost of the
      // one path that costs anything, on the messages that are longest and
      // therefore most expensive. Check 19 forbids a second completion and it
      // is right to.
      //
      // So the enforcement lives in the prompt, where it is free — the clause
      // list goes in numbered and the model is told to answer all of them —
      // and this is the measurement that says whether that worked. Visible on
      // the response so `live-verify` can hold real replies to it instead of
      // anybody assuming.
      coverage: (() => {
        const c = coverage(input.message, reply);
        return {
          // Null is a real answer and the common one — see SCOREABLE_MIN.
          score: c.score === null ? null : Number(c.score.toFixed(2)),
          missed: c.missed,
          floor: COVERAGE_FLOOR,
        };
      })(),
      tokensSpent,
      /*
        Shown only when it is true, and never on a crisis turn.

        The commandment asks for a "God Mode Active" badge so somebody can see
        the product fighting for them, and that is worth showing — honestly.
        Null on the fast path rather than a second label, because a badge that
        is always lit is decoration, and one that names a model that did not
        answer is a receipt for something that did not happen.
      */
      depth: verdict.depth,
      depthBadge: tokensSpent ? depthBadge(verdict) : null,
      /** A real open room, or null. Never prose — the UI renders a link. */
      circleInvite: invite,
      provider: answeredBy,
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
      /*
        The one sentence in here nobody wrote themselves.

        `memories-list.tsx` says it plainly: long-term memory without a delete
        button is not a feature. The Carver writes a line *about* a person, and
        the page where they take their words back was the only place it could
        honestly live — invisible memory is the thing every companion app is
        rightly distrusted for.

        It is anon-scoped like everything else on this route. `/api/memories`
        cannot serve it: that endpoint is behind `requireUser()` and almost
        nobody here is signed in.
      */
      carve: await store.getCarve(userId),
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

  // The carve on its own. "Clear everything" already takes it, but a person
  // who wants that one line gone should not have to burn their whole history
  // to do it — the sentence they did not write is exactly the one they are
  // most likely to want removed on its own.
  if (url.searchParams.get("carve") === "1") {
    await store.setCarve(userId, null);
    return NextResponse.json(
      { deleted: "carve", persisted: true, storage: store.kind },
      { headers: { "cache-control": "no-store" } },
    );
  }

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
/**
 * Record the outcome. The only claim this product makes.
 *
 * There was no route for this at all. The closing question set some React
 * state, toasted "Saved. That's the anchor.", and made no network call —
 * while `tryPersist` wrote `tension_after: null` on every insert. So no
 * session could ever be anchored: the heartbeat's mean drop was structurally
 * unreachable, `drop_is_flat` could never fire, and the efficacy loop had no
 * data and never would have.
 *
 * "Saved" over nothing saved is the oldest bug in this repo, and this was its
 * most expensive version — it silently disabled the only measurement the
 * product has.
 */
async function handlePATCH(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = z
    .object({ anonId: z.string().min(8).max(64), mood: z.number().int().min(1).max(10) })
    .safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const store = getStore();
  if (!store) {
    // Honest, and the UI must not claim otherwise on this response.
    return NextResponse.json(
      { anchored: false, reason: "no_storage" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  const userId = await store.findUserId(parsed.data.anonId);
  if (!userId) {
    return NextResponse.json(
      { anchored: false, reason: "no_session" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  // Mood 1–10 becomes tension 0–100, inverted — feeling better is less
  // tension. The same arithmetic the circle close uses, so the two surfaces
  // cannot disagree about what a 7 means.
  const tensionAfter = Math.round((10 - parsed.data.mood) * 10);
  const anchored = await store.anchorLatestVent(userId, parsed.data.mood, tensionAfter);

  return NextResponse.json(
    { anchored, tensionAfter, reason: anchored ? null : "nothing_to_anchor" },
    { headers: { "cache-control": "no-store" } },
  );
}

export const POST = withStore(handlePOST);
export const PATCH = withStore(handlePATCH);
export const GET = withStore(handleGET);
export const DELETE = withStore(handleDELETE);
