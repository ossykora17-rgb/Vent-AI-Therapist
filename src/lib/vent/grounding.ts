/**
 * Real-time grounding. Injected at the top of every AI call.
 *
 * The failure this fixes: user asks "what's today's date?" and a model with no
 * clock reframes it as therapy ("said what's heavy") — which instantly tells
 * the user they are talking to a machine. VENT knows the date.
 */

export const TIMEZONE = "Africa/Lagos";
export const LOCALE = "en-NG";

export interface Grounding {
  date: string;
  time: string;
  iso: string;
  weekday: string;
  hour: number;
  block: "morning" | "afternoon" | "evening" | "night";
}

export function groundNow(now: Date = new Date()): Grounding {
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TIMEZONE,
  });
  const time = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIMEZONE,
  });
  const weekday = now.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: TIMEZONE,
  });

  // Read the hour in Lagos, not in whatever region the server happens to run.
  const hour = Number(
    now.toLocaleString("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: TIMEZONE,
    }),
  );

  const block =
    hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";

  return { date, time, iso: now.toISOString(), weekday, hour, block };
}

/** The literal block prepended to every system prompt. */
export function groundingBlock(g: Grounding): string {
  return `REAL TIME GROUNDING — YOU ARE IN THE SAME MOMENT AS THE USER.
Current date: ${g.date}
Current time: ${g.time} WAT (Africa/Lagos, UTC+1)
ISO: ${g.iso}
Location: Nigeria

You know the date and time exactly. If the user asks what day it is, what the
time is, who you are, or where they are — answer directly from the values
above, in one or two sentences. Do not reframe it as feeling. Do not say
"that sounds heavy". Say the date.`;
}

/**
 * Answers a bare factual question locally — no model call, no tokens spent.
 *
 * In the register they asked in. Every line here used to end in Pidgin
 * whoever asked — "anything about today wey dey tight?" to somebody who wrote
 * "what's the time" — which is the direction this product counts as worse: a
 * Pidgin speaker can read English, and somebody who wrote in English may not
 * read Pidgin at all. The Pidgin lines are the old ones, unchanged.
 *
 * "Who are you" is not answered here any more. It is the question the spec
 * answers, and `localReply` answers it in both registers, without the clock.
 */
export function answerFactual(message: string, g: Grounding, pidgin = false): string | null {
  const m = message.toLowerCase();

  if (/\b(where am i|which place|where are we)\b/.test(m)) {
    return pidgin
      ? `You're in VENT, and by the clock I'm reading you're on Nigeria time — ${g.time} WAT. Anything about today wey dey tight?`
      : `You're in VENT, on Nigeria time — ${g.time} WAT. Anything about today pressing on you?`;
  }
  if (/\b(time|clock)\b/.test(m) && !/\b(long time|time and again|every time)\b/.test(m)) {
    return pidgin
      ? `${g.time} WAT, on ${g.date}. You keeping track — anything about today wey dey press you?`
      : `${g.time} WAT, on ${g.date}. Anything about today pressing on you?`;
  }
  if (/\b(date|day|today|what day)\b/.test(m)) {
    return pidgin
      ? `Today is ${g.date}. ${g.time} WAT. You keeping track — anything about today wey dey tight?`
      : `Today is ${g.date}, ${g.time} WAT. Anything about today pressing on you?`;
  }
  return null;
}
