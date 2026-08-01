import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { classify, CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import {
  MAX_SEATS, PHASE_LABEL, keeperIntention, keeperReflection,
  phaseFor, roleForSeat,
} from "@/lib/circles/rules";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The room: who is in it, what role you hold, how long is left. */
export async function GET(request: Request, { params }: Params) {
  const anonId = new URL(request.url).searchParams.get("anonId") ?? "";
  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const circle = await store.getCircle(params.id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const members = await store.listMembers(params.id);
  const me = members.find((m) => m.anon_id === anonId) ?? null;

  const msRemaining = Math.max(0, new Date(circle.ends_at).getTime() - Date.now());
  const phase = phaseFor(msRemaining);

  // At the 38-minute mark the Keeper stops holding time and says the one
  // thing it is for: the pattern the room actually voiced. Written once,
  // counted from real shares, never generated.
  if (phase === "reflect" || phase === "close") {
    const said = await store.listCircleMessages(params.id);
    if (!said.some((m) => m.kind === "keeper_prompt")) {
      const reflection = keeperReflection(
        said.filter((m) => m.kind === "share").map((m) => m.content),
      );
      if (reflection) {
        await store.addCircleMessage({
          circle_id: params.id,
          anon_id: "keeper",
          content: reflection,
          kind: "keeper_prompt",
          flagged: false,
        });
      }
    }
  }

  return NextResponse.json(
    {
      circle,
      members: members.map((m) => ({ role: m.role, joined_at: m.joined_at })),
      seats: members.length,
      maxSeats: MAX_SEATS,
      role: me?.role ?? null,
      joined: Boolean(me),
      intention: keeperIntention(circle.tag),
      phase,
      phaseLabel: PHASE_LABEL[phase],
      msRemaining,
      storage: store.kind,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

const joinSchema = z.object({
  anonId: z.string().min(8).max(64),
  /** Pre-join mood check. Crisis blocks the seat, by design. */
  intent: z.string().max(2000).optional(),
  consent: z.literal(true),
});

/** Join. Consent is required, crisis is refused, seats are capped at six. */
export async function POST(request: Request, { params }: Params) {
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
  const { anonId, intent } = parsed.data;

  if (intent && classify(intent).intent === "crisis") {
    return NextResponse.json(
      { error: "crisis", reply: CRISIS_RESPONSE, crisis: { ...CRISIS_LINES, gated: true } },
      { status: 409 },
    );
  }

  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const circle = await store.getCircle(params.id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (circle.status === "closed" || new Date(circle.ends_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const members = await store.listMembers(params.id);
  const existing = members.find((m) => m.anon_id === anonId);
  if (existing) {
    return NextResponse.json({ role: existing.role, seats: members.length, rejoined: true });
  }
  if (members.length >= MAX_SEATS) {
    return NextResponse.json({ error: "full", seats: members.length }, { status: 409 });
  }

  const role = roleForSeat(members.length);
  await store.addMember({ circle_id: params.id, anon_id: anonId, role });

  return NextResponse.json(
    { role, seats: members.length + 1, storage: store.kind },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}

/** The Keeper may end early. Closing deletes every word said. */
export async function DELETE(request: Request, { params }: Params) {
  const anonId = new URL(request.url).searchParams.get("anonId") ?? "";
  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const members = await store.listMembers(params.id);
  const me = members.find((m) => m.anon_id === anonId);
  if (!me || me.role !== "keeper") {
    return NextResponse.json({ error: "not_keeper" }, { status: 403 });
  }

  await store.closeCircle(params.id);
  return NextResponse.json({ closed: true }, { headers: { "cache-control": "no-store" } });
}
