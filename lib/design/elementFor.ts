import "server-only";

/* ==========================================================================
   Which PageFly element a pattern is really about.

   Training sections are filed by ELEMENT NAME, because that is the platform's
   own vocabulary and the thing the exporter emits. The resolver works in
   PATTERN ids, because that is the design vocabulary. This is the join, and it
   is a table rather than a guess for the same reason `PINNED` is a table: the
   mapping is a fact about the pattern library, and a fact belongs written down
   where it can be read.

   Only the patterns whose whole point IS an element are listed. `story-band` is
   a heading and two paragraphs; there is no element to file a reference for, and
   a training entry keyed on `FlexBlock` would apply to two thirds of every page
   ever built — which is the same as applying to nothing.
   ========================================================================== */

const BY_PATTERN: Record<string, string> = {
  /* the product itself */
  "product-detail-gallery": "ProductBox",
  "product-detail-wide": "ProductBox",
  "hero-product-lead": "ProductBox",

  /* the store's products */
  "collection-grid-3up": "ProductList2",
  "collection-grid-4up": "ProductList2",
  "collection-featured-row": "ProductList2",
  "collection-carousel": "ProductList2",

  /* repeating cards */
  "whats-inside-grid": "ContentList2",
  "spec-grid-4x2": "ContentList2",
  "stat-strip-3up": "ContentList2",
  "spec-bars": "ContentList2",
  "usecase-tiles-overlay": "ContentList2",
  "social-proof-wall": "ContentList2",
  "certification-logo-row": "ContentList2",
  "guarantee-row": "ContentList2",
  "ingredient-list": "ContentList2",
  "process-steps": "ContentList2",
  "routine-steps": "ContentList2",

  /* elements with behaviour of their own */
  "faq-accordion": "Accordion3",
  "lead-form-split": "Form2",
  "newsletter-inline": "Form2",
  "before-after-pair": "ImageComparison",
  "comparison-table": "Table2",
  "plan-comparison": "Table2",
  "size-fit-guide": "Table2",
  "lookbook-strip": "Slideshow",
  "gallery-masonry-3": "ContentList2",
};

export function elementForPattern(pattern: string): string | null {
  return BY_PATTERN[pattern] ?? null;
}
