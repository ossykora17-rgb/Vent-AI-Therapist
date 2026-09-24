/**
 * Who this room is for, stated once.
 *
 * WHAT THIS IS, AND — MORE IMPORTANTLY — WHAT IT IS NOT
 *
 * This repository has a rule about exactly this object: *"Governance is
 * enforced on the server. `checkMessage()` runs where the message is written,
 * because curl walks around a greyed-out button. The UI mirrors the rules for
 * kindness, never for safety."*
 *
 * An age gate cannot be enforced on the server, because the server has no way
 * to learn anybody's age. There is no account here, no identity, no document —
 * the whole product runs on an id a browser made up. So by this repository's
 * own rule this is a **mirror with nothing behind it**, and saying so in the
 * module is the difference between a disclosure and a lie. It is a liability
 * posture and a statement of intent. It is not a child-safety control, it stops
 * nobody who wants to walk past it, and nothing downstream may be written as
 * though a person on the other side of it has been verified.
 *
 * WHY IT EXISTS ANYWAY
 *
 * Because the statement is true and somebody deserves to read it before they
 * write the worst sentence of their week into a machine. A room that has never
 * said out loud who it is built for has not declined anybody; it has just never
 * been asked.
 *
 * THE NUMBER IS A DEFAULT, NOT A LEGAL FINDING
 *
 * Eighteen because it is the strictest ordinary answer, which means a lawyer
 * can only ever loosen it — and a gate that has to be *tightened* later has
 * already shipped to the people it should not have. Nobody here read a statute
 * to pick it. If a jurisdiction, an app store or counsel names a different age,
 * this constant is the only edit.
 *
 * WHAT IT MUST NEVER COST
 *
 * The crisis path. Somebody turned away by this screen is, by construction,
 * more likely than average to be a teenager at 2am who has just typed something
 * they have not said to anybody — and a wall with no phone number on it hands
 * them nothing and closes. So the refusal carries the same lines the room does,
 * and `/memory`, `/history`, `/privacy` and `/terms` are never behind it:
 * deleting what this product holds about you cannot require confirming your age
 * to the thing you are deleting it from.
 */

/** The floor. One constant, so a change is one edit and one diff. */
export const MIN_AGE = 18;

/**
 * Where the acknowledgement lives, and it lives on the device on purpose.
 *
 * Beside `mw-anon-id` and `mw-alliance` rather than in a column, because a row
 * would be a new thing this product keeps about somebody — on a front page that
 * promises one tap deletes everything — in order to record that they tapped a
 * button about a rule nothing can verify. The wipe clears it with the rest, so
 * the promise stays literally true and whoever comes back is asked again, which
 * is correct: for all the room knows they are somebody else.
 */
export const AGE_KEY = "mw-age-ok";

/*
  THE FLAG AS AN EXTERNAL STORE, AND WHY IT IS NOT A `useEffect`

  The first version read storage in an effect and called `setState` from it,
  which is a real lint warning and a real extra render — and worse, it put the
  *cache* in a component while the *wipe* removed the key somewhere else. Two
  writers and one of them invisible to the other: navigate from the wipe to the
  room inside the same session and the gate would have stayed cleared off a
  memory the wipe could not reach. That is the shape this repository records
  under `setCarve` and `circle_members` — a promise kept in one place and
  walked around in another.

  So the flag lives here, once, with everything that touches it: the read, the
  cache, the write and the forget. The component subscribes; the wipe calls
  `forgetAge`. There is no second path to the key.

  It is also what makes this testable at all. A React component is not
  importable by the eval suite; this is, so check 150 runs the real confirm and
  the real forget against a stubbed `localStorage` instead of grepping a file
  for the shape of them.
*/

/** `null` until the client has looked. The server never can. */
let cached: boolean | null = null;
const listeners = new Set<() => void>();

/** What the browser says, and a blocked read is not an answer. */
function readFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(AGE_KEY) === "1";
  } catch {
    /*
      Private mode, blocked site data, a thumbnail capture. Asking again is a
      smaller failure than never asking, and the failure is bounded: the screen
      it falls back to carries the crisis lines, so the worst case still hands
      somebody a number.
    */
    return false;
  }
}

/** React's subscribe half. Returns the unsubscriber it is given. */
export function subscribeAge(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** What the client sees: the flag, read once and remembered. */
export function ageSnapshot(): boolean {
  if (cached === null) cached = readFlag();
  return cached;
}

/**
 * What the server sees: nothing, which is the honest answer and not a default.
 *
 * `false` would be a lie in the one direction that costs something — it renders
 * the gate into the HTML, so every returning person is shown the screen this
 * product least wants to show twice, for one frame, on every navigation. `null`
 * renders nothing until the client has actually looked.
 */
export function ageServerSnapshot(): null {
  return null;
}

/** They tapped it. Storage and memory move together or not at all. */
export function confirmAge(): void {
  try {
    globalThis.localStorage?.setItem(AGE_KEY, "1");
  } catch {
    /*
      Storage blocked. The session still opens — refusing the room because a
      browser will not remember a tap punishes somebody for their privacy
      settings, and the flag is a courtesy rather than a credential.
    */
  }
  cached = true;
  for (const cb of listeners) cb();
}

/** The wipe's half, so "everything" means everything. */
export function forgetAge(): void {
  try {
    globalThis.localStorage?.removeItem(AGE_KEY);
  } catch {
    /* ignore */
  }
  cached = false;
  for (const cb of listeners) cb();
}

/**
 * What the screen says.
 *
 * Here rather than in the component for check 81's reason — no sentence a
 * person reads may live in two files — and because the suite can import this
 * and cannot import a client component's JSX.
 */
export const AGE_HEADLINE = "This room is for adults.";

export const AGE_BODY = `Mind Weave VENT is an AI — not a person, and not a licensed therapist. It is built for people ${MIN_AGE} and over, and nothing in it replaces care from somebody qualified to give it.`;

export const AGE_CONFIRM = `I am ${MIN_AGE} or over`;
export const AGE_DECLINE = `I am under ${MIN_AGE}`;

/**
 * The refusal, and it is held to the same test as every other refusal here.
 *
 * *"Read a refusal message and ask whether it is true."* The worst bug this
 * product shipped was a refusal reading "Your turn comes" to people whose turn
 * could never come. This one is true — the room really is not built for them —
 * and true is not sufficient on its own, because a true sentence that ends the
 * conversation is still a door onto nothing.
 *
 * So it does not pretend the feeling is smaller than it is, and it does not
 * end here: the lines render underneath it, tappable, the same two numbers the
 * room carries on every screen.
 */
export const AGE_TURNED_AWAY_HEADLINE = "Then this is not your room — but you are not out of options.";

export const AGE_TURNED_AWAY_BODY =
  "What you are carrying is real whatever your age. It deserves somebody trained for it rather than a machine that is not. These lines are answered by people, they are free, and they are open now.";

/** Something to do that is not a phone call, for whoever will not make one. */
export const AGE_TURNED_AWAY_ALSO =
  "If calling is too much tonight, tell one adult you trust — a parent, a teacher, an older sibling, anybody. Saying it out loud once is the whole first step.";
