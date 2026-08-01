import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { classify, CRISIS_LINES, CRISIS_RESPONSE } from "@/lib/vent/intent";
import { checkMessage } from "@/lib/circles/rules";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Only members read the room, and only inside the 24h window. */
export async function GET(request: Request, { params }: Params) {
  const anonId = new URL(request.url).searchParams.get("anonId") ?? "";
  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const members = await store.listMembers(params.id);
  if (!members.some((m) => m.anon_id === anonId)) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const messages = await store.listCircleMessages(params.id);

  // Seat number, not identity. Nobody carries a name between circles.
  const seatOf = new Map(members.map((m, i) => [m.anon_id, i + 1]));

  return NextResponse.json(
    {
      messages: messages.map((m) => ({
        id: m.id,
        seat: seatOf.get(m.anon_id) ?? 0,
        mine: m.anon_id === anonId,
        role: members.find((x) => x.anon_id === m.anon_id)?.role ?? "witness",
        content: m.content,
        kind: m.kind,
        created_at: m.created_at,
      })),
      storage: store.kind,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

const postSchema = z.object({
  anonId: z.string().min(8).max(64),
  content: z.string().trim().min(1).max(900),
  kind: z.enum(["share", "witness"]),
});

export async function POST(request: Request, { params }: Params) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }
  const { anonId, content, kind } = parsed.data;

  const store = getStore();
  if (!store) return NextResponse.json({ error: "no_storage" }, { status: 503 });

  const circle = await store.getCircle(params.id);
  if (!circle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (circle.status === "closed" || new Date(circle.ends_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const members = await store.listMembers(params.id);
  const me = members.find((m) => m.anon_id === anonId);
  if (!me) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  // ── Guardian: crisis inside the room. Nothing is stored, the circle is not
  // the place, and the person gets a number rather than five strangers. ────
  if (classify(content).intent === "crisis") {
    return NextResponse.json(
      {
        error: "crisis",
        reply: CRISIS_RESPONSE,
        crisis: { ...CRISIS_LINES, gated: true },
        exitTo: "/chat",
      },
      { status: 409 },
    );
  }

  // ── Governance, enforced here so curl cannot walk around the UI. ────────
  const verdict = checkMessage(content, kind, me.role);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "rule", message: verdict.reason },
      { status: 422, headers: { "cache-control": "no-store" } },
    );
  }

  await store.addCircleMessage({
    circle_id: params.id,
    anon_id: anonId,
    content,
    kind,
    flagged: false,
  });

  return NextResponse.json(
    { ok: true, role: me.role, storage: store.kind },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
