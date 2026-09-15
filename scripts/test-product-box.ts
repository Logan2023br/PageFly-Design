/* ==========================================================================
   A product page has to carry a product.

       npx tsx scripts/test-product-box.ts

   WHAT THIS IS ACTUALLY DEFENDING. A product page built out of a Slideshow and
   four Image nodes photographs correctly. The mockup is right, the export is
   valid, the file opens — and in the store it is a picture of a shop: a price
   that never moves, swatches that select nothing, a button that adds nothing
   to a cart. There is no stage after this that notices, which is why it has to
   be noticed here.

   The rule that was supposed to catch it walked the built sections against the
   planned ones BY INDEX, and free design lets the model choose its own section
   count and order having never been shown that plan. Index three of the tree is
   not index three of the order. So the checks below are position-blind on
   purpose: the tree either contains a `product` node or it does not.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
};

/* Imported inside `main` rather than at the top: the shim above has to be in
   place before anything reaches `server-only`, and a static import would be
   hoisted past it. */
async function main(): Promise<void> {
const { audit } = await import("../lib/design/audit.js");
const { planPage, pageHasOneProduct } = await import("../lib/design/plan.js");
const { pageflyFromTree } = await import("../lib/design/toPagefly.js");
const { designTreeSchema } = await import("../lib/design/schema.js");

/* THE FIXTURES GO THROUGH THE REAL SCHEMA. Every node below is written with
   only the fields that matter to this test; the schema fills the rest with the
   same defaults a model reply gets. Hand-filling them instead is how a test
   ends up asserting against a tree shape that never reaches `audit`. */
const parse = (t: unknown) => designTreeSchema.parse(t);

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const text = (t: string) => ({ type: "text", text: t }) as any;
const section = (children: any[]) => ({ type: "section", children }) as any;

/* The page from the screenshot, as the model built it: a row, a slideshow of
   photographs on one side, a hand-lettered buy box on the other.

   `row`/`col` and not "flex" — "Flex" is what these become in the PageFly
   editor, which is why the tree that produced the screenshot is full of them.
   Nothing here is bound to a product; every word is a literal the model typed. */
const BY_HAND = {
  sections: [
    section([
      {
        type: "row",
        children: [
          /* `query` and not `src`: an image node names a photograph to go and find.
             Without it the schema drops the node, the slideshow loses every slide
             and drops in turn, and the fixture quietly becomes an empty page — the
             test then passes for the wrong reason. */
          {
            type: "slideshow",
            slides: [
              { type: "image", query: "serum bottle" },
              { type: "image", query: "serum texture" },
            ],
          },
          { type: "col", children: [text("Name"), text("$48.00"), { type: "button", text: "Add to cart" }] },
        ],
      },
    ]),
  ],
} as any;

/* The same page with the one node that binds it to a real product. */
const WITH_BOX = {
  sections: [
    section([
      { type: "product", gallery: true, children: [text("Free shipping over $50")] },
    ]),
  ],
} as any;

/* AN ORDER THAT DOES NOT NAME A BUY BOX, which is the whole point.

   The older rule reads `order.sections[i].pattern` and can only speak when the
   band it happens to be standing on was planned as a product-detail. Under free
   design it rarely is: the model was never shown this plan and chose its own
   bands. Auditing against this order proves the new rule needs no such luck —
   everything it finds, it finds from the page type and the tree alone. */
const ORDER = {
  vertical: "beauty",
  archetype: "A",
  motionIds: [],
  sections: [{ role: "story", pattern: "story-band" }],
} as any;

/** Only the new rule says this; the positional one opens with "Section N". */
const MINE = (p: string) => p.startsWith("This is a ");

console.log("\nthe page type is the thing that knows");

check(pageHasOneProduct("product"), 'a "product" page holds exactly one product');
check(!pageHasOneProduct("landing"), "a landing page does not");

const planned = planPage(
  { whatYouSell: "a face serum, sold direct", verticalSlug: "beauty", visualStyle: "minimal" } as any,
  "product",
  "seed-7",
  null,
);
check(
  planned.sections.some((s: any) => s.pattern?.startsWith("product-detail")),
  "and the local plan pins a product-detail band for it",
  planned.sections.map((s: any) => s.pattern).join(" · "),
);

console.log("\nwhat the audit says about a hand-built buy box");

const hand = audit(parse(BY_HAND), ORDER, "#FFFFFF", "product");
const caught = hand.filter(MINE);
check(caught.length === 1, "a product page with no product node is a problem", String(caught.length));
check(
  caught[0]?.includes("image/slideshow"),
  "and it names what was built instead of one",
  caught[0],
);
check(caught[0]?.includes('"gallery": true'), "and names the flag, so the gallery is not rebuilt by hand");

console.log("\nand about the same page built right");

const right = audit(parse(WITH_BOX), ORDER, "#FFFFFF", "product");
check(
  right.filter(MINE).length === 0,
  "one product node satisfies it",
  right.join(" | ") || "nothing said",
);

/* THE RULE MUST NOT FIRE WHERE THERE IS NO PRODUCT TO BIND. A landing page for
   a whole catalogue has no single product, and demanding a buy box on one would
   send the repair model off to invent one. */
console.log("\nand where there is no one product to bind");

for (const t of ["landing", "collection", "about", "blog"]) {
  const out = audit(parse(BY_HAND), ORDER, "#FFFFFF", t);
  check(
    out.filter(MINE).length === 0,
    `a "${t}" page is left alone`,
  );
}
check(
  audit(parse(BY_HAND), ORDER, "#FFFFFF").filter(MINE).length === 0,
  "and a caller that passes no page type at all",
);

console.log("\nwhat the product node actually exports");

/* Through the real exporter and back out of the real zip. `pageflyFromTree`
   returns the .pagefly file itself, so what is asserted below is what a
   merchant would actually open — not an intermediate the packer could still
   drop something from. */
const built = pageflyFromTree(
  parse(WITH_BOX),
  { name: "Serum", bg: "#FFFFFF", ink: "#111111", fontBody: "Inter" },
  1200,
);
const { unzipSync, strFromU8 } = await import("fflate");
const entries = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
const json = Object.values(entries).map((b) => strFromU8(b)).join("");
for (const el of ["ProductBox", "ProductMedia3", "MediaMain3", "MediaList2"]) {
  check(json.includes(`"${el}"`), `PageFly's ${el}`);
}
check(!json.includes('"Slideshow"'), "and no hand-built slideshow standing in for the gallery");

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
