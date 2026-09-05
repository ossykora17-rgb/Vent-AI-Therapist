import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore, type Store, type VentRow } from "@/lib/store";
import { isModelConfigured } from "@/lib/env";
import { answerFactual, groundNow } from "@/lib/vent/grounding";
import { classify, CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { CARRY_WORDS, OBJECT_IDS } from "@/lib/vent/chairs";
import { selectTactic, type TacticContext } from "@/lib/vent/tactics";
import { selectProbe } from "@/lib/vent/probes";
import { blendEfficacy, getEfficacy, measurePersonalEfficacy } from "@/lib/vent/efficacy";
import { findPattern, type Pattern } from "@/lib/vent/pattern";
import { coverage, COVERAGE_FLOOR } from "@/lib/vent/scan";
import { buildSystemPrompt, localReply, type MemoryRow } from "@/lib/vent/prompt";
import { research } from "@/lib/vent/research";
import { inspectReply } from "@/lib/vent/failsafe";
import { allianceLine, openingLine, shouldSayAlliance } from "@/lib/vent/intake";
import { MEMORY_TURNS, memoryFetchSize, selectMemory } from "@/lib/vent/memory";
import { noModelKeyReply } from "@/lib/vent/fallback";
import { MAX_TOKENS, classifyModelError, modelFailureReply } from "@/lib/vent/model";
import { generateReply } from "@/lib/vent/providers";
import { depthFor, depthBadge } from "@/lib/vent/depth";
import { assessTurn } from "@/lib/vent/assess";
import { circleInvite, soundsAlone } from "@/lib/community/invite";
import { BREAKING_LINES, nextQuestion, type Question } from "@/lib/vent/breaking";
import { buildFlavour } from "@/lib/flavour/profile";
import { withStore } from "@/lib/http/with-store";

export const dynamic = "force-dynamic";
// A model call is the one slow thing here. The platform default can be short
// enough to kill it mid-answer, which surfaces as a network fault and sends
// everyone looking at their wifi.
export const maxDuration = 60;

/*
  What the one retry may spend, and it comes out of this route's budget rather
  than being added to it.

  The first call may take the full provider deadline. A retry given its own
  clock on top pushes the worst case past `maxDuration`, and a function the
  platform kills gets no classifier, no fallthrough and no log line — which is
  the harm check 64 exists to prevent. So the retry is skipped entirely when
  there is not this much left, and a reply with one bad sentence in it goes
  out instead. That is the right trade: the alternative is somebody waiting on
  a reply that never arrives.

  Declared here, as a literal, because it is this route's second and not the
  failsafe's — the module that decides *whether* to retry has no idea how much
  clock is left.
*/
const RETRY_DEADLINE_MS = 12_000;

// Depth costs money, so only a real vent reaches it. VENT_MODEL and the
// failure vocabulary live in @/lib/vent/model so /api/health probes the model
// the product actually calls, rather than a second copy of the name.

const RATE_PER_MINUTE = 10;
const RATE_PER_DAY = 100;

/*
  A second ceiling, for the nights the first one was never meant to catch.

  Crisis returns above this and always has. What sat unguarded was the layer
  underneath: somebody the depth router calls `edge` or `grave` — hopeless,
  worthless, grieving, "i don tire" — who has typed a hundred messages in one
  day. The router knew. It just ran a hundred lines too late, so they got
  "Small small — breathe. Try again in a minute" and a closed door.

  A hundred messages in a day is not abuse when somebody is at the edge; it is
  what a bad night looks like from the inside. The per-minute limit goes
  entirely for those turns, because bursting is the shape distress takes, and
  the daily ceiling is raised rather than removed.

  Raised, not removed, and finite on purpose. Somebody can pad a message with
  "hopeless" to reach the higher tier, and that is a real and bounded cost —
  250 turns against one anonymous id. The Final Law says burn the tokens
  rather than refuse a person at the edge, and this is what that costs.
*/
const RATE_PER_DAY_EDGE = 250;
const HISTORY_LIMIT = 100;

const bodySchema = z.object({
  anonId: z.string().min(8).max(64),
  /*
    Whether the room has already introduced itself to this person.

    A flag from the client rather than a count on the server, because the count
    moves and the flag does not: somebody who clears their id is a new person
    by construction and should hear it again, and somebody who read it on
    Tuesday should not.
  */
  allianceSaid: z.boolean().optional(),
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

/**
 * Where a reply goes while it is still being written.
 *
 * Null on every path but one — the browser chat asking for an event stream.
 * Everything else here (the live checks, the eval suite, curl, the offline
 * queue flush) gets exactly the JSON it always got, produced by exactly the
 * same code, because the sink is threaded through rather than the handler
 * being forked. A second copy of this route for streaming is how the two
 * drift, and this file's own history says which copy would stop being fixed.
 */
interface Sink {
  delta: (chunk: string) => void;
  restart: () => void;
}

async function handlePOST(request: Request, sink: Sink | null = null) {
  /*
    When the platform's clock started, so the one retry can be skipped rather
    than started and killed. Read once at the top rather than at the point of
    use: by then the body has been parsed, the store read and the model called,
    and "how long have I got" measured from after all of that is not the
    question `maxDuration` is asking.
  */
  const startedAt = Date.now();
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

  /*
    Decided here, above the rate limiter, because it is free and because the
    limiter needs it. `ventCount` is not known yet — that needs the store —
    so a long session can still upgrade this below, and the upgrade only ever
    goes one way.
  */
  let verdict = depthFor({
    classification,
    message: input.message,
    pressure: input.pressure ?? null,
  });

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
            store, userId, input, classification, CRISIS_RESPONSE, null, null, grounding.iso, true,
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
        /*
          The turn that most needs a risk level was the one without one.

          `assessment` was added to the vent response and to nothing else —
          a field shipped into the shape its author was standing in, one
          commit after a check was written arguing against exactly that. This
          path returns before a tactic or a probe is chosen and before the
          store is read, so those are honestly null and the history is empty;
          the risk and the handoff are the two fields that matter here and
          both are real.
        */
        assessment: assessTurn({
          classification,
          depth: verdict,
          tacticId: null,
          probeId: null,
          history: [],
        }),
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
  /*
    The same rotation, for the question rather than the move.

    Read from `probe_used`, which 0018 added beside `tactic_used` for exactly
    this. Without it the three-turn block in `selectProbe` has nothing to block
    against, and the highest-ranked question for a given message is asked every
    single time that message shape recurs — which is how a library of fifty
    ships as a library of one.
  */
  let recentProbes: string[] = [];
  // Where in the arc. Null unless the store actually answers — a session that
  // cannot be counted gets no claim about how long it has been going.
  let turnsToday: number | null = null;
  // What recurs, from the same twenty-four rows the memory block already
  // fetched. Computed, never generated, and null below the floor.
  let pattern: Pattern | null = null;
  /* Their own anchored sittings, hoisted for the selector below. */
  let mine: VentRow[] = [];

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

        /*
          The ceiling is decided by the message, and only by the message.

          The first draft upgraded to `deep` here on `inDay >= 6` — the daily
          count — where `depthFor` means a session's turns. Different scale
          entirely: everybody with six messages in a day became permanently
          deep, exempt from the per-minute limit, and routed to the expensive
          model. A broken limiter and a cost blowout in one line, caught by
          the ordinary user sailing past twelve messages a minute.

          The long-session upgrade still happens; it moved below this block,
          where it belongs. It should decide which model answers, never who is
          allowed to speak.
        */
        const edge = verdict.depth === "deep";
        const dayCap = edge ? RATE_PER_DAY_EDGE : RATE_PER_DAY;
        // The per-minute limit does not apply at the edge. Bursting is what
        // distress looks like from the inside, not what abuse looks like.
        const tooFast = !edge && inMinute >= RATE_PER_MINUTE;

        if (tooFast || inDay >= dayCap) {
          /*
            Never a dead end.

            Somebody who has typed two hundred and fifty messages in a day
            while the router keeps calling it `edge` is past what this product
            can do for them, and the honest response to that is a human — not
            "try again in a minute", which is the app closing a door on the
            person least able to take it.

            The ordinary refusal keeps its own voice. It is a pause, and it
            reads like one.
          */
          return NextResponse.json(
            edge
              ? {
                  error: "rate_limited",
                  reply: CRISIS_RESPONSE,
                  crisis: { ...CRISIS_LINES, gated: false },
                }
              : {
                  error: "rate_limited",
                  reply: "Small small — breathe. Try again in a minute.",
                },
            { status: 429, headers: { "cache-control": "no-store" } },
          );
        }

        // Asking the date is not a vent — `selectMemory` is where that rule
        // lives, so the eval suite measures the real filter and not a copy.
        const recent = await store.recentVents(userId, memoryFetchSize(MEMORY_TURNS));
        const rows = selectMemory(recent, MEMORY_TURNS);
        mine = recent;

        pattern = findPattern(recent);

        history = rows as unknown as MemoryRow[];
        recentTactics = rows
          .map((r) => r.tactic_used)
          .filter((t): t is string => Boolean(t));
        recentProbes = rows
          .map((r) => r.probe_used)
          .filter((t): t is string => Boolean(t));
      }
    } catch (error) {
      console.error("[vent] store unreachable — continuing without it", error);
      userId = null;
      history = [];
      recentTactics = [];
      recentProbes = [];
      pattern = null;
    }
  }

  // Now that the store has answered, a long sitting can raise the depth.
  // Routing only — the rate limiter has already made its decision above, on
  // the message alone, and must not be reopened by a turn count.
  if (verdict.depth === "fast" && history.length >= 6) {
    verdict = { depth: "deep", reason: "long_session" };
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

  /*
    The other half of the office contract: the one question to go after.

    "Answer what they actually said. Then ask one thing you do not know the
    answer to." The tactic serves the first sentence and always has. Nothing
    served the second, so the model invented a question every turn — and an
    invented question drifts toward the four or five that fit any conversation
    on earth, which is the fail state the whole anti-generic rule is about.

    Free. Fifty regexes over one string, no store and no model call, so it
    behaves identically in the shape with nothing configured.
  */
  const probe = selectProbe(input.message, recentProbes);

  /*
    Read once, used twice: the greeting names one of these, and the prompt
    below carries them. Both degrade to nothing rather than failing the turn —
    a session opens knowing less, never not at all.
  */
  const greetCarve = store && userId ? await store.getCarve(userId).catch(() => null) : null;
  const greetNotes = store && userId ? await store.listNotes(userId).catch(() => []) : [];

  // ── 3. Free paths. No model call — this is the credit policy in code. ───
  const factual =
    classification.intent === "factual"
      ? answerFactual(input.message, grounding)
      : null;
  /*
    The first thing the room says, and it branches on whether it knows them.

    `localReply` still answers `meta`; the greeting goes through `openingLine`,
    which needs the carve and the notes and therefore needs the store to have
    answered — which it has, by here. Free either way: this is the greeting
    path and it has never cost a token.

    The branch is on something read, not on something guessed. "Welcome back"
    said to a stranger is the failure that makes every other product in this
    category feel fake, so with nothing specific to name it falls through to
    the new-visitor line.
  */
  const local =
    factual ??
    (classification.intent === "greeting"
      ? openingLine(grounding, classification.language === "pidgin" ? "pidgin" : "en", greetCarve, greetNotes)
      : localReply(classification.intent, grounding, classification.language, input.message));

  if (local) {
    const saved =
      store && userId
        ? await tryPersist(store, userId, input, classification, local, null, null, grounding.iso)
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
  /*
    Their own opinion first, the room's underneath.

    `recent` is already in hand for memory, so the personal table costs no
    extra query — it is arithmetic over rows this request has already paid
    for. Below four anchored sittings on a move it says nothing and the room
    answers, which is the same shape as every other floor in this product.
  */
  const tactic = selectTactic({
    ...ctx,
    efficacy: blendEfficacy(measurePersonalEfficacy(mine), await getEfficacy(store)),
  });

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
    /*
      The outside world, and it cannot hold the room open.

      Cached for a day and keyed to the pressure rather than the person, so
      this is a cache read on all but the first vent of the day for a given
      tag. `research` never throws and never returns anything it did not have
      a URL for; on the miss that does cost a round trip, the ceiling is the
      module's own and the reply is unaffected either way.
    */
    technique: await research(classification.realWorldTag),
    // Free when there is no store and null on every failure inside the store,
    // so a session simply opens knowing nothing — which is what it did before
    // the Carver existed.
    carve: greetCarve,
    /*
      The office, across sessions. Free when there is no store, and every
      failure inside the store degrades to nothing — a session opens knowing
      less rather than not opening at all.
    */
    notes: greetNotes,
    // One of fifty, chosen against their own words and blocked for three
    // turns. Null means the message offered no handle at all, and the prompt
    // then carries no question line rather than a blank one.
    probe,
    opening: {
      object: input.openingObject,
      carrying: input.openingCarrying,
      putDown: input.openingPutDown,
    },
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
      /*
        Built once and used twice — the first attempt and the retry. Two
        expressions of "the conversation so far" is two things that can
        disagree, and they did: the retry had none.
      */
      const modelMessages = [
        ...history.flatMap((h) =>
          h.ai_reply
            ? [
                { role: "user" as const, content: h.user_message },
                { role: "assistant" as const, content: h.ai_reply },
              ]
            : [],
        ),
        { role: "user" as const, content: input.message },
      ];
      const answered = await generateReply({
        system: systemPrompt,
        maxTokens: MAX_TOKENS,
        // Cheap for the ordinary 80%, everything for the edge. Decided by a
        // regex pass over a message that is already classified — this product
        // does not spend a model call to size a model call.
        depth: verdict.depth,
        onDelta: sink?.delta,
        onRestart: sink?.restart,
        messages: modelMessages,
      });

      reply = answered.text;
      answeredBy = answered.provider;

      /*
        Inspected before anybody reads it, and regenerated once if it fails.

        `gradeReply` already knew about advice, promises, banned phrases and
        the file read aloud — and it only ever ran in a paid command nobody
        runs nightly, and in the audit, which reads replies people already
        received. The live path shipped whatever came back.

        Narrow on purpose: only the offences that are unambiguous from the
        text. One retry, on a shorter clock than the first attempt, and then
        the tactic's authored line — which passes by construction, because
        check 76 fails the build if anything we wrote contains a banned
        phrase. A person waiting on a reply that never arrives is worse than
        a reply with one bad sentence in it.
      */
      const asCase = {
        id: "live",
        message: input.message,
        intent: "vent" as const,
        language: classification.language === "pidgin" ? ("pidgin" as const) : ("en" as const),
        probes: "live failsafe",
      };
      /*
        Everything they have actually written, so the invention check has
        evidence rather than a guess.

        Their whole side of the conversation, not just this turn — because
        "last time you said your brother still hasn't called" is the most
        valuable sentence a therapist has, and graded against one message it
        looks exactly like a fabricated brother. The grader skips itself
        entirely when this is absent; here it never is.
      */
      const said = [...history.map((h) => h.user_message), input.message].join("\n");
      const verdictOnReply = inspectReply(asCase, reply, said);
      const leftOnTheClock = maxDuration * 1000 - (Date.now() - startedAt);
      if (verdictOnReply.reject && leftOnTheClock > RETRY_DEADLINE_MS) {
        console.warn("[vent] rejected own reply:", verdictOnReply.reject);
        try {
          const again = await generateReply({
            system: `${systemPrompt}\n\n${verdictOnReply.correction}`,
            maxTokens: MAX_TOKENS,
            depth: verdict.depth,
            deadlineMs: RETRY_DEADLINE_MS,
            /*
              The same conversation, not just the last line.

              The first version sent `[{ user: message }]` alone — so the one
              call made specifically to produce a *less* generic reply was the
              only call in the product with no history behind it. A retry
              stripped of context is a retry that can only be more generic
              than the attempt it is replacing.
            */
            messages: modelMessages,
          });
          reply = inspectReply(asCase, again.text, said).reject
            ? tactic.hold ?? reply
            : again.text;
          answeredBy = again.provider;
        } catch {
          // The retry is a second opinion on our own output. Unreachable means
          // keep what we have rather than leave somebody with nothing.
        }
      }
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
          ? await tryPersist(store, userId, input, classification, failure, tactic.id, probe?.id ?? null, grounding.iso)
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
      ? await tryPersist(store, userId, input, classification, reply, tactic.id, probe?.id ?? null, grounding.iso)
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

  /*
    THE BREAKING ROOM, offered — one question, and only when the room may ask.

    Picked here rather than by the screen, and that is the entire safety model
    of the feature. `canOpen` refuses on a crisis turn, refuses on the
    unfixable, refuses to a stranger, and refuses off-cadence; a client that
    chose its own question would be a client that can ask somebody whose
    father is dying who they are pretending to be. So the server reads the
    turn count and the asked-list it already owns, decides, and sends either
    one question or nothing at all.

    Never beside the circle invite. Two doors on one reply is not depth, it is
    a menu — and the circle wins that contest every time, because somebody who
    has just said they are alone needs a room with people in it more than they
    need a hard question.

    Deliberately after `tryPersist`: a question offered on a turn that was not
    recorded would be asked again on the next one, since `turnsToday` is the
    count this read.

    And shut outright when the store cannot say what has been asked.

    `getBreaking` returns null for that, distinct from `[]`, and the
    distinction is load-bearing: a deployment with 0015 pending reads the
    column as an error, and an error rendered as an empty list makes every
    question look unasked. It would offer the shallowest question, fail to
    keep the answer, and offer the same one again on the next cadence turn,
    forever. Somebody asked the same question twice has learned the room was
    not listening the first time.

    So: no answer means no question. The room does not guess.
  */
  let breaking: Question | null = null;
  if (store && userId && turnsToday !== null && !invite) {
    try {
      const answered = await store.getBreaking(userId);
      breaking =
        answered === null
          ? null
          : nextQuestion({
              message: input.message,
              // The count read before this vent was written, plus this one.
              // Off by one against `canOpen`'s floor is a question arriving a
              // turn early, which is the direction that matters here.
              ventCount: turnsToday + 1,
              asked: answered.map((entry) => entry.q),
            });
    } catch {
      breaking = null;
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
      /*
        The turn's verdict, computed rather than asked for.

        A risk level, why, the move, the question, and whether this has
        outgrown the room — every field derived from what the router and the
        selectors already decided before the model was called. Asking the model
        for it would spend output tokens on a budget that has already produced
        this repo's sharpest bug, add a parse whose failure mode is XML on
        screen at 2am, and let the message being assessed argue with its own
        assessment. See assess.ts.
      */
      assessment: assessTurn({
        classification,
        depth: verdict,
        tacticId: tactic.id,
        probeId: probe?.id ?? null,
        history: mine,
      }),
      /** A real open room, or null. Never prose — the UI renders a link. */
      circleInvite: invite,
      /**
       * One heavy question, chosen by the server, or null.
       *
       * Hand-written and picked from a fixed bank, so like the circle invite
       * there is nothing here a model could have invented. The UI renders it
       * as an offer with a visible no.
       */
      breaking: breaking && {
        id: breaking.id,
        text: breaking.text,
        // The room's own words, sent rather than imported.
        //
        // `lib/vent/breaking` pulls in `classify` and `nothingCanMove`, which
        // is `intent.ts` and the whole 33-tactic library — four short strings
        // are not worth putting that in every visitor's first load. The same
        // argument that keeps `livekit-client` inside the join handler.
        lines: BREAKING_LINES,
      },
      provider: answeredBy,
      persisted: saved,
      /*
        Said once, at the third exchange, and only as true as the write.

        The first half of this sentence — "I keep what we talk about" — is a
        promise the code cannot keep, and the grader bans a model from making
        it for exactly that reason: a model cannot know whether the write
        landed. The server can, and `saved` is what came back from it rather
        than what the configuration implied. With nothing kept, the claim is
        dropped and only the disclosure half is said.
      */
      alliance: shouldSayAlliance(history.length + 1, input.allianceSaid === true)
        ? allianceLine(saved, classification.language === "pidgin" ? "pidgin" : "en")
        : null,
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

  const forgetCarve = url.searchParams.get("carve") === "1";

  const store = getStore();
  if (!store) return NextResponse.json({ deleted: 0, persisted: false, storage: "none" });

  const userId = await store.findUserId(anonId);
  /*
    Nothing to delete is a deletion that holds, and it has to answer as one.

    This returned `deleted: 0` for a row that does not exist, which is
    literally true and reads as a failure to every caller — and the caller for
    `?carve=1` is a button whose whole job is to tell somebody their memory is
    gone. So: wipe your history in the History tab, come back to the tab you
    left open, tap Forget, and the room says *"Could not clear that. It is
    still here."* about a line that had already been destroyed.

    That is this file's own bug read backwards. Every face of it so far has
    been a promise made without its answer — "I've saved it, word for word",
    "Sealed. Nothing here is kept." This is the mirror: a *denial* made
    without its answer, in the one product where "we still have it" is the
    most alarming sentence available. False comfort and false alarm are the
    same defect, and the second one is worse here, because somebody acts on it
    — they go looking for a way to delete a thing that is already deleted, and
    find none, and conclude the deletion never works.

    The question a person is asking is not "did a row change" — it is "is it
    gone". For a user with no row the answer is yes, and it was yes before
    they asked. The end state is the truth, so the end state is what is
    reported. The general delete keeps `deleted: 0` on purpose: it is a count,
    nobody's screen turns it into a promise, and history-list reads `res.ok`.
  */
  if (!userId) {
    return NextResponse.json(
      forgetCarve
        ? { deleted: "carve", persisted: true, storage: store.kind, had: false }
        : { deleted: 0, persisted: true, storage: store.kind, had: false },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // The carve on its own. "Clear everything" already takes it, but a person
  // who wants that one line gone should not have to burn their whole history
  // to do it — the sentence they did not write is exactly the one they are
  // most likely to want removed on its own.
  if (forgetCarve) {
    /*
      The answer is read, because this is the one store method that reports by
      returning rather than by throwing.

      Every other mutation in `supabase-store.ts` goes through `done()`, which
      throws `StoreUnavailableError` — so `deleteVent` and `deleteAll` below
      fail loudly, the handler answers non-2xx, and both screens correctly say
      the deletion did not hold. `setCarve` is deliberately not like that: a
      deployment with 0011 pending answers `42703` on this column, which is a
      normal state rather than a fault, so it catches, logs and returns false.

      This line was written for the throwing world and dropped the boolean on
      the floor, then reported `deleted: "carve"` — the exact field both
      screens read — with nothing behind it. `setCarve` carries three
      paragraphs about having been fixed to return what happened, under a
      contract in `store/types.ts` reading "a carve that did not land must not
      be reported as kept". Both halves were right. The line between them threw
      the answer away.

      Which deployment shape makes this false? The one this repository has
      never run and is about to: Supabase configured, schema half-applied.
      `42501` with no GRANT, `42703` with 0011 pending — in both, the room said
      "Forgotten." about a sentence it was still holding, on the two screens
      whose entire job is that question.

      `deleted: 0` with `had: true` is the honest shape and needs no new field:
      there was a carve, nothing was deleted, and the store is still keeping
      things. Both callers already turn that into FORGET_FAILED — "Could not
      clear that. It is still here." — which until now was unreachable.
    */
    const cleared = await store.setCarve(userId, null);
    return NextResponse.json(
      cleared
        ? { deleted: "carve", persisted: true, storage: store.kind, had: true }
        : { deleted: 0, persisted: true, storage: store.kind, had: true },
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
  probeId: string | null,
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
    probe_used: probeId,
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

/**
 * The same turn, delivered as it is written.
 *
 * Two events and no more:
 *
 *   delta    a fragment of the reply, as the provider produced it
 *   done     `{status, body}` — the entire response this route would have
 *            returned, byte for byte
 *
 * `done` is the answer. The deltas are a preview, and the client is required
 * to replace what it has drawn with `body.reply` when `done` lands, for a
 * reason this codebase has paid for in a dozen other shapes: what was streamed
 * is what a provider *started* saying, and this route can still refuse it. A
 * completion cut off mid-sentence throws and the chain moves on. A crisis
 * classification never reaches the model at all. `keyless` rewrites the reply
 * after the write, out of what the write returned. In each of those the words
 * on the screen and the words in the response differ, and the response is the
 * one that is true.
 *
 * So: stream for the wait, commit on the answer. It is the same rule the rest
 * of this product runs on — *did this wait for the thing, and did it read what
 * came back* — applied to the one surface where waiting is the problem.
 *
 * A `restart` is not an event. The client is told to discard by the next thing
 * it is sent, and nothing is sent between a restart and the next provider's
 * first token, so it rides on the delta: `{ chunk, seq }`, and a client that
 * sees `seq` change throws away what it has. One field instead of a third
 * event type, and impossible to receive out of order.
 */
/**
 * How long a turn took, and which provider it took that long on.
 *
 * Nothing in this product measured latency. Both of the slow paths found so
 * far — a fifty-second lobby against a hung SFU, a carve killed by the
 * platform at thirty — were found by reading a runtime error table and by
 * building a black hole on purpose. Neither would have shown up in a metric
 * because there was no metric.
 *
 * One line per turn, to the platform's own log, which already exists and
 * already retains. Not a dashboard, not a service, not a dependency: the
 * cheapest thing that turns "the app feels slow" into a number somebody can
 * sort by. `answeredBy` is on it because "slow" and "slow *on gemini*" are
 * different problems with the same symptom, and the chain moves.
 *
 * No message, no reply, no anon id. A latency line is the one log in here
 * that would be tempting to enrich with content, and content in a log is a
 * transcript in a place nobody promised one.
 */
function logTurn(started: number, res: Response, provider: string | null) {
  const ms = Math.round(Date.now() - started);
  console.info(
    `[vent] turn ${res.status} ${ms}ms via ${provider ?? "local"}`,
  );
}

export const POST = withStore(async (request: Request) => {
  const started = Date.now();

  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    const res = await handlePOST(request);
    // Cloned, because reading a body consumes it and this response is on its
    // way to somebody. `provider` is the only field wanted and a clone is the
    // only way to look without taking it.
    const body = await res.clone().json().catch(() => null);
    logTurn(started, res, body?.provider ?? null);
    return res;
  }

  const encoder = new TextEncoder();
  let seq = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // The tab was closed mid-answer. Nothing to report and nothing to
          // recover — the write to storage already happened or is about to,
          // and it does not depend on anybody still listening.
          closed = true;
        }
      };

      try {
        const res = await handlePOST(request, {
          delta: (chunk) => send("delta", { chunk, seq }),
          restart: () => {
            seq += 1;
          },
        });
        const body = await res.json();
        // Measured where the turn actually ends, which on this path is when
        // the answer is handed over rather than when the function returns.
        logTurn(started, res, (body as { provider?: string })?.provider ?? null);
        send("done", { status: res.status, body });
      } catch (error) {
        /*
          A throw here would otherwise be an aborted stream, and an aborted
          stream is indistinguishable from a dropped connection — the client
          would tell somebody their network dipped when what actually happened
          was a store outage or a bug. `withStore` is wrapped *around* this
          function, so by the time the error is thrown the response has already
          begun and there is no status code left to set. The status goes in the
          event instead, where the client reads it exactly as it reads every
          other `done`.
        */
        console.error("[vent] stream failed", error);
        send("done", {
          status: 500,
          body: {
            error: "stream_failed",
            reply:
              "Something broke on my side before I could finish. Say it again — it was not you.",
            persisted: false,
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      // Nginx and friends buffer proxied responses by default, which turns a
      // stream back into one lump delivered at the end — the exact thing this
      // exists to stop, invisible in dev and only in front of real users.
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
});
export const PATCH = withStore(handlePATCH);
export const GET = withStore(handleGET);
export const DELETE = withStore(handleDELETE);
