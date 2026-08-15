import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { findPattern, patternSentence, PATTERN_FLOOR } from "@/lib/vent/pattern";
import { findTestimony, testimonySentence } from "@/lib/vent/testimony";
import { activeReferrals, handoffLine, pastWhatThisHolds } from "@/lib/vent/referrals";
import { withStore } from "@/lib/http/with-store";

export const dynamic = "force-dynamic";

/**
 * What keeps bringing them back, counted from their own rows.
 *
 * Anonymous like the rest of the vent surface — scoped by anonId, never
 * across people. Zero tokens: this is arithmetic, not a model call, which is
 * why it can run on every visit to History without costing anything.
 */
async function handleGET(request: Request) {
  const anonId = new URL(request.url).searchParams.get("anonId");
  if (!anonId) {
    return NextResponse.json({ error: "anonId required" }, { status: 422 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ pattern: null, testimony: null, floor: PATTERN_FLOOR });

  const userId = await store.findUserId(anonId);
  if (!userId) return NextResponse.json({ pattern: null, testimony: null, floor: PATTERN_FLOOR });

  const vents = await store.listVents(userId, 200);
  const pattern = findPattern(vents);
  /*
    Same rows, same request, no second round trip.

    Both of these are arithmetic over the list already in hand — what keeps
    coming back, and whether it has been going anywhere. Fetching twice for
    two sums over one array would be the kind of cost nobody notices until
    the bill arrives.
  */
  const testimony = findTestimony(vents);

  /*
    Third sum over the same array, and the only one that can point somewhere
    else.

    It answers a different question from the other two. `pattern` says what
    keeps coming back; `testimony` says what they have survived. This one asks
    whether any of it is moving — and when the answer has been no for five
    sittings, says so once and names people who do this properly.

    `activeReferrals()` is what makes it safe to compute here. Anything
    nobody has dialled and dated does not come back, so today this is
    reliably null: the machine runs, the payload waits for a person. When the
    first number is verified, this lights up on its own with no deploy.
  */
  const handoff = pastWhatThisHolds(vents);
  const referrals = handoff ? activeReferrals() : [];
  const handoffSentence = handoff ? handoffLine(handoff, referrals) : null;

  return NextResponse.json(
    {
      pattern,
      sentence: pattern ? patternSentence(pattern) : null,
      testimony,
      testimonySentence: testimony ? testimonySentence(testimony) : null,
      // The sentence and the list travel together or not at all — naming
      // somebody's stuckness and handing them an empty list is the cruellest
      // version of this. `handoffSentence` is null unless `referrals` is not.
      handoff: handoffSentence ? handoff : null,
      handoffSentence,
      referrals: handoffSentence ? referrals : [],
      floor: PATTERN_FLOOR,
      counted: vents.length,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

// A store that stops answering is a 503 here, not a 404 and not a 500.
export const GET = withStore(handleGET);
