/* ==========================================================================
   A COLOUR PER MERCHANT, INSIDE ONE FAMILY.

   The corner card shows one store at a time. Before this, every card was the
   same: a grey disc on a navy panel one shade off the page behind it, which is
   what "no colour was chosen" looks like. A card with nothing of its own also
   makes the SEQUENCE invisible — three merchants in a row read as one card
   redrawing itself rather than three different stores.

   So the name picks the colour. Two constraints decide the shape of this file:

   IT IS A LIST, NOT ARITHMETIC. Deriving a hue from a hash gives every value
   between 0 and 360, and a page with one accent family cannot afford a
   merchant who lands on lime. Five stops, hand-picked along the violet arc,
   and the hash only chooses among them.

   IT IS NOT RANDOM. A card already on screen must not change colour because
   React drew it again, and the same store should look like the same store on
   the next visit. `Math.random` in a render is also the exact lint this
   component was already corrected for once.
   ========================================================================== */

export type Tint = { from: string; to: string };

/**
 * Five stops, ~22 degrees apart, from periwinkle to plum.
 *
 * SPACING IS THE WHOLE JOB. An earlier draft had two stops at 256 and 258
 * degrees: two rows here, one colour on screen, and three merchants in a row
 * looking like one card being redrawn. The gap is asserted, not eyeballed.
 */
export const TINTS: readonly Tint[] = [
  { from: "#3f5ae8", to: "#8496ff" }, // 230  periwinkle
  { from: "#6b2ff7", to: "#9a6bff" }, // 258  the brand violet
  { from: "#9333d6", to: "#c98cff" }, // 275  purple
  { from: "#c235c0", to: "#e98ce7" }, // 301  orchid
  { from: "#b82b8a", to: "#ef8ace" }, // 320  plum
];

/**
 * FNV-1a over the whole string.
 *
 * OVER THE WHOLE STRING is the point. Every name reaching this function has
 * been through `mask()`, so they are all four characters and a tail — anything
 * that reads only the length, or only the tail, returns one answer for the
 * entire feed.
 */
export function tintFor(name: string): Tint {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return TINTS[h % TINTS.length];
}
