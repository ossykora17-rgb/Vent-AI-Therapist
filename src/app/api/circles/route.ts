import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { classify, CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { CIRCLE_MINUTES, MAX_SEATS, roleForSeat } from "@/lib/circles/rules";
import { sweepIfOver } from "@/lib/circles/sweep";
import { withStore } from "@/lib/http/with-store";

export const dynamic = "force-dynamic";

/*
  Written for the person tapping the button, not for whoever deploys this.

  It said "Circles need storage. Run locally or configure Supabase." and the
  lobby toasts `d.message` verbatim, so somebody at 2am who tapped Open a
  circle was handed our vendor's name and a shell command. CLAUDE.md already
  records this exact sentence being fixed once — it lists "in the circles
  lobby it went further and told them to run `npm run local`" among the faces
  of the deployment-shape bug — and that fix reached the lobby's own copy of
  the string and not the route's, which is the one the lobby actually prints.

  The operator has /api/health, the heartbeat and the deploy logs, none of
  which are on this screen. What a person needs is what it means for them and
  whether the thing they came for still works. It does: the private session
  answers with no store at all, only without keeping anything.

  One constant, because there are two branches — no store, and an insert the
  database refused — and from where somebody is sitting those are the same
  event. Two hand-typed copies of one sentence is how the first one drifted.
*/
const NO_CIRCLES_HERE =
  "Rooms aren't open here yet. The private session still works — come in and talk.";

const createSchema = z.object({
  anonId: z.string().min(8).max(64),
  tag: z
    .enum(["economy", "japa", "ai_job", "social", "family", "lonely", "traffic", "climate", "health", "grief"])
    .nullish(),
  chairPicked: z.enum(["tight_edge", "sunk", "half_off"]).nullish(),
  pressure: z.number().min(0).max(100).nullish(),
  flavour: z.string().max(60).nullish(),
  /** Checked before a seat is given — a circle is the wrong room in a crisis. */
  intent: z.string().max(2000).optional(),
});

/**
 * How many stale circles one lobby load will clear.
 *
 * Small on purpose. Somebody is waiting on this response, and each sweep is a
 * transcript delete plus a call to the SFU. A backlog has no deadline; the
 * person who just opened the page does.
 */
const SWEEP_BATCH = 5;

/** Open circles, with seat counts. No content, ever — just the shape. */
async function handleGET() {
  const store = getStore();
  if (!store) {
    return NextResponse.json({ circles: [], persisting: false, storage: "none" });
  }

  /*
    The circles nobody is asking about, which is all of the ones that matter.

    `sweep.ts` opens by describing this exact failure — "a circle nobody was
    polling never closed at all — its transcript stayed readable, and its
    voice room stayed live on the SFU indefinitely" — and states the fix as
    calling `sweepIfOver` from every route that touches a circle. That was
    done, and it is not sufficient, because every one of those routes is
    scoped to a circle id. The check runs when somebody asks about that
    circle, and when a circle ends everybody closes their tab.

    `listOpenCircles` then filters the expired ones out with `ends_at > now()`
    so the lobby never showed them either. The row went invisible instead of
    going away: transcript intact in `circle_messages`, room alive on the SFU,
    nothing left in the product with a reason to look at it.

    That is the normal end of a normal circle, not an edge case — and it is a
    confidentiality promise, not a tidiness one. "Circle transcripts are never
    training data. Confidentiality is a deletion policy."

    This is the one route that can see them, because it is the only one not
    scoped to an id. Same "whoever notices first does the work" rule the file
    already runs on, extended to the case where nobody notices.

    It never fails the lobby. A sweep that cannot finish is a sweep that
    happens on the next load; a lobby that 500s because the SFU was slow is a
    room nobody can join.
  */
  /*
    Together, not one after another — and that changed meaning today.

    Written as a `for` loop the day before LiveKit keys existed, when
    `closeVoiceRoom` returned instantly because nothing was configured. Five
    sequential no-ops. The hour a key was added, the same loop became five
    sequential round trips to a third party inside a page load, and each one
    of those had no timeout on it.

    Which is this codebase's own question, asked of code written an hour
    earlier and answered by a configuration change rather than by a commit:
    *which deployment shape makes this false?* The one nobody had — until
    somebody pasted a key.

    `allSettled`, so one circle that will not close does not abandon the other
    four. Each `sweepIfOver` already deletes the transcript before it touches
    the SFU, so the promise that matters is kept before any of this can go
    wrong.
  */
  try {
    const stale = await store.expiredUnclosedCircles(SWEEP_BATCH);
    await Promise.allSettled(stale.map((c) => sweepIfOver(store, c)));
  } catch (error) {
    console.error("[circles] lobby sweep failed", error);
  }

  return NextResponse.json(
    {
      circles: await store.listOpenCircles(),
      maxSeats: MAX_SEATS,
      persisting: true,
      storage: store.kind,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

async function handlePOST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }
  const input = parsed.data;

  // A circle cannot hold a crisis. Route to a person, not to five strangers.
  if (input.intent && classify(input.intent).intent === "crisis") {
    return NextResponse.json(
      { error: "crisis", reply: CRISIS_RESPONSE, crisis: { ...CRISIS_LINES, gated: true } },
      { status: 409 },
    );
  }

  const store = getStore();
  if (!store) {
    return NextResponse.json(
      { error: "no_storage", message: NO_CIRCLES_HERE },
      { status: 503 },
    );
  }

  const now = new Date();
  let circle;
  try {
    // The one store method that throws rather than returning null. An insert
    // the database rejects was a 500 here; the caller's answer is the same as
    // if there were no store at all, because from where they sit there isn't.
    circle = await store.createCircle({
      creator_anon_id: input.anonId,
      tag: input.tag ?? null,
      chair_picked: input.chairPicked ?? null,
      pressure_seeded: input.pressure != null ? Math.round(input.pressure) : null,
      flavour: input.flavour ?? null,
      status: "waiting",
      starts_at: now.toISOString(),
      ends_at: new Date(now.getTime() + CIRCLE_MINUTES * 60_000).toISOString(),
    });

    // Whoever opens the circle holds it.
    await store.addMember({
      circle_id: circle.id,
      anon_id: input.anonId,
      role: roleForSeat(0),
      pressure_seeded: input.pressure != null ? Math.round(input.pressure) : null,
    });
  } catch (error) {
    console.error("[circles] could not open a circle", error);
    return NextResponse.json(
      { error: "no_storage", message: NO_CIRCLES_HERE },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { circle, role: roleForSeat(0), storage: store.kind },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}

// A store that stops answering is a 503 here, not a 404 and not a 500.
export const GET = withStore(handleGET);
export const POST = withStore(handlePOST);
