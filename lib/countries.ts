/* ==========================================================================
   TWO LETTERS, SHOWN AS SOMETHING A PERSON CAN READ.

   NO TABLE OF COUNTRY NAMES IN THIS REPOSITORY, and that is the point of the
   file. A hand-written list of 250 names is 250 chances to misspell one, it is
   only ever in English, and it goes stale — countries are renamed, and the one
   thing worse than a missing name is a wrong one on a screen somebody is making
   decisions from. `Intl.DisplayNames` is in every browser and in Node, it is
   maintained by people whose job that is, and it answers in the reader's own
   language for free.

   THE FLAG IS ARITHMETIC, NOT AN IMAGE. Every regional-indicator letter sits at
   a fixed offset from its ASCII letter, so a two-letter code maps to its flag
   with a subtraction — no sprite sheet, no network request, no licence, and
   nothing to keep in sync with the code list. Linux desktops without an emoji
   flag font render the two letters instead, which is exactly the fallback
   anybody would have chosen.
   ========================================================================== */

/** `VN` → 🇻🇳. Anything that is not two letters comes back empty. */
export function flagOf(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  /* 0x1F1E6 is REGIONAL INDICATOR SYMBOL LETTER A, and 65 is "A". */
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/* Built once. `Intl.DisplayNames` is not free to construct and this is called
   per row of a three-hundred-row feed. */
let names: Intl.DisplayNames | null | undefined;

function displayNames(): Intl.DisplayNames | null {
  if (names !== undefined) return names;
  try {
    names = new Intl.DisplayNames(undefined, { type: "region" });
  } catch {
    /* An engine without the region data. The code itself is still a fine label
       and nothing on the screen breaks. */
    names = null;
  }
  return names;
}

/** `VN` → "Vietnam", in the reader's language. Falls back to the code. */
export function countryName(code: string | null): string {
  if (!code) return "Unplaced";
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return c;
  try {
    return displayNames()?.of(c) ?? c;
  } catch {
    return c;
  }
}

/**
 * How a country reads on a chip: flag, then name.
 *
 * `null` is "Unplaced" rather than blank — see the note on `unknown` in
 * `lib/db/types.ts`. A remainder with no name is a remainder nobody can ask
 * about, and "how much of this could we not place" is a fair question about
 * any geographic breakdown.
 */
export function countryLabel(code: string | null): string {
  if (!code) return "Unplaced";
  const flag = flagOf(code);
  return flag ? `${flag} ${countryName(code)}` : countryName(code);
}
