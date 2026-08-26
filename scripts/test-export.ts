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
async function open(
  tree: unknown,
  name = "probe",
  /* `border` reaches the composites this file emits itself — the accordion's
     row rule, the buy box's stepper — and a test that cannot pass one cannot
     tell "took the palette" from "fell back to black". */
  media: {
    images?: Record<string, string>;
    videos?: Record<string, string>;
    border?: string;
    accent?: string;
  } = {},
) {
  const { pageflyFromTree } = await import("../lib/design/toPagefly");

  const { blob } = pageflyFromTree(
    tree as never,
    { name, bg: "#0A0A0A", ink: "#F6F6F4", fontBody: "Inter" },
    1180,
    {
      images: media.images ?? {},
      videos: media.videos ?? {},
      ...(media.border ? { border: media.border } : {}),
      ...(media.accent ? { accent: media.accent } : {}),
    },
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const files = unzipSync(bytes);
  const entry = Object.keys(files)[0];
  const page = JSON.parse(strFromU8(files[entry])) as {
    items: Item[];
    styles: { id: string; styles: string }[];
    customCSS?: string;
  };

  /** The `&` rule for one item, at one breakpoint. Where the fidelity bugs are:
      an element can be the right element and still carry the wrong type. */
  const cssOf = (id: string, device = "all", selector = "&"): string => {
    const entryFor = page.styles.find((s) => s.id === id);
    if (!entryFor) return "";
    const parsed = JSON.parse(entryFor.styles) as Record<string, Record<string, string>>;
    return parsed[device]?.[selector] ?? "";
  };

  return { items: page.items, cssOf, customCSS: page.customCSS ?? "" };
}

async function build(tree: unknown, name = "probe"): Promise<Item[]> {
  return (await open(tree, name)).items;
}

const section = (children: unknown[], pattern: string) => ({
  type: "section",
  pattern,
  role: "commerce",
  css: { padding: "96px 56px" },
  children,
});

async function main(): Promise<void> {
  const { __firstLengthForTest: px } = await import("../lib/design/toPagefly");

  /* A page shipped with a 4,432px gap: `gap: "44px 32px"` had every non-digit
     stripped out of it. Every case below is a value a design has actually
     written. */
  console.log("\ngap shorthand");
  check(px("44px 32px", 24) === 44, "a two-value gap takes the row gap", String(px("44px 32px", 24)));
  check(px("24px", 99) === 24, "a single value is itself");
  check(px(24, 99) === 24, "a bare number is itself");
  check(px("1.5rem", 99) === 24, "rem becomes pixels");
  check(px(0, 24) === 0, "zero is a length, not a missing value");
  check(px("0", 24) === 0, "…written as a string too");
  check(px(undefined, 24) === 24, "absent falls back");
  check(px("normal", 24) === 24, "a keyword falls back");
  check(px("5%", 24) === 24, "a percentage has no pixel meaning here — falls back");

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
    check(
      !/grid-template-columns|display:\s*grid/.test(JSON.stringify(list)),
      "no CSS grid left on the list",
    );
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

  /* ---- the type belongs to the words, not to the wrapper ---------------- */

  console.log("\na stat card");

  const stats = await open({
    sections: [
      section(
        [
          {
            type: "counter",
            value: "94",
            suffix: "°C",
            label: "Ideal brewing temperature",
            css: { fontSize: "48px", fontWeight: 700 },
          },
        ],
        "stat-strip-3up",
      ),
    ],
  });

  const num = stats.items.find((i) => i.type === "Heading2");
  const lab = stats.items.filter((i) => i.type === "Paragraph4").pop();
  const wrap = stats.items.find(
    (i) => i.type === "FlexBlock" && i.children.length === 2 && i.children.includes(lab?.id ?? ""),
  );

  check(/font-size:\s*48px/.test(stats.cssOf(num?.id ?? "")), "the NUMBER keeps the 48px");
  check(
    /font-size:\s*13px/.test(stats.cssOf(lab?.id ?? "")),
    "the label has its own size",
    stats.cssOf(lab?.id ?? "").match(/font-size:[^;]*/)?.[0] ?? "(none)",
  );
  /* THE BUG. The wrapper carried the node's font-size, the label had no style of
     its own, and inheritance did the rest: "Ideal brewing temperature" came in
     at 48px and wrapped across three lines under a 48px "94°C". */
  check(
    !/font-size/.test(stats.cssOf(wrap?.id ?? "")),
    "and the wrapper carries no type at all",
    stats.cssOf(wrap?.id ?? "").match(/font-size:[^;]*/)?.[0] ?? "(clean)",
  );
  check(
    /flex-direction:\s*column/.test(stats.cssOf(wrap?.id ?? "")),
    "the wrapper still states its direction",
  );

  /* ---- a real store's photographs are not all the same shape ------------ */

  console.log("\nproduct photography");

  const shaped = await open({
    sections: [
      section(
        [{ type: "productList", columns: 3, limit: 9, source: "collection", query: "coffee" }],
        "collection-grid-3up",
      ),
    ],
  });
  const cardMedia = shaped.items.find((i) => i.type === "ProductMedia3");
  const raw = shaped.cssOf(cardMedia?.id ?? "");
  check(/aspect-ratio:\s*1\s*\/\s*1/.test(raw), "the card's media box is square", raw.match(/aspect-ratio:[^;]*/)?.[0] ?? "(none)");

  /* ---- the form, which crashed the editor on click ---------------------- */

  console.log("\na contact form");

  const form = await open({
    sections: [
      section(
        [
          {
            type: "form",
            intent: "contact",
            submitText: "Send enquiry",
            fields: [
              { label: "Name", kind: "text", required: true },
              { label: "Email", kind: "email", required: true },
              { label: "Message", kind: "message", required: true },
            ],
          },
        ],
        "lead-form-split",
      ),
    ],
  });

  const fields = form.items.filter((i) => i.type === "Form2.Field");
  check(fields.length === 3, "three Form2.Fields", `${fields.length}`);

  /* THE CRASH. `label` reads as an OBJECT — FormLabel is "shown by the parent
     `label.on` sub-field". Written as a bare string every label was hidden, and
     opening the field's settings panel gave "Something went wrong". */
  const lab0 = fields[0]?.data?.label as Record<string, unknown> | string | undefined;
  check(typeof lab0 === "object" && lab0 !== null, "label is an object, not a string", typeof lab0);
  check((lab0 as Record<string, unknown>)?.on === true, "with on:true, or the label never renders");
  check(
    Object.values((lab0 ?? {}) as Record<string, unknown>).includes("Name"),
    "and it carries the copy",
    JSON.stringify(lab0),
  );

  /* The other half: an item with no data key and no style entry, on an element
     whose own documentation lists five styleable properties. */
  const labels = form.items.filter((i) => i.type === "FormLabel");
  check(labels.length === 3, "one FormLabel per field", `${labels.length}`);
  check(labels.every((l) => Boolean(l.data)), "every FormLabel has a data key");
  check(
    labels.every((l) => form.cssOf(l.id).length > 0),
    "and a style entry of its own",
  );

  /* A multi-line field has to BE multi-line: 1, not 0. */
  const inputs = form.items.filter((i) => i.type === "FormInput");
  check(
    inputs.map((i) => i.data?.inputType).join(",") === "0,2,1",
    "text, email, multi-line map to 0, 2, 1",
    inputs.map((i) => i.data?.inputType).join(","),
  );
  check(
    inputs.every((i) => i.data?.required === true),
    "required carries onto the input, not only the field",
  );

  const submit = form.items.find((i) => i.type === "Form2.Button2");
  check(submit?.data?.value === "Send enquiry", "the button says what was written", String(submit?.data?.value));

  /* ---- a stack is one per row, not N across ----------------------------- */

  console.log("\nfour spec bars stacked in a col");

  /* The exact shape that shipped wrong: a col holding four cols, each a
     label/value row over a rule. The mockup stacks them because a col stacks;
     the element was told four items per row and the import squeezed four
     full-width bars into four narrow columns, breaking "11,000 st" over two
     lines. */
  const stacked = await open({
    sections: [
      section(
        [
          {
            type: "col",
            css: { maxWidth: "900px", gap: "40px" },
            children: [
              { type: "heading", level: 2, text: "Measured, not marketed" },
              {
                type: "col",
                css: { gap: "24px" },
                children: Array.from({ length: 4 }, (_, i) => ({
                  type: "col",
                  css: { gap: "8px" },
                  children: [
                    {
                      type: "row",
                      css: { justifyContent: "space-between" },
                      children: [
                        { type: "text", text: `WOOL CONTENT ${i + 1}` },
                        { type: "text", text: "80%" },
                      ],
                    },
                    { type: "custom", label: "bar", html: "<div class='b'></div>" },
                  ],
                })),
              },
            ],
          },
        ],
        "spec-bars",
      ),
    ],
  });

  const bars = stacked.items.find((i) => i.type === "ContentList2");
  check(Boolean(bars), "the stack became a ContentList2");
  const per = (bars?.data?.slidesToShow as Record<string, number> | undefined)?.all;
  check(per === 1, "ONE item per row, because a col stacks", String(per));
  check(
    stacked.items.filter((i) => i.type === "ContentListItem").length === 4,
    "four items",
  );

  /* And the container: max-width with no width hugs in PageFly and fills in the
     mockup. The imported 1180px container collapsed to the width of its longest
     line until this was added. */
  const container = stacked.items.find(
    (i) => i.type === "FlexBlock" && /max-width:\s*900px/.test(stacked.cssOf(i.id)),
  );
  check(Boolean(container), "the 900px container is there");
  check(
    /width:\s*100%/.test(stacked.cssOf(container?.id ?? "")),
    "and it is told to fill up to that maximum",
    stacked.cssOf(container?.id ?? "").match(/(^|[; ])width:[^;]*/)?.[0]?.trim() ?? "(none)",
  );

  /* But NOT inside a row: there a maxWidth is a reading-width cap on a column
     meant to hug, and width:100% turns a 42/58 split into a shrink-factor
     argument. */
  const inRow = await open({
    sections: [
      section(
        [
          {
            type: "row",
            css: { gap: "64px" },
            children: [
              {
                type: "col",
                css: { maxWidth: "520px" },
                children: [{ type: "heading", level: 2, text: "Woven in Biella" }],
              },
              { type: "image", query: "wool cloth", ratio: 0.86 },
            ],
          },
        ],
        "deep-dive-split",
      ),
    ],
  });
  const capped = inRow.items.find(
    (i) => i.type === "FlexBlock" && /max-width:\s*520px/.test(inRow.cssOf(i.id)),
  );
  check(
    !/(^|[; ])width:\s*100%/.test(inRow.cssOf(capped?.id ?? "")),
    "a capped column inside a row is left to hug",
  );

  /* ---- text in a row hugs; text in a column fills ---------------------- */

  console.log("\na label beside a value");

  const labelled = await open({
    sections: [
      section(
        [
          {
            type: "row",
            css: { justifyContent: "space-between", alignItems: "baseline" },
            children: [
              { type: "text", text: "WOOL CONTENT", css: { fontSize: "13px" } },
              { type: "heading", level: 3, text: "80%", css: { fontSize: "28px" } },
            ],
          },
          {
            type: "col",
            css: { maxWidth: "620px", gap: "12px" },
            children: [
              { type: "heading", level: 2, text: "Woven for a cooler night" },
              { type: "text", text: "Long-staple cotton, spun tight and woven into sateen." },
            ],
          },
        ],
        "spec-bars",
      ),
    ],
  });

  const inARow = labelled.items.filter((i) =>
    ["WOOL CONTENT", "80%"].includes(String(i.data?.value ?? "")),
  );
  check(inARow.length === 2, "the label and the value are both there", `${inARow.length}`);
  /* THE BUG. `fill` is not a hint: PageFly expands it to
     `flex-grow: 1; flex-basis: 0px`, so the label took the whole row and pushed
     the value to the far edge. In the mockup the same node is a flex child at
     its default `flex: 0 1 auto`. */
  check(
    inARow.every((i) => /--pf-flex-layout-width:\s*hug/.test(labelled.cssOf(i.id))),
    "and both hug, because a row's children size to their words",
    inARow.map((i) => labelled.cssOf(i.id).match(/--pf-flex-layout-width:[^;]*/)?.[0]).join(" · "),
  );

  /* And the other half of the same rule: in a column, text fills, which is what
     makes a paragraph wrap at the container's measure. */
  const inACol = labelled.items.filter((i) =>
    /Long-staple cotton|cooler night/.test(String(i.data?.value ?? "")),
  );
  check(
    inACol.length === 2 &&
      inACol.every((i) => /--pf-flex-layout-width:\s*fill/.test(labelled.cssOf(i.id))),
    "text in a column still fills its measure",
    inACol.map((i) => labelled.cssOf(i.id).match(/--pf-flex-layout-width:[^;]*/)?.[0]).join(" · "),
  );

  /* ---- a carousel, set up the way the mockup draws one ------------------ */

  console.log("\nsix slides, three visible");

  const slider = await open({
    sections: [
      section(
        [
          {
            type: "slideshow",
            perView: 3,
            autoplay: false,
            css: { gap: "24px" },
            slides: Array.from({ length: 6 }, (_, i) => ({
              type: "col",
              children: [
                { type: "image", query: `look ${i + 1}`, ratio: 1.25 },
                { type: "text", text: `Fog Walk ${i + 1}` },
              ],
            })),
          },
        ],
        "lookbook-strip",
      ),
    ],
  });

  const show = slider.items.find((i) => i.type === "Slideshow");
  check(Boolean(show), "a Slideshow was emitted");
  if (show) {
    /* EVERY ONE OF THESE IS A PLATFORM DEFAULT WE HAVE TO OVERRIDE. navStyle
       defaults to nav-style-1 and paginationStyle to pagination-style-1, so a
       Slideshow emitted without them arrives with grey arrows over the first and
       last slide and a row of dots — neither of which the mockup draws. */
    check(show.data?.navStyle === "none", "no arrows, because the mockup draws none", String(show.data?.navStyle));
    check(
      show.data?.paginationStyle === "pagination-style-1",
      "dots, because six slides overflow three",
      String(show.data?.paginationStyle),
    );
    const g = show.data?.gutter as Record<string, number> | undefined;
    check(g?.all === 24, "the gap is the element's gutter, not CSS", String(g?.all));
    check(g?.mobile === 16, "and tighter on a phone", String(g?.mobile));
    check(
      (show.data?.slidesToShow as Record<string, number>)?.mobile === 1,
      "one slide on a phone whatever the desktop shows",
    );
    /* The dots' LOOK is CSS on the selectors fields.md names, because the
       setting chooses the shape and cannot say 7px or currentColor. */
    const dotRule = slider.cssOf(show.id, "all", "& .pf-slider-nav button");
    check(/width:\s*7px/.test(dotRule), "the dots are 7px, as the mockup draws them", dotRule.slice(0, 40));
    check(
      /background:\s*currentColor/.test(dotRule),
      "in currentColor, so they read on a dark band and a light one",
    );
    check(
      /gap:\s*24px/.test(slider.cssOf(show.id)) === false,
      "and the gap is NOT left on the root as dead CSS",
    );
  }

  /* Three slides in a three-wide carousel is not a carousel. A pager that says
     there is more when there is not is worse than no pager. */
  const exact = await open({
    sections: [
      section(
        [
          {
            type: "slideshow",
            perView: 3,
            autoplay: false,
            slides: Array.from({ length: 3 }, (_, i) => ({
              type: "col",
              children: [{ type: "text", text: `Look ${i + 1}` }],
            })),
          },
        ],
        "lookbook-strip",
      ),
    ],
  });
  check(
    exact.items.find((i) => i.type === "Slideshow")?.data?.paginationStyle === "none",
    "no dots when nothing overflows",
    String(exact.items.find((i) => i.type === "Slideshow")?.data?.paginationStyle),
  );

  /* ---- a band's background is settings, not CSS ------------------------- */

  console.log("\na photograph behind a band");

  const banded = await open({
    sections: [
      {
        type: "section",
        pattern: "hero-full-bleed-scrim",
        role: "hero",
        css: { padding: "140px 56px" },
        bg: { kind: "photo", query: "misty highland coffee farm at dawn", scrim: "strong" },
        children: [{ type: "heading", level: 1, text: "Where the cup begins" }],
      },
      {
        type: "section",
        pattern: "full-bleed-quote-band",
        role: "media",
        css: { padding: "120px 56px" },
        bg: { kind: "video", query: "steam rising from a cup", scrim: "soft" },
        children: [{ type: "heading", level: 2, text: "One harvest, one farm" }],
      },
    ],
  },
  "probe",
  {
    /* As a real build hands them over: resolved by the stock library before the
       exporter ever runs. */
    images: {
      "misty highland coffee farm at dawn": "https://images.example/farm.jpg",
      "steam rising from a cup": "https://images.example/steam.jpg",
    },
    videos: { "steam rising from a cup": "https://videos.example/steam.mp4" },
  });

  const bands = banded.items.filter((i) => i.type === "FlexSection");
  check(bands.length === 2, "two bands", `${bands.length}`);

  /* Photo: the URL is `src` and the mode is `standard`, both SETTINGS. Written
     as CSS it would be a background the merchant cannot change from the editor. */
  const photoBand = bands[0];
  check(photoBand?.data?.bgType === "standard", "a photo band is bgType standard", String(photoBand?.data?.bgType));
  check(
    photoBand?.data?.src === "https://images.example/farm.jpg",
    "the resolved photo is the src",
    String(photoBand?.data?.src),
  );
  check(
    photoBand?.data?.filterColor === "rgba(0,0,0,0.62)",
    "scrim strong is a filterColor, not a CSS overlay",
    String(photoBand?.data?.filterColor),
  );
  check(
    photoBand?.data?.backgroundImageLoading === "preload",
    "and it preloads, because a band background sits at the fold",
  );

  /* Video: a different mode and a different field, and it stays lazy. */
  const videoBand = bands[1];
  check(videoBand?.data?.bgType === "video", "a video band is bgType video", String(videoBand?.data?.bgType));
  check(videoBand?.data?.backgroundVideoLoading === "lazy", "the video is lazy");
  check(
    videoBand?.data?.videoBg === "https://videos.example/steam.mp4",
    "the video URL is videoBg",
    String(videoBand?.data?.videoBg),
  );
  check(
    videoBand?.data?.src === "https://images.example/steam.jpg",
    "with the still underneath, for the browser that refuses autoplay",
    String(videoBand?.data?.src),
  );
  check(
    videoBand?.data?.filterColor === "rgba(0,0,0,0.42)",
    "scrim soft",
    String(videoBand?.data?.filterColor),
  );

  /* A band with no `bg` must carry none of those keys — an empty bgType on
     every section is six dead settings a merchant has to read past. */
  const plain = await open({
    sections: [
      section([{ type: "heading", level: 2, text: "The math" }], "price-math-band"),
    ],
  });
  const plainBand = plain.items.find((i) => i.type === "FlexSection");
  check(
    plainBand?.data?.bgType === undefined && plainBand?.data?.filterColor === undefined,
    "a band with no background carries no background settings",
    JSON.stringify(plainBand?.data),
  );

  /* A band asking for a background the library could not resolve stays clean. A
     bgType with an empty src is a broken background, not a background. */
  const unresolved = await open({
    sections: [
      {
        type: "section",
        role: "media",
        pattern: "full-bleed-quote-band",
        css: { padding: "120px 56px" },
        bg: { kind: "photo", query: "nothing matches this", scrim: "soft" },
        children: [{ type: "heading", level: 2, text: "Quiet" }],
      },
    ],
  });
  check(
    unresolved.items.find((i) => i.type === "FlexSection")?.data?.bgType === undefined,
    "an unresolved background leaves no half-set settings behind",
  );

  /* ---- sticky, not fixed ------------------------------------------------ */

  console.log("\na sticky spec rail");

  /* The shape that shipped wrong: a rail inside a split, meant to hold beside
     the specs while they scroll. Exported as `position: fixed` it left its
     column, pinned itself to the viewport, and sat on the store's own header
     with the heading, the price and the Add to bag button over the navigation. */
  const rail = await open({
    sections: [
      section(
        [
          {
            type: "row",
            css: { gap: "64px" },
            children: [
              {
                type: "sticky",
                edge: "top",
                mobileOnly: false,
                css: { flexBasis: "40%" },
                children: [{ type: "heading", level: 2, text: "Spec'd to be worn daily" }],
              },
              { type: "col", css: { flexBasis: "60%" }, children: [{ type: "text", text: "280gsm loopback cotton fleece." }] },
            ],
          },
        ],
        "spec-rail-sticky",
      ),
    ],
  });

  /* The rule lives in the page's own stylesheet, so it is read out of there. */
  const sheet = rail.customCSS;
  check(/\.pfd-sticky\{position:sticky/.test(sheet), "the rail is position: sticky", (sheet.match(/\.pfd-sticky\{[^}]*/) ?? ["(none)"])[0]);
  check(!/position:fixed/.test(sheet), "and nothing on the page is fixed");
  check(
    /align-self:flex-start/.test(sheet),
    "with align-self, or a stretched flex child has nowhere to hold",
  );
  check(!/left:0/.test(sheet), "and no left/right, which would make a column a band");

  /* The one case where `fixed` is the point: a buy bar across the bottom of a
     phone genuinely belongs to the viewport rather than to the page. */
  const buyBar = await open({
    sections: [
      section(
        [
          {
            type: "sticky",
            edge: "bottom",
            mobileOnly: true,
            children: [{ type: "button", text: "Add to bag — $148" }],
          },
        ],
        "product-detail-gallery",
      ),
    ],
  });
  check(/\.pfd-sticky\{position:fixed/.test(buyBar.customCSS), "a phone buy bar is fixed");
  check(
    /min-width: 768px\)\{\.pfd-sticky\{position:static;left:auto/.test(buyBar.customCSS),
    "and returns to the flow above the phone, offsets and all",
  );

  /* ---- an add-to-cart button is not a button ---------------------------- */

  console.log("\nan Add to bag button");

  /* A single-product home page: a hero with a price and a real cart button, and
     no `product` node anywhere. `Button2` here is a styled anchor that cannot
     add anything, so the merchant's only route to a working button was to delete
     it and rebuild the one they had just been given. */
  const atc = await open({
    sections: [
      section(
        [
          { type: "heading", level: 1, text: "Spec'd to be worn daily" },
          {
            type: "button",
            text: "Thêm vào giỏ",
            action: "atc",
            atc: { adding: "Đang thêm…", added: "Đã thêm", soldout: "Hết hàng" },
            css: { background: "#0A0A0A", color: "#FFFFFF", padding: "16px 28px" },
          },
        ],
        "hero-editorial-stack",
      ),
    ],
  });

  const cart = atc.items.find((i) => i.type === "ProductATC2");
  check(Boolean(cart), "it became a ProductATC2, not a Button2");
  check(atc.items.every((i) => i.type !== "Button2"), "and there is no Button2 left");
  if (cart) {
    check(cart.data?.text === "Thêm vào giỏ", "the label is the design's own words", String(cart.data?.text));
    /* PageFly's defaults for these are English. A button that says `Thêm vào
       giỏ` and then `Adding...` changes language when you click it. */
    check(cart.data?.adding === "Đang thêm…", "and so are the other three states", String(cart.data?.adding));
    check(cart.data?.soldout === "Hết hàng", "including sold out", String(cart.data?.soldout));
    check(
      cart.data?.source === "custom",
      "no product on the page, so the merchant picks one",
      String(cart.data?.source),
    );
    check(cart.data?.action === "same", "and it stays on the page after adding");
    /* The style the design wrote has to survive the swap — the point was that
       the button looked right and did nothing. */
    check(
      /background:\s*#0A0A0A/i.test(atc.cssOf(cart.id)),
      "the design's styling came with it",
      atc.cssOf(cart.id).slice(0, 48),
    );
  }

  /* On a page that HAS a product, the same button binds to it instead. */
  const bound = await open({
    sections: [
      section(
        [
          { type: "product", title: "The Forge Hoodie", price: "$148", gallery: true },
          { type: "button", text: "Add to bag", action: "atc" },
        ],
        "product-detail-gallery",
      ),
    ],
  });
  check(
    bound.items.filter((i) => i.type === "ProductATC2").some((i) => i.data?.source === "auto"),
    "a page with a product binds the button to it",
  );

  /* And a plain button is still a plain button. */
  const plainBtn = await open({
    sections: [
      section([{ type: "button", text: "Shop the hoodie" }], "cta-band-full"),
    ],
  });
  check(
    plainBtn.items.some((i) => i.type === "Button2") &&
      plainBtn.items.every((i) => i.type !== "ProductATC2"),
    "a link is still a link",
  );

  /* ---- the buy box, with everything the reference had ------------------- */

  console.log("\na buy box with all four flags");

  const full = await open({
    sections: [
      section(
        [
          {
            type: "product",
            layout: "sideBySide",
            gallery: true,
            galleryEdge: "left",
            swatches: 1,
            qty: true,
            stock: true,
            express: true,
            badge: "NEW",
            badgeCorner: "TOP_LEFT",
            title: "EDC Tactical Pen",
            price: "$134.20",
            compareAt: "$201.30",
            atcText: "Add to cart",
            extras: [
              {
                type: "row",
                css: { gap: "8px", alignItems: "center" },
                children: [
                  { type: "icon", name: "star" },
                  { type: "text", text: "4.8" },
                  { type: "text", text: "42 reviews" },
                ],
              },
            ],
          },
        ],
        "product-detail-gallery",
      ),
    ],
  });

  const has = (t: string) => full.items.some((i) => i.type === t);
  check(has("ProductQuantity"), "qty became a ProductQuantity");
  check(
    full.items.filter((i) => i.type === "QuantityButton").length === 2 && has("QuantityField"),
    "with both buttons and the field, in that order",
  );
  check(has("StockIndicator"), "stock became a StockIndicator");
  check(has("ProductDynamicCheckout"), "express became a ProductDynamicCheckout");
  check(has("ProductBadge"), "badge became a ProductBadge");

  /* The badge is shown by the FLAG. Emitted as a child with showBadge left
     false it imports and never renders — present, correct, invisible. */
  const fullMedia = full.items.find((i) => i.type === "ProductMedia3");
  check(fullMedia?.data?.showBadge === true, "shown by the media element's own flag");
  check(fullMedia?.data?.badgePosition === "TOP_LEFT", "in the corner asked for");

  /* Slot order is the platform's: quantity and stock above the cart button,
     express below it. A stepper under the button is a stepper nobody sees. */
  const infoBlock = full.items.find(
    (i) =>
      i.type === "FlexBlock" &&
      i.children.some((c) => full.items.find((x) => x.id === c)?.type === "ProductATC2"),
  );
  const order = (infoBlock?.children ?? []).map(
    (c) => full.items.find((x) => x.id === c)?.type ?? "?",
  );
  const at = (t: string) => order.indexOf(t);
  check(at("ProductQuantity") < at("ProductATC2"), "quantity above the cart button", order.join(" · "));
  check(at("StockIndicator") < at("ProductATC2"), "stock above it too");
  check(at("ProductDynamicCheckout") > at("ProductATC2"), "express below it");

  /* And `extras` — the open slot, because the composite is closed. */
  check(
    at("ProductATC2") < order.length - 1,
    "the rating row landed after the buy controls",
    order.join(" · "),
  );
  check(
    full.items.some((i) => String(i.data?.value ?? "") === "42 reviews"),
    "with the words the design wrote",
  );

  /* ---- a buy column the design arranged itself --------------------------- */

  /* The order title → price → swatches → qty → stock → cart → express was never
     PageFly's: a ProductBox asks for a media element and one FlexBlock and says
     nothing about the inside of it. When the design arranges the column, the
     markers say where the bound parts go and everything between them is its
     own — which is how one store gets an offer picker above its cart button and
     another a review slideshow below it. */
  console.log("\na buy column the design arranged");

  const arranged = await open({
    sections: [
      section(
        [
          {
            type: "product",
            layout: "sideBySide",
            swatches: 2,
            qty: true,
            express: true,
            title: "Night Serum",
            price: "$68.00",
            atcText: "Add to Bag",
            children: [
              {
                type: "row",
                css: { gap: "8px", alignItems: "center" },
                children: [
                  { type: "icon", name: "star" },
                  { type: "text", text: "4.9 · 1,204 reviews" },
                ],
              },
              { type: "bound", slot: "title" },
              { type: "bound", slot: "price" },
              { type: "bound", slot: "swatches" },
              {
                type: "custom",
                label: "offer picker",
                html: '<button class="card" aria-checked="true">Three bottles</button>',
                stylesheet: '.card[aria-checked="true"]{border-color:currentColor}',
                js: 'root.querySelectorAll(".card").forEach(function(c){c.onclick=function(){}})',
              },
              { type: "bound", slot: "qty" },
              { type: "bound", slot: "atc" },
              { type: "bound", slot: "express" },
              {
                type: "accordion",
                items: [{ q: "How is it used?", a: "Two drops at night." }],
              },
            ],
          },
        ],
        "product-detail-gallery",
      ),
    ],
  });

  const aInfo = arranged.items.find(
    (i) =>
      i.type === "FlexBlock" &&
      i.children.some((c) => arranged.items.find((x) => x.id === c)?.type === "ProductATC2"),
  );
  const aOrder = (aInfo?.children ?? []).map(
    (c) => arranged.items.find((x) => x.id === c)?.type ?? "?",
  );
  const aAt = (t: string) => aOrder.indexOf(t);

  check(aAt("ProductTitle") >= 0 && aAt("ProductPrice2") >= 0, "the bound parts are real elements");
  check(aOrder[0] !== "ProductTitle", "the design's own row came first", aOrder.join(" · "));
  check(
    aAt("ProductVariantSwatches") < aAt("ProductATC2"),
    "the marker order is the column order",
  );
  check(
    aAt("Accordion3") > aAt("ProductATC2"),
    "and what the design put last is last",
    aOrder.join(" · "),
  );
  check(
    arranged.items.some((i) => String(i.data?.value ?? "").includes("1,204 reviews")),
    "the design's own rating row is in the column",
  );
  check(
    aOrder.filter((t) => t === "ProductATC2").length === 1,
    "the cart button is emitted once, not once per marker and once by habit",
  );

  /* Both shapes filled. The first real arranged column put a delivery promise
     and a benefit grid in `extras` while arranging `children`, and the first
     cut of this code dropped them without a word. */
  const both = await open({
    sections: [
      section(
        [
          {
            type: "product",
            title: "Overshirt",
            price: "$480",
            atcText: "Add to Bag",
            children: [{ type: "bound", slot: "title" }, { type: "bound", slot: "price" }, { type: "bound", slot: "atc" }],
            extras: [
              {
                type: "row",
                children: [
                  { type: "icon", name: "truck" },
                  { type: "text", text: "Order by 2 PM Fri — arrives Tue 12 Nov" },
                ],
              },
            ],
          },
        ],
        "product-detail-gallery",
      ),
    ],
  });
  check(
    both.items.some((i) => String(i.data?.value ?? "").includes("arrives Tue 12 Nov")),
    "extras written beside an arranged column are kept, not dropped",
  );

  /* The label goes in `value`, which is where every other element whose copy is
     editable puts it — Button2, Heading2, Paragraph4 all do. Writing only `text`
     imported a cart button whose label field was empty in the editor and whose
     face rendered blank, on a live storefront. */
  const atcEl = both.items.find((i) => i.type === "ProductATC2");
  check(atcEl?.data?.value === "Add to Bag", "the cart label is in `value`", String(atcEl?.data?.value));
  check(atcEl?.data?.text === "Add to Bag", "and in `text`, saying the same thing");

  const noLabel = await open({
    sections: [
      section(
        [{ type: "product", title: "X", price: "$1", atcText: "", children: [] }],
        "product-detail-gallery",
      ),
    ],
  });
  const bare = noLabel.items.find((i) => i.type === "ProductATC2");
  /* PageFly's own documented default, per fields.md. The schema has a fallback
     too, but a tree reaching the exporter unparsed — as here — must not be able
     to ship a blank button either. */
  check(bare?.data?.value === "Add to Cart", "an empty label falls back, never ships blank", String(bare?.data?.value));

  /* Two defects the editor could not show, because the editor renders both the
     old thumbnail generation and a doubled border without complaint. Only the
     live storefront told the truth. */
  console.log("\nwhat the editor rendered and the storefront did not");

  const thumbs = arranged.items.find((i) => i.type === "MediaList2");
  const thumbKids = (thumbs?.children ?? []).map(
    (c) => arranged.items.find((x) => x.id === c)?.type ?? "?",
  );
  check(
    thumbKids.length > 0 && thumbKids.every((t) => t === "MediaListItem2"),
    "thumbnails are the CURRENT generation, or clicking one does nothing live",
    thumbKids.join(" · "),
  );
  check(
    !!(thumbs?.data?.slidesToShow as Record<string, unknown> | undefined)?.mobile,
    "the strip states how many thumbnails are visible per breakpoint",
  );

  const acc = await open(
    {
      sections: [
        section(
          [{ type: "accordion", items: [{ q: "How is it used?", a: "Two drops." }] }],
          "faq-accordion",
        ),
      ],
    },
    "probe",
    { border: "#3A3A38" },
  );
  const accEl = acc.items.find((i) => i.type === "Accordion3")!;
  const rowEl = acc.items.find((i) => i.type === "Accordion3.Content.Wrapper")!;
  const headerRule = acc.cssOf(accEl.id, "all", "& .pf-header-item-wrapper");
  const rowRule = acc.cssOf(rowEl.id, "all", "&");

  check(!headerRule.includes("border-bottom"), "the header draws no border", headerRule.slice(0, 60));
  check(rowRule.includes("border-bottom"), "the row is where the one border lives", rowRule);
  check(
    rowRule.includes("#3A3A38"),
    "and it takes the page's border colour, not a black hairline invisible on a dark page",
    rowRule,
  );

  /* ---- a design that never mentioned phones ------------------------------

     The common case, and until now the broken one: a two-column band with no
     `mobile` block exported ONE breakpoint. On a 375px screen that is two
     columns of about 160 pixels, a 72px gap and a 56px heading — the page was
     not responsive, it was desktop shown small. */
  console.log("\na design that never mentioned phones");

  const noPhone = await open({
    sections: [
      section(
        [
          {
            type: "row",
            css: { gap: "72px", alignItems: "center" },
            children: [
              {
                type: "col",
                css: { flexBasis: "44%" },
                children: [{ type: "heading", level: 2, text: "A headline", css: { fontSize: "56px" } }],
              },
              { type: "image", query: "cloth", ratio: 0.82, css: { flexBasis: "56%" } },
            ],
          },
        ],
        "deep-dive-split",
      ),
    ],
  });

  const splitRow = noPhone.items.find(
    (i) => i.type === "FlexBlock" && noPhone.cssOf(i.id, "all").includes("gap: 72px"),
  )!;
  const splitMobile = noPhone.cssOf(splitRow.id, "mobile");
  check(splitMobile.length > 0, "a phone breakpoint exists at all");
  check(splitMobile.includes("flex-direction: column"), "the row stacks", splitMobile.slice(0, 60));
  check(!splitMobile.includes("gap: 72px"), "and its desktop gap does not follow it there");

  const headEl = noPhone.items.find((i) => i.type === "Heading2")!;
  const headMobile = noPhone.cssOf(headEl.id, "mobile");
  const headSize = /font-size:\s*(\d+)/.exec(headMobile)?.[1];
  check(Number(headSize) < 56, "a 56px display size comes down on a phone", `${headSize}px`);

  const imgEl = noPhone.items.find((i) => i.type === "Image5")!;
  check(
    noPhone.cssOf(imgEl.id, "mobile").includes("width: 100%"),
    "a 56% share of a row becomes full width once the row is a column",
  );

  /* Laptop and tablet exist too, and they are not just copies of the phone. */
  check(noPhone.cssOf(splitRow.id, "tablet").length > 0, "tablet is styled");
  check(
    noPhone.cssOf(splitRow.id, "laptop").includes("flex-direction: row"),
    "a laptop keeps the two columns — stacking at 1280px is the other bug",
    noPhone.cssOf(splitRow.id, "laptop").slice(0, 60),
  );

  /* And the floor never argues with a design that DID decide. */
  const decided = await open({
    sections: [
      section(
        [
          {
            type: "row",
            css: { gap: "72px" },
            mobile: { flexDirection: "row", gap: "8px" },
            children: [
              { type: "text", text: "a" },
              { type: "text", text: "b" },
            ],
          },
        ],
        "deep-dive-split",
      ),
    ],
  });
  const kept = decided.items.find(
    (i) => i.type === "FlexBlock" && decided.cssOf(i.id, "all").includes("gap: 72px"),
  )!;
  const keptMobile = decided.cssOf(kept.id, "mobile");
  check(
    keptMobile.includes("flex-direction: row") && keptMobile.includes("gap: 8px"),
    "a design that asked for a row on phones gets one — this is a floor, not a policy",
    keptMobile.slice(0, 60),
  );

  /* ---- a size chart -------------------------------------------------------

     A hand-built grid of rows stops aligning the moment two cells differ in
     length, carries no header semantics, and on a phone either overflows or
     collapses. PageFly has an element for this and the vocabulary did not. */
  console.log("\na size chart");

  const chart = await open(
    {
      sections: [
        section(
          [
            {
              type: "table",
              headerColumn: true,
              rows: [
                ["Size", "Chest", "Length"],
                ["S", "96 cm", "70 cm"],
                ["M", "102 cm", "72 cm"],
              ],
            },
          ],
          "size-fit-guide",
        ),
      ],
    },
    "probe",
    { border: "#3A3A38" },
  );

  const tbl = chart.items.find((i) => i.type === "Table2");
  check(!!tbl, "the table became a Table2, not a nest of FlexBlocks");
  check(
    !chart.items.some((i) => i.type === "ContentList2"),
    "and not a card list either",
  );

  const cells = tbl?.data?.rows as string[][] | undefined;
  check(cells?.length === 3, "the cells are DATA, not children", String(cells?.length));
  check(cells?.[0]?.[0] === "Size", "the header row is row zero");
  check(cells?.[2]?.[1] === "102 cm", "and the values arrive verbatim");

  const slots = (tbl?.children ?? []).map(
    (c) => chart.items.find((x) => x.id === c)?.type ?? "?",
  );
  check(
    slots.join(",") === "Table2.RowHeader,Table2.ColumnHeader,Table2.ColumnBody,Table2.Body",
    "four slots, in the order the validator requires",
    slots.join(" · "),
  );
  check(
    tbl?.data?.columnHeadersPosition === "left",
    "headerColumn true puts the row labels down the left",
  );
  check(
    (tbl?.data?.columnsWidth as Record<string, string> | undefined)?.mobile === "hug",
    "columns hug on a phone, whatever they do on a desktop",
  );

  /* Ragged input is a table with holes in it. The schema pads; assert the
     exporter never sees a short row. */
  const ragged = await open({
    sections: [
      section(
        [{ type: "table", rows: [["A", "B", "C"], ["1"]] }],
        "size-fit-guide",
      ),
    ],
  });
  const raggedCells = ragged.items.find((i) => i.type === "Table2")?.data?.rows as string[][];
  check(
    raggedCells?.[1]?.length === 3,
    "a short row is padded to the widest, not left with holes",
    JSON.stringify(raggedCells?.[1]),
  );

  /* A design that forgets one of the three parts a buy box cannot do without
     gets it appended. Losing the page over a missing marker would cost far more
     than a button in the wrong place. */
  const forgot = await open({
    sections: [
      section(
        [
          {
            type: "product",
            title: "Night Serum",
            price: "$68.00",
            atcText: "Add to Bag",
            children: [
              { type: "text", text: "Only the words, and no markers at all." },
            ],
          },
        ],
        "product-detail-gallery",
      ),
    ],
  });
  const fTypes = forgot.items.map((i) => i.type);
  check(fTypes.includes("ProductATC2"), "a forgotten cart button is appended");
  check(fTypes.includes("ProductTitle"), "so is a forgotten title");
  check(fTypes.includes("ProductPrice2"), "and a forgotten price");

  /* And the old shape is untouched: no `children` is the fixed sequence, with
     `extras` under the cart button exactly where it always was. */
  check(
    !full.items.some((i) => i.type === "ProductBound"),
    "a buy box with no arrangement emits no markers",
  );

  /* ---- text on a photograph, three across ------------------------------- */

  /* `usecase-tiles-overlay` — "the highest-value non-hero pattern", and the one
     that shipped three full-screen empty boxes. Three separate defects met in
     it and each is asserted below, because each of them alone is enough to make
     the section look broken:

       the tile had no photograph   nothing collected an overlay's query, so the
                                    scrim gradient painted over nothing
       the tile was a screen tall   `ratio` is a SHAPE, written as a fraction of
                                    the viewport width, then clamped to 100vh
       the row was not a card list  `cardList` allowed col/row/image children,
                                    and `elementFor` says this pattern IS a
                                    ContentList2 */

  console.log("\nthree overlay tiles across");

  const TILE_QUERIES = [
    "woman wearing a fine gold chain at a kitchen window",
    "gold hoop earrings on a dressing table at night",
    "stacked gold bracelets on a wrist, daylight",
  ];

  const tilesTree = {
    sections: [
      section(
        [
          {
            type: "row",
            css: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" },
            children: TILE_QUERIES.map((query, i) => ({
              type: "overlay",
              query,
              ratio: 1.15,
              scrim: "bottom",
              align: "bottom-left",
              children: [
                { type: "text", text: ["THE MORNING", "THE EVENING", "THE EVERYDAY"][i] },
                { type: "heading", level: 3, text: "A single chain" },
                { type: "text", text: "One quiet piece that does the work before you speak." },
              ],
            })),
          },
        ],
        "usecase-tiles-overlay",
      ),
    ],
  };

  /* Every overlay query the tree asks for must be asked FOR. This is the only
     assertion here that is not about `toPagefly` — it is about the step before
     it, and it lives beside the others because the three of them are one
     section's worth of damage and are meant to be read together. */
  const { imageWants } = await import("../lib/design/imageWants");
  const asked = new Set(imageWants(tilesTree as never).map((w) => w.query));
  check(
    TILE_QUERIES.every((q) => asked.has(q)),
    "an overlay's photograph is asked for",
    TILE_QUERIES.filter((q) => !asked.has(q)).join(" · ") || "",
  );

  const tiles = await open(tilesTree, "tiles", {
    images: Object.fromEntries(TILE_QUERIES.map((q, i) => [q, `https://example.test/tile-${i}.jpg`])),
  });
  const tileType = (t: string) => tiles.items.filter((i) => i.type === t);

  const tileList = tileType("ContentList2")[0];
  check(Boolean(tileList), "the tile row became a ContentList2", tileList ? "" : "still a FlexBlock");
  if (tileList) {
    check(
      tileType("ContentListItem").length === 3,
      "one ContentListItem per tile",
      `${tileType("ContentListItem").length}`,
    );
    const shown = tileList.data?.slidesToShow as Record<string, number> | undefined;
    check(shown?.all === 3, "three across, as DATA", String(shown?.all));
  }

  /* The tiles themselves: the FlexBlocks carrying a scrim gradient. */
  const tileBoxes = tiles.items.filter((i) => /linear-gradient/.test(tiles.cssOf(i.id)));
  check(tileBoxes.length === 3, "three tiles carry a scrim", `${tileBoxes.length}`);

  for (const box of tileBoxes.slice(0, 1)) {
    const css = tiles.cssOf(box.id);
    check(/url\("https:\/\/example\.test\//.test(css), "the photograph is in the tile", css.slice(0, 90));
    /* THE HEIGHT BUG. `ratio` is cao/rộng of THIS box. As `vw` it is a fraction
       of the whole viewport, so a tile one third of the row wide asked for
       115vw and got clamped to exactly one screen. */
    check(
      !/min-height:\s*\d+vw/.test(css),
      "the tile's shape is not a fraction of the viewport",
      (/min-height:\s*\d+vw/.exec(css) ?? [""])[0],
    );
    check(/aspect-ratio:/.test(css), "the tile states its aspect ratio", css.slice(0, 90));
  }

  /* ---- and the class the form bug belonged to --------------------------- */

  console.log("\nevery element, every page above");

  const everything = [
    ...items, ...split, ...withProduct, ...pdp, ...grid, ...featured,
    ...carousel, ...stats.items, ...shaped.items, ...form.items,
    ...stacked.items, ...inRow.items, ...labelled.items,
    ...slider.items, ...exact.items, ...banded.items, ...plain.items, ...unresolved.items,
    ...rail.items, ...buyBar.items, ...atc.items, ...bound.items, ...plainBtn.items, ...full.items,
    ...tiles.items,
  ];
  /* Body and Layout are excluded: the format doc says both are required and
     carry no styles, they are built outside the element path, and neither has
     ever been something a merchant can click. Everything BELOW them is an
     element with a settings panel, and a panel reading `item.data.x` off an
     absent `data` is what "Something went wrong" looks like. */
  const dataless = everything.filter(
    (i) => i.data === undefined && i.type !== "Body" && i.type !== "Layout",
  );
  check(
    dataless.length === 0,
    "no element reaches the editor without a data key",
    dataless.length ? [...new Set(dataless.map((i) => i.type))].join(", ") : "",
  );

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
