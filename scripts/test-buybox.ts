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
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
