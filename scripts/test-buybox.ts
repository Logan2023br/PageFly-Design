/* ==========================================================================
   Can a buy box reach a page that sells nothing?

       npx tsx scripts/test-buybox.ts

   Shipped: an About page and a Contact page each carrying a full buy box —
   photograph, price, colour swatches, size grid, Add to bag, Buy it now —
   bound to a product neither page is about. Three stages can each put one
   there and only the first was checking.
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
} as never;

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { vetSpec } = await import("../lib/design/specCheck");
  const { audit } = await import("../lib/design/audit");
  const { pageHasOneProduct } = await import("../lib/design/plan");

  console.log("\nwhich page types have a product to bind to");

  for (const t of ["product", "lp-launch", "gift-card"])
    check(pageHasOneProduct(t), `${t} does`);
  for (const t of ["about", "contact", "home", "blog-list", "faq"])
    check(!pageHasOneProduct(t), `${t} does not`);

  console.log("\nthe spec cannot ask for one on a page with no product");

  const withBuyBox = {
    nodes: [
      { el: "row", children: [
        { el: "image", ratio: 1.2 },
        { el: "col", children: [
          { el: "bound", slot: "title" },
          { el: "bound", slot: "price" },
          { el: "bound", slot: "swatches" },
          { el: "bound", slot: "atc" },
          { el: "text", note: "delivery promise" },
        ] },
      ] },
    ],
  };

  const onProduct = vetSpec(withBuyBox, "product");
  const bounds = (s: unknown): number =>
    JSON.stringify(s ?? "").split('"el":"bound"').length - 1;

  check(bounds(onProduct) === 4, "a product page keeps all four bound slots", `${bounds(onProduct)}`);

  for (const t of ["about", "contact", "blog-list"]) {
    const out = vetSpec(withBuyBox, t);
    check(bounds(out) === 0, `${t} keeps none of them`, `${bounds(out)}`);
    /* The band is not thrown away with them — an About page still gets its
       photograph and its line of text. */
    check(
      JSON.stringify(out ?? "").includes('"el":"image"'),
      `and ${t} still keeps the rest of the band`,
    );
  }

  /* No page type given is "no opinion" — the older paths never had one. */
  check(bounds(vetSpec(withBuyBox)) === 4, "with no page type stated, nothing is dropped");

  console.log("\nand the audit catches one the build model wrote anyway");

  const order = {
    vertical: "general",
    archetype: "E" as const,
    patternIds: ["story-band"],
    motionIds: [],
    sections: [{ role: "content", pattern: "story-band" }],
  };

  const tree = {
    sections: [
      {
        type: "section" as const,
        role: "content",
        pattern: "story-band",
        children: [
          { type: "heading" as const, text: "Our story", level: 2 },
          { type: "product" as const },
          { type: "bound" as const, slot: "atc" },
        ],
      },
    ],
  };

  const onAbout = audit(tree as never, order as never, "#FFFFFF", "about");
  const buyBoxProblem = onAbout.filter((p) => p.includes("buy-box"));
  check(buyBoxProblem.length === 1, "an about page reports it", buyBoxProblem[0]?.slice(0, 72));
  check(
    buyBoxProblem[0]?.includes("2 buy-box element"),
    "and counts both the product and the bound slot",
  );

  const onProductPage = audit(tree as never, order as never, "#FFFFFF", "product");
  check(
    onProductPage.filter((p) => p.includes("buy-box")).length === 0,
    "a product page reports nothing — that is where a buy box belongs",
  );

  const noType = audit(tree as never, order as never, "#FFFFFF");
  check(
    noType.filter((p) => p.includes("buy-box")).length === 0,
    "and with no page type given the check does not run",
  );

  console.log();
  /* ======================================================================
     A SECOND GALLERY BESIDE THE BUY BOX.

     One build put a five-slide `slideshow` in the same band as the `product`
     node, each slide a photograph of the same dress. The page showed the
     product twice — once in an element bound to the merchant's real media and
     once in one bound to nothing — and the two galleries argued with each other
     down the whole opening screen.

     The contract already said "never put `image` nodes beside it". It named the
     one shape somebody had got wrong before, and a slideshow is the same
     mistake with a different element, so the rule is now about GALLERIES rather
     than about `image`.

     ONLY IN THE BAND THAT HOLDS THE BUY BOX. A product page is meant to carry
     photographs further down — the fabric, the styling, the detail shots — and
     a rule that reached those would delete the page's whole argument.
     ====================================================================== */
  console.log("\nand a second gallery beside the buy box");

  const detailOrder = {
    vertical: "general",
    archetype: "E" as const,
    patternIds: ["product-detail-gallery"],
    motionIds: [],
    sections: [{ role: "commerce", pattern: "product-detail-gallery" }],
  };

  const bandWith = (extra: unknown[]) => ({
    sections: [
      {
        type: "section" as const,
        role: "commerce",
        pattern: "product-detail-gallery",
        children: [
          {
            type: "row" as const,
            children: [
              ...extra,
              { type: "product" as const, extras: [{}, {}] },
            ],
          },
        ],
      },
    ],
  });

  const twoGalleries = audit(
    bandWith([{ type: "slideshow", slides: [{}, {}, {}, {}, {}] }]) as never,
    detailOrder as never,
    "#FFFFFF",
    "product",
  );
  const g = twoGalleries.filter((p) => p.includes("second gallery"));
  check(g.length === 1, "a slideshow beside the buy box is reported", g[0]?.slice(0, 80));
  check(g[0]?.includes("slideshow"), "and the offending element is named", g[0]?.slice(0, 80));

  const withImage = audit(
    bandWith([{ type: "image", query: "dress", ratio: 1.2 }]) as never,
    detailOrder as never,
    "#FFFFFF",
    "product",
  );
  check(
    withImage.filter((p) => p.includes("second gallery")).length === 1,
    "so is a loose image — the shape the contract already named",
  );

  const clean = audit(
    bandWith([]) as never,
    detailOrder as never,
    "#FFFFFF",
    "product",
  );
  check(
    clean.filter((p) => p.includes("second gallery")).length === 0,
    "a band with only the buy box in it is fine",
  );

  /* The rest of a product page is photographs, and must stay that way. */
  const storyBand = audit(
    {
      sections: [
        {
          type: "section" as const,
          role: "content",
          pattern: "story-band",
          children: [{ type: "image" as const, query: "fabric", ratio: 1.2 }],
        },
      ],
    } as never,
    {
      vertical: "general",
      archetype: "E" as const,
      patternIds: ["story-band"],
      motionIds: [],
      sections: [{ role: "content", pattern: "story-band" }],
    } as never,
    "#FFFFFF",
    "product",
  );
  check(
    storyBand.filter((p) => p.includes("second gallery")).length === 0,
    "and a photograph in any other band is left alone",
    storyBand.filter((p) => p.includes("second gallery"))[0]?.slice(0, 90) ?? null,
  );

  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
