import type { PageMockup } from "@/lib/generate/types";

/* ==========================================================================
   THE SNAPSHOT MINUS THE PAGES AN OPERATOR HID.

   LIFTED OUT OF `LibraryScreen` SO IT CAN BE TESTED, and it needed testing:
   the flag had tests at the database layer — `pagesUsed`, `setPageHidden`,
   the per-page flags — and none at all here, which is the only place that
   decides what a merchant actually sees.

   MATCHED BY ID AGAINST THE PAGE ROWS, because that is where the flag lives.
   The snapshot is a blob written at build time and knows nothing about it.

   A PAGE WITH NO ROW IS KEPT. An unknown page is not a hidden one, and
   dropping it would lose work over a bookkeeping gap.
   ========================================================================== */

export type PageRow = { pageId: string; hidden: boolean };

/**
 * @param snapshot the run's saved pages, or null when it has none worth using
 * @param rows     the page rows, which carry the flag
 * @param admin    an operator is looking, so hidden pages are drawn — marked —
 *                 rather than dropped. Nobody can unhide what has vanished
 *                 from their own screen.
 *
 * NULL AND EMPTY ARE DIFFERENT ANSWERS, and conflating them was a bug that
 * did the opposite of what the button says. `null` means "this run has no
 * usable snapshot", and the Library answers that by REBUILDING the deck from
 * the brief — a model call that invents new copy and a new design. An empty
 * array means "the snapshot was read and everything in it is hidden", which
 * must draw nothing at all.
 *
 * Returning `null` for the second case made hiding every page of a run
 * regenerate it: the merchant saw pages nobody had approved, in place of the
 * ones that were supposed to have disappeared.
 */
export function hideFrom(
  snapshot: PageMockup[] | null,
  rows: readonly PageRow[],
  admin: boolean,
): PageMockup[] | null {
  if (admin || !snapshot) return snapshot;
  const hidden = new Set(rows.filter((p) => p.hidden).map((p) => p.pageId));
  if (hidden.size === 0) return snapshot;
  return snapshot.filter((p) => !hidden.has(p.id));
}
