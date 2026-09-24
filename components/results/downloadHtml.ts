import type { PageMockup } from "@/lib/generate/types";

/* ==========================================================================
   THE MOCKUP'S OWN DOCUMENT, FOR AN OPERATOR.

   The admin can take the HTML a page was built as — the document every later
   step is derived from, and the only thing that says what the export was
   supposed to produce. Nothing here is offered to a merchant; see
   `adminView.tsx` for the gate and `CardActions` for where it is drawn.
   ========================================================================== */

/**
 * The document this page carries, or null when it has none.
 *
 * NULL IS A REAL ANSWER. A deck restored from the database is `unknown` until
 * it is checked, and a page whose `design.html` is missing or blank would hand
 * over a zero-byte file named like a real one — which reads as a broken export
 * rather than as a page that never had HTML. No document, no button.
 */
export function htmlOfPage(page: PageMockup): string | null {
  const html = page.design?.html;
  return typeof html === "string" && html.trim() !== "" ? html : null;
}

/** `Home.html`, `Product-2.html` — the name the operator sees. */
export function htmlFileName(page: PageMockup): string {
  const base = (page.label || page.pageType || "page").trim();
  /* The characters a filesystem refuses. A label is merchant-facing text and
     has no reason to be a legal filename. */
  const stem = base.replace(/[\\/:*?"<>|]+/g, "-") || "page";
  /* One of one is not a copy, and numbering it suggests there are others. */
  const suffix = page.copyTotal && page.copyTotal > 1 ? `-${page.copyIndex}` : "";
  return `${stem}${suffix}.html`;
}
