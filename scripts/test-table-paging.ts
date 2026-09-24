/* ==========================================================================
   FIFTEEN HUNDRED ROWS, AND THE FOUR WAYS A PAGER LIES.

       npx tsx scripts/test-table-paging.ts

   The Users table drew every store it had — 1,506 rows, each with a progress
   bar, a status pill and three buttons. This pages it, and every rule below is
   a way for a pager to be wrong while looking fine:

     A PAGE THAT NO LONGER EXISTS. An operator on page 40 types a search that
     matches eleven stores. Page 40 of one is an empty table under a filter that
     found something, which reads as "no results" — the worst possible answer,
     because it is indistinguishable from the true one.

     THE SAME ON A BIGGER PAGE SIZE. Switching 25 → 250 divides the page count
     by ten and strands the same way.

     AN OFF-BY-ONE IN THE LABEL. "Showing 1–25 of 1,506" is read as a promise
     about what is on screen; 0–25, or 26–50 on a page holding 25, is a number
     nobody can check but everybody half-trusts.

     AND AN EMPTY LIST IS NOT PAGE ZERO. A table with nothing in it still has
     one page, or `clamp` divides by it.
   ========================================================================== */

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  clampPage,
  pageCount,
  shownRange,
} from "../components/admin/tablePaging";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

head("the default is twenty-five");
ok("DEFAULT_PAGE_SIZE", DEFAULT_PAGE_SIZE === 25, String(DEFAULT_PAGE_SIZE));
ok("and it is one of the choices", PAGE_SIZES.includes(DEFAULT_PAGE_SIZE), PAGE_SIZES.join(", "));

head("how many pages");
ok("1506 rows of 25 is 61 pages", pageCount(1506, 25) === 61, String(pageCount(1506, 25)));
ok("1500 of 25 is exactly 60", pageCount(1500, 25) === 60);
ok("1 row is 1 page", pageCount(1, 25) === 1);
ok("AND NO ROWS IS STILL ONE PAGE", pageCount(0, 25) === 1, "zero pages divides by nothing");

head("A PAGE THAT NO LONGER EXISTS COMES BACK TO THE LAST ONE");
ok(
  "page 40 of a list that now has 11 rows",
  clampPage(40, 11, 25) === 1,
  `${clampPage(40, 11, 25)} — an empty table under a filter that matched reads as "no results"`,
);
ok("page 61 stays on 61 while 1506 rows remain", clampPage(61, 1506, 25) === 61);
ok(
  "and switching 25 to 250 strands the same way",
  clampPage(61, 1506, 250) === 7,
  String(clampPage(61, 1506, 250)),
);
ok("below one comes back to one", clampPage(0, 1506, 25) === 1);
ok("so does a negative", clampPage(-3, 1506, 25) === 1);

head("the label counts from one and never past the end");
ok("page 1 of 1506 shows 1-25", JSON.stringify(shownRange(1, 25, 1506)) === '{"from":1,"to":25}');
ok("page 2 shows 26-50", JSON.stringify(shownRange(2, 25, 1506)) === '{"from":26,"to":50}');
ok(
  "THE LAST PAGE STOPS AT THE LAST ROW",
  JSON.stringify(shownRange(61, 25, 1506)) === '{"from":1501,"to":1506}',
  JSON.stringify(shownRange(61, 25, 1506)),
);
ok("an empty list shows 0-0", JSON.stringify(shownRange(1, 25, 0)) === '{"from":0,"to":0}');
ok("one row shows 1-1", JSON.stringify(shownRange(1, 25, 1)) === '{"from":1,"to":1}');

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
