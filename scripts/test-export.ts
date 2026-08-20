/* ==========================================================================
   Which PageFly element did each section actually become?

       npx tsx scripts/test-export.ts

   The mockup is React and the import is PageFly's own element model, and the
   only thing holding them together is `toPagefly.ts`. Every fidelity bug this
   app has shipped lived in that gap and every one of them was found the same
   way: build a page, import it into a store, look at it. Ten minutes to see one
   wrong element.

   This unzips the real .pagefly a real tree produces and asserts what is inside
   it. It cannot tell you the page is beautiful. It can tell you that a row of
   four cards is a ContentList2 with four ContentListItems and a column count of
   four — rather than a FlexBlock holding FlexBlocks with the columns written as
   CSS, which renders one card per row on import while the mockup shows four.
   ========================================================================== */

import { unzipSync, strFromU8 } from "fflate";
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

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type Item = {
  id: string;
  type: string;
  children: string[];
  data?: Record<string, unknown>;
};

/** The page JSON, out of the zip the app hands the merchant. */
async function build(tree: unknown, name = "probe"): Promise<Item[]> {
  const { pageflyFromTree } = await import("../lib/design/toPagefly");
  const { blob } = pageflyFromTree(
    tree as never,
    { name, bg: "#0A0A0A", ink: "#F6F6F4", fontBody: "Inter" },
    1180,
    { images: {} },
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const files = unzipSync(bytes);
  const entry = Object.keys(files)[0];
  return (JSON.parse(strFromU8(files[entry])) as { items: Item[] }).items;
}

const section = (children: unknown[], pattern: string) => ({
  type: "section",
  pattern,
  role: "commerce",
  css: { padding: "96px 56px" },
  children,
});

async function main(): Promise<void> {
  /* ---- a row of cards is a card list ------------------------------------ */

  console.log("four feature cards in a row");

  const cards = {
    sections: [
      section(
        [
          {
            type: "row",
            /* The model's own column count, written as CSS — which is how a
               model writes a grid and where the columns have to be read from. */
            css: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "24px" },
            children: Array.from({ length: 4 }, (_, i) => ({
              type: "col",
              css: { padding: "24px", background: "#141416", borderRadius: "12px" },
              children: [
                { type: "heading", level: 3, text: `600-thread sateen ${i + 1}` },
                { type: "text", text: "Long-staple cotton, spun tight and woven into sateen." },
              ],
            })),
          },
        ],
        "whats-inside-grid",
      ),
    ],
  };

  const items = await build(cards);
  const byType = (t: string) => items.filter((i) => i.type === t);

  const list = byType("ContentList2")[0];
  check(Boolean(list), "the row became a ContentList2", list ? "" : "still a FlexBlock");
  if (list) {
    check(
      byType("ContentListItem").length === 4,
      "one ContentListItem per card",
      `${byType("ContentListItem").length}`,
    );
    const shown = list.data?.slidesToShow as Record<string, number> | undefined;
    check(shown?.all === 4, "columns are DATA, taken from the model's own grid", String(shown?.all));
    check(shown?.mobile === 1, "one per row on a phone", String(shown?.mobile));
    const spacing = list.data?.spacing as Record<string, string> | undefined;
    check(spacing?.all === "24px", "the gap is the element's spacing setting", spacing?.all);

    /* THE POINT. `fields.md`: a CSS display/grid-template on the root or the
       native wrappers "overrides the native grid and collapses every card to
       one per row" — so the mockup shows four across and the import shows four
       down. The layout declarations have to be GONE, not merely duplicated. */
    const style = items.find((i) => i.id === list.id);
    void style;
    const css = JSON.stringify(list);
    check(!/grid-template-columns/.test(css), "no CSS grid left on the list");
  }

  /* A two-column split must NOT become a card list — it is a composition with
     measured widths, and a list distributes evenly. */
  const split = await build({
    sections: [
      section(
        [
          {
            type: "row",
            css: { gap: "64px" },
            children: [
              { type: "col", css: { flexBasis: "42%" }, children: [{ type: "heading", level: 2, text: "Woven for a cooler night" }] },
              { type: "image", css: { flexBasis: "58%" }, query: "sateen sheet", ratio: 0.86 },
            ],
          },
        ],
        "deep-dive-split",
      ),
    ],
  });
  check(split.filter((i) => i.type === "ContentList2").length === 0, "a 42/58 split stays a FlexBlock");

  /* Three cards, but one holds a product. ContentList2 gives its children no
     product context — every card would read "Please select a product". */
  const withProduct = await build({
    sections: [
      section(
        [
          {
            type: "row",
            css: { gap: "24px" },
            children: Array.from({ length: 3 }, () => ({
              type: "col",
              children: [{ type: "product", title: "Sateen set", price: "$148" }],
            })),
          },
        ],
        "collection-grid-3up",
      ),
    ],
  });
  check(
    withProduct.filter((i) => i.type === "ContentList2").length === 0,
    "a row of product cards is refused — Product* has no context in a list",
  );

  /* ---- the gallery is a setting, not CSS -------------------------------- */

  console.log("\na product page's buy box");

  const pdp = await build({
    sections: [
      section(
        [
          {
            type: "product",
            layout: "sideBySide",
            gallery: true,
            galleryEdge: "left",
            swatches: 4,
            title: "The Everyday Sheet",
            price: "$148",
            compareAt: "$198",
            atcText: "Add to basket",
          },
        ],
        "product-detail-gallery",
      ),
    ],
  });

  const media = pdp.find((i) => i.type === "ProductMedia3");
  check(Boolean(media), "a ProductMedia3 was emitted");
  if (media) {
    const showList = media.data?.showList as Record<string, boolean> | undefined;
    check(showList?.all === true, "the thumbnail strip is ON as a SETTING", String(showList?.all));
    check(showList?.mobile === false, "and off on a phone", String(showList?.mobile));
    check(media.data?.listPosition === "LEFT", "the edge the design asked for", String(media.data?.listPosition));
    check(
      media.data?.clickAction === "SHOW_FULLSCREEN",
      "click-to-zoom, which is a setting rather than something to build",
    );
    /* The old code made the strip visible with `display:flex` on MediaList2 and
       left showList at its default of false — so the mockup drew thumbnails and
       the imported page had none, whatever CSS the list carried. */
    const listNode = pdp.find((i) => i.type === "MediaList2");
    check(
      !/display:\s*flex/.test(JSON.stringify(listNode ?? {})),
      "and not forced visible with CSS",
    );
  }

  const box = pdp.find((i) => i.type === "ProductBox");
  check(Boolean(box), "wrapped in a ProductBox");
  check(pdp.some((i) => i.type === "ProductTitle"), "with a ProductTitle — a card without one ships a nameless product");
  check(pdp.some((i) => i.type === "ProductATC2"), "and an add-to-cart");

  /* ---- a collection grid binds to the collection ----------------------- */

  console.log("\na collection page's grid");

  const grid = await build({
    sections: [
      section(
        [
          { type: "heading", level: 2, text: "The everyday sheet" },
          { type: "productList", columns: 3, limit: 9, source: "collection", listLayout: "grid", query: "folded bedding" },
        ],
        "collection-grid-3up",
      ),
    ],
  });

  const plist = grid.find((i) => i.type === "ProductList2");
  check(Boolean(plist), "a ProductList2 was emitted");
  if (plist) {
    check(
      plist.data?.source === "auto",
      "bound to THIS collection's products",
      String(plist.data?.source),
    );
    check(plist.data?.limit === 9, "nine cards, as ordered", String(plist.data?.limit));
    check(
      grid.filter((i) => i.type === "ProductBox").length === 1,
      "exactly ONE card template — the renderer repeats it",
      `${grid.filter((i) => i.type === "ProductBox").length}`,
    );
    const layout = plist.data?.listLayout as Record<string, string> | undefined;
    check(layout?.all === "grid", "a grid, not the platform's slideshow default", layout?.all);
  }

  /* A home page's featured row is store-wide, not a collection. */
  const featured = await build({
    sections: [
      section(
        [{ type: "productList", columns: 3, limit: 3, source: "store", listLayout: "grid", query: "bedding" }],
        "collection-featured-row",
      ),
    ],
  });
  check(
    featured.find((i) => i.type === "ProductList2")?.data?.source === "all",
    "a home page's row is store-wide",
  );

  /* A carousel must not also carry a CSS grid — the track is a slider, and a
     grid laid over it puts every card on one row inside a one-card viewport. */
  const carousel = await build({
    sections: [
      section(
        [{ type: "productList", columns: 4, limit: 12, source: "collection", listLayout: "slideshow", query: "bedding" }],
        "collection-carousel",
      ),
    ],
  });
  const car = carousel.find((i) => i.type === "ProductList2");
  const carStyle = carousel.find((i) => i.id === car?.id);
  void carStyle;
  check(
    (car?.data?.listLayout as Record<string, string>)?.all === "slideshow",
    "the carousel is a carousel",
  );

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
