import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { classify, CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { CIRCLE_MINUTES, MAX_SEATS, roleForSeat } from "@/lib/circles/rules";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  anonId: z.string().min(8).max(64),
  tag: z
    .enum(["economy", "japa", "ai_job", "social", "family", "lonely", "traffic", "climate", "health"])
    .nullish(),
  chairPicked: z.enum(["tight_edge", "sunk", "half_off"]).nullish(),
  pressure: z.number().min(0).max(100).nullish(),
  flavour: z.string().max(60).nullish(),
  /** Checked before a seat is given — a circle is the wrong room in a crisis. */
  intent: z.string().max(2000).optional(),
});

/** Open circles, with seat counts. No content, ever — just the shape. */
export async function GET() {
  const store = getStore();
  if (!store) {
    return NextResponse.json({ circles: [], persisting: false, storage: "none" });
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

export async function POST(request: Request) {
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
      { error: "no_storage", message: "Circles need storage. Run locally or configure Supabase." },
      { status: 503 },
    );
  }

  const now = new Date();
  const circle = await store.createCircle({
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

  return NextResponse.json(
    { circle, role: roleForSeat(0), storage: store.kind },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
