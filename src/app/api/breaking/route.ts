import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { withStore } from "@/lib/http/with-store";
import { classify } from "@/lib/vent/intent";
import { QUESTIONS } from "@/lib/vent/breaking";

export const dynamic = "force-dynamic";

/**
 * THE BREAKING ROOM — where the answer to a heavy question is filed.
 *
 * The question itself is not chosen here. It is chosen on the vent path, by
 * `nextQuestion`, from a turn count and an asked-list the server read for
 * itself — because a client that picks its own question is a client that can
 * ask somebody in crisis about their father, and the whole safety model of
 * this feature is that the room decides when it opens.
 *
 * This endpoint does two things and neither of them costs a token:
 *
 *   POST  file one answer, after checking the sentence in it is not a crisis
 *   GET   hand them back, with the question each one answered
 *
 * ## The crisis check is the point of the POST existing at all
 *
 * "Which of your parents hurt you pass, wey you never forgive?" can be
 * answered with the worst sentence of somebody's life. Filing that away as an
 * answer — silently, with a thank-you — would be the single worst thing this
 * product could do with a sentence, and it is exactly what a client-side
 * check misses the moment anything goes around it.
 *
 * So the same rule as `/api/held`, for the same reason `checkMessage` runs
 * where the circle message is written: the classifier is local, free, and
 * lives on the server where the write happens.
 *
 * ## What is trusted, and what is not
 *
 * The question id is checked against the bank. A caller cannot invent one, so
 * `getBreaking` can never contain an id that `nextQuestion` will not
 * recognise — which matters, because that list is the only thing standing
 * between somebody and being asked the same question twice.
 *
 * The answer is trusted completely. It is theirs.
 */

const postSchema = z.object({
  anonId: z.string().min(8).max(64),
  /** A `Question.id`. Verified against the bank below — never taken on trust. */
  q: z.string().min(1).max(64),
  /**
   * Their answer.
   *
   * Longer than a held note, which is capped at 200. "Who you need to forgive
   * so that YOU fit breathe" is not a sentence somebody finishes in two
   * hundred characters, and a limit that truncates the answer to the hardest
   * question in the product would be the interface deciding they had said
   * enough.
   */
  a: z.string().min(1).max(2000),
});

async function handlePOST(request: Request) {
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
  const { anonId, q, a } = parsed.data;

  /*
    Validated before anything about this deployment is consulted.

    A bad request is bad in every shape — the lesson the carve route learned
    when a malformed body came back 200 on a deployment with no key and 422 on
    one with a key, so the status code described the environment instead of
    the request.
  */
  if (!QUESTIONS.some((question) => question.id === q)) {
    return NextResponse.json({ error: "Unknown question" }, { status: 422 });
  }

  /*
    The crisis router, on the server, before the write.

    Not "flag it and save it anyway": a person who answered a question about
    their father with a sentence about wanting to die is not making a record,
    they are saying something, and the only correct response is the number of
    somebody who can pick up a phone. The answer is not filed. There is
    nothing to file — that was not an answer.
  */
  const verdict = classify(a);
  if (verdict.intent === "crisis") {
    return NextResponse.json({ saved: false, crisis: true }, { status: 200 });
  }

  const store = getStore();
  if (!store) return NextResponse.json({ saved: false }, { status: 200 });

  const userId = await store.findUserId(anonId);
  if (!userId) return NextResponse.json({ saved: false }, { status: 200 });

  // The outcome, never the intention. The room says "I see you" on the
  // strength of this boolean and never on the strength of having asked.
  const saved = await store.addBreaking(userId, q, a);
  return NextResponse.json({ saved }, { status: 200 });
}

/**
 * What they have answered, with the question each answer belongs to.
 *
 * The text is joined here rather than stored beside the answer, because the
 * wording of a question is ours and may be improved, while what somebody said
 * is theirs and never changes. A retired question therefore leaves `text`
 * null — and the answer is still returned, because hiding somebody's own
 * words behind an edit we made to our own copy would be indefensible.
 */
async function handleGET(request: Request) {
  const anonId = new URL(request.url).searchParams.get("anonId");
  if (!anonId) {
    return NextResponse.json({ error: "anonId required" }, { status: 422 });
  }
  const store = getStore();
  if (!store) return NextResponse.json({ answers: [] });
  const userId = await store.findUserId(anonId);
  if (!userId) return NextResponse.json({ answers: [] });

  // Null is "could not read", which on a page that renders a card is the same
  // thing as nothing to render — the caller that must tell them apart is the
  // vent path, where the answer decides whether a question is asked at all.
  const answers = ((await store.getBreaking(userId)) ?? []).map((entry) => ({
    ...entry,
    text: QUESTIONS.find((question) => question.id === entry.q)?.text ?? null,
  }));

  return NextResponse.json({ answers }, { headers: { "cache-control": "no-store" } });
}

export const GET = withStore(handleGET);
export const POST = withStore(handlePOST);
