import { zipSync, strToU8 } from "fflate";

/* ==========================================================================
   PageFly page builder.

   Two references, and they cover different things:

   - `MD Json PageFly/` is the element model: every element type, every field,
     every legal nesting. It is generated from PageFly's own registry, so it wins
     on anything about an element.
   - `docs/pagefly-file-format.md` is the CONTAINER: the zip, its single entry,
     the top-level keys and the parallel `styles` array. The generated reference
     does not describe any of that, so it is recorded separately.

   Runs in the browser rather than shelling out to a script: generation is
   client-side, so the export has to produce a Blob with no server hop.

   The rules the validator enforces are the ones that fail SILENTLY in the editor
   — it renders an empty block and reports nothing — which is why validation here
   is not optional.
   ========================================================================== */

export type StyleData = Record<string, Record<string, string>> | null;

/** Composition-time node. `_kids` holds real child nodes; ids are assigned at
    build time so the order things are composed in never matters. */
export type PFNode = {
  type: string;
  data: Record<string, unknown>;
  styleData: StyleData;
  /**
   * Structural settings, a sibling of `data` and not interchangeable with it.
   * Responsive visibility lives here: hideOnDesktop / hideOnLaptop /
   * hideOnTablet / hideOnMobile. Writing those into `data` is accepted, stored,
   * and does nothing — see MD Json PageFly/page-json.md.
   */
  options?: Record<string, unknown>;
  _kids: PFNode[];
  roomId?: string;
};

/** The four breakpoints PageFly styles against. `all` is the base. */
export type DeviceKey = "all" | "laptop" | "tablet" | "mobile";

/* Button2 carries these inert blobs in every real export. Copied verbatim —
   the editor expects the keys to exist. */
const BTN_BLOBS = {
  youtubeData: {
    loop: false,
    autoplay: false,
    controls: false,
    mute: false,
    videoID: "PtZir36SIMk",
  },
  htmlVideoData: { loop: false, autoplay: false, controls: false, mute: false },
  vimeoData: {
    ratio: 56.25,
    loop: false,
    portrait: false,
    byline: false,
    title: false,
    autoplay: false,
    controls: true,
    mute: false,
  },
  popupImageData: { objectFit: "contain", objectPosition: "center center" },
};

function node(
  type: string,
  data: Record<string, unknown> = {},
  styleData: StyleData = null,
  kids: PFNode[] = [],
): PFNode {
  return { type, data, styleData, _kids: kids };
}

/** Hide a node on every breakpoint except the ones listed. */
export function onlyOn(target: PFNode, devices: DeviceKey[]): PFNode {
  const flags: Record<string, boolean> = {};
  if (!devices.includes("all")) flags.hideOnDesktop = true;
  if (!devices.includes("laptop")) flags.hideOnLaptop = true;
  if (!devices.includes("tablet")) flags.hideOnTablet = true;
  if (!devices.includes("mobile")) flags.hideOnMobile = true;
  target.options = { ...target.options, ...flags };
  return target;
}

/* ---- node constructors -------------------------------------------------- */

export function FB(styleData: StyleData, kids: PFNode[] = [], cls?: string) {
  return node("FlexBlock", cls ? { className: cls } : {}, styleData, kids);
}

export function FSECTION(kids: PFNode[] = [], styleData: StyleData = null) {
  return node(
    "FlexSection",
    { classGlobalStyling: "pf-container-2" },
    styleData,
    kids,
  );
}

export function H2(value: string, styleData: StyleData, cls?: string) {
  const d: Record<string, unknown> = {
    value,
    editable: true,
    placeholder: "Enter heading...",
  };
  if (cls) d.className = cls;
  return node("Heading2", d, styleData, []); // light form — no Icon2 slot
}

export function P4(value: string, styleData: StyleData, cls?: string) {
  const d: Record<string, unknown> = { value };
  if (cls) d.className = cls;
  return node("Paragraph4", d, styleData, []); // light form — no Dropcap slot
}

export function BTN(
  value: string,
  href: string,
  styleData: StyleData,
  cls?: string,
) {
  const d: Record<string, unknown> = {
    value,
    buttonType: "text",
    placeholder: "Enter text here...",
    ...BTN_BLOBS,
  };
  /* Omitted rather than sent as "none". The enum is url|popup|section|email|
     phone with an unset default, so "none" was never a member — and a mockup
     button has no real destination anyway. Left unset, the merchant picks one in
     the editor. */
  if (href) {
    d.href = href;
    d.clickAction = "url";
  }
  if (cls) d.className = cls;
  return node("Button2", d, styleData, []);
}

export function IMG(src: string, styleData: StyleData, cls?: string) {
  const d: Record<string, unknown> = {
    name: "Image",
    loading: "lazy",
    imgQuality: "auto",
    linkTarget: "_self",
  };
  if (src) d.src = src;
  if (cls) d.className = cls;
  return node("Image5", d, styleData, []);
}

export function CUSTOM_HTML(code: string, styleData?: StyleData, cls?: string) {
  const d: Record<string, unknown> = { code };
  if (cls) d.className = cls;
  return node(
    "Custom.HTML",
    d,
    styleData ?? { all: { "&": "width: 100%;" } },
    [],
  );
}

/* ---- product + accordion families ---------------------------------------

   These are the elements a merchant actually wants to receive: an imported
   ProductBox is bound to a real Shopify product, so its title, price, swatches
   and Add-to-cart work rather than being pictures of themselves.

   Their `data` is left mostly empty, which is the intent: these elements pull
   their content from the product they are bound to rather than carrying the
   mockup's copy.

   `MD Json PageFly/fields.md` now documents their fields, and it contradicts
   nothing here — ProductPrice2Item genuinely has no configurable fields, so the
   regular and compare-at lines are distinguished by ORDER, which is what the slot
   table below encodes. It does list fields worth setting that this builder still
   ignores (ProductATC2.text, Heading2.tag); see the README.

   Slot order is load-bearing and enforced in `validate` below.
   ------------------------------------------------------------------------- */

/** Renders a <form action="/cart/add">, so layout styling has to target
    `& > form` — styling `&` leaves the form at its own default width, which is
    the single easiest way to make an imported product page look wrong. */
export function PRODUCT_BOX(media: PFNode, info: PFNode, css: string) {
  return node(
    "ProductBox",
    {},
    { all: { "&": "width: 100%;", "& > form": css } },
    [media, info],
  );
}

export function PRODUCT_MEDIA(main: PFNode, list: PFNode, styleData: StyleData) {
  return node("ProductMedia3", {}, styleData, [main, list]);
}

export function MEDIA_MAIN(styleData: StyleData) {
  return node("MediaMain3", {}, styleData, []);
}

export function MEDIA_LIST(count: number, styleData: StyleData, itemStyle: StyleData) {
  const items = Array.from({ length: Math.max(1, count) }, () =>
    node("MediaItem2", {}, itemStyle, []),
  );
  return node("MediaList2", {}, styleData, items);
}

export function PRODUCT_TITLE(styleData: StyleData) {
  return node("ProductTitle", {}, styleData, []);
}

/** Both items are required; hide the compare-at one with display:none rather
    than deleting it — a one-child ProductPrice2 renders empty. */
export function PRODUCT_PRICE(
  styleData: StyleData,
  priceStyle: StyleData,
  compareStyle: StyleData,
) {
  return node("ProductPrice2", {}, styleData, [
    node("ProductPrice2Item", {}, priceStyle, []),
    node("ProductPrice2Item", {}, compareStyle, []),
  ]);
}

export function PRODUCT_SWATCHES(
  styleData: StyleData,
  labelStyle: StyleData,
  swatchStyle: StyleData,
) {
  return node(
    "ProductVariantSwatches",
    {
      /* `combined: true` is the default and it renders ONE selector listing
         whole variants — "Red / S", "Red / M" — which is not what a mockup
         showing a row of colour dots means. False gives one group per option,
         which is what was drawn. */
      combined: false,
      /* Vertical is the default: option values stacked down the page. The
         mockups put swatches in a row. */
      layout: "horizontal",
      label: true,
      labelPosition: "top",
      /* Each option takes the merchant's own configured swatch type, so a
         Colour option renders as dots and a Size option as its own tiles. The
         `display` fallback cannot do both at once — forcing "color" turns a
         size value like "34" into a collapsed broken label. */
      useOptionSwatches: true,
      swatchesSpacing: { all: "10px" },
      optionsSpacing: { all: "18px" },
    },
    styleData,
    [
      node("OptionLabel", {}, labelStyle, []),
      node("Swatch", {}, swatchStyle, []),
    ],
  );
}

/** `text` is the button's label. Left unset it renders PageFly's default
    "Add to Cart", which is not necessarily what the mockup showed. */
export function PRODUCT_ATC(styleData: StyleData, text?: string) {
  /* Always written, never conditionally. Left unset when the model returned an
     empty string, the button imported with no label at all — the field showed
     its placeholder and the button rendered blank. "Add to Cart" is PageFly's
     own default and the right thing to fall back to. */
  return node(
    "ProductATC2",
    { text: text?.trim() || "Add to Cart", buttonType: "text" },
    styleData,
    [],
  );
}

/** Four tiers, and the real content has to sit in the innermost one — content
    placed in Accordion3.Content opens to an empty body. */
export function ACCORDION(
  rows: { header: PFNode; body: PFNode[]; style?: StyleData }[],
  styleData: StyleData,
) {
  const wrappers = rows.map((r) =>
    node("Accordion3.Content.Wrapper", {}, r.style ?? null, [
      r.header,
      node("Accordion3.Content", {}, null, [
        node("Accordion3.Flex.Content", {}, null, r.body),
      ]),
    ]),
  );
  return node(
    "Accordion3",
    {
      /* `headerIcon` defaults to unset, which is no glyph at all — every
         imported FAQ arrived without the + the mockup drew. It lives on the
         accordion, not on the header, and it syncs to every row. */
      headerIcon: "plus",
      /* Default is left. The mockups put it at the end of the row. */
      arrowPos: "right",
      activeInFront: -1,
      multiple: false,
    },
    styleData,
    wrappers,
  );
}

export function ACCORDION_HEADER(
  label: string,
  styleData: StyleData,
  kids: PFNode[] = [],
) {
  return node("Accordion3.Header", { label, showIcon: false }, styleData, kids);
}

/**
 * A grid of real products.
 *
 * Exactly ONE ProductBox goes inside: the renderer repeats that card for every
 * product, so handing it N boxes ships N copies of the same card. Placement
 * rules say it must be a direct child of FlexSection.
 */
export function PRODUCT_LIST(
  card: PFNode,
  styleData: StyleData,
  opts: { columns?: number; limit?: number; gap?: number } = {},
) {
  const columns = Math.min(4, Math.max(1, opts.columns ?? 3));
  return node(
    "ProductList2",
    {
      source: "all",
      tag: "h3",
      limit: opts.limit ?? columns * 2,
      listLayout: { all: "grid", laptop: "grid", tablet: "grid", mobile: "grid" },
      slidesToShow: {
        all: columns,
        laptop: columns,
        tablet: Math.min(2, columns),
        mobile: 1,
      },
      spacing: { all: `${opts.gap ?? 24}px` },
      maxHeight: true,
      loadingMode: "none",
      pagination: false,
    },
    styleData,
    [card],
  );
}

/* ---- flatten + validate ------------------------------------------------- */

export type FlatNode = {
  id: number;
  type: string;
  data: Record<string, unknown>;
  styleData: StyleData;
  children: number[];
  roomId?: string;
};

/** Bottom-up ids; root gets 0 and must be the LAST array element. */
export function flatten(root: PFNode): FlatNode[] {
  const order: PFNode[] = [];
  const walk = (n: PFNode) => {
    for (const k of n._kids) walk(k);
    order.push(n);
  };
  walk(root);

  const ids = new Map<PFNode, number>();
  let next = 1;
  for (const n of order) ids.set(n, n === root ? 0 : next++);

  return order.map((n) => {
    const out: FlatNode = {
      id: ids.get(n)!,
      type: n.type,
      data: n.data,
      styleData: n.styleData,
      children: n._kids.map((k) => ids.get(k)!),
    };
    if (n.roomId !== undefined) out.roomId = n.roomId;
    return out;
  });
}

const SLOT_RULES: Record<string, string[]> = {
  ProductBox: ["ProductMedia3", "FlexBlock"],
  ProductMedia3: ["MediaMain3", "MediaList2"],
  ProductPrice2: ["ProductPrice2Item", "ProductPrice2Item"],
  ProductQuantity: ["QuantityButton", "QuantityField", "QuantityButton"],
  ProductVariantSwatches: ["OptionLabel", "Swatch"],
  "Accordion3.Content.Wrapper": ["Accordion3.Header", "Accordion3.Content"],
  "Accordion3.Content": ["Accordion3.Flex.Content"],
  /* One card template, repeated. Two ProductBoxes here is two identical cards
     stamped over every product in the grid. */
  ProductList2: ["ProductBox"],
};

/** Parents whose children must ALL be one type (count is free). */
const UNIFORM_CHILDREN: Record<string, string> = {
  Accordion3: "Accordion3.Content.Wrapper",
  MediaList2: "MediaItem2",
  ContentList2: "ContentListItem",
};

export function validate(nodes: FlatNode[]): void {
  const ids = nodes.map((n) => n.id);
  if (ids.length !== new Set(ids).size) throw new Error("duplicate id");

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = nodes.flatMap((n) => n.children);
  if (kids.length !== new Set(kids).size)
    throw new Error("a node has two parents");

  const orphans = kids.filter((c) => !byId.has(c));
  if (orphans.length) throw new Error(`orphan child refs: ${orphans}`);

  const childSet = new Set(kids);
  const roots = ids.filter((i) => !childSet.has(i));
  if (roots.length !== 1 || roots[0] !== 0)
    throw new Error(`expected single root id 0, got ${roots}`);
  if (nodes[nodes.length - 1].id !== 0)
    throw new Error("root must be the LAST array element");

  for (const n of nodes) {
    const rule = SLOT_RULES[n.type];
    if (rule) {
      const kt = n.children.map((c) => byId.get(c)!.type);
      if (kt.join("|") !== rule.join("|"))
        throw new Error(`${n.type} slots must be ${rule}, got ${kt}`);
    }
    const uniform = UNIFORM_CHILDREN[n.type];
    if (uniform) {
      const wrong = n.children
        .map((c) => byId.get(c)!.type)
        .filter((t) => t !== uniform);
      if (wrong.length)
        throw new Error(`${n.type} children must all be ${uniform}, got ${wrong}`);
    }
    // Shopify's Liquid engine eats these on publish.
    const code = (n.data?.code as string | undefined) ?? "";
    if (code.includes("{{") || code.includes("{%"))
      throw new Error("Liquid tokens in Custom.HTML code");
  }
}

export function toClipboard(root: PFNode): string {
  const nodes = flatten(root);
  validate(nodes);
  return JSON.stringify({ pageflyData: nodes });
}

/* ---- .pagefly page ------------------------------------------------------ */

type Item = {
  __v: 0;
  id: string;
  type: string;
  children: string[];
  styles: never[];
  createdAt: string;
  updatedAt: string;
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
  roomId?: string;
};

type StyleEntry = {
  __v: 0;
  id: string;
  type: string;
  styles: string;
  createdAt: string;
  updatedAt: string;
};

export type PageFlyFile = {
  selectedFonts: Record<string, unknown>;
  customJS: string;
  customCSS: string;
  pageflyVersion: string;
  editorVersion: "Flex";
  items: Item[];
  styles: StyleEntry[];
  type: "page";
  globalSectionData: never[];
};

const PAGEFLY_VERSION = "4.26.3.55";

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Deterministic-enough fallback for environments without randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function stamp(): string {
  return new Date().toISOString().replace(/(\.\d{3})Z$/, "$1Z");
}

export class Page {
  readonly name: string;
  private customJS: string;
  private customCSS: string;
  private selectedFonts: Record<string, unknown>;
  private sections: PFNode[] = [];

  constructor(opts: {
    name: string;
    customJS?: string;
    customCSS?: string;
    selectedFonts?: Record<string, unknown>;
  }) {
    const js = opts.customJS ?? "";
    if (js.includes("{{") || js.includes("{%"))
      throw new Error("Liquid tokens in customJS");
    this.name = opts.name;
    this.customJS = js;
    this.customCSS = opts.customCSS ?? "";
    this.selectedFonts = opts.selectedFonts ?? {};
  }

  addSection(section: PFNode) {
    if (section.type !== "FlexSection")
      throw new Error("addSection takes an FSECTION(...)");
    this.sections.push(section);
  }

  build(): PageFlyFile {
    const ts = stamp();
    const items: Item[] = [];
    const styles: StyleEntry[] = [];

    const emit = (n: PFNode, parentChildren: string[]) => {
      const id = uid();
      const item: Item = {
        __v: 0,
        id,
        type: n.type,
        children: [],
        styles: [],
        createdAt: ts,
        updatedAt: ts,
      };
      if (Object.keys(n.data).length) item.data = n.data;
      if (n.options && Object.keys(n.options).length) item.options = n.options;
      if (n.roomId !== undefined) item.roomId = n.roomId;
      items.push(item);
      parentChildren.push(id);

      /* Note the double encoding: the top-level `styles` array holds the real
         styles, and its `styles` field is a JSON *string*. The per-item
         `styles: []` is a decoy the format requires. */
      if (n.styleData !== null) {
        styles.push({
          __v: 0,
          id,
          type: n.type,
          styles: JSON.stringify(n.styleData),
          createdAt: ts,
          updatedAt: ts,
        });
      }
      for (const k of n._kids) emit(k, item.children);
    };

    // Required tree root: Body → Layout → FlexSection(s). Both carry no styles.
    const body: Item = {
      __v: 0,
      id: uid(),
      type: "Body",
      children: [],
      styles: [],
      createdAt: ts,
      updatedAt: ts,
    };
    const layout: Item = {
      __v: 0,
      id: uid(),
      type: "Layout",
      children: [],
      styles: [],
      createdAt: ts,
      updatedAt: ts,
    };
    body.children.push(layout.id);
    items.push(body, layout);
    for (const s of this.sections) emit(s, layout.children);

    this.validateItems(items, styles);

    return {
      selectedFonts: this.selectedFonts,
      customJS: this.customJS,
      customCSS: this.customCSS,
      pageflyVersion: PAGEFLY_VERSION,
      editorVersion: "Flex",
      items,
      styles,
      type: "page",
      globalSectionData: [],
    };
  }

  private validateItems(items: Item[], styles: StyleEntry[]) {
    const ids = new Set(items.map((i) => i.id));
    const child = items.flatMap((i) => i.children);
    if (child.length !== new Set(child).size)
      throw new Error("double-parented item");
    if (child.some((c) => !ids.has(c))) throw new Error("orphan child ref");

    const childSet = new Set(child);
    const roots = items.filter((i) => !childSet.has(i.id));
    if (roots.length !== 1 || roots[0].type !== "Body")
      throw new Error("single Body root required");

    /* The slot rules apply to the .pagefly path too — this used to only run on
       the clipboard path, so a malformed ProductBox would have shipped. */
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const i of items) {
      const rule = SLOT_RULES[i.type];
      if (rule) {
        const kt = i.children.map((c) => byId.get(c)!.type);
        if (kt.join("|") !== rule.join("|"))
          throw new Error(`${i.type} slots must be ${rule}, got ${kt}`);
      }
      const uniform = UNIFORM_CHILDREN[i.type];
      if (uniform) {
        const wrong = i.children
          .map((c) => byId.get(c)!.type)
          .filter((t) => t !== uniform);
        if (wrong.length)
          throw new Error(`${i.type} children must all be ${uniform}, got ${wrong}`);
      }
      const code = (i.data?.code as string | undefined) ?? "";
      if (code.includes("{{") || code.includes("{%"))
        throw new Error("Liquid tokens in Custom.HTML code");
    }

    for (const s of styles) {
      if (!ids.has(s.id)) throw new Error("style entry points at missing item");
      JSON.parse(s.styles); // must be a valid JSON string
    }
  }

  /** The .pagefly container is a zip holding exactly one `1 - <name>.json`. */
  toBlob(): Blob {
    const page = this.build();
    const entry = `1 - ${this.name}.json`;
    const zipped = zipSync(
      { [entry]: strToU8(JSON.stringify(page)) },
      { level: 6 },
    );
    // Copy into a fresh buffer so the Blob never aliases fflate's pooled memory.
    return new Blob([new Uint8Array(zipped)], { type: "application/zip" });
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next task so the download has definitely started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
