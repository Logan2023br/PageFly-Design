/* ==========================================================================
   PAGING A TABLE, AND THE ARITHMETIC THAT HAS TO BE RIGHT.

   The Users table drew every store it had — 1,506 rows, each with a progress
   bar, a status pill and three buttons. Every rule here exists because a pager
   can be wrong while looking entirely reasonable.

   A PAGE THAT NO LONGER EXISTS is the one that matters. An operator on page 40
   types a search that matches eleven stores; page 40 of one is an empty table
   under a filter that DID find something, which reads as "no results" — an
   answer indistinguishable from the true one. `clampPage` is called on every
   render, not on the change, because the list can shrink from a search, a
   sort, a delete, or a sync, and only one of those is a place to hook.
   ========================================================================== */

/** What an operator can pick, smallest first. */
export const PAGE_SIZES = [25, 50, 100, 250] as const;

/** Twenty-five rows is about a screen, and a screen is the unit of a table. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * How many pages the list fills.
 *
 * NEVER ZERO. An empty table still has a page one — `clampPage` divides by
 * this, and a table showing "page 1 of 0" is a table that has already gone
 * wrong somewhere else.
 */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, size)));
}

/** The page actually shown: what was asked for, brought inside the list. */
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), pageCount(total, size));
}

/**
 * The rows on this page, counted from one, for the label beside the pager.
 *
 * `{from: 0, to: 0}` for an empty list: "Showing 1–0 of 0" is arithmetic
 * nobody can read, and 0–0 at least says nothing is there.
 */
export function shownRange(
  page: number,
  size: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const p = clampPage(page, total, size);
  const from = (p - 1) * size + 1;
  return { from, to: Math.min(total, p * size) };
}
