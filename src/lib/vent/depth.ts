import { plainText, type Classification } from "./intent";

/**
 * How much brain this message gets, decided for free.
 *
 * Two commandments meet here and they are the same mechanism. "Fast, cheap
 * models for 80% of chats" and "auto-switch to maximum intelligence for
 * trauma, suicide risk, existential crisis" are one router: most vents are
 * ordinary and a smaller model answers them well, and the rare ones where a
 * person is at the edge get everything.
 *
 * Deciding costs nothing — a regex pass over a message that has already been
 * classified. There is no world in which this product spends a model call to
 * work out how big a model call should be.
 *
 * ## Why cheap-by-default is the caring choice, not the stingy one
 *
 * A free tier that survives is worth more to somebody at 2am than a premium
 * tier they cannot reach. Every vent answered at 1/3 the cost is three people
 * helped instead of one, and the ones who need depth still get it — because
 * the router spends the saving on them rather than banking it.
 *
 * ## What DEEP is for
 *
 * Not "hard questions". The line is whether getting this wrong costs somebody
 * something they cannot get back: a person circling the drain who has not yet
 * said the explicit sentence, grief, a body in danger, a decision that cannot
 * be undone. Crisis itself never arrives here — it is answered locally,
 * before any model, and it always will be.
 */
export type Depth = "fast" | "deep";

/**
 * Language that is one layer above the crisis list.
 *
 * `intent.ts` gates the explicit sentences and hands somebody a human. This
 * catches the layer underneath — the person who is not there yet, or who is
 * there and has not written it down. They get the best model available, every
 * time, and the cost argument does not get a vote.
 */
const EDGE = [
  /\b(hopeless|worthless|empty|numb|nothing matters|no way out|trapped)\b/,
  /\b(can'?t (go on|take (it|this) anymore|keep going))\b/,
  /\b(i (hate|despise) myself|i am nothing|i'?m nothing)\b/,
  /\bno reason\b/,
  /\bgive up\b/,
  // Pidgin — the half that gets forgotten in products written in English.
  /\b(i don tire|e don do me|i no fit again|life don tire me|nothing dey sweet)\b/,
];

/** Loss, harm, and the things that do not undo. */
const GRAVE = [
  /\b(died|dead|death|passed away|funeral|burial|grief)\b/,
  /\b(cancer|terminal|stroke|hospital|test results?|ICU)\b/,
  /\b(assault|raped|rape|beat me|hit me|violent)\b/,
  /\b(custody|miscarriage|lost the baby)\b/,
  /\b(fired|sacked|evicted|deported|visa (refused|denied))\b/,
  /\b(flashback|nightmares?|panic attack)\b/,
  /*
    Stems, and they were trapped inside the groups above until check 31 found
    them. `IRREVERSIBLE` twenty lines down documents this exact trap and the
    lesson never crossed the gap to its own neighbours: `griev\b` matches
    neither "grieving" nor "grief", `diagnos\b` matches neither "diagnosed"
    nor "diagnosis", and `separat\b`, `molest\b` and `divorce\b` all miss the
    past tense — which is the only tense any of them is ever written in.

    So "my mum was diagnosed in March" and "I have been grieving since
    March" both routed to the cheap model. Not a wrong answer: a worse one,
    to the two people in this list who most needed the better one.
  */
  /\b(griev(e|es|ed|ing)|diagnos|abus|molest|separat|divorc|trauma|bereave|mourn)/,
  /*
    Danger from somebody else, in the tense it is lived in. `beat me` and
    `hit me` above miss "my husband beats me every night" — the present, which
    is the tense of somebody still inside it — and a reported threat matched
    nothing at all. A person comes first, because "it beats me why" is an
    idiom. This is `grave`, not crisis: answered, with the lines beside it.
  */
  /\b(he|she|they|husband|wife|partner|boyfriend|girlfriend|father|dad|papa|mother|mum|mama|uncle|aunt|aunty|brother|boss|oga|landlord|ex)\b[^.!?]{0,20}\b(beats|beating|hits|hitting|slaps?|slapped|slapping|kicks|kicked|punch(es|ed)?|chokes|choked|strangled|dey (beat|hit|slap|flog))\s+me\b/,
  /\b(threaten(ed|s|ing)?|swore|vowed)\b[^.!?]{0,30}\b(kill|hurt|beat|harm|finish|deal with) me\b/,
  /\b(he|she|they)\s+(said|says|told me)\b[^.!?]{0,20}\b(kill|hurt|harm) me\b/,
];

/** A decision that cannot be walked back. */
const IRREVERSIBLE = [
  // Stems, not bare words. The first draft used `\bquit\b` and missed
  // "quitting", and `move abroad` and missed "moving abroad" — so "i am
  // thinking of quitting my job and moving abroad" routed to the cheap model.
  // A word boundary after a verb root is the most common way a regex quietly
  // stops matching the tense people actually write in.
  /\b(quit(ting|s)?|resign(ing|ed)?|leav(e|ing) (him|her|them|my|the marriage)|break(ing)? up|divorc)/,
  /\b(japa|relocat|emigrat|mov(e|ing) (abroad|out)|sell(ing)? (the|my) )/,
  /\b(borrow(ing)?|loan|debt|invest(ed|ing)? (my|all))/,
];

export interface DepthContext {
  classification: Classification;
  message: string;
  /** Turns in this session. A long sitting is rarely a light one. */
  ventCount?: number;
  /** 0–100 from the pressure slider, when they moved it. */
  pressure?: number | null;
}

export interface DepthVerdict {
  depth: Depth;
  /** Why, in words, for `/api/health` and the response. Never shown as jargon. */
  reason: string;
}

/**
 * The heavy turns: one layer under the crisis list (`edge`), or loss and harm
 * (`grave`). `assess.ts` reads them as the `high` and `moderate` risk tiers, the
 * depth router spends the best model on them, and the tactic and question
 * selectors hold back what a person there should not be asked for. One reading,
 * three consumers, so they cannot disagree about who is at the edge.
 */
export function heaviness(message: string): "edge" | "grave" | null {
  const text = plainText(message).toLowerCase();
  if (EDGE.some((r) => r.test(text))) return "edge";
  if (GRAVE.some((r) => r.test(text))) return "grave";
  return null;
}

/**
 * Decide. Free paths never reach here — they have already been answered.
 */
export function depthFor(ctx: DepthContext): DepthVerdict {
  const text = ctx.message.toLowerCase();

  // Crisis is answered locally and never sent to a model at all. If one ever
  // reaches this function, something upstream changed and the only safe
  // reading is the most serious one.
  if (ctx.classification.intent === "crisis") {
    return { depth: "deep", reason: "crisis" };
  }

  const heavy = heaviness(ctx.message);
  if (heavy) return { depth: "deep", reason: heavy };
  if (IRREVERSIBLE.some((r) => r.test(text))) {
    return { depth: "deep", reason: "irreversible" };
  }

  // Somebody still typing at turn eight is not having a light evening, and a
  // long message is usually a person who finally decided to say the whole
  // thing. Both are cheap signals and both are worth the better model.
  if ((ctx.ventCount ?? 0) >= 6) return { depth: "deep", reason: "long_session" };
  if (ctx.message.trim().split(/\s+/).length >= 90) {
    return { depth: "deep", reason: "long_message" };
  }
  if ((ctx.pressure ?? 0) >= 90) return { depth: "deep", reason: "pressure" };

  return { depth: "fast", reason: "ordinary" };
}

/**
 * What the person is told, and only when it is true.
 *
 * The commandment asks for "God Mode Active" so somebody can see the product
 * fighting for them. That is worth showing and it is worth showing *honestly*:
 * this returns null on the fast path rather than a second label, because a
 * badge that is always on is decoration, and one that lies about which model
 * answered is the same class of failure as a receipt for a message that was
 * never saved.
 *
 * It is also never shown on a crisis turn. Somebody being handed a helpline
 * does not need a banner about infrastructure.
 */
export function depthBadge(v: DepthVerdict): string | null {
  if (v.depth !== "deep" || v.reason === "crisis") return null;
  return "Deep mode — taking this one slowly.";
}
