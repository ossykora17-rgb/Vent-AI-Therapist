import { NextResponse } from "next/server";
import { isPushConfigured, pushPublicKey } from "@/lib/push/send";

export const dynamic = "force-dynamic";

/**
 * Can this build wake a phone, and with what key.
 *
 * A question about the deployment, not about a circle — which is why it lives
 * here and not under `api/circles/[id]`. Every handler under that prefix
 * operates on a circle that exists, so every one of them must call
 * `sweepIfOver` and wrap in `withStore` (checks 95 and 118). This one touches
 * no store and knows no id; putting it there would have needed two exemptions
 * to say it is not really that kind of route, and a route that needs two
 * exemptions is in the wrong place.
 *
 * The room never offers a door that opens onto a 501. The client asks this
 * first and draws no notify control at all when the answer is no, rather than
 * a switch that fails when tapped — `voice/route.ts` learned that by handing
 * somebody three environment variable names.
 *
 * The public key is public by definition: it is what the push service checks
 * our signature against. The private one is never read outside `send.ts`.
 */
export async function GET() {
  return NextResponse.json(
    { configured: isPushConfigured, publicKey: pushPublicKey() },
    { headers: { "cache-control": "no-store" } },
  );
}
