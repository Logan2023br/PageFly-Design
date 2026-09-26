/* ==========================================================================
   HIDING A PAGE MUST HIDE IT — NOT REBUILD THE DECK.

       npx tsx scripts/test-hidden-library.ts

   REPORTED: "ở admin tôi đổi cho thành hidden sao ở bên client nó không xoá
   hoặc ẩn đi mà show bản gì kì" — an operator hid pages and the merchant's
   Library, instead of dropping them, showed pages that looked like nothing
   anyone had approved.

   THE FLAG WAS TESTED AND THIS WAS NOT. `test-hidden-pages.ts` covers the
   database layer — `setPageHidden`, `pagesUsed`, the per-page flags — and all
   of it passes. `hideFrom` is the only place that decides what a MERCHANT
   sees, and it had no test at all.

   THE FAILURE IS A CONFLATION OF NULL AND EMPTY. `loadLibrary` reads a null
   snapshot as "this run has nothing saved" and answers it by REGENERATING the
   deck from the brief — a model call that writes new copy and a new design.
   `hideFrom` returned null when every page was hidden. So hiding a whole run
   did not hide it; it replaced it with pages nobody had ever seen.

   Nothing failed while it did this. The Library filled, the cards rendered,
   the export worked. It was simply showing a different deck.
   ========================================================================== */

import { hideFrom, type PageRow } from "../components/library/hidePages";
import type { PageMockup } from "../lib/generate/types";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

/* Only `id` is read; the rest of a PageMockup is irrelevant here. */
const page = (id: string) => ({ id }) as PageMockup;
const SNAP = [page("p-home"), page("p-product"), page("p-about")];

const rows = (...hiddenIds: string[]): PageRow[] =>
  SNAP.map((p) => ({ pageId: p.id, hidden: hiddenIds.includes(p.id) }));

head("nothing hidden");
ok("the deck is untouched", hideFrom(SNAP, rows(), false)?.length === 3);
ok(
  "and it is the same array, not a copy",
  hideFrom(SNAP, rows(), false) === SNAP,
  "a needless copy would remount every card on every render",
);

head("one page hidden");
const one = hideFrom(SNAP, rows("p-product"), false);
ok("two are left", one?.length === 2, String(one?.length));
ok(
  "and the hidden one is the one missing",
  !one?.some((p) => p.id === "p-product"),
  one?.map((p) => p.id).join(","),
);

head("EVERY page hidden — the reported bug");
const all = hideFrom(SNAP, rows("p-home", "p-product", "p-about"), false);
/* THE WHOLE POINT. `null` here means "no usable snapshot", and the Library
   answers that by rebuilding the deck with a model call. The merchant then
   sees brand-new pages in place of the ones that were meant to vanish. */
ok(
  "IT IS NOT NULL",
  all !== null,
  "null makes the Library regenerate the deck — the reported symptom",
);
ok("it is an empty deck", Array.isArray(all) && all.length === 0, JSON.stringify(all));

head("an operator is looking");
ok(
  "hidden pages are still drawn, so they can be un-hidden",
  hideFrom(SNAP, rows("p-home"), true)?.length === 3,
  "nobody can unhide what has vanished from their own screen",
);

head("a page with no row");
/* A bookkeeping gap must not lose work. */
const partial = hideFrom(SNAP, [{ pageId: "p-home", hidden: true }], false);
ok("the unknown pages are kept", partial?.length === 2, partial?.map((p) => p.id).join(","));

head("no snapshot at all");
ok(
  "null passes straight through — this IS the rebuild case",
  hideFrom(null, rows("p-home"), false) === null,
  "a run with nothing saved is the one case that should regenerate",
);

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
