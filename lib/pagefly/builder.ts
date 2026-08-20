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

export function FB(
  styleData: StyleData,
  kids: PFNode[] = [],
  cls?: string,
  /* Only `overlay` uses this. The picture rides in styleData as CSS rather than
     in `data`, because a FlexBlock has no image field — and that is the point:
     no new element type means nothing new that can fail to import. */
  bg?: { backgroundSrc: string; scrim: string },
) {
  const d: Record<string, unknown> = {};
  if (cls) d.className = cls;
  if (bg) {
    /* Written into data as well as into CSS. PageFly's own sections carry a
       `src` for their background; whether the editor picks the image up from
       there or from the stylesheet is the one thing the probe import has to
       answer, and setting both means the page looks right either way. */
    d.src = bg.backgroundSrc;
  }
  return node("FlexBlock", d, styleData, kids);
}

/**
 * A repeating card grid — the element a row of cards is supposed to be.
 *
 * Three or more sibling cards used to export as a FlexBlock holding FlexBlocks,
 * with the columns written as a CSS grid. That renders, and it is the wrong
 * element twice over. `fields.md` is explicit about the second part: columns are
 * DATA (`slidesToShow`), rendered natively, and a CSS `display:grid` on the root
 * or the wrappers "overrides the native grid and collapses every card to one per
 * row" — so the mockup showed three across and the imported page showed three
 * down. It is also what the merchant meets in the editor: a ContentList2 has a
 * column count and a spacing control, and a nest of FlexBlocks has neither.
 *
 * `spacing` is the ONLY channel for the gap. The item wrapper has no `gap`
 * property in any layout mode, so a CSS gap here is a guaranteed no-op.
 *
 * STATIC CARDS ONLY. The moment a card carries a product's title or price it is
 * a product card and belongs in a ProductList2 with one template — Product*
 * elements inside a ContentList2 have no product context and render "Please
 * select a product" on every card. The caller checks that; this function is
 * given cards and trusts them.
 */
export function CONTENT_LIST(
  cards: PFNode[],
  styleData: StyleData,
  opts: { columns?: number; gap?: number; layout?: "grid" | "slideshow" } = {},
) {
  const columns = Math.min(6, Math.max(1, opts.columns ?? cards.length));
  const layout = opts.layout ?? "grid";
  const gap = `${opts.gap ?? 24}px`;
  return node(
    "ContentList2",
    {
      listLayout: { all: layout, laptop: layout, tablet: layout, mobile: layout },
      slidesToShow: {
        all: columns,
        laptop: columns,
        tablet: Math.min(2, columns),
        mobile: 1,
      },
      slidesToScroll: { all: 1, laptop: 1, tablet: 1, mobile: 1 },
      spacing: { all: gap, laptop: gap, tablet: gap, mobile: "16px" },
      maxHeight: true,
      stretch: true,
      navStyle: "none",
      paginationStyle: "none",
      align: "ct",
    },
    styleData,
    cards.map((card) => node("ContentListItem", {}, null, [card])),
  );
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

/**
 * The product's image, and — when asked — its thumbnail strip.
 *
 * `showList` IS the gallery. It used to be omitted, which left it at its
 * default of `false`, and the strip was made visible instead by styling the
 * MediaList2 with `display: flex`. That is the shape of a mockup/live mismatch:
 * `fields.md` says the list "is shown per breakpoint by the parent `showList`
 * object", so the mockup drew a row of thumbnails and the imported page had
 * none, whatever CSS the list carried.
 *
 * `listPosition` and `mediaListSize` are settings for the same reason — a
 * merchant who opens the element in the editor finds a gallery configured, not
 * a gallery hand-drawn in CSS they would have to find and unpick.
 */
export function PRODUCT_MEDIA(
  main: PFNode,
  list: PFNode,
  styleData: StyleData,
  gallery: { show: boolean; edge?: "TOP" | "RIGHT" | "BOTTOM" | "LEFT"; size?: string } = {
    show: false,
  },
) {
  return node(
    "ProductMedia3",
    {
      showList: {
        all: gallery.show,
        laptop: gallery.show,
        tablet: gallery.show,
        /* Off on a phone whichever way the desktop went: a thumbnail strip on a
           375px screen is six 50px squares competing with the price. */
        mobile: false,
      },
      listPosition: gallery.edge ?? "BOTTOM",
      mediaListSize: gallery.size ?? "64px",
      /* Click-to-zoom on a product page is what a shopper reaches for, and it
         is a setting rather than something to build. */
      clickAction: gallery.show ? "SHOW_FULLSCREEN" : "NONE",
    },
    styleData,
    [main, list],
  );
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
  opts: {
    columns?: number;
    limit?: number;
    gap?: number;
    /**
     * `auto` is the products IN the collection this page is showing; `all` is
     * the store-wide list.
     *
     * It used to be hardcoded to `all`, which is the wrong answer on the one
     * page type where the question matters: a collection page exported that way
     * shows the same products as every other page, and the collection it is
     * named after appears nowhere on it. The merchant sees a plausible grid and
     * has no reason to suspect the binding.
     */
    source?: "all" | "auto";
    layout?: "grid" | "slideshow";
  } = {},
) {
  const columns = Math.min(4, Math.max(1, opts.columns ?? 3));
  const layout = opts.layout ?? "grid";
  return node(
    "ProductList2",
    {
      source: opts.source ?? "all",
      tag: "h3",
      limit: opts.limit ?? columns * 2,
      /* Per breakpoint, and the platform default is `slideshow` — so a list
         emitted without this field is a carousel nobody asked for. */
      listLayout: { all: layout, laptop: layout, tablet: layout, mobile: layout },
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



/* ---- the five that make a designed page possible ------------------------

   Each maps to something PageFly already renders. Where the element model has
   a native answer it is used; where it does not, the fallback is named and the
   condition for switching is written down, because none of this can be proven
   without importing into a real store.
   ------------------------------------------------------------------------ */

/**
 * Text on a photograph.
 *
 * A FlexBlock with the picture as a CSS background and the scrim as a gradient
 * in the same stack — NOT a new element type. FlexBlock is what every container
 * in every exported page already is, so this cannot fail to import; a novel
 * element could.
 *
 * The gradient goes FIRST in the background shorthand because CSS paints the
 * first layer on top, and a scrim under the photograph is a scrim doing
 * nothing.
 */
export function OVERLAY(
  src: string,
  scrim: "left" | "bottom" | "full" | "none",
  styleData: StyleData,
  kids: PFNode[] = [],
) {
  return FB(styleData, kids, undefined, src ? { backgroundSrc: src, scrim } : undefined);
}

/** The gradient for each scrim, as a CSS background layer. */
export const SCRIM_CSS: Record<string, string> = {
  /* Strong at the edge the text sits on, gone by the middle — the photograph
     stays a photograph everywhere the text is not. */
  left: "linear-gradient(90deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.45) 38%, rgba(0,0,0,0) 68%)",
  bottom: "linear-gradient(0deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,.35) 34%, rgba(0,0,0,0) 62%)",
  full: "linear-gradient(0deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.45) 100%)",
  none: "",
};

/**
 * Before/after, on PageFly's own element.
 *
 * `ImageComparison` is real and documented — beforeImageUrl, afterImageUrl,
 * initialPosition, handleStyle. Nothing is invented here, so there is no
 * fallback to leave behind.
 */
export function BEFORE_AFTER(
  before: string,
  after: string,
  beforeLabel: string,
  afterLabel: string,
  styleData: StyleData,
) {
  return node(
    "ImageComparison",
    {
      beforeImageUrl: before,
      afterImageUrl: after,
      /* `alt` doubles as the image-search query in PageFly, so the label is the
         better value than a description of the label. */
      beforeImageAlt: beforeLabel,
      afterImageAlt: afterLabel,
      initialPosition: 50,
      handleStyle: "circle",
      direction: "horizontal",
      imgQuality: "auto",
      loading: "lazy",
    },
    styleData,
    [],
  );
}

/* ---- form ---------------------------------------------------------------

   Form2 posts to Shopify's own endpoint, so what a visitor types reaches the
   merchant. That is the whole reason to emit one rather than draw input-shaped
   rectangles: the two are indistinguishable in a mockup and only one of them
   collects anything.

   The submit button is a slot, not a child of the field collection — Form2
   requires exactly `Form2.Field`(1..n) then `Form2.Button2`(1), in that order. */

/** FormInput.inputType is a NUMBER, not a name. From fields.md: 0 text, 1
    multi-line, 2 email, 6 number. Phone has no type of its own; single-line
    text is what PageFly's own contact forms use for it. */
const INPUT_TYPE: Record<string, number> = {
  text: 0,
  message: 1,
  email: 2,
  phone: 0,
};

export function FORM_FIELD(
  label: string,
  kind: string,
  required: boolean,
  styleData: StyleData = null,
  /** typography for the label; also guarantees it a style entry — see below */
  labelStyle: StyleData = null,
) {
  return node(
    "Form2.Field",
    {
      /**
       * `label` IS AN OBJECT, not the copy.
       *
       * The field table calls it a string and the Contains note gives it away:
       * FormLabel is "shown by the parent `label.on` sub-field". Written as a
       * bare string, `label.on` is undefined, so every label was hidden — the
       * imported form showed three inputs carrying PageFly's own placeholder
       * text and no Name, Email or Message anywhere, while the mockup labels
       * them. Clicking one opened a settings panel reading a sub-field off a
       * string and the editor answered "Something went wrong".
       *
       * `{ on, text }` is the convention the same file uses for every other
       * label that carries copy — CountDown's `timeData` is documented as
       * "Object w/d/h/m/s each { on, text }", and its `label` as
       * "Object { on, reverse }". `value` rides along because `text` is the
       * inferred key of the two and an unread extra key costs nothing; when an
       * import confirms which one PageFly reads, delete the other.
       */
      label: { on: true, text: label, value: label },
      required,
    },
    styleData,
    [
      /**
       * Given a style, and it matters for a reason that is not cosmetic.
       *
       * `build()` writes a style entry only for a node whose styleData is not
       * null, and omits `data` entirely for a node whose data is empty. So a
       * FormLabel built with `{}` and `null` reached the editor as an item with
       * NO data key and NO style entry, on an element whose own documentation
       * lists typography, colour, background, spacing and border as styleable.
       * An editor panel reading either one finds `undefined` where it expects an
       * object — which is the other half of the crash.
       */
      node("FormLabel", { label }, labelStyle, []),
      node("FormInput", { required, inputType: INPUT_TYPE[kind] ?? 0 }, null, []),
    ],
  );
}

export function FORM(
  fields: PFNode[],
  submit: string,
  intent: "contact" | "signup",
  styleData: StyleData,
) {
  return node(
    "Form2",
    {
      /* `contact` reaches the shop's contact inbox; `customer` is the endpoint
         that creates a subscriber, which is what a signup box is for. */
      formType: intent === "contact" ? "contact" : "customer",
      showConfirm: true,
    },
    styleData,
    [
      ...fields,
      /* Unstyled by default it renders as a bare native button — grey, system
         font, nothing like the page around it. fields.md says so outright. */
      node("Form2.Button2", { value: submit, buttonType: "text" }, null, []),
    ],
  );
}

/* ---- slideshow ---------------------------------------------------------- */

/**
 * A carousel, set up the way the mockup draws one.
 *
 * EVERY DEFAULT HERE IS WRONG FOR US, which is why they are all written out.
 * `navStyle` defaults to `nav-style-1` and `paginationStyle` to
 * `pagination-style-1`, so a Slideshow emitted without them arrives with grey
 * arrows sitting over the first and last slide and a row of dots underneath —
 * neither of which the mockup has ever drawn. `gutter` defaults to 0, so the
 * slides arrived edge to edge where the mockup gaps them by 24.
 *
 * The mockup is the specification for all three:
 *
 *   arrows      never drawn. `Slides` renders no controls at all.
 *   dots        ONLY when the slides overflow — `slides.length > perView`. A
 *               carousel showing everything it has needs no pager, and drawing
 *               one says there is more when there is not.
 *   gap         24 between slides, taken from the node's own `gap` when the
 *               design states one.
 */
export function SLIDESHOW(
  slides: PFNode[],
  opts: { perView: number; autoplay: boolean; gutter?: number },
  styleData: StyleData,
) {
  const per = Math.max(1, Math.min(4, opts.perView));
  const gap = Math.max(0, Math.round(opts.gutter ?? 24));
  /* Nothing to page through, nothing to page with. */
  const overflows = slides.length > per;

  return node(
    "Slideshow",
    {
      autoPlay: opts.autoplay,
      autoPlayDelay: 4000,
      loop: true,
      pauseOnHover: true,
      /* Per breakpoint, and a phone shows one whatever the desktop shows —
         three testimonials side by side on a 390px screen is three unreadable
         columns. */
      slidesToShow: { all: per, laptop: per, tablet: Math.min(2, per), mobile: 1 },
      slidesToScroll: { all: 1, laptop: 1, tablet: 1, mobile: 1 },
      /* A phone gets a tighter gap for the same reason it gets one slide. */
      gutter: { all: gap, laptop: gap, tablet: gap, mobile: Math.min(gap, 16) },
      displayPartialItems: { all: false, laptop: false, tablet: false, mobile: false },
      maxHeight: true,
      navStyle: "none",
      paginationStyle: overflows ? "pagination-style-1" : "none",
    },
    styleData,
    slides.map((s) => node("SlideshowSlide", {}, null, [s])),
  );
}

/**
 * The dots, styled to the mockup, on the selectors `fields.md` names for them.
 *
 * The setting chooses WHETHER there is a pager and which of three shapes it
 * takes; it cannot say 7px, or centred, or `currentColor`. So the shape comes
 * from the setting and the look comes from here — which is the rule the whole
 * export follows: use the setting where one exists, and write CSS for the part
 * no setting reaches.
 *
 * `currentColor` rather than a literal: the pager sits inside a section whose
 * ink is already correct, and a hard-coded grey is invisible on a dark band and
 * heavy on a light one.
 */
export const SLIDESHOW_PARTS: Record<string, string> = {
  "& .pf-slider-nav": "display: flex; justify-content: center; gap: 7px; padding-top: 22px;",
  "& .pf-slider-nav button":
    "width: 7px; height: 7px; padding: 0; border: 0; border-radius: 999px;" +
    " background: currentColor; opacity: .22;",
  "& .pf-slider-nav button.active": "opacity: .75;",
};

const SLOT_RULES: Record<string, string[]> = {
  ProductBox: ["ProductMedia3", "FlexBlock"],
  ProductMedia3: ["MediaMain3", "MediaList2"],
  ProductPrice2: ["ProductPrice2Item", "ProductPrice2Item"],
  ProductQuantity: ["QuantityButton", "QuantityField", "QuantityButton"],
  ProductVariantSwatches: ["OptionLabel", "Swatch"],
  "Accordion3.Content.Wrapper": ["Accordion3.Header", "Accordion3.Content"],
  "Accordion3.Content": ["Accordion3.Flex.Content"],
  "Form2.Field": ["FormLabel", "FormInput"],
  /* One card template, repeated. Two ProductBoxes here is two identical cards
     stamped over every product in the grid. */
  ProductList2: ["ProductBox"],
};

/** Parents whose children must ALL be one type (count is free). */
const UNIFORM_CHILDREN: Record<string, string> = {
  Accordion3: "Accordion3.Content.Wrapper",
  Slideshow: "SlideshowSlide",
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
      /* ALWAYS a `data` key, even an empty one.

         This used to be written only when there was something in it, which
         reads as a tidy saving and is the shape of a crash: an item with no
         `data` at all hands the editor `undefined` where it expects an object,
         and a panel doing `item.data.label` throws. That is half of why
         clicking a Form Field answered "Something went wrong" — its FormLabel
         was built with `{}`.

         MediaMain3, MediaList2, MediaItem2 and ContentListItem are all emitted
         the same way and had the same exposure. `data: {}` is what an element
         with no settings is supposed to look like, and the bytes are nothing
         next to a class of bug that only shows up as a white screen. */
      item.data = n.data;
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
