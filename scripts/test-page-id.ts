/* ==========================================================================
   THE LIBRARY RENAMES EVERY PAGE, AND TWO THINGS WERE LOOKING FOR THE OLD NAME.

       npx tsx scripts/test-page-id.ts

   `loadLibrary` gives each page a new id — `${runId}::${page.id}` — so that
   two runs holding the same page cannot collide in one flat list. Everything
   drawn from the Library therefore carries the prefixed id, and everything
   written when the deck was BUILT carries the plain one.

   Two readers were on the wrong side of that:

     THE STORED FILE. `prebuild` files a built `.pagefly` under
     `keyForHtml(page.id, html)` with the plain id; the Library asked for it
     with the prefixed one. Different key, no hit, and a fresh two-minute
     conversion on every single export from the Library or the admin —
     including the second click on the same page, and the third.

     THE HIDE BUTTON. Its map is keyed by the page rows, which hold the plain
     id, so the lookup missed and the button simply did not render.

   Neither could fail loudly: a cache miss is a slow success, and a button that
   does not appear looks like a button that was never built.
   ========================================================================== */

import { ownPageId } from "../lib/pagefly/pageId";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

head("a page straight off a build is unchanged");
ok("no runId, no prefix", ownPageId({ id: "home-1" }) === "home-1");
ok(
  "a runId that is not in the id changes nothing",
  ownPageId({ id: "home-1", runId: "abc" }) === "home-1",
  ownPageId({ id: "home-1", runId: "abc" }),
);

head("A PAGE OUT OF THE LIBRARY LOSES THE PREFIX");
ok(
  "the plain id comes back",
  ownPageId({ id: "abc::home-1", runId: "abc" }) === "home-1",
  ownPageId({ id: "abc::home-1", runId: "abc" }),
);
ok(
  "and this is what `prebuild` filed it under",
  ownPageId({ id: "abc::home-1", runId: "abc" }) === "home-1",
  "a different key is a cache that never hits, which reads as a slow success",
);

head("and only its OWN prefix is removed");
ok(
  "another run's prefix is left alone",
  ownPageId({ id: "xyz::home-1", runId: "abc" }) === "xyz::home-1",
  `${ownPageId({ id: "xyz::home-1", runId: "abc" })} — taking any prefix would rename a page that was never renamed`,
);
ok(
  "a page id that merely contains `::`",
  ownPageId({ id: "a::b::c", runId: "a" }) === "b::c",
  ownPageId({ id: "a::b::c", runId: "a" }),
);
ok(
  "and one that starts with `::`",
  ownPageId({ id: "::home", runId: "abc" }) === "::home",
  ownPageId({ id: "::home", runId: "abc" }),
);

head("it is idempotent, because it is called on both sides");
const once = ownPageId({ id: "abc::home-1", runId: "abc" });
ok("running it twice is running it once", ownPageId({ id: once, runId: "abc" }) === once, once);

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
