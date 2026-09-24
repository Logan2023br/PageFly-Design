/* ==========================================================================
   THE LIBRARY DRAWS ONE IFRAME PER PAGE, AND A STORE CAN HAVE FORTY-SEVEN.

       npx tsx scripts/test-library-paging.ts

   Every card renders the mockup itself — `MockupPage` hands the page's own
   HTML to an `<iframe>`, which parses a couple of hundred kilobytes and then
   goes and fetches that page's fonts and photographs on its own. Forty-seven
   of those at once is what made an operator wait on `/design/admin/users/ts`.

   So the list starts at eight and grows on request. The rules are small and
   every one of them is a way to be wrong quietly:

     EIGHT IS NOT "MORE THAN EIGHT". A list of exactly eight showing a Load
     more button that reveals nothing is worse than no button.

     THE BUTTON MUST NOT OUTLIVE THE LIST. Press it enough times and it has to
     go; one that stays on a fully-shown list is a control that does nothing.

     AND IT MUST NOT OVERSHOOT. Nine pages with a step of eight shows nine, not
     sixteen — the count beside it is read as a promise.
   ========================================================================== */

import { FIRST_BATCH, STEP, moreAfter, shownAfter } from "../components/results/paging";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

head("the batch the library opens on");
ok("eight", FIRST_BATCH === 8, String(FIRST_BATCH));

head("a list no longer than the batch has no button");
for (const n of [0, 1, 7, 8])
  ok(`${n} page${n === 1 ? "" : "s"}`, moreAfter(n, FIRST_BATCH) === 0, `${n}`);

head("AND ONE LONGER THAN IT DOES");
ok("9 pages leaves 1", moreAfter(9, FIRST_BATCH) === 1);
ok("47 pages leaves 39", moreAfter(47, FIRST_BATCH) === 39);

head("pressing it reveals the next batch and never overshoots");
ok("8 of 47 becomes 16", shownAfter(47, 8) === 8 + STEP, String(shownAfter(47, 8)));
ok(
  "8 of 9 becomes 9, not 16",
  shownAfter(9, 8) === 9,
  `${shownAfter(9, 8)} — the count beside the button is read as a promise`,
);
ok("40 of 47 becomes 47", shownAfter(47, 40) === 47, String(shownAfter(47, 40)));

head("and then it is gone");
ok("nothing left after the last press", moreAfter(47, 47) === 0);
ok(
  "NOR CAN IT COME BACK",
  moreAfter(47, 99) === 0,
  "a shown count past the end must not report a negative remainder",
);

head("a step of one page still works");
ok("47 shown one at a time", shownAfter(47, 46) === 47);

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
