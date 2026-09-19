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
import { readFileSync } from "node:fs";
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
    band?: string;
    radius?: number;
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
      ...(media.band ? { band: media.band } : {}),
      ...(media.radius === undefined ? {} : { radius: media.radius }),
    },
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const files = unzipSync(bytes);
  const entry = Object.keys(files)[0];
  const page = JSON.parse(strFromU8(files[entry])) as {
    items: Item[];
    styles: { id: string; styles: string }[];
    customCSS?: string;
    customJS?: string;
  };

  /** The `&` rule for one item, at one breakpoint. Where the fidelity bugs are:
      an element can be the right element and still carry the wrong type. */
  const cssOf = (id: string, device = "all", selector = "&"): string => {
    const entryFor = page.styles.find((s) => s.id === id);
    if (!entryFor) return "";
    const parsed = JSON.parse(entryFor.styles) as Record<string, Record<string, string>>;
    return parsed[device]?.[selector] ?? "";
  };

  return { items: page.items, cssOf, customCSS: page.customCSS ?? "", customJS: page.customJS ?? "" };
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

    /* ====================================================================
       THE DOCUMENTED DEFAULTS ARE WRITTEN, NOT ASSUMED.

       `fields.md` gives each of these a default, and an absent boolean is
       `undefined` — falsy to anything reading it directly. A strip that
       renders and then ignores a click is what a disabled list setting looks
       like from the outside, and it cannot be told apart from a working one
       in the editor, which is where this kind of thing hides.
       ==================================================================== */
    for (const [field, want] of [
      ["source", "auto"],
      ["enableImageListSetting", true],
      ["enableImageMagnifier", true],
      ["imageSource", "default-variant"],
      ["onHover", "NEXT_IMAGE"],
    ] as const) {
      check(
        media.data?.[field] === want,
        `${field} is stated, not left to a default that may not arrive`,
        String(media.data?.[field]),
      );
    }

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

  /* THE FIELD OUTLINE, which was the one control in this file that read no
     palette. `rgba(0,0,0,.16)` and a 6px corner were written into the rule, so
     a newsletter band on an inverted section exported a field outlined in a
     colour that is not there — and nearly every page in a deck ends on one. */
  {
    const styled = await open(
      {
        sections: [
          section(
            [
              {
                type: "form", intent: "newsletter", submitText: "→",
                fields: [{ label: "Email", kind: "email", required: true }],
              },
            ],
            "newsletter-inline",
          ),
        ],
      },
      "probe",
      { border: "rgba(250,247,242,.22)", accent: "#B4552C", radius: 14 },
    );
    const wrap = styled.items.find((i) => i.type === "Form2");
    const rule = styled.cssOf(wrap?.id ?? "", "all", "& input");
    check(rule.includes("rgba(250,247,242,.22)"), "the input takes the page's border", rule.slice(0, 70));
    check(rule.includes("border-radius: 14px"), "and the page's radius");
    /* White is the browser's default and the brightest thing on a dark band. */
    check(rule.includes("background: transparent"), "and does not paint itself white");

    const btn = styled.cssOf(wrap?.id ?? "", "all", "& button");
    check(btn.includes("#B4552C"), "the button takes the accent", btn.slice(0, 60));
    check(btn.includes("border-radius: 14px"), "and the same radius as the field beside it");

    /* ====================================================================
       EVERY PART OF THE FORM HAS A WIDTH, AND ONE OF THEM MUST NOT HAVE A
       STYLE.

       `& input { width: 100% }` is a hundred percent of whatever box the input
       sits in, and both boxes around it — Form2.Field and FormInput — were
       built with a null styleData, so neither had a width and the engine hugged
       them. What shipped was a label, a forty-pixel email field beside it, and
       a full-width button underneath.

       The first attempt fixed that by giving both a style. `fields.md` marks
       FormInput "cannot be styled on its own", and that note is not a
       preference: a style entry on it made the editor answer "Something went
       wrong" the moment a merchant clicked the field, over the whole page. So
       the width for that one is set on the Form2 by type, where the
       documentation puts its look.
       ==================================================================== */
    const field = styled.items.find((i) => i.type === "Form2.Field");
    check(styled.cssOf(field?.id ?? "") !== "", "Form2.Field has a style entry of its own");
    check(
      /width:\s*100%/.test(styled.cssOf(field?.id ?? "")),
      "and fills the form's width",
      styled.cssOf(field?.id ?? "").slice(0, 56),
    );

    const input = styled.items.find((i) => i.type === "FormInput");
    check(Boolean(input), "the input is built");
    check(
      styled.cssOf(input?.id ?? "") === "",
      "FormInput carries NO style of its own — the editor refuses the page otherwise",
      styled.cssOf(input?.id ?? "") || "(none, correct)",
    );

    /* Its width comes from the parent instead, by type, alongside the rule that
       paints the `<input>` itself. */
    check(
      /width:\s*100%/.test(styled.cssOf(wrap?.id ?? "", "all", '& [data-pf-type="FormInput"]')),
      "its width is set on the Form2 by type",
      styled.cssOf(wrap?.id ?? "", "all", '& [data-pf-type="FormInput"]') || "(no rule)",
    );

    /* The button is content-sized, which is what a submit button should be
       beside a full-width field — and it IS styleable, so it keeps its entry. */
    const btn2 = styled.items.find((i) => i.type === "Form2.Button2");
    check(
      /--pf-flex-layout-width:\s*hug/.test(styled.cssOf(btn2?.id ?? "")),
      "the button hugs its label",
      (styled.cssOf(btn2?.id ?? "").match(/--pf-flex-layout-width:[^;]*/) ?? ["(unsaid)"])[0],
    );
  }

  /* ---- a stack is one per row, not N across ----------------------------- */

  /* ---- tabs, which used to be three words above one block --------------- */

  console.log("\ntabs");

  {
    const tabs = await open(
      {
        sections: [
          section(
            [
              {
                type: "tabs",
                open: 1,
                items: [
                  { label: "Regular", children: [{ type: "text", text: "Regular fit" }] },
                  { label: "Oversized", children: [{ type: "text", text: "Oversized fit" }] },
                  { label: "Tall", children: [{ type: "table", rows: [["Size", "XS"], ["Chest", "96"]] }] },
                ],
              },
            ],
            "size-fit-guide",
          ),
        ],
      },
      "probe",
      { border: "#3A3A38", accent: "#C9A24B" },
    );

    /* ======================================================================
       PAGEFLY'S OWN TABS, AND THE ROUTE MATTERS.

       A note in `tabsOf` used to record that Tabs3 had been tried and
       abandoned. It had — through the placement rule, which says to emit the
       element alone and fill `content.items:[{label,content}]`. That key made
       an export import successfully and never reach the editor's list, twice,
       and the assertion here was `not Tabs3` to keep anybody from trying it
       again.

       The lesson is kept and the conclusion is not. `nesting.md` describes a
       second shape for the same element — Tabs3 holding TabsMenu3 and
       TabContentWrapper3, TabsContent3 taking 152 of the 241 types — which is
       the ordinary composite this file already builds for Accordion3 and
       ProductBox. So the assertions below check that shape AND check that the
       route known to break is still not taken.

       What the radio bar cost, and why it went: a merchant opening the tabs
       in the editor found `HTML/Liquid` and a code box. No list of tabs, no
       renaming, no reordering, no fifth tab. The page switched panels and
       could not be edited, which is the failure this whole exporter exists to
       avoid.
       ====================================================================== */
    const shell = tabs.items.find((i) => i.type === "Tabs3");
    check(Boolean(shell), "PageFly's own Tabs3, not a bar of hidden radios");
    check(
      tabs.items.every((i) => i.type !== "Custom.HTML"),
      "and no markup block standing in for the header row",
    );

    const menu = tabs.items.find((i) => i.type === "TabsMenu3");
    const wrapper = tabs.items.find((i) => i.type === "TabContentWrapper3");
    check(Boolean(menu && wrapper), "the two slots the element requires");

    /* THE MENU'S HEADERS, NOT EVERY TabHeader3. `Tabs3` also carries two loose
       ones that are the scroll arrows — `isNavButton: "start"` and `"end"` in
       PageFly's own export, where the menu's own headers carry `false`.
       Counting all five would make this assertion about the wrong thing. */
    const headers = tabs.items.filter(
      (i) => i.type === "TabHeader3" && menu?.children.includes(i.id),
    );
    check(headers.length === 3, "one header per tab", String(headers.length));
    check(
      tabs.items.filter((i) => i.type === "DropdownButton").length === 1,
      "and the dropdown slot the element declares",
    );
    check(
      tabs.items.filter(
        (i) => i.type === "TabHeader3" && !menu?.children.includes(i.id),
      ).length === 2,
      "and the two scroll arrows",
    );
    /* The label is `value` ON the header. Nested as a Heading it imports and
       the editor shows an empty tab — the same trap as ACCORDION_HEADER. */
    const labels = headers.map((h) => String((h.data as Record<string, unknown>)?.value ?? ""));
    for (const l of ["Regular", "Oversized", "Tall"])
      check(labels.includes(l), `the label "${l}" rides on the header itself`);

    const panels = tabs.items.filter((i) => i.type === "TabsContent3");
    check(panels.length === 3, "and one panel per tab", String(panels.length));

    const texts = tabs.items
      .filter((i) => i.type === "Paragraph4")
      .map((i) => String((i.data as Record<string, unknown>)?.value ?? ""));
    for (const want of ["Regular fit", "Oversized fit", "Chest"])
      check(texts.includes(want), `panel content "${want}" arrives`);

    /* A panel holds REAL nodes, which is the whole reason for taking the
       nesting route rather than the `content.items` one — that route carries a
       label and a string, and this design puts a table in a tab. */
    check(
      texts.includes("Size") && texts.includes("96"),
      "a table inside a tab is built, not flattened to prose",
    );

    /* `activeTab` IS THE HEADER'S OWN INDEX — settled by PageFly's own export,
       against this file's previous reading of it. The reference has header 1
       carrying 0, header 2 carrying 1, header 3 carrying 2, and `Tabs3.active`
       saying which of them opens. Written as "the open tab, counting from one"
       on every header, all three claimed to be the same tab, and the menu
       carried a key the editor writes on nothing. */
    const d = (shell?.data ?? {}) as Record<string, unknown>;
    check(d.activeFront === 1, "open:1 is the tab that starts open", String(d.activeFront));
    check(
      headers.every((h, i) => (h.data as Record<string, unknown>)?.activeTab === i),
      "each header carries its own index",
      headers.map((h) => (h.data as Record<string, unknown>)?.activeTab).join(","),
    );
    check(
      (menu?.data as Record<string, unknown>)?.activeTab === undefined,
      "and the menu carries none — the editor writes it on nothing else",
      String((menu?.data as Record<string, unknown>)?.activeTab),
    );

    /* THE ROUTE THAT BROKE IMPORTS IS STILL NOT TAKEN. An item-level `content`
       key is what made two exports import and vanish. */
    check(
      !("items" in d) && !("content" in d),
      "and the content.items fill route is not used",
      Object.keys(d).join(" "),
    );

    /* TabHeader3 says in `fields.md` that it cannot be styled on its own — its
       look is set on the parent — so a rule written against the header would be
       valid CSS reaching nothing. */
    const shellCss = tabs.cssOf(shell?.id ?? "", "all", '& [data-pf-type="TabsMenu3"] > label');
    check(/text-transform:\s*uppercase/.test(shellCss), "labels styled through the parent's documented part", shellCss.slice(0, 70) || "(no rule)");
    check(
      /border-bottom/.test(tabs.cssOf(shell?.id ?? "", "all", "& .tab3-headers-wrapper")),
      "and the bar through its own",
    );
  }

  /* ======================================================================
     A TABLE THAT CAN BE READ AT ANY WIDTH.

     Reported from the editor at 1025px: a two-column spec table with
     `SPECIFICATION` running down the page one letter per line. Two rules were
     asking for opposite things — the wrapper carried `overflow-x: auto`,
     expecting rows wider than the box, and every cell carried `min-width: 0`,
     guaranteeing they never would be. So nothing scrolled and the words came
     apart instead.

     The mockup never had the bug: `render.tsx` gives its table 110px a column.
     The export and the picture disagreeing about the same table is the class
     of failure this whole file exists to prevent, so the floor is now the same
     number in both.
     ====================================================================== */
  console.log("\na table at a narrow width");

  {
    const t = await open({
      sections: [
        section(
          [{ type: "table", rows: [["Specification", "Detail"], ["Alloy", "Unlacquered solid brass"]] }],
          "spec-rail-sticky",
        ),
      ],
    });

    const cells = t.items.filter((i) => i.type === "Paragraph4");
    check(cells.length >= 4, "every cell is built", String(cells.length));

    const cellCss = t.cssOf(cells[0]?.id ?? "");
    check(
      !/min-width:\s*0/.test(cellCss),
      "no cell may shrink past its own longest word",
      cellCss.slice(0, 80),
    );

    /* The row carries the floor, as the mockup's table does — 110px a column,
       two columns, 220px. Below that the wrapper scrolls rather than the words
       breaking. */
    const rows = t.items.filter(
      (i) => i.type === "FlexBlock" && /flex-direction:\s*row/.test(t.cssOf(i.id)),
    );
    const withFloor = rows.filter((r) => /min-width:\s*220px/.test(t.cssOf(r.id)));
    check(withFloor.length >= 2, "each row has a floor of 110px a column", String(withFloor.length));

    /* The wrapper is whichever block carries the scroll, not the first one in
       the file — the section has blocks of its own above it. */
    const scroller = t.items.filter(
      (i) => i.type === "FlexBlock" && /overflow-x:\s*auto/.test(t.cssOf(i.id)),
    );
    check(scroller.length === 1, "and exactly one wrapper can scroll", String(scroller.length));
  }

  /* ======================================================================
     THE WIDTH CHAIN MAY NOT LIVE IN `customCSS`.

     Three commits fixed the one-letter-per-line collapse by rewriting one
     `min-width` rule inside `pageCss()`, and the editor stayed broken every
     time. `customCSS` runs on preview and live and NOT in the editor canvas —
     see `docs/pagefly-file-format.md` — so every layout guarantee written
     there is absent in the one place the merchant meets the page first.

     The collapse itself is what PageFly's Flex engine does to a container with
     no definite width: the export makes every block `--pf-flex-layout-width:
     fill`, which the engine expands to `flex-grow: 1; flex-basis: 0px`, and a
     chain of those resolves to nothing unless something at the top states a
     real width. That statement was `.pf-design-export { width: 100% }` — in
     `customCSS`. In the editor there was nothing holding the page open, so a
     text band squeezed to about one character.

     These tests lock the rule rather than the instance: whatever the export
     needs in order to lay out has to be in the element's OWN styleData, which
     the editor reads. `customCSS` is for decoration — the webfont and the
     resets — and a page whose stylesheet were dropped entirely must still come
     out the right shape.
     ====================================================================== */
  console.log("\nthe width chain, and where it has to live");

  {
    /* No product, no productList, no accordion: `needsFill` is false, so this
       is the section that had nothing holding it open. */
    const band = await open({
      sections: [
        section(
          [
            {
              type: "row",
              css: { display: "flex", gap: "48px" },
              children: [
                {
                  type: "col",
                  css: { display: "flex", flexDirection: "column" },
                  children: [
                    { type: "heading", level: 2, text: "Every dollar stays within a few blocks" },
                    { type: "text", text: "The owner drives the van herself." },
                  ],
                },
                { type: "image", query: "shop front", css: { width: "50%" } },
              ],
            },
          ],
          "story-band",
        ),
      ],
    });

    /* The content block — the one carrying `pf-design-export`. Its width used
       to come only from the class rule. */
    const content = band.items.find(
      (i) => i.type === "FlexBlock" && String(i.data?.classGlobalStyling ?? "").includes("pf-design-export"),
    );
    const contentCss = band.cssOf(content?.id ?? "");
    check(Boolean(content), "the content block is found");
    check(
      /width:\s*100%/.test(contentCss),
      "the content block states its own width, not the stylesheet's",
      contentCss.slice(0, 120) || "(no css)",
    );
    check(
      /max-width:\s*1180px/.test(contentCss),
      "and its own page cap",
      (contentCss.match(/max-width:[^;]*/) ?? ["(no cap)"])[0],
    );

    /* A word-carrying leaf keeps the floor a browser would have given it. */
    const heading = band.items.find((i) => i.type === "Heading2");
    const para = band.items.find((i) => i.type === "Paragraph4");
    for (const [label, item] of [
      ["a heading", heading],
      ["a paragraph", para],
    ] as const) {
      const css = band.cssOf(item?.id ?? "");
      check(
        /min-width:\s*min-content/.test(css),
        `${label} may not shrink past its longest word`,
        (css.match(/min-width:[^;]*/) ?? ["(no floor)"])[0],
      );
    }

    /* And a box still may: that is how a two-column row narrows. */
    const box = band.items.find(
      (i) => i.type === "FlexBlock" && !String(i.data?.classGlobalStyling ?? "").includes("pf-design-export"),
    );
    check(
      /min-width:\s*0/.test(band.cssOf(box?.id ?? "")),
      "a box may still shrink",
      (band.cssOf(box?.id ?? "").match(/min-width:[^;]*/) ?? ["(no rule)"])[0],
    );

    /* A PICTURE HAS NO WORDS TO PROTECT, and `min-content` means something
       else entirely on a replaced element: the photograph's own intrinsic
       width. A 2000px source would refuse to shrink below 2000px and take the
       row open with it — the floor turned into the overflow it exists to
       prevent. The floor is for text; anything without text keeps the zero. */
    const img = band.items.find((i) => i.type === "Image5");
    check(
      /min-width:\s*0/.test(band.cssOf(img?.id ?? "")),
      "a picture keeps the zero — min-content there is its intrinsic width",
      (band.cssOf(img?.id ?? "").match(/min-width:[^;]*/) ?? ["(no rule)"])[0],
    );

    /* THE COMPOSITES THAT LAY THEIR OWN CHILDREN OUT IN A ROW.

       A column's min-content is its widest word; a ROW's is the sum of its
       children's, which on a narrow rail is wider than the rail. The old page
       rule named ProductBox, ProductMedia3, MediaList2, Slideshow and Tabs3 for
       exactly this reason, and the floor moving onto the elements has to carry
       that with it — otherwise they overflow instead of reflowing. */
    const rowish = await open({
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
            { type: "productList", columns: 3, limit: 3, source: "collection", listLayout: "grid", query: "bedding" },
          ],
          "showcase",
        ),
      ],
    });
    for (const type of ["Slideshow", "MediaList2", "ProductList2"]) {
      const node = rowish.items.find((i) => i.type === type);
      if (!node) continue;
      check(
        !/min-width:\s*min-content/.test(rowish.cssOf(node.id)),
        `${type} lays out in a row, so it keeps the zero`,
        (rowish.cssOf(node.id).match(/min-width:[^;]*/) ?? ["(no rule)"])[0],
      );
    }

    /* THE RULE ITSELF. Nothing that decides a layout may be left in the
       stylesheet the editor does not read. */
    check(
      !/min-width/.test(band.customCSS),
      "no min-width is left in customCSS",
      (band.customCSS.match(/[^\n]*min-width[^\n]*/) ?? ["(none)"])[0].trim(),
    );
    /* The page cap specifically. `img { max-width: 100% }` may stay: it keeps a
       picture inside a box that already has a width, which is decoration. The
       rule that GIVES the page its width may not. */
    check(
      !/\.pf-design-export \{/.test(band.customCSS),
      "and the page cap is no longer a class rule",
      (band.customCSS.match(/[^\n]*\.pf-design-export \{[^\n]*/) ?? ["(none)"])[0].trim(),
    );
  }

  /* ======================================================================
     THE SAME RULE ON THE OTHER EXPORT PATH.

     `fromDom.ts` is the DOM walk a deck saved before the design tree existed
     still exports through, and it shipped the original blanket `min-width: 0`
     and the same class-scoped page cap — the two rules the tree path has just
     moved onto the elements. A stylesheet the editor does not read is no more
     load-bearing on one path than the other.

     Only the stylesheet is asserted here. The per-element half of that path
     cannot be tested in Node: `fromDom` reads `getComputedStyle` and measured
     boxes, and jsdom does no layout, so a harness for it needs a real headless
     browser. That is a separate piece of infrastructure and it does not exist
     yet — see the note in `docs/pagefly-file-format.md`.
     ====================================================================== */
  /* ======================================================================
     AND THE LIST MAY NOT GO STALE.

     Every version of this floor has been a list, and every version broke when
     the list fell behind the vocabulary — `Paragraph4` and `Heading2` named
     while `Button2` was not, and a filter rail came back with CLEAR ALL set one
     letter per line. The classification now lives beside `schema.ts`'s node
     types, so this reads that file and insists the two agree: a node type
     nobody has classified is the bug, caught here rather than in an import.

     A new type defaults to keeping the floor, which is the safe side — this
     test failing means "decide", not "it is broken".
     ====================================================================== */
  console.log("\nevery node type is classified");

  {
    const { _internals } = await import("../lib/design/toPagefly");
    const schemaSrc = readFileSync(
      new URL("../lib/design/schema.ts", import.meta.url),
      "utf8",
    );
    const vocabulary = [
      ...new Set([...schemaSrc.matchAll(/z\.literal\("([a-zA-Z]+)"\)/g)].map((m) => m[1])),
    ].filter((t) => t !== "section");

    /* The word-carriers, and the whole point of the default: anything holding
       text this exporter writes into a single element keeps `min-content`. */
    const CARRIES_WORDS = ["bound", "button", "countdown", "counter", "heading", "text"];
    const keeps = vocabulary.filter((t) => !_internals.mayShrink(t)).sort();
    check(
      keeps.join(" ") === CARRIES_WORDS.join(" "),
      "exactly the word-carrying node types keep the floor",
      keeps.join(" ") || "(none)",
    );
    check(
      vocabulary.length >= 20,
      "and the vocabulary was actually read from schema.ts",
      `${vocabulary.length} types`,
    );
  }

  /* ======================================================================
     THE FLOOR REACHES WHAT COMPOSITES BUILD, TOO.

     `cssAt` gives every design-tree node a `min-width`, and that is where the
     one-character-per-line fix lives. But a composite's internals never pass
     through it: a table's cells, an accordion's rows, a media list's items and
     every part of a buy box are constructed in `builder.ts` and reach the file
     with whatever that function wrote.

     Measured on a real export: 129 of 412 elements carried a style entry and no
     `min-width` at all — 65 of them Paragraph4, which is the element the
     collapse is visible on.

     ONLY WHERE A STYLE ALREADY EXISTS. Forty-five more elements have no style
     entry, and two of them must never have one — `fields.md` marks `FormInput`
     and `TabHeader3` "cannot be styled on its own", and giving `FormInput` a
     style once took the whole editor down on a click. Creating entries to carry
     a floor would walk straight back into that.
     ====================================================================== */
  console.log("\nthe floor inside a composite");

  {
    const table = await open({
      sections: [
        section(
          [
            {
              type: "table",
              rows: [
                ["Maat", "34", "36", "38"],
                ["Borst (cm)", "82", "86", "90"],
              ],
            },
          ],
          "spec-table",
        ),
      ],
    });

    const cells = table.items.filter((i) => i.type === "Paragraph4");
    check(cells.length > 0, "the table has cells to check", `${cells.length}`);
    const floored = cells.filter((c) => /min-width/.test(table.cssOf(c.id)));
    check(
      floored.length === cells.length,
      "every table cell carries a floor",
      `${floored.length}/${cells.length}`,
    );
    check(
      /min-width:\s*min-content/.test(table.cssOf(cells[0]?.id ?? "")),
      "and it is min-content — a cell carries words",
      (table.cssOf(cells[0]?.id ?? "").match(/min-width:[^;]*/) ?? ["(none)"])[0],
    );

    /* The row is a box and must still be able to shrink; its own 110px-a-column
       floor is what makes the table scroll rather than break. */
    const rows = table.items.filter(
      (i) => i.type === "FlexBlock" && /flex-direction: row/.test(table.cssOf(i.id)),
    );
    check(
      rows.length > 0 && rows.every((r) => /min-width/.test(table.cssOf(r.id))),
      "and the rows keep the floor they already had",
      table.cssOf(rows[0]?.id ?? "").match(/min-width:[^;]*/)?.[0] ?? "(none)",
    );
  }

  {
    /* The two the reference forbids a style on. A floor must not be the thing
       that finally gives them one. */
    const form = await open({
      sections: [
        section(
          [
            {
              type: "form",
              intent: "signup",
              submit: "Aanmelden",
              fields: [{ label: "E-mailadres", kind: "email", required: true }],
            },
          ],
          "signup-band",
        ),
      ],
    });
    for (const type of ["FormInput"]) {
      const el = form.items.find((i) => i.type === type);
      if (!el) continue;
      check(
        form.cssOf(el.id) === "",
        `${type} still carries no style of its own`,
        form.cssOf(el.id) || "(none)",
      );
    }
  }

  console.log("\nthe DOM-walk path's stylesheet");

  {
    const { __pageCssForTest } = await import("../lib/pagefly/fromDom");
    const css = __pageCssForTest();
    check(
      !/min-width/.test(css),
      "no min-width is left in the fallback's customCSS",
      (css.match(/[^\n]*min-width[^\n]*/) ?? ["(none)"])[0].trim(),
    );
    check(
      !/\.pf-design-export \{/.test(css),
      "and its page cap is no longer a class rule either",
      (css.match(/[^\n]*\.pf-design-export \{[^\n]*/) ?? ["(none)"])[0].trim(),
    );
  }

  /* ======================================================================
     AND NOTHING ANYWHERE CARRIES A STYLE IT CANNOT CARRY.

     `fields.md` marks exactly two elements "cannot be styled on its own", and
     a style entry on one of them is not a cosmetic mistake — it is a page the
     editor will not open. FormInput got one and clicking a form field answered
     "Something went wrong" over the whole page.

     Asserted over a page carrying both of them rather than at the two call
     sites, because the next builder to reach for one of these types will not
     be looking at this test.
     ====================================================================== */
  console.log("\nthe two elements that must carry no style");

  {
    const both = await open({
      sections: [
        section(
          [
            {
              type: "form", intent: "contact", submitText: "Send",
              fields: [{ label: "Email", kind: "email", required: true }],
            },
            {
              type: "tabs", open: 0,
              items: [
                { label: "One", children: [{ type: "text", text: "First" }] },
                { label: "Two", children: [{ type: "text", text: "Second" }] },
              ],
            },
          ],
          "faq-two-column",
        ),
      ],
    });

    for (const ty of ["FormInput", "TabHeader3"] as const) {
      const nodes = both.items.filter((i) => i.type === ty);
      check(nodes.length > 0, `${ty} is on the page to be checked`, String(nodes.length));
      check(
        nodes.every((n) => both.cssOf(n.id) === ""),
        `and no ${ty} carries a style of its own`,
        nodes.map((n) => both.cssOf(n.id)).filter(Boolean).join(" | ") || "(none, correct)",
      );
    }
  }

  /* ======================================================================
     A BAND'S TEXT IS THE BAND'S, NOT THE PAGE'S.

     `opts.ink` was set once from the page and written into every composite —
     the table's cells, the accordion's rows. That exists because PageFly makes
     a composite inherit from the MERCHANT'S theme rather than from the surface
     it sits on, so stating nothing came back dark-on-dark and invisible.

     One colour for a whole page is right until a band inverts. Reported from
     the editor: a spec table on a near-black band, its cells carrying the
     page's dark ink — present, correctly positioned, unreadable. The mockup
     never had it, because there the cells state no colour and inherit the one
     the design put on the band.
     ====================================================================== */
  console.log("\nink follows the band");

  {
    const band = (bg: string, pattern: string) => ({
      type: "section", pattern, role: "content",
      css: { padding: "96px 56px", background: bg },
      children: [
        { type: "table", rows: [["Specification", "Detail"], ["Alloy", "Solid brass"]] },
        { type: "accordion", items: [{ q: "Question?", a: "Answer." }] },
      ],
    });

    const bands = await open(
      {
        sections: [
          band("#F6F3EC", "light-band"),
          band("#28301F", "dark-band"),
          /* Neither the page background nor its ink — a conversion strip in the
             accent. A `dark` boolean cannot answer this one; contrast can. */
          band("#5C7A4A", "accent-band"),
        ],
      },
      "probe",
      { border: "rgba(40,48,31,.14)", accent: "#5C7A4A" },
    );



    /* Read the colours straight off every text node in the page, grouped by the
       band each one sits under. */
    const byId = new Map(bands.items.map((i) => [i.id, i]));
    const colours = (rootId: string): string[] => {
      const out: string[] = [];
      const walk = (id: string) => {
        const n = byId.get(id);
        if (!n) return;
        if (n.type === "Paragraph4") {
          const c = /color:\s*([^;]+)/.exec(bands.cssOf(n.id))?.[1]?.trim();
          if (c) out.push(c);
        }
        for (const k of n.children ?? []) walk(k);
      };
      walk(rootId);
      return [...new Set(out)];
    };

    const sections = bands.items.filter((i) => i.type === "FlexSection");
    check(sections.length === 3, "three bands", String(sections.length));

    const [light, dark, accent] = sections.map((sec) => colours(sec.id));

    /* Asserted against each other rather than against two hex literals: the
       page's own palette belongs to the helper, and a test that restates it is
       a test that breaks when somebody changes a default it was never about. */
    check(light.length === 1 && dark.length === 1, "each band settles on one ink", `${light} / ${dark}`);
    check(light.join() !== dark.join(), "and the two bands do not share it", `${light} vs ${dark}`);

    const lum = (hex: string) => {
      const m = /^#?([0-9a-f]{6})/i.exec(hex.trim());
      if (!m) return -1;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    check(lum(dark.join()) > lum(light.join()), "the dark band's text is the lighter of the two", `${dark} vs ${light}`);

    /* Neither the page background nor its ink. A `dark` boolean cannot answer
       this one; contrast can, and it lands on the same side as the dark band. */
    check(
      accent.join() === dark.join(),
      "and an accent band takes whichever of the two actually reads on it",
      accent.join() || "(none)",
    );
  }

  /* ======================================================================
     ANYTHING THE PAGE SCRIPTS IS FINDABLE FROM THE ELEMENT.

     The counter's script used to reach its number as `.pfd-count-N
     [data-pf-type]` — the first descendant of the wrapper that happens to be
     an element. It worked, and it left the one node on the page whose text is
     rewritten on every load carrying no class at all: a merchant clicking it
     saw an ordinary heading, with nothing to say why editing the number
     changes nothing on the live page.

     So a script may name a class, and the class has to be on an element.
     Reaching an element by type alone is what this forbids.
     ====================================================================== */
  console.log("\nwhat the page's script can reach");

  {
    const counted = await open({
      sections: [
        section(
          [
            { type: "counter", value: "30", prefix: "", suffix: "", label: "nights" },
            { type: "counter", value: "1,240", prefix: "", suffix: "", label: "reviews" },
          ],
          "proof-counters",
        ),
      ],
    });

    const js = counted.customJS ?? "";
    check(js.includes("querySelector"), "the counters ship a script", js ? "yes" : "(none)");
    check(
      !/querySelector(All)?\(["'][^"']*\[data-pf-type\][^"']*["']\)/.test(js),
      "and it reaches nothing by element type alone",
      (js.match(/querySelector\w*\([^)]*\)/g) ?? []).join(" ").slice(0, 96),
    );

    /* Every class the script names has to be on an element, or the rule it is
       meant to make visible is invisible again by another route. */
    const onElements = new Set<string>();
    for (const i of counted.items)
      for (const c of String((i.data as Record<string, unknown>)?.classGlobalStyling ?? "")
        .split(/\s+/)
        .filter(Boolean))
        onElements.add(c);

    const named = [
      ...new Set(
        (js.match(/querySelector\w*\(["']\.[\w-]+/g) ?? []).map((m: string) =>
          m.slice(m.indexOf(".") + 1),
        ),
      ),
    ];
    check(named.length > 0, "the script names classes", named.join(" ") || "(none)");
    for (const c of named)
      check(onElements.has(c), `.${c} is on an element a merchant can click`);
  }

  /* ---- the countdown, which used to be markup that counted nothing ------ */

  console.log("\na countdown");

  {
    const cd = await open({
      sections: [
        section(
          [
            {
              type: "countdown",
              endsAt: "2026-11-24T23:59:00.000Z",
              units: ["d", "h", "m", "s"],
              labels: true,
              caption: "Sale ends",
            },
          ],
          "cta-band-full",
        ),
      ],
    });

    const timer = cd.items.find((i) => i.type === "CountDown");
    check(Boolean(timer), "PageFly's own element, not Custom.HTML");
    check(
      cd.items.every((i) => i.type !== "Custom.HTML"),
      "and no raw markup pretending to be one",
    );

    const d = (timer?.data ?? {}) as Record<string, unknown>;
    check(d.endType === "specific" && d.endTime === "2026-11-24T23:59:00.000Z",
      "it ends at the instant the design named", `${d.endType} ${d.endTime}`);
    /* `first`/`every` restart per visitor, which is a scarcity trick rather
       than a deadline — a sale ends when it ends. */
    check(d.countdownType === "specific", "not a per-visitor timer", String(d.countdownType));

    /* Two fields the field table types as strings and documents as objects —
       the same trap FormLabel fell into. */
    const label = d.label as { on?: boolean } | undefined;
    check(typeof label === "object" && label?.on === true, "label is an object with on:true");
    const time = d.timeData as Record<string, { on?: boolean; text?: string }> | undefined;
    check(typeof time === "object", "timeData is an object, not a string");
    check(
      time?.d?.on === true && time?.s?.on === true && time?.w?.on === false,
      "every unit is written, with `on` deciding which are drawn",
      JSON.stringify(time),
    );
    check(time?.h?.text === "hours", "and each carries its name");

    /* The caption is a sibling: CountDown contains only its number and label
       slots, and a paragraph inside them is one the element does not know it has. */
    const caption = cd.items.find((i) => i.type === "Paragraph4");
    check(Boolean(caption), "the caption is emitted");
    check(
      !JSON.stringify(timer ?? {}).includes("Sale ends"),
      "and is not pushed inside the timer",
    );

    /* ---- THE SLOTS ARE OURS TO EMIT ------------------------------------

       An imported CountDown with `children: []` drew NOTHING — an empty box
       where the timer should be, in a page whose copy says the sale ends
       tonight. The same element dragged from PageFly's own panel carries a
       `CountdownNumber` and a `CountdownLabel` in the layer tree, and it
       draws. `fields.md` calls them slots, which was read here as "the
       element fills them" — it means "these and only these go inside".

       Every other slot-bearing element in the builder already emits its own:
       ProductQuantity's three, Form2.Field's two, Table2's four. The timer
       was the single exception and the single one that rendered empty. */
    const byId = new Map(cd.items.map((i) => [i.id, i]));
    const slots = (timer?.children ?? []).map((c) => byId.get(c)?.type);
    check(
      slots.join("|") === "CountdownNumber|CountdownLabel",
      "the number and label slots are emitted, in that order",
      slots.join("|") || "(none)",
    );

    /* A slot with no style entry is the FormLabel crash again: the editor
       panel reads an object off `undefined`. Both carry type of their own for
       the same reason the counter's number does — an unstyled child inherits
       the wrapper, and inheritance is the bug. */
    const numberId = (timer?.children ?? [])[0] ?? "";
    const labelId = (timer?.children ?? [])[1] ?? "";
    const numCss = cd.cssOf(numberId);
    const labCss = cd.cssOf(labelId);
    check(/font-size:\s*44px/.test(numCss), "the number is the mockup's 44px", numCss);
    check(/font-weight:\s*700/.test(numCss), "and its weight", numCss);
    check(
      /font-variant-numeric:\s*tabular-nums/.test(numCss),
      "and tabular figures, so the row does not jitter each second",
      numCss,
    );
    check(/font-size:\s*12px/.test(labCss), "the label is 12px, not the number's size", labCss);
    check(
      !/font-size:\s*44px/.test(labCss),
      "`days` does not arrive at 44px under a 44px `03`",
      labCss,
    );

    /* ---- AND THE UNITS ARE HELD APART ----------------------------------

       Type alone got the figures drawn and drew them touching: `77154920`
       where the mockup has `77 15 48 50`. PageFly sizes each unit column by
       its content and puts no gap between them, so four 44px numbers arrive
       as one eight-digit number and the timer reads as a part code.

       Nothing in the root can be relied on to fix it — the root carries no gap
       and whether PageFly's own wrapper is a flex container is not written
       down anywhere in `MD Json PageFly/`. The margin goes on the slots
       instead, on BOTH of them and equally: whichever of the figure and its
       unit name is the wider one sets the column, so matching margins hold the
       columns apart whether the element stacks them or rows them. */
    check(
      /margin[^;]*\b9px/.test(numCss) && /margin[^;]*\b9px/.test(labCss),
      "both slots carry the half-gap, so 18px lands between units either way",
      `${numCss} || ${labCss}`,
    );
    check(
      /margin-top:\s*8px|margin:\s*8px/.test(labCss),
      "and the unit name sits 8px under its figure, as the mockup draws it",
      labCss,
    );
    check(
      /text-align:\s*center/.test(numCss) && /text-align:\s*center/.test(labCss),
      "a one-digit `5` stays centred under a five-letter `hours`",
      `${numCss} || ${labCss}`,
    );
  }


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
  /* THIS CHECK USED TO ASSERT THE OPPOSITE, and it was wrong in the way only an
     artefact can settle. `fields.md` calls `MediaItem2` the "older item
     generation; same purpose", so the code took the newer-sounding
     `MediaListItem2` and emitted one per thumbnail — and the check was written
     to hold it there. The strip then rendered correctly in the editor and did
     nothing on the storefront, which is exactly the symptom the old label
     predicted for the OTHER type.

     PageFly's own export decides it: `MediaList2` holds exactly ONE
     `MediaItem2`, carrying nothing but a class, and the renderer repeats it per
     media on the merchant's product. A description got it wrong; the artefact
     got it right; `reference/all-elements.pagefly` is in this repository for
     precisely this. */
  check(
    thumbKids.length === 1 && thumbKids[0] === "MediaItem2",
    "the strip is ONE MediaItem2 template, as the editor's own export writes it",
    thumbKids.join(" · "),
  );
  /* And no `slidesToShow`, for the same reason: the editor writes none. How
     many thumbnails are visible is the renderer's business, decided from the
     product's real media, not a count this file can guess. */
  check(
    (thumbs?.data as Record<string, unknown> | undefined)?.slidesToShow === undefined,
    "and states no thumbnail count — the product decides that",
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

  /* ---- the photograph ------------------------------------------------------

     ProductMedia3 has nine styleable parts and this file was using two, which
     is how a product page's largest element came out as a square grey rectangle
     with a strip of squares under it. */
  console.log("\nthe photograph");

  const shot = await open(
    {
      sections: [
        section(
          [
            {
              type: "product",
              title: "Overshirt",
              price: "$480",
              atcText: "Add",
              gallery: true,
              mediaRatio: 1.25,
              mediaHover: "magnifier",
              children: [],
            },
          ],
          "product-detail-gallery",
        ),
      ],
    },
    "probe",
    { border: "#3A3A38", accent: "#C6A667", band: "#F4F1E8" },
  );

  const med = shot.items.find((i) => i.type === "ProductMedia3")!;
  check(med.data?.hoverAction === "MAGNIFIER", "the magnifier is a setting, not something built");
  check(
    (med.data?.mediaListSize as Record<string, string>)?.mobile === "56px",
    "thumbnails size per breakpoint",
  );

  const main = shot.items.find((i) => i.type === "MediaMain3")!;
  check(
    shot.cssOf(main.id, "all").includes("aspect-ratio: 1 / 1.25"),
    "the main image takes the design's shape, not a hardcoded square",
    shot.cssOf(main.id, "all").slice(0, 60),
  );

  /* `MediaItem2` — the template the strip repeats; see the note above. */
  const thumb = shot.items.find((i) => i.type === "MediaItem2")!;
  const active = shot.cssOf(thumb.id, "all", '&[data-active="true"]');
  check(
    active.includes("#C6A667"),
    "and the chosen thumbnail is visibly the chosen one",
    active.slice(0, 60),
  );

  const arrows = shot.cssOf(med.id, "all", "& .splide__arrow--prev, & .splide__arrow--next");
  check(
    arrows.includes("#F4F1E8"),
    "the gallery arrows sit on a plate from this page, not a guessed white",
    arrows.slice(0, 60),
  );

  /* ---- how a product is chosen ------------------------------------------- */

  console.log("\nhow a product is chosen");

  const chosen = await open(
    {
      sections: [
        section(
          [
            {
              type: "product",
              title: "Overshirt",
              price: "$480",
              atcText: "Add to Bag",
              variants: [
                { name: "Colour", values: 6, as: "dots" },
                { name: "Size", values: 5, as: "tiles" },
              ],
              children: [{ type: "bound", slot: "swatches" }, { type: "bound", slot: "atc" }],
            },
          ],
          "product-detail-gallery",
        ),
      ],
    },
    "probe",
    { border: "#3A3A38", accent: "#C6A667" },
  );

  const sw = chosen.items.find((i) => i.type === "ProductVariantSwatches")!;
  const swCss = chosen.cssOf(sw.id, "all", "& .pf-variant-select");
  check(swCss.includes("#3A3A38"), "the dropdown takes the page's border, not the browser's", swCss.slice(0, 60));
  check(swCss.includes("appearance: none"), "and loses the native control's arrow");

  const tile = chosen.cssOf(sw.id, "all", '& .pf-vs-label > input[type="radio"]:checked + label');
  check(tile.includes("#C6A667"), "a chosen size tile takes the accent", tile.slice(0, 60));

  const soldOut = chosen.cssOf(sw.id, "all", '& .pf-vs-label > input[type="radio"]:disabled + label');
  check(
    soldOut.includes("line-through"),
    "and a sold-out one READS sold out, not merely faint",
    soldOut.slice(0, 60),
  );

  /* Two groups means the merchant's own per-option config decides, because
     nothing here knows whether their product is colour-and-size or size-only. */
  check(
    sw.data?.useOptionSwatches === true && sw.data?.display === undefined,
    "two groups force no display — a forced colour grid breaks on a size option",
  );

  const oneSize = await open({
    sections: [
      section(
        [
          {
            type: "product",
            title: "Tee",
            price: "$40",
            atcText: "Add",
            variants: [{ name: "Size", values: 5, as: "tiles" }],
            children: [],
          },
        ],
        "product-detail-gallery",
      ),
    ],
  });
  const oneSw = oneSize.items.find((i) => i.type === "ProductVariantSwatches")!;
  check(oneSw.data?.display === "label", "one non-colour group is known enough to force tiles");
  check(
    oneSw.data?.useOptionSwatches === false,
    "and turns off the merchant override, or the forced display is ignored",
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

  /* NOT Table2. Two shapes for its cells were tried and the editor rejected
     both — it answers "Please add an item in General -> Rows or General ->
     Columns", so the element has `rows` and `columns` list fields that
     `fields.md` does not list among its four. `data.rows` did nothing, and a
     sibling `content` key did worse: outside the six keys `page-json.md`
     allows on a node, it made an import report success while the page never
     reached the editor's list. Built from primitives that do work instead. */
  check(
    !chart.items.some((i) => i.type === "Table2"),
    "the table is NOT PageFly's Table2 — its cell shape is undocumented",
  );
  check(
    !chart.items.some((i) => i.type === "ContentList2"),
    "and not a card list either",
  );

  const known = new Set(["__v", "id", "type", "children", "styles", "createdAt", "updatedAt", "data", "options", "roomId"]);
  const strays = [...new Set(chart.items.flatMap((i) => Object.keys(i)))].filter((k) => !known.has(k));
  check(strays.length === 0, "no item carries a key the format does not document", strays.join(", "));

  /* Three rows of three, as Paragraphs inside FlexBlocks. */
  const cellText = chart.items
    .filter((i) => i.type === "Paragraph4")
    .map((i) => String((i.data as Record<string, unknown>)?.value ?? ""));
  for (const want of ["Size", "Chest", "102 cm"])
    check(cellText.includes(want), `the cell "${want}" arrives verbatim`);
  check(cellText.length >= 9, "every cell of a 3x3 becomes its own editable node", `${cellText.length}`);

  /* A header row that does not read as one is a list of nine phrases. */
  const headerCell = chart.items.find(
    (i) => i.type === "Paragraph4" && (i.data as Record<string, unknown>)?.value === "Size",
  );
  const headerCss = chart.cssOf(headerCell?.id ?? "");
  check(headerCss.includes("uppercase"), "row zero is set as the header", headerCss.slice(0, 60));
  check(headerCss.includes("flex: 1 1 0"), "and every cell shares the width evenly");

  /* Digits that do not line up turn a size chart back into prose. */
  const numeric = chart.items.find(
    (i) => i.type === "Paragraph4" && (i.data as Record<string, unknown>)?.value === "102 cm",
  );
  check(
    chart.cssOf(numeric?.id ?? "").includes("tabular-nums"),
    "a cell carrying digits gets tabular figures",
  );

  /* Wide tables scroll rather than crushing the page — the one thing Table2's
     per-breakpoint columnsWidth used to do, done by hand. */
  const scroller = chart.items.find(
    (i) => i.type === "FlexBlock" && chart.cssOf(i.id).includes("overflow-x: auto"),
  );
  check(Boolean(scroller), "the table scrolls inside its own box");

  /* Ragged input is a table with holes in it. The schema pads; assert the
     exporter never emits a short row. */
  const ragged = await open({
    sections: [
      section([{ type: "table", rows: [["A", "B", "C"], ["1"]] }], "size-fit-guide"),
    ],
  });
  const raggedCells = ragged.items.filter((i) => i.type === "Paragraph4");
  check(
    raggedCells.length === 6,
    "a short row is padded to the widest, not left with holes",
    `${raggedCells.length} cells`,
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

  /* ---- a row that stacks tells its children it stacked ------------------

     THE PARENT'S DIRECTION WAS READ ONCE, AT DESKTOP, AND WRITTEN AT EVERY
     BREAKPOINT. `floorFor` turns a two-column row into a stack on the phone —
     that part has worked for a while — but every child of that row still
     carried `--pf-flex-layout-parent-direction: horizontal` in its `mobile`
     entry, because `parentDir` was computed once from the row's desktop css
     and handed to all four.

     Three things go wrong at once on the phone, and all three are visible in a
     real export: the engine lays the child out as a row child of a column; a
     paragraph takes `hug` from `widthMode`'s "text in a row hugs" rule and
     wraps at its own longest line instead of the screen's; and a container
     with a `maxWidth` is denied the `width: 100%` that the same rule gives it
     everywhere else, so it collapses to its longest line. A paragraph four
     words wide sitting over the photograph above it is what that looks like.

     The mockup has none of this because the mockup is real CSS: a flex column
     stretches its children without being told. Only the export has to say so,
     and it was saying the opposite. */

  console.log("\na row that stacks on the phone");

  {
    const stacked = await open({
      sections: [
        section(
          [
            {
              type: "row",
              css: { gap: "72px" },
              children: [
                { type: "image", query: "bench", css: { flexBasis: "44%" } },
                {
                  type: "col",
                  css: { flexBasis: "56%", maxWidth: "560px" },
                  children: [
                    { type: "heading", level: 2, text: "Lasting and welting", css: {} },
                  ],
                },
                /* Straight in the row, which is the shape `widthMode`'s "text
                   in a row hugs" rule is written for — and the shape that rule
                   was still applying to on a phone, where the row is a stack. */
                { type: "text", text: "The upper is pulled over the last and the welt is sewn by hand.", css: {} },
              ],
            },
          ],
          "split",
        ),
      ],
    }, "stack", { images: { bench: "https://example.test/bench.jpg" } });

    const mobileOf = (id: string) => stacked.cssOf(id, "mobile");
    const blocks = stacked.items.filter((i) => i.type === "FlexBlock");
    const withParent = blocks
      .map((i) => ({ i, css: mobileOf(i.id) }))
      .filter((x) => x.css.includes("--pf-flex-layout-parent-direction"));

    check(
      withParent.length > 0,
      "the children of the stacked row carry a mobile entry at all",
      String(withParent.length),
    );
    check(
      withParent.every((x) => !/parent-direction:\s*horizontal/.test(x.css)),
      "and none of them still claims a horizontal parent on the phone",
      withParent.map((x) => x.css.match(/parent-direction:\s*\w+/)?.[0]).join(" | "),
    );

    /* The column carries a maxWidth and no width — the case the long comment in
       `cssAt` is written about. On a phone its parent is a stack, so the rule
       applies and the box fills rather than hugging its longest line. */
    const col = withParent.find((x) => /max-width/.test(x.css));
    check(Boolean(col), "the capped column is found", col ? "yes" : "no");
    check(
      /width:\s*100%/.test(col?.css ?? ""),
      "a capped column fills the phone instead of collapsing to its longest line",
      col?.css ?? "(missing)",
    );

    const para = stacked.items.find((i) => i.type === "Paragraph4");
    check(
      /--pf-flex-layout-width:\s*fill/.test(mobileOf(para?.id ?? "")),
      "and the paragraph fills rather than hugging — `text in a row hugs` is not about a stack",
      mobileOf(para?.id ?? "") || "(no mobile entry)",
    );
  }

  /* ---- the before/after slider, which had no shape of its own ----------

     It carried no ratio and no `object-fit`, so the element took the natural
     height of whatever photograph the filler resolved — a portrait shot made a
     band three screens tall — and the two images kept their own heights, so the
     before ended where the after did not and the handle compared a picture
     against white.

     The selectors asserted here are the ones `MD Json PageFly/fields.md`
     documents for this element, not guesses at its markup: a rule written
     against the wrong class applies to nothing, renders as the bug it was
     meant to fix, and reports no error anywhere. */

  console.log("\na before/after slider");

  {
    const ba = await open({
      sections: [
        section(
          [
            {
              type: "beforeAfter",
              beforeQuery: "room empty",
              afterQuery: "room furnished",
              beforeLabel: "Before",
              afterLabel: "After",
            },
          ],
          "split",
        ),
      ],
    }, "ba", { images: { "room empty": "https://x/a.jpg", "room furnished": "https://x/b.jpg" } });

    const el = ba.items.find((i) => i.type === "ImageComparison");
    check(Boolean(el), "PageFly's own element");

    /* EVERY DEVICE, and checking only `all` is how this last escaped. The four
       blocks are not deltas: `derive.ts` writes each one as a COMPLETE rule and
       the narrower replaces the wider outright, so a ratio present only in
       `all` is a ratio absent everywhere a merchant actually looks — including
       the editor's own 1440px, which resolves to `laptop`. What shipped was an
       element left to `--pf-flex-layout-height: hug`, sizing to its content and
       standing taller than it is wide. */
    check(
      /aspect-ratio:\s*1\s*\/\s*1/.test(ba.cssOf(el?.id ?? "")),
      "square, so a portrait photo cannot make it three screens tall",
      ba.cssOf(el?.id ?? "").slice(0, 80),
    );

    /* Both halves, because one of them covering is worse than neither: the
       slider would then compare a filled frame against a letterboxed one. */
    for (const half of ["before", "after"]) {
      const css = ba.cssOf(el?.id ?? "", "all", `& .pf-ba-${half} img`);
      check(
        /object-fit:\s*cover/.test(css) && /height:\s*100%/.test(css),
        `the ${half} image fills its half`,
        css || "(no rule)",
      );
    }

    check(
      /height:\s*100%/.test(ba.cssOf(el?.id ?? "", "all", "& .pf-ba-content")),
      "and the content box is the full square",
    );

    /* ======================================================================
       AND AT EVERY WIDTH THE NODE HAS A BLOCK FOR.

       The four device blocks are not deltas. `derive.ts` writes each one as a
       COMPLETE `&` rule and the narrower replaces the wider outright, so a
       ratio folded into `all` alone is a ratio absent from every width that
       got its own block — which is every width, the moment the design puts any
       css on the node. The fixture above carries none and so has only `all`;
       this one carries a radius, which is enough to make `derive` emit all
       four.

       What that shipped: an element left to `--pf-flex-layout-height: hug`,
       sizing to its content and standing taller than it is wide in the editor
       at 1440px, where `laptop` is the block that applies. Checking `all` was
       what let it through.
       ====================================================================== */
    const styled = await open({
      sections: [
        section(
          [
            {
              type: "beforeAfter",
              beforeQuery: "room empty",
              afterQuery: "room furnished",
              beforeLabel: "Before",
              afterLabel: "After",
              css: { borderRadius: "22px", maxWidth: "1100px" },
              /* The mobile block is what makes `derive` write all four devices
                 out — with nothing to interpolate toward it leaves `all` to
                 cover every width, which is the fixture above. A design that
                 says anything about phones gets the four, and the four are
                 where the ratio went missing. */
              mobile: { borderRadius: "14px" },
            },
          ],
          "split",
        ),
      ],
    }, "ba2", { images: { "room empty": "https://x/a.jpg", "room furnished": "https://x/b.jpg" } });

    const el2 = styled.items.find((i: { type: string }) => i.type === "ImageComparison");
    for (const device of ["all", "laptop", "tablet", "mobile"]) {
      const rule = styled.cssOf(el2?.id ?? "", device);
      check(
        rule !== "" && /aspect-ratio:\s*1\s*\/\s*1/.test(rule),
        `square at ${device} too`,
        rule ? rule.slice(0, 74) : "(no rule — derive wrote no block for this width)",
      );
      /* The radius the design asked for has to survive alongside it, or the
         fix would be trading one lost declaration for another. */
      check(/border-radius/.test(rule), `and keeps its own radius at ${device}`);
    }
  }

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
