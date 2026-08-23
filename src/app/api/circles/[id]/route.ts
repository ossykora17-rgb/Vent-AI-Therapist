import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { classify, CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { tensionDrop, tensionNow } from "@/lib/vent/chairs";
import { logPreference } from "@/lib/rlhf/log";
import { presenceOf, shouldTouch } from "@/lib/circles/presence";
import { economyContext, weatherContext } from "@/lib/external/sources";
import { isLivekitConfigured } from "@/lib/env";
import { closeVoiceRoom } from "@/lib/voice/close";
import { sweepIfOver } from "@/lib/circles/sweep";
import {
  MAX_SEATS, PHASE_LABEL, economyFact, weatherFact, keeperIntention, keeperReflection,
  phaseFor, roleForSeat,
} from "@/lib/circles/rules";
import { withStore } from "@/lib/http/with-store";

export const dynamic = "force-dynamic";

/** Authorship, so each Keeper line is written at most once. */
const KEEPER_OPEN = "keeper:open";
const KEEPER_REFLECT = "keeper:reflect";

/**
 * Next 15 made route params a promise — the request store is resolved rather
 * than ambient — so every handler awaits its own id before using it.
 */
type Params = { params: Promise<{ id: string }> };

/** The room: who is in it, what role you hold, how long is left. */
async function handleGET(request: Request, { params }: Params) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const anonId = query.get("anonId") ?? "";
  const typing = query.get("typing") === "1";
  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const circle = await store.getCircle(id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let members = await store.listMembers(id);
  let me = members.find((m) => m.anon_id === anonId) ?? null;

  const msRemaining = Math.max(0, new Date(circle.ends_at).getTime() - Date.now());
  const phase = phaseFor(msRemaining);

  // Time up means over, not merely un-postable. Until this ran, the row still
  // said "waiting" and every word stayed readable to members for another 24
  // hours — so "what's said here stays here" quietly meant "for a day". Now
  // the clock ending is what deletes the transcript.
  //
  // And a closed room stays closed however it got there. Ending it early is
  // the Keeper's move; answering 200 afterwards meant the room kept polling
  // as though it were alive, with the transcript already deleted underneath.
  if (await sweepIfOver(store, circle)) {
    return NextResponse.json(
      { error: "not_found", closed: true },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  // The poll is the heartbeat. It already happens every four seconds, so
  // presence costs one write and no new endpoint — and the write is skipped
  // when the last one is still fresh and nothing changed.
  if (me && shouldTouch(me, typing)) {
    await store.touchMember(id, anonId, typing);
    members = await store.listMembers(id);
    me = members.find((m) => m.anon_id === anonId) ?? null;
  }

  // One fetched number, and only for the room it belongs to. Cached an hour,
  // three-second timeout, and `null` when the rate is not known — in which
  // case the sentence is absent rather than approximated.
  const rate = circle.tag === "economy" ? await economyContext() : null;

  /*
    The heat room gets the actual heat.

    `rw_climate` has always said "cold water on the face, heat makes
    everything feel worse than it is" — true, generic, and unprovable to the
    person reading it. A measured felt-temperature turns it into something the
    room and the person are both standing in.

    Same discipline as the rate, and the same three ways to say nothing: not
    this room's tag, upstream unreachable, or a reading too ordinary to be
    worth a sentence. `weatherFact` returns null for the third, so a mild
    Tuesday produces silence rather than filler about the weather.
  */
  const sky = circle.tag === "climate" ? await weatherContext() : null;

  const counted = rate
    ? economyFact(rate.value.usdNgn)
    : sky
      ? weatherFact(sky.value.feelsC, sky.value.rainMm)
      : null;
  const intention = keeperIntention(circle.tag, counted);

  // The Keeper speaks exactly twice, and each line is selected rather than
  // generated: the tag's own tool at minute three, the room's own counted
  // words at thirty-eight. The two are guarded separately by author, so one
  // never suppresses the other and the four-second poll cannot duplicate either.
  // Two people, minimum. The creator is a member, so members.length > 0 was
  // true the instant a circle opened — the Keeper read the intention aloud to
  // an empty room, to itself.
  if (phase !== "breathe" && members.length > 1) {
    const said = await store.listCircleMessages(id);

    const spokeOpening = said.some((m) => m.anon_id === KEEPER_OPEN);
    if (!spokeOpening) {
      await store.addCircleMessage({
        circle_id: id,
        anon_id: KEEPER_OPEN,
        content: intention,
        kind: "keeper_prompt",
        flagged: false,
      });
    }

    if (phase === "reflect" || phase === "close") {
      const spokeReflection = said.some((m) => m.anon_id === KEEPER_REFLECT);
      if (!spokeReflection) {
        const reflection = keeperReflection(
          said.filter((m) => m.kind === "share").map((m) => m.content),
        );
        if (reflection) {
          await store.addCircleMessage({
            circle_id: id,
            anon_id: KEEPER_REFLECT,
            content: reflection,
            kind: "keeper_prompt",
            flagged: false,
          });
        }
      }
    }
  }

  return NextResponse.json(
    {
      circle,
      members: members.map((m) => ({ role: m.role, joined_at: m.joined_at })),
      seats: members.length,
      maxSeats: MAX_SEATS,
      // Who is actually behind the chairs. Counts and dots, never names —
      // a circle has seats, and that is the whole point of it.
      ...presenceOf(members, anonId),
      role: me?.role ?? null,
      joined: Boolean(me),
      intention,
      counted,
      phase,
      phaseLabel: PHASE_LABEL[phase],
      // Their chair, not the room's. Falling back to the circle's seed would
      // show a joiner somebody else's starting point.
      pressureSeeded: me?.pressure_seeded ?? null,
      msRemaining,
      // No keys, no button. The room never offers a door that opens onto 501.
      voice: isLivekitConfigured,
      storage: store.kind,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

const joinSchema = z.object({
  anonId: z.string().min(8).max(64),
  /** Pre-join mood check. Crisis blocks the seat, by design. */
  intent: z.string().max(2000).optional(),
  /** Their own chair, so the closing drop is measured from where they sat. */
  pressure: z.number().min(0).max(100).nullish(),
  consent: z.literal(true),
});

/** Join. Consent is required, crisis is refused, seats are capped at six. */
async function handlePOST(request: Request, { params }: Params) {
  const { id } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = joinSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "consent_required", message: "Read the agreement and accept it to take a seat." },
      { status: 422 },
    );
  }
  const { anonId, intent, pressure } = parsed.data;

  if (intent && classify(intent).intent === "crisis") {
    return NextResponse.json(
      { error: "crisis", reply: CRISIS_RESPONSE, crisis: { ...CRISIS_LINES, gated: true } },
      { status: 409 },
    );
  }

  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const circle = await store.getCircle(id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // A circle nobody is polling still ends. Whoever knocks on the door is the
  // one who notices, and the sweep closes the room and the voice with it.
  if (await sweepIfOver(store, circle)) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const members = await store.listMembers(id);
  const existing = members.find((m) => m.anon_id === anonId);
  if (existing) {
    return NextResponse.json({ role: existing.role, seats: members.length, rejoined: true });
  }
  if (members.length >= MAX_SEATS) {
    return NextResponse.json({ error: "full", seats: members.length }, { status: 409 });
  }

  const role = roleForSeat(members.length);
  /*
    Read what came back, because a seat is not a request.

    `addMember` used to return `void` and quietly decline a full room, so this
    answered **201 with a role** to somebody who had no seat — and then the
    room drew a chair for them, the voice route minted a token for them, and
    the first thing they learned was that nobody could hear them.

    That is the shape of the worst bug this product ever shipped: a promise
    the code could not keep, made to the person least able to absorb it. The
    check above catches the ordinary full room; this catches the two people
    who took the last seat at the same instant, which is the only way past it
    and the only one the file store cannot reproduce.
  */
  const took = await store.addMember({
    circle_id: id,
    anon_id: anonId,
    role,
    pressure_seeded: pressure != null ? Math.round(pressure) : null,
  });

  // Counted after the write, never inferred from the read before it.
  const after = await store.listMembers(id);
  if (!took) {
    return NextResponse.json({ error: "full", seats: after.length }, { status: 409 });
  }

  return NextResponse.json(
    { role, seats: after.length, storage: store.kind },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}

const sealSchema = z.object({
  anonId: z.string().min(8).max(64),
  /** 1–10, the same scale the private session closes on. */
  mood: z.number().int().min(1).max(10),
  carry: z.string().max(40).nullish(),
  drop: z.string().max(40).nullish(),
});

/**
 * The seal. Not a message and never part of the transcript — it is the only
 * thing worth keeping out of a circle: whether the room moved anything.
 * The two words and a number, no content, nothing anybody said.
 */
async function handlePATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = sealSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  const { anonId, mood, carry, drop } = parsed.data;

  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const members = await store.listMembers(id);
  const me = members.find((m) => m.anon_id === anonId);
  if (!me) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  const circle = await store.getCircle(id);
  if (circle && (await sweepIfOver(store, circle))) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }
  const before = me.pressure_seeded;

  await logPreference({
    kind: "circle_close",
    anon_id: anonId,
    circle_id: id,
    tag: circle?.tag ?? null,
    rating: mood,
    tension_before: before,
    tension_after: tensionNow(mood),
    drop_points: before != null ? tensionDrop(before, mood) : null,
    word_carried: carry ?? null,
    word_dropped: drop ?? null,
  });

  return NextResponse.json(
    { sealed: true, drop: before != null ? tensionDrop(before, mood) : null },
    { headers: { "cache-control": "no-store" } },
  );
}

/** The Keeper may end early. Closing deletes every word said. */
async function handleDELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const anonId = new URL(request.url).searchParams.get("anonId") ?? "";
  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  /*
    The circle first, and the sweep before anything else touches it.

    This was the one handler of eight under `[id]` that never called
    `sweepIfOver`, which made it the only surface where a circle that had
    already ended answered `200 {closed: true}` — a Keeper tapping "end early"
    on a room the clock had closed twenty minutes ago is told they closed it.
    The contract everywhere else in this product is that a closed circle
    answers 404 from the room and 410 from every other surface, and this is
    every other surface.

    It also answered 403 for a circle that does not exist, because
    `listMembers` on a bad id returns an empty list and the Keeper check fires
    first — "you are not the Keeper" about a room nobody is the Keeper of.
  */
  const circle = await store.getCircle(id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (await sweepIfOver(store, circle)) {
    return NextResponse.json(
      { error: "closed" },
      { status: 410, headers: { "cache-control": "no-store" } },
    );
  }

  const members = await store.listMembers(id);
  const me = members.find((m) => m.anon_id === anonId);
  if (!me || me.role !== "keeper") {
    return NextResponse.json({ error: "not_keeper" }, { status: 403 });
  }

  await store.closeCircle(id);
  await closeVoiceRoom(id);
  return NextResponse.json({ closed: true }, { headers: { "cache-control": "no-store" } });
}

// A store that stops answering is a 503 here, not a 404 and not a 500.
export const GET = withStore(handleGET);
export const POST = withStore(handlePOST);
export const PATCH = withStore(handlePATCH);
export const DELETE = withStore(handleDELETE);
