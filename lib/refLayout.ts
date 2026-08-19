/* ==========================================================================
   Layout fingerprints read off a reference screenshot.

   A reference image is a DESIGN reference: a picture of a page whose structure
   the merchant wants. So the useful information in it is not its pixels — it is
   its shape. This module holds the fingerprint type and the pure logic that
   turns fingerprints into generation hints.

   The extraction itself needs a canvas and lives in lib/imageAnalysis.ts.
   Nothing here touches the DOM, so the server-side generator can import it.

   HONEST LIMITS. This is signal processing on a screenshot, not vision. It can
   see horizontal section rhythm, how dark each section is, how many columns a
   grid runs, how text-heavy a section is and how tightly packed the page is.
   It cannot read words, identify a font, tell a testimonial from an FAQ, or
   understand hierarchy. Everything below is a structural hint; the recipe still
   decides what a Product page contains.
   ========================================================================== */

export type RefBandKind = "media" | "grid" | "text" | "strip";

export type RefBand = {
  /** share of the page's height, 0..1 */
  height: number;
  /** mean lightness, 0..1 */
  lightness: number;
  /** repeating columns detected inside the band; 1 means full width */
  columns: number;
  kind: RefBandKind;
};

export type LayoutFingerprint = {
  bands: RefBand[];
  /** fraction of rows carrying content rather than empty space */
  density: number;
  /** whole-image mean lightness */
  lightness: number;
  /** does the page alternate light and dark sections? */
  alternating: boolean;
};

/* ==========================================================================
   Hints: what the generator is allowed to take from the reference.
   ========================================================================== */

export type RefHints = {
  /** columns for product grids and feature rows */
  gridColumns: number | null;
  /** hero arrangement implied by the first band */
  heroLayout: "fullBleed" | "centered" | "split" | null;
  /** spacing pressure */
  density: "airy" | "normal" | "tight" | null;
  /** how many sections the reference actually has */
  sectionCount: number | null;
  /** force strict light/dark banding */
  alternating: boolean;
  /** reference is a dark design */
  dark: boolean | null;
  /** true when at least one reference produced a usable fingerprint */
  present: boolean;
};

export const NO_HINTS: RefHints = {
  gridColumns: null,
  heroLayout: null,
  density: null,
  sectionCount: null,
  alternating: false,
  dark: null,
  present: false,
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Fold every reference's fingerprint into one set of hints.
 *
 * Several references are treated as several votes rather than a sequence: a
 * merchant who uploads three screenshots is showing a taste, not asking for
 * the three to be concatenated.
 */
export function layoutToHints(
  fingerprints: (LayoutFingerprint | null | undefined)[],
): RefHints {
  const fps = fingerprints.filter((f): f is LayoutFingerprint =>
    Boolean(f && f.bands.length > 0),
  );
  if (fps.length === 0) return NO_HINTS;

  /* ---- grid columns ----------------------------------------------------
     Votes are weighted by how much of the page each grid band occupies, not
     counted. A reference with one 4-up grid across a quarter of the page and
     one 3-up strip below it is a 4-up design; plain counting ties at one vote
     each and then silently picks the smaller number. */
  const columnWeight = new Map<number, number>();
  for (const f of fps) {
    for (const b of f.bands) {
      if (b.columns < 2) continue;
      columnWeight.set(b.columns, (columnWeight.get(b.columns) ?? 0) + b.height);
    }
  }
  const gridColumns =
    columnWeight.size === 0
      ? null
      : [...columnWeight.entries()].sort(
          (a, b) => b[1] - a[1] || b[0] - a[0],
        )[0][0];

  /* ---- hero: the first substantial band OF THE FIRST UPLOAD -------------
​
     Of the first upload only, which used to be every upload averaged together.
     A merchant who screenshots a page in seven passes while scrolling hands over
     seven images whose first band is, in six cases, whatever section happened to
     start that screenshot — so the hero was read as the mean of one real hero and
     six mid-page bands, and came out `centered` on a page with a full-bleed one.

     There is only ever one hero, and it is at the top of the first thing they
     uploaded. Averaging was never right; it only looked harmless while the common
     case was a single upload. */
  const lead = fps[0];
  const heroBand = lead.bands.find((b) => b.height > 0.06) ?? lead.bands[0];

  const heroHeight = heroBand?.height ?? 0;
  const mediaLed = heroBand?.kind === "media";

  let heroLayout: RefHints["heroLayout"] = null;
  if (mediaLed && heroHeight > 0.22) heroLayout = "fullBleed";
  else if (heroHeight > 0.14) heroLayout = "split";
  else if (heroHeight > 0) heroLayout = "centered";

  /* ---- density --------------------------------------------------------- */
  const d = mean(fps.map((f) => f.density)) ?? 0.5;
  const density: RefHints["density"] =
    d > 0.78 ? "tight" : d < 0.52 ? "airy" : "normal";

  /* ---- section count: median, so one odd screenshot doesn't dominate --- */
  const counts = fps.map((f) => f.bands.length).sort((a, b) => a - b);
  const sectionCount = counts[Math.floor(counts.length / 2)];

  const lightness = mean(fps.map((f) => f.lightness)) ?? 0.5;

  return {
    gridColumns:
      gridColumns === null ? null : Math.max(2, Math.min(4, gridColumns)),
    heroLayout,
    density,
    sectionCount,
    alternating: fps.filter((f) => f.alternating).length > fps.length / 2,
    dark: lightness < 0.45,
    present: true,
  };
}

/**
 * Trim a block sequence so the generated page runs to roughly as many sections
 * as the reference does.
 *
 * Only `droppable` blocks can go. Everything else is structural: a Product page
 * without its product detail is not a shorter Product page, it is a broken one.
 * Trimming takes from the END of the droppable list, because supporting
 * sections earn their place in the order the recipe put them.
 */
export function fitRecipeToSections<T extends string>(
  recipe: T[],
  sectionCount: number | null,
  droppable: readonly T[],
): T[] {
  if (sectionCount === null) return recipe;

  /* A screenshot usually captures the top of a page rather than all of it, so
     the count is a floor, not a target — and we only trim when the gap is
     decisive, never by one or two. */
  const target = Math.max(sectionCount, 5);
  if (recipe.length <= target + 1) return recipe;

  let toDrop = recipe.length - target;
  const dropIndices = new Set<number>();
  for (let i = recipe.length - 1; i >= 0 && toDrop > 0; i--) {
    if (droppable.includes(recipe[i])) {
      dropIndices.add(i);
      toDrop--;
    }
  }
  return recipe.filter((_, i) => !dropIndices.has(i));
}
