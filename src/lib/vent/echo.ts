/**
 * Did the reply use one of their own words?
 *
 * Not a similarity score, and deliberately not one. The rule the office
 * contract actually states is "use their own words back to them", and the
 * cheapest honest test of it is whether a single uncommon word survived the
 * round trip.
 *
 * Its own module because three things need it and one of them is `quality.ts`:
 * this lived in `audit.ts`, which imports the grader, so the grader could not
 * import back without a cycle. A rule used by the live failsafe, the nightly
 * audit and the offline golden set has to sit under all three.
 */

/*
  Words everybody uses. A reply echoing "really" is not echoing anybody.
  Pidgin function words are in here too — "dey", "na", "wey" are the grammar
  of the sentence, not the thing somebody came to say.
*/
const COMMON =
  /^(the|and|that|with|from|about|because|would|there|this|have|been|they|them|your|what|when|will|just|like|really|very|dey|na|wey|abi|make|una|don|still|even|much|more|some|than|then|only|into|over|after|before|being|which|while|these|those|their|other|could|should|might|every|thing|things|feel|feels|felt)$/i;

export function echoesThem(message: string, reply: string): boolean {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z']+/i)
        .filter((w) => w.length >= 5 && !COMMON.test(w)),
    );
  const theirs = words(message);
  if (theirs.size === 0) return true; // Nothing distinctive to echo.
  for (const w of words(reply)) if (theirs.has(w)) return true;
  return false;
}

