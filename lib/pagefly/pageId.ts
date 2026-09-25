/* ==========================================================================
   THE LIBRARY RENAMES EVERY PAGE.

   `loadLibrary` gives each page `${runId}::${page.id}` so that two runs
   holding the same page cannot collide in one flat list. Everything drawn from
   the Library therefore carries the prefixed id — and everything written when
   the deck was BUILT carries the plain one.

   Two readers were on the wrong side of that. `prebuild` files a built
   `.pagefly` under `keyForHtml(page.id, html)` with the plain id and the
   Library asked with the prefixed one, so the key never matched and every
   export from the Library or the admin paid for a fresh two-minute conversion
   — including the second click on the same page. And the hide button's lookup
   is keyed by the page rows, which hold the plain id, so it simply did not
   render.

   Neither could fail loudly: a cache miss is a slow success, and a button that
   does not appear looks like one that was never built.

   IT READS `runId`, NOT `::`. The store's own note says that field exists so
   nobody has to split on the separator — which would rename a page whose id
   happens to contain one, or one prefixed by a different run.
   ========================================================================== */

/** The page's own id, whatever list it arrived in. */
export function ownPageId(page: { id: string; runId?: string }): string {
  if (!page.runId) return page.id;
  const prefix = `${page.runId}::`;
  return page.id.startsWith(prefix) ? page.id.slice(prefix.length) : page.id;
}
