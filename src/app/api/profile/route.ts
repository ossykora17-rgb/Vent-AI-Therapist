import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const schema = z.object({
  anonId: z.string().min(8).max(64),
  chairPicked: z.enum(["tight_edge", "sunk", "half_off"]).nullish(),
  objectPicked: z
    .enum(["heavy_stone", "tight_knot", "buzzing_wire", "empty_bowl", "spinning_top", "cold_block"])
    .nullish(),
  onboardingDone: z.boolean().optional(),
});

/** Saves what the onboarding learned. Degrades silently without a store. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }
  const { anonId, chairPicked, objectPicked, onboardingDone } = parsed.data;

  const store = getStore();
  if (!store) return NextResponse.json({ persisted: false, storage: "none" });

  const userId = await store.ensureUser(anonId, {
    chairPicked: chairPicked ?? undefined,
    objectPicked: objectPicked ?? undefined,
    onboardingDone,
  });

  return NextResponse.json(
    { persisted: Boolean(userId), storage: store.kind },
    { headers: { "cache-control": "no-store" } },
  );
}
