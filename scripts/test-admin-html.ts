/* ==========================================================================
   THE ADMIN'S DOWNLOAD-HTML BUTTON, AND THE TWO WAYS IT COULD GO WRONG QUIETLY.

       npx tsx scripts/test-admin-html.ts

   An operator looking at a store's pages can take the mockup's own HTML —
   the document the whole export is derived from. Two things about it fail
   without failing:

     IT MUST NOT REACH A MERCHANT. The same card component draws the results
     screen, the Library and this; a button added there appears in all three
     unless something says otherwise. What leaves here is the page's full
     source, and the merchant's own screen has never offered it. A gate that is
     open by default is a gate nobody notices is open.

     A PAGE WITHOUT A MOCKUP MUST NOT OFFER ONE. A deck restored from the
     database is `unknown` until checked, and a page whose `design.html` is
     missing or blank would hand over a zero-byte file named like a real one —
     which looks like a broken export rather than a page that never had HTML.
     No html, no button.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { htmlOfPage, htmlFileName } from "../components/results/downloadHtml";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

const page = (over: Record<string, unknown> = {}) =>
  ({ id: "p1", label: "Home", pageType: "home", ...over }) as never;

head("a page with a mockup offers its html");
ok(
  "the document comes back",
  htmlOfPage(page({ design: { html: "<!DOCTYPE html><html></html>" } })) ===
    "<!DOCTYPE html><html></html>",
);

head("A PAGE WITHOUT ONE OFFERS NOTHING");
for (const [name, p] of [
  ["no design at all", page()],
  ["design but no html", page({ design: {} })],
  ["html is empty", page({ design: { html: "" } })],
  ["html is whitespace", page({ design: { html: "   \n  " } })],
  ["html is not a string", page({ design: { html: 42 } })],
] as const)
  ok(
    name,
    htmlOfPage(p) === null,
    "a zero-byte file named like a real one reads as a broken export",
  );

head("the file is named after the page");
ok("label wins", htmlFileName(page()) === "Home.html", htmlFileName(page()));
ok(
  "a copy keeps its number",
  htmlFileName(page({ label: "Product", copyTotal: 3, copyIndex: 2 })) === "Product-2.html",
  htmlFileName(page({ label: "Product", copyTotal: 3, copyIndex: 2 })),
);
ok(
  "and one of one does not",
  htmlFileName(page({ label: "Product", copyTotal: 1, copyIndex: 1 })) === "Product.html",
);
ok(
  "a label that cannot be a filename is made into one",
  htmlFileName(page({ label: 'A/B: "best"?' })) === "A-B- -best-.html",
  htmlFileName(page({ label: 'A/B: "best"?' })),
);
ok("no label falls back to the type", htmlFileName(page({ label: "" })) === "home.html");
ok(
  "and no type either still names something",
  htmlFileName(page({ label: "", pageType: "" })) === "page.html",
);

head("THE BUTTON IS ADMIN-ONLY, and the gate is closed by default");
/* The context that opens it. A card rendered anywhere nobody thought about —
   the merchant's results screen, the Library, the public gallery — gets the
   closed answer without being told. */
const src = readFileSync("components/results/CardActions.tsx", "utf8");
ok(
  "the card asks the context",
  /useAdminView\(\)/.test(src),
  "a prop threaded through four components is four chances to miss one",
);
/* The document is only READ when the context says admin, so the button cannot
   render anywhere else — a stronger gate than hiding a computed value. */
ok(
  "and the html is only read when it says yes",
  /admin \? htmlOfPage\(page\) : null/.test(src),
  src.includes("htmlOfPage") ? "html read unconditionally" : "html never read",
);
ok(
  "the button hangs off that value",
  /\{html && \(/.test(src),
  "no page without a mockup, and no card outside the admin",
);

const ctx = readFileSync("components/results/adminView.tsx", "utf8");
/* THE VALUE, NOT THE SPELLING. This read `createContext(false)` and broke the
   day the context grew from a flag into a map — a change that kept the gate
   shut. What matters is that the default is a CLOSED one, whatever shape the
   context has. */
const dflt = /createContext\s*(?:<[^>]*>)?\s*\(\s*([^)]*?)\s*\)/.exec(ctx)?.[1];
ok(
  "THE DEFAULT IS A CLOSED GATE",
  dflt === "false" || dflt === "null",
  `${dflt} — a gate that is open by default is a gate nobody notices is open`,
);

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
