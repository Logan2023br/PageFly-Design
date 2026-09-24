/* ==========================================================================
   HOW MANY CARDS THE LIBRARY DRAWS BEFORE IT IS ASKED FOR MORE.

   A card is not a thumbnail. `MockupPage` hands the page's own document to an
   `<iframe>`, which parses a couple of hundred kilobytes and then fetches that
   page's fonts and photographs on its own account. One store had forty-seven,
   and an operator opening it waited for all of them.

   NOT A SCROLL LISTENER. A button is a thing a reader decides to press; an
   infinite scroll loads pages nobody asked for, which is the same cost with
   the decision taken away. It also gives the count somewhere to live — "39
   more" is the number that says whether pressing is worth it.
   ========================================================================== */

/** What the list opens on. */
export const FIRST_BATCH = 8;

/** What each press adds. */
export const STEP = 8;

/**
 * How many are still hidden.
 *
 * Zero means no button — including for a list of exactly `FIRST_BATCH`, where
 * a button that reveals nothing is worse than none, and for a `shown` that has
 * run past the end, which must not come back as a negative.
 */
export function moreAfter(total: number, shown: number): number {
  return Math.max(0, total - shown);
}

/** The new count after one press, never past the end. */
export function shownAfter(total: number, shown: number): number {
  return Math.min(total, shown + STEP);
}
