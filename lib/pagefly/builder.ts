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
  /* THROWN AT COMPOSITION TIME, not at validation. A style entry for one of
     these is a page the editor cannot open, and the stack trace from here names
     the builder that wrote it — `validate` would name a flat node id, which is
     the difference between a fix and a search. See `UNSTYLEABLE`. */
  if (styleData !== null && UNSTYLEABLE.has(type))
    throw new Error(
      `${type} cannot carry a style of its own — the editor refuses the page. ` +
        `Set it on the parent that owns its look.`,
    );
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

/* ==========================================================================
   `classGlobalStyling`, NOT `className`, and the difference was invisible.

   Every class this file attaches went into `className`. PageFly writes that key
   on NONE of the 480 elements in `reference/all-elements.pagefly`; it writes
   `classGlobalStyling`, and its own custom CSS targets those classes —
   `#__pf .pu-eyebrow { … }` — with 42 of its values carrying several classes
   separated by spaces, which is exactly what `className` was being used for.

   What was riding on the wrong key: `pf-design-export`, which every page-level
   rule was scoped to; `pfd-reveal`, which every scroll animation needs;
   `pfd-count-N`, which the counter's own script looks itself up by; and the
   marquee and sticky classes. None of it landed, and nothing said so — a class
   on a key the editor does not read is not an error, it is an absence.
   ========================================================================== */
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
  if (cls) d.classGlobalStyling = cls;
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
  opts: {
    columns?: number;
    gap?: number;
    layout?: "grid" | "slideshow";
    /** what the mockup shows at 768-1024 and below 768, when it says */
    columnsTablet?: number;
    columnsPhone?: number;
    gapPhone?: number;
  } = {},
) {
  const columns = Math.min(6, Math.max(1, opts.columns ?? cards.length));
  const layout = opts.layout ?? "grid";
  const gap = `${opts.gap ?? 24}px`;
  return node(
    "ContentList2",
    {
      listLayout: { all: layout, laptop: layout, tablet: layout, mobile: layout },
      /* THE NARROW COUNTS ARE THE DESIGN'S. Two and one were written here for
         every list this file builds — reasonable numbers, and nobody else's
         decision to make. A mockup that goes four across, then two at 1080 and
         two at 900, said so in its own media queries. */
      slidesToShow: {
        all: columns,
        laptop: columns,
        tablet: opts.columnsTablet ?? Math.min(2, columns),
        mobile: opts.columnsPhone ?? 1,
      },
      slidesToScroll: { all: 1, laptop: 1, tablet: 1, mobile: 1 },
      spacing: { all: gap, laptop: gap, tablet: gap, mobile: `${opts.gapPhone ?? 16}px` },
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

/** How dark the layer over a background photograph is. `filterColor` is the
    field; these three are the only values the design vocabulary offers, because
    a merchant does not need a slider to make a heading readable. */
const SCRIM_FILTER = {
  none: "rgba(0,0,0,0)",
  soft: "rgba(0,0,0,0.42)",
  strong: "rgba(0,0,0,0.62)",
} as const;

/**
 * A full-bleed band, and its background if it has one.
 *
 * All three background mechanisms are FlexSection's own settings — `src` for a
 * photograph, `videoBg` for a video, `bgType` to say which, `filterColor` for
 * the layer over it. So a background belongs in DATA, not in CSS: written as CSS
 * it is a background the merchant cannot change from the editor, and a video
 * written as CSS cannot exist at all.
 *
 * `filterColor` is not decoration. A heading over someone else's landscape is
 * unreadable about half the time depending on where the sky falls, and the
 * section has no way to know which half it got. `soft` carries a dark
 * photograph; `strong` is for anything with a bright sky in it.
 *
 * The photograph preloads, because a band background sits at or near the fold
 * and a lazy one arrives as a flash of flat colour under text designed to sit on
 * a picture. The video stays lazy — it is the thing on the page most worth
 * making a visitor wait for least.
 */
export function FSECTION(
  kids: PFNode[] = [],
  styleData: StyleData = null,
  bg?: { photo?: string; video?: string; scrim?: "none" | "soft" | "strong" },
) {
  const d: Record<string, unknown> = { classGlobalStyling: "pf-container-2" };

  if (bg?.video) {
    d.bgType = "video";
    d.videoBg = bg.video;
    /* A still underneath, so the band is not a black hole while the video loads
       and is not empty for a visitor whose browser refuses autoplay. */
    if (bg.photo) d.src = bg.photo;
    d.backgroundVideoLoading = "lazy";
    d.filterColor = SCRIM_FILTER[bg.scrim ?? "soft"];
  } else if (bg?.photo) {
    d.bgType = "standard";
    d.src = bg.photo;
    d.backgroundImageLoading = "preload";
    d.filterColor = SCRIM_FILTER[bg.scrim ?? "soft"];
  }

  return node("FlexSection", d, styleData, kids);
}

export function H2(value: string, styleData: StyleData, cls?: string) {
  const d: Record<string, unknown> = {
    value,
    editable: true,
    placeholder: "Enter heading...",
  };
  if (cls) d.classGlobalStyling = cls;
  return node("Heading2", d, styleData, []); // light form — no Icon2 slot
}

export function P4(value: string, styleData: StyleData, cls?: string) {
  const d: Record<string, unknown> = { value };
  if (cls) d.classGlobalStyling = cls;
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
  if (cls) d.classGlobalStyling = cls;
  return node("Button2", d, styleData, [ICON2()]);
}

export function IMG(src: string, styleData: StyleData, cls?: string) {
  const d: Record<string, unknown> = {
    name: "Image",
    loading: "lazy",
    imgQuality: "auto",
    linkTarget: "_self",
  };
  if (src) d.src = src;
  if (cls) d.classGlobalStyling = cls;
  return node("Image5", d, styleData, []);
}

export function CUSTOM_HTML(code: string, styleData?: StyleData, cls?: string) {
  const d: Record<string, unknown> = { code };
  if (cls) d.classGlobalStyling = cls;
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
   table below encodes. Where it once listed fields this builder ignored, both
   have since been written: ProductATC2's label and Heading2's tag.

   Slot order is load-bearing and enforced in `validate` below.
   ------------------------------------------------------------------------- */

/** Renders a <form action="/cart/add">, so layout styling has to target
    `& > form` — styling `&` leaves the form at its own default width, which is
    the single easiest way to make an imported product page look wrong. */
export function PRODUCT_BOX(
  media: PFNode,
  info: PFNode,
  css: string,
  /* Rules that belong to the CARD rather than to anything inside it — a
     quick-add that appears when the card is pointed at is `.pcard:hover .qadd`
     in the mockup, and the card is this element. The slots are fixed at
     ProductMedia3 + FlexBlock, so there is no wrapper to hang them on. */
  parts: Record<string, string> = {},
) {
  return node(
    "ProductBox",
    {},
    { all: { "&": "width: 100%;", "& > form": css, ...parts } },
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
  gallery: {
    show: boolean;
    edge?: "TOP" | "RIGHT" | "BOTTOM" | "LEFT";
    size?: string;
    /** what the main photograph does under a cursor */
    hover?: "MAGNIFIER" | "NONE";
    /** whether the strip survives on a phone; the mockup's call, not ours */
    phone?: boolean;
  } = {
    show: false,
  },
  /** the corner badge, when the design asked for one */
  badge?: { node: PFNode; corner: "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT" },
) {
  return node(
    "ProductMedia3",
    {
      showList: {
        all: gallery.show,
        laptop: gallery.show,
        tablet: gallery.show,
        /* ON A PHONE, WHATEVER THE MOCKUP SAYS. This was `false` outright, with
           a note arguing that six 50px squares compete with the price on a
           375px screen. That is a real opinion about some galleries and it was
           applied to all of them: the mockup measured against keeps its strip
           at every width — `.g-thumbs` is a three-column grid and appears in no
           media query — so a shopper on a phone lost three photographs the
           design had drawn for them. */
        mobile: gallery.show && (gallery.phone ?? true),
      },
      listPosition: gallery.edge ?? "BOTTOM",

      /* Click-to-zoom on a product page is what a shopper reaches for, and it
         is a setting rather than something to build. */
      clickAction: gallery.show ? "SHOW_FULLSCREEN" : "NONE",
      /* Zoom under the cursor. It ships off, and a product page without it is
         the one detail a shopper notices missing on an expensive thing —
         `fields.md` has it as a setting precisely so nobody builds one. */
      hoverAction: gallery.hover ?? "NONE",
      /* Per breakpoint, and bigger than the 50px default. Six 50px squares
         under a full-width photograph read as an afterthought rather than a
         gallery, and the flat `gallery.size` this replaces could not shrink
         them on a phone. */
      mediaListSize: gallery.size
        ? { all: gallery.size, laptop: gallery.size, tablet: gallery.size, mobile: gallery.size }
        : { all: "76px", laptop: "76px", tablet: "64px", mobile: "56px" },
      /* The arrows are styled below; without this they are not there to style. */
      imageNavigation: true,
      buttonSize: "36px",

      /* ==================================================================
         THE DOCUMENTED DEFAULTS, WRITTEN OUT.

         `fields.md` gives each of these a default, and leaving them off was
         reading that as "the renderer will supply it". This codebase has
         already been bitten once by the opposite: an item with no `data` at
         all handed the editor `undefined` where it expected an object, and a
         panel doing `item.data.label` threw. An absent boolean is `undefined`,
         and `undefined` is falsy — so a field documented as defaulting to
         `true` can arrive switched OFF for anything that reads it directly.

         `enableImageListSetting` is the one that matters here: it is what
         allows the thumbnail-list behaviour, and a strip that renders but does
         not respond to a click is exactly what a disabled list setting looks
         like. The others cost four keys and remove the same class of doubt.
         ================================================================== */
      source: "auto",
      enableImageListSetting: true,
      enableImageMagnifier: true,
      imageSource: "default-variant",
      onHover: "NEXT_IMAGE",
      /* The badge is shown by the FLAG, not by being present. Emitted as a child
         with `showBadge` left false, it imports and never renders. */
      showBadge: Boolean(badge),
      badgePosition: badge?.corner ?? "TOP_LEFT",
    },
    styleData,
    badge ? [main, list, badge.node] : [main, list],
  );
}

/**
 * The main product photograph.
 *
 * `name: "MAIN_MEDIA"` IS THE FIELD THAT MAKES THE STRIP WORK. This shipped
 * with `{}` for its data, on the reading that the renderer supplies what it
 * needs — and the strip rendered, and clicking a thumbnail did nothing, because
 * the list has to find the main image by name to swap it. It is the same fault
 * as `TabsContent3.name = "TAB_CONTENT"`, in the same shape, and it was found
 * the same way: PageFly's own export has the field and ours did not.
 *
 * The rest are the editor's own defaults for a product page, written out. An
 * absent field is `undefined`, and a renderer reading `data.navStyle` directly
 * gets nothing rather than the documented default.
 */
export function MEDIA_MAIN(
  styleData: StyleData,
  look: {
    nav?: "none" | "nav-style-1";
    pagination?: "none" | "pagination-style-1";
    /** the magnifier, when the design asked for one */
    hover?: boolean;
  } = {},
) {
  return node(
    "MediaMain3",
    {
      name: "MAIN_MEDIA",
      navStyle: look.nav ?? "nav-style-1",
      paginationStyle: look.pagination ?? "none",
      /* Numbers here, strings on ProductMedia3 — the two elements encode the
         same two settings differently, and this is the editor's own encoding
         for each. Copied, not reasoned about.

         AND ONE OF THEM WAS COPIED TOO FAR. `fields.md` types `hoverAction` as
         NONE | MAGNIFIER | HOVER, runtime 0-2, DEFAULT NONE. This was 1 —
         MAGNIFIER — taken from an export that happened to have the lens on, and
         written on every gallery since. Every imported product page zoomed
         under the cursor and drew a pale rectangle over the photograph that no
         mockup draws. The design has always been able to say: `mediaHover` is
         the field, and ProductMedia3 has always honoured it. Only this element
         did not. */
      onHover: 0,
      clickAction: 2,
      hoverAction: look.hover ? 1 : 0,
      slidesToShow: { all: 1, laptop: 1, tablet: 1, mobile: 1 },
      slidesToScroll: { all: 1, laptop: 1, tablet: 1, mobile: 1 },
      loading: "eager",
    },
    styleData,
    [],
  );
}

/**
 * The thumbnail strip under the main product image.
 *
 * ONE `MediaItem2`, NOT SIX `MediaListItem2`, and both halves of that were
 * wrong here for the same reason: `fields.md` describes `MediaItem2` as the
 * "older item generation; same purpose", so the code took the newer-sounding
 * name and built one child per thumbnail. PageFly's own export settles it —
 * `MediaList2` holds exactly one `MediaItem2`, carrying nothing but a class,
 * and the renderer repeats it once per media on the merchant's product.
 *
 * A description got this wrong and an artefact got it right, which is the whole
 * reason `reference/all-elements.pagefly` is in this repository. The symptom
 * was the one a wrong child type always gives: the strip looked correct in the
 * editor and clicking a thumbnail on the storefront did nothing.
 *
 * `count` is kept in the signature and ignored. The number of thumbnails is a
 * property of the merchant's product, not of this file, and every caller was
 * passing a guess at it.
 */
/**
 * The thumbnail strip, holding ONE `MediaItem2` the renderer repeats.
 *
 * `count` is how many tiles are visible at once, and it is optional on
 * purpose. `fields.md` documents `slidesToShow` as per-breakpoint and
 * editable; `reference/all-elements.pagefly` omits it, because its merchant
 * left PageFly's five alone and that is what an editor omits. So the field is
 * written only when a design states a number — silence produces exactly the
 * bytes the reference does.
 */
export function MEDIA_LIST(
  count: number | undefined,
  styleData: StyleData,
  itemStyle: StyleData,
) {
  const show = count === undefined ? undefined : Math.max(2, Math.round(count));
  return node(
    "MediaList2",
    show === undefined
      ? {}
      : { slidesToShow: { all: show, laptop: show, tablet: show, mobile: show } },
    styleData,
    [node("MediaItem2", {}, itemStyle, [])],
  );
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
  /**
   * A display mode to force, when the caller knows the product's options.
   *
   * Empty by default, and that default is load-bearing: `useOptionSwatches`
   * stays true and every option renders the way the merchant configured it.
   * Passing `display` here also turns that off, so it is only safe when the
   * product's options are actually known — one group, and not colour.
   */
  force: { display?: "dropdown" | "label" } = {},
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
      /* LAST, so it wins. Placed above the defaults it was silently overwritten
         by the `useOptionSwatches: true` two lines up, and a forced display is
         ignored while that is true — the call would have looked correct and
         done nothing. */
      ...(force.display ? { display: force.display, useOptionSwatches: false } : {}),
    },
    styleData,
    [
      /* THE STYLE DATA ON BOTH OF THESE IS DEAD, and it is the caller's job to
         know it. PageFly's renderer draws the swatch block itself and attaches
         no style class to either child — its own export carries no `styles`
         entry for them either, only a global class. The look is written on the
         PARENT, through `& .pf-variant-label` and `& .pf-option-swatches`.

         `source`, `useContext` and `name` are the editor's own fields for the
         Swatch, written out for the same reason as everywhere else here: an
         absent field is `undefined`, not its documented default. */
      node("OptionLabel", {}, labelStyle, []),
      node("Swatch", { source: "auto", useContext: true, name: "Option value" }, swatchStyle, []),
    ],
  );
}

/** `text` is the button's label. Left unset it renders PageFly's default
    "Add to Cart", which is not necessarily what the mockup showed. */
/**
 * The add-to-cart control.
 *
 * `source` is the field that decides whether this button works at all:
 *
 *   `auto`   — inside a ProductBox, or on a page bound to a product. The button
 *              knows which item it is adding.
 *   `custom` — anywhere else, and it needs a `productId`. Emitted without one,
 *              the merchant picks the product in the editor once, which is the
 *              honest cost of an add-to-cart button on a page that is not about
 *              a single product.
 *
 * The three secondary labels are passed rather than defaulted because PageFly's
 * defaults are English: a page whose button says `Thêm vào giỏ` and then
 * `Adding...` changes language when you click it.
 */
/**
 * The − 1 + stepper.
 *
 * SLOT_RULES requires exactly `QuantityButton, QuantityField, QuantityButton` —
 * decrease, the number, increase. Both buttons appear or neither does, which is
 * what `showButton` governs, so the two are emitted together and the flag is
 * left at its default of true: a stepper with no buttons is a number.
 */
export function PRODUCT_QUANTITY(styleData: StyleData) {
  return node(
    "ProductQuantity",
    { source: "auto", showButton: true, defaultQuantity: 1 },
    styleData,
    [
      node("QuantityButton", { kind: "minus" }, null, []),
      node("QuantityField", {}, null, []),
      node("QuantityButton", { kind: "plus" }, null, []),
    ],
  );
}

/**
 * "IN STOCK" / "Only 3 left" / "Sold out", from real inventory.
 *
 * The three texts are passed so the line is in the page's own language, and the
 * three colours are passed because the component's defaults are a green, an
 * orange and a red chosen against a white theme — on a near-black page the green
 * is the only one that reads.
 *
 * `displayOption: "always"` rather than `showIfUnder`: a design that placed a
 * stock line placed it because the row is part of the composition, and a row
 * that appears only under five units is a row that shifts the page when
 * inventory moves.
 */
export function STOCK_INDICATOR(
  styleData: StyleData,
  texts: { inStock?: string; lowStock?: string; outOfStock?: string } = {},
) {
  return node(
    "StockIndicator",
    {
      source: "auto",
      displayOption: "always",
      threshold: 5,
      inStockText: texts.inStock?.trim() || "In stock",
      lowStockText: texts.lowStock?.trim() || "Only {quantity} left",
      outOfStockText: texts.outOfStock?.trim() || "Sold out",
    },
    styleData,
    [],
  );
}

/**
 * Shopify's express checkout — "Buy it now", Shop Pay, the wallet buttons.
 *
 * `fields.md`: its own row, BELOW ProductATC2, full width. It PAIRS with the
 * cart button rather than replacing it — a buy box with only express checkout
 * cannot add to a cart, and one with only a cart button loses the shopper who
 * wanted to be gone in two taps.
 */
export function DYNAMIC_CHECKOUT(styleData: StyleData, label?: string) {
  return node(
    "ProductDynamicCheckout",
    { source: "auto", value: label?.trim() || "Buy it now" },
    styleData,
    [],
  );
}

/**
 * The corner badge over the photograph — "NEW", "-33%".
 *
 * A CHILD OF THE MEDIA ELEMENT, shown by its `showBadge` flag and positioned by
 * `badgePosition`. Not a box on top: a hand-placed badge needs
 * `position:absolute`, which is banned for the reason the whole ban exists, and
 * the platform's own note says a separate badge node is dropped on import.
 */
export function PRODUCT_BADGE(text: string, styleData: StyleData) {
  return node("ProductBadge", { text }, styleData, []);
}

export function PRODUCT_ATC(
  styleData: StyleData,
  text?: string,
  opts: {
    source?: "auto" | "custom";
    adding?: string;
    added?: string;
    soldout?: string;
  } = {},
) {
  /* Always written, never conditionally. Left unset when the model returned an
     empty string, the button imported with no label at all — the field showed
     its placeholder and the button rendered blank. "Add to Cart" is PageFly's
     own default and the right thing to fall back to.

     WRITTEN TWICE, AND THAT IS NOT BELT-AND-BRACES. `fields.md` describes this
     element two ways: its field table lists `text` as the button label, and its
     header says `copy: value on this element` — the same line Button2, Heading2
     and Paragraph4 carry, and for all three of those the editor reads `value`.
     Writing only `text` imported a button whose label field was empty and whose
     face rendered blank, which is what the merchant saw. `value` is the one the
     editor reads; `text` is kept because the table documents it and the two
     saying different things would be a worse bug than either alone.

     This was the only element of the nine whose copy lives in `value` that was
     not writing it. */
  const label = text?.trim() || "Add to Cart";
  const d: Record<string, unknown> = {
    value: label,
    text: label,
    buttonType: "text",
    source: opts.source ?? "auto",
    /* Stay put. A button that navigates to the cart on every add turns a page
       designed to sell three things into a page that sells one. */
    action: "same",
  };
  if (opts.adding?.trim()) d.adding = opts.adding.trim();
  if (opts.added?.trim()) d.added = opts.added.trim();
  if (opts.soldout?.trim()) d.soldout = opts.soldout.trim();

  return node("ProductATC2", d, styleData, [ICON2()]);
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

/**
 * A horizontal rule, as PageFly's own element.
 *
 * WHAT THIS REPLACES. `Custom.HTML` holding `<div></div>` with the line drawn
 * by CSS on the outside. It rendered correctly and it was still a code box in
 * the editor: ten of them on one page, each opening a panel of markup where a
 * merchant expected a divider with a thickness and a colour.
 *
 * THE MECHANISM HAS TO CHANGE WITH THE ELEMENT, and this is the part that can
 * go wrong quietly. The design writes a rule the way the mockup draws one —
 * `height: 1px; background: <colour>` — and `fields.md` says Divider2 takes
 * its "line thickness/colour via border". Passing the design's own
 * declarations through untouched would leave PageFly's border drawing one line
 * and the background drawing another, half a pixel apart: the exact shape of
 * the double-rule the accordion had, which shipped looking like a heavy line
 * with a faint one under it.
 *
 * So the two are converted into the one the element understands, and the pair
 * that would have drawn the second line is removed rather than left to be
 * harmless. `border: 0` goes in before `border-top`, because a design that
 * wrote `border: none` and a design that wrote nothing have to end up in the
 * same place.
 */
function asRule(styleData: StyleData): StyleData {
  if (!styleData) return null;
  const out: Record<string, Record<string, string>> = {};

  for (const [device, block] of Object.entries(styleData)) {
    const rule = block?.["&"];
    if (typeof rule !== "string") {
      out[device] = block;
      continue;
    }

    /* Split on the first colon only: a value can hold one (a url, a gradient
       stop) and a key cannot. */
    const decls: [string, string][] = [];
    for (const part of rule.split(";")) {
      const at = part.indexOf(":");
      if (at === -1) continue;
      const k = part.slice(0, at).trim();
      const v = part.slice(at + 1).trim();
      if (k && v) decls.push([k, v]);
    }

    /* `!important` STRIPPED OFF THE PARTS AND PUT BACK ON THE WHOLE. The
       exporter marks a fixed height important, and folding that token into the
       middle of a shorthand produces `1px !important solid <colour>` — which is
       not a declaration at all. A browser drops the whole line and the divider
       disappears, silently, which is worse than the double rule this
       conversion exists to prevent. */
    const bang = (v: string) => v.replace(/\s*!important\s*$/, "").trim();
    const height = decls.find(([k]) => k === "height")?.[1];
    const colour = decls.find(([k]) => k === "background")?.[1];
    const loud = [height, colour].some((v) => v && /!important\s*$/.test(v));

    const kept = decls.filter(([k]) =>
      /* The three the rule is made of, gone whichever way the design spelled
         them. Everything else — margin, width, opacity, the layout variables —
         is the design's and stays. */
      !(k === "height" || k === "background" || k === "border" || k.startsWith("border-")),
    );

    const line =
      height && colour
        ? [
            ["border", "0"],
            ["border-top", `${bang(height)} solid ${bang(colour)}${loud ? " !important" : ""}`],
          ]
        : [];

    out[device] = {
      ...block,
      "&": [...line, ...kept].map(([k, v]) => `${k}: ${v};`).join(" "),
    };
  }
  return out;
}

export function DIVIDER(styleData: StyleData) {
  return node("Divider2", { dividerType: "plain" }, asRule(styleData), []);
}

/**
 * Tabs, as PageFly's own element.
 *
 * WHAT THIS REPLACES. A hand-built bar of hidden radio inputs, a `:has()` rule
 * per panel and a `Custom.HTML` block to hold the labels. It worked — the live
 * page switched panels — and it was wrong in the way that matters most here: a
 * merchant opening the element in the editor found `HTML/Liquid` and a code
 * panel, not a Tabs element with a list of tabs they could rename, reorder or
 * add to. An export that a merchant cannot edit afterwards has handed them a
 * picture of a page again, in the one place they are most likely to want a
 * change.
 *
 * FOUR TYPES, AND THE NESTING IS NOT OPTIONAL. `Tabs3` holds exactly two slots
 * — the header row and the panel wrapper — and each of those holds a
 * collection. `fields.md` also carries a placement note saying to emit `Tabs3`
 * alone and fill `content.items`, which is a different authoring path for
 * label-and-text tabs; it cannot carry a table or an image, and the tabs this
 * product designs do. The nesting table is explicit that `TabsContent3` takes
 * 152 of the 241 element types, so the full tree is the one that keeps what
 * the design asked for.
 *
 * THE LABEL IS `value` ON THE HEADER, not a Heading nested inside it — the same
 * shape, and the same trap, as `ACCORDION_HEADER` above: nested, the editor
 * shows an empty tab and the words are in the file with nothing displaying them.
 *
 * `activeFront` counts from ZERO and `activeTab` counts from ONE. Both are
 * written, because they are read by different halves — the canvas and the
 * published page — and setting one without the other opens a different tab in
 * the editor than the shopper sees.
 */
export function TABS(
  tabs: { label: string; body: PFNode[] }[],
  open: number,
  styleData: StyleData,
  /** what the bar does when it runs out of room; the mockup's call */
  narrowBar: "wrap" | "scroll" = "scroll",
) {
  const active = Math.min(Math.max(0, open), Math.max(0, tabs.length - 1));
  return node(
    "Tabs3",
    {
      activeFront: active,
      /* Written alongside `activeFront`, which `fields.md` says it shadows. */
      active: active,
      /* Per breakpoint, like every other responsive setting in this file. The
         bar stays on top at every width: `left` and `right` put a column of
         labels beside the panel, which is a two-column layout on a phone. */
      headerPosition: { all: "top", laptop: "top", tablet: "top", mobile: "top" },
      align: { all: "start", laptop: "start", tablet: "start", mobile: "start" },
      fitted: { all: false, laptop: false, tablet: false, mobile: false },
      /* THE THREE THE EDITOR REPORTED AS "Something went wrong", and the
         divergence report had named them all along — dismissed as cosmetic
         because `name` and `classGlobalStyling` sat in the same list.

         `tabMenuLayout` is a per-breakpoint object exactly like `fitted` and
         `align` above. A component that reads `.mobile` off one of those and
         finds the whole object undefined throws; it does not fall back. It is
         also what stops four labels crowding on a phone, which is the job
         `fitted: true` was doing here badly — the bar scrolls instead.

         `icon` is the chevron `DropdownButton` draws, and `targetStyle` is how
         the element finds its own style bucket. Both PageFly exports of the
         same page carry all three. */
      /* THE NARROW BEHAVIOUR IS THE MOCKUP'S. `scroll` on both narrow widths
         was written here whatever the bar does: a mockup whose `.tablist` is
         `flex-wrap: wrap` with no media query touching it wraps at every width,
         and came back as a horizontal scroller on half of them. */
      tabMenuLayout: { all: "wrap", laptop: "wrap", tablet: narrowBar, mobile: narrowBar },
      icon: "angle-down",
      targetStyle: "Tabs3",
    },
    styleData,
    [
      /* NO `activeTab` ON THE MENU. PageFly's own export writes it on every
         TabHeader3 and on nothing else; on the menu it is a key the editor
         does not read. */
      node("TabsMenu3", {}, null,
        /* `activeTab` CARRIES NOTHING. Two PageFly exports of the same page
           disagree about it — one has the headers at 0,1,2 and the other has
           all three at 0 — and both import clean, so it is stale editor state
           and no reader depends on it. The header's own index is what we write
           because one of the two files does; nothing turns on the choice. */
        tabs.map((t, i) =>
          node(
            "TabHeader3",
            { value: t.label, activeTab: i, showIcon: false, iconPos: "left", isNavButton: false },
            null,
            [ICON2()],
          ),
        ),
      ),
      node("TabContentWrapper3", {}, null,
        /* `TAB_CONTENT` IS NOT A LABEL. Every other `name` in a PageFly export
           is prose a merchant typed — "Tab header 1", "Product tabs". This one
           is an uppercase literal identical on every panel in both exports,
           which is what a renderer looks a panel up BY rather than something it
           displays. Emitted with no panel body it is the only field here that
           could not have been guessed from the field reference. */
        tabs.map((t) => node("TabsContent3", { name: "TAB_CONTENT" }, null, t.body)),
      ),
      /* THE THREE SLOTS THIS FILE DID NOT KNOW ABOUT. `Tabs3` declares four
         things it contains and only two were emitted. The reference has the
         other two: a `DropdownButton`, which is the collapsed-navigation
         control, and a pair of loose `TabHeader3`s that are the scroll arrows —
         `isNavButton` is a STRING there, `start` and `end`, not the boolean the
         menu's own headers carry. */
      node("DropdownButton", {}, null, []),
      /* AND THESE TWO HOLD NOTHING. The `Icon2`-is-always-there rule is real
         for a header in the menu and wrong for these: a scroll arrow draws its
         own glyph, and both exports give the pair zero children. A child on a
         component that renders none of its own is a node the editor has to
         place and cannot. */
      node("TabHeader3", { activeTab: 0, showIcon: false, iconPos: "left", isNavButton: "start" }, null, []),
      node("TabHeader3", { activeTab: 0, showIcon: false, iconPos: "left", isNavButton: "end" }, null, []),
    ],
  );
}

/**
 * A data table.
 *
 * The cells go in DATA, not in children: `fields.md` is explicit that they are
 * supplied as `rows: string[][]` and that "row/column counts derive from rows;
 * do not set them". The four children are SLOTS — exactly one of each, holding
 * nothing — and the renderer builds the grid from the data between them. Hand
 * a Table2 a tree of cells instead and the editor shows an empty table.
 *
 * `columnsWidth` is per breakpoint. `fill` shares the width evenly, which is
 * right for a size chart; `hug` sizes to content, which is right when the first
 * column is a long label and the rest are single values. A table wider than a
 * phone scrolls inside its own wrapper rather than pushing the page sideways —
 * that rule is in the page stylesheet, not here.
 */
/**
 * PageFly's own Table2 — NO LONGER EMITTED, and kept only as the record of why.
 *
 * The editor rejects every shape we could find for its cells: it answers
 * "Please add an item in General -> Rows or General -> Columns", so the element
 * has `rows` and `columns` list fields that `fields.md` does not list among its
 * four. `data.rows` did nothing; a sibling `content` key did worse, because it
 * is outside the six keys `page-json.md` allows on a node — the import reported
 * success and the page never reached the editor's list.
 *
 * `tableAsFlex` in `toPagefly.ts` builds tables out of FlexBlocks and
 * Paragraphs instead. Delete this when the real field shape is documented, or
 * restore it the moment it is.
 */
export function TABLE(
  rows: string[][],
  styleData: StyleData,
  opts: { headerColumn?: boolean; width?: "fill" | "hug" } = {},
) {
  const width = opts.width ?? "fill";

  /* Padded here as well as in the schema. A ragged row is a table with holes in
     it, and a tree can reach this function without having been parsed — the
     exporter is called directly by tests and by any caller holding a tree it
     built itself. One place that cannot emit a broken table beats two places
     that agree to check. */
  const columns = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const square = rows.map((r) => [...r, ...Array(Math.max(0, columns - r.length)).fill("")]);

  /* THE TABLE THE EDITOR CALLED EMPTY.

     Exported with the cells in `data.rows`, PageFly opened the section and said
     "Your list is empty. To add new items, click the button below" — with the
     Table2 sitting there carrying every row. `fields.md` says where they go and
     the field table backs it up by NOT listing `rows` among the element's four
     fields:

         Cells go in `content:{ rows:[[header…],[row…]] }` (string[][])

     WRITTEN INSIDE `data`, AND ONLY INSIDE IT. The first attempt also put a
     `content` key beside `data` on the item, because `fields.md` reads that
     way. It was the only key in a 222-item export that `page-json.md` does not
     list among a node's six, and an import that reported success while the
     editor showed nothing is exactly what an out-of-schema key would produce.
     Unverified either way — but a guess that can cost the whole page is worse
     than a table that arrives empty, so the guess goes and the two safe
     placements stay. `data` is documented as "the element's own settings",
     which is where an unread extra key costs nothing. */
  return node(
    "Table2",
    {
      rows: square,
      content: { rows: square },
      rowHeaders: 1,
      columnHeadersPosition: opts.headerColumn ? "left" : "disable",
      ...(opts.headerColumn ? { columnHeaders: 1 } : {}),
      columnsWidth: { all: width, laptop: width, tablet: width, mobile: "hug" },
    },
    styleData,
    [
      node("Table2.RowHeader", {}, null, []),
      node("Table2.ColumnHeader", {}, null, []),
      node("Table2.ColumnBody", {}, null, []),
      node("Table2.Body", {}, null, []),
    ],
  );
}

export function ACCORDION_HEADER(
  label: string,
  styleData: StyleData,
  kids: PFNode[] = [],
) {
  /* `showIcon` IS NOT A FIELD HERE. PageFly's own export writes it on Button2
     and TabHeader3 and not on this one — what it writes instead is the Icon2
     child, which every Accordion3.Header in the reference carries. The child is
     the icon; the flag was an invention. */
  return node("Accordion3.Header", { label }, styleData, [ICON2(), ...kids]);
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
    /** what the mockup shows at 768-1024 and below 768, when it says */
    columnsTablet?: number;
    columnsPhone?: number;
    gapPhone?: number;
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
      /* The mockup's own counts at the two narrow widths; see CONTENT_LIST. */
      slidesToShow: {
        all: columns,
        laptop: columns,
        tablet: opts.columnsTablet ?? Math.min(2, columns),
        mobile: opts.columnsPhone ?? 1,
      },
      spacing: {
        all: `${opts.gap ?? 24}px`,
        laptop: `${opts.gap ?? 24}px`,
        tablet: `${opts.gap ?? 24}px`,
        mobile: `${opts.gapPhone ?? 16}px`,
      },
      /* BOTH DEFAULT TO A VISIBLE CONTROL, and a grid has nowhere to page to.
         Left unsaid, the platform draws `nav-style-1` — a round dark arrow —
         over the first and last card, and `pagination-style-1` dots under a
         list that does not scroll. ContentList2 has passed `none` here since it
         was written; this element was never told, so every exported grid
         arrived wearing controls the mockup does not have.

         A slideshow keeps them: a carousel with no way to advance is a
         carousel showing one row of a list the visitor cannot reach. */
      navStyle: layout === "slideshow" ? "nav-style-1" : "none",
      paginationStyle: layout === "slideshow" ? "pagination-style-1" : "none",
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
/**
 * A real countdown, from PageFly's own element.
 *
 * BEFORE THIS, a page that wanted a timer got `Custom.HTML` — markup that
 * counts nothing, styled to look like a clock, in an element the merchant
 * cannot configure from the editor. A flash sale is the commonest reason to
 * want one, and a dead timer above a sale is worse than no timer.
 *
 * The field names come from `MD Json PageFly/fields.md`. Two of them are
 * objects wearing a string's type in that table, and the note beside each gives
 * it away — the same trap `FORM_FIELD`'s `label` fell into and the reason its
 * comment is as long as it is:
 *
 *   label     "Object { on, reverse }"          — visibility and position
 *   timeData  "Object w/d/h/m/s each { on, text }" — which units, and their names
 *
 * So `timeData` carries every unit, with `on` deciding which are drawn. Writing
 * only the wanted units would leave the rest undefined rather than off, and an
 * undefined unit is one PageFly decides about itself.
 *
 * `endType: "specific"` with an ISO `endTime` — a sale ends at an instant, not
 * after a duration from whenever the page happens to load. `countdownType` is
 * `specific` for the same reason: `first`/`every` restart per visitor, which is
 * a scarcity trick rather than a deadline.
 */
const UNIT_NAMES: Record<string, string> = {
  w: "weeks",
  d: "days",
  h: "hours",
  m: "mins",
  s: "secs",
};

export function COUNTDOWN(
  endsAt: string,
  units: string[],
  labels: boolean,
  /**
   * The `:` between the columns.
   *
   * THIS USED TO BE `!labels`, which is a coupling nothing supports.
   * `fields.md` types `showColon` and `label` as separate booleans and defaults
   * `showColon` to true, and a countdown is ordinarily drawn with both — the
   * figures separated AND named. Derived from `labels`, the one arrangement the
   * mockups actually use was the one arrangement that could not be expressed,
   * and the imported timer ran its four numbers together into one long figure.
   */
  separator: boolean,
  styleData: StyleData,
  /** typography for the figures, and for the unit names under them — see below */
  numberStyle: StyleData = null,
  labelStyle: StyleData = null,
) {
  const shown = new Set(units);
  const timeData = Object.fromEntries(
    Object.entries(UNIT_NAMES).map(([u, text]) => [u, { on: shown.has(u), text }]),
  );

  return node(
    "CountDown",
    {
      countdownType: "specific",
      endType: "specific",
      endTime: endsAt,
      repeat: "never",
      /* Left visible when it ends. A sale page whose timer vanishes at midnight
         reads as a page that lost a section, and the copy around it still says
         the sale is on — the merchant edits both or neither. */
      hideIfInactive: false,
      styleCountDown: "basic",
      showColon: separator,
      label: { on: labels, reverse: false },
      timeData,
      targetStyle: "CountDown",
    },
    styleData,
    /**
     * THE SLOTS ARE OURS TO EMIT, and this is where the timer was lost.
     *
     * This used to be `[]`, on the reading that `fields.md` calling
     * CountdownNumber and CountdownLabel "slots, one per time unit shown" meant
     * the element stamps them out of `timeData` at render. It does not. "Slot"
     * in that file says WHAT may go inside — these two and nothing else — not
     * who puts it there. An imported CountDown with no children is an element
     * with no figure to repeat, and it drew an empty box on a page whose own
     * copy said the sale ends tonight. The layer tree told the story plainly:
     * ours had no children under it, the same element dragged from PageFly's
     * panel had exactly these two, and only that one counted.
     *
     * ONE OF EACH, not one per unit. The pair is a template the element repeats
     * across whichever units `timeData` turns on — the same shape as
     * `ProductList2`, which holds one ProductBox stamped over every product.
     * Four CountdownNumbers here would be four sets of numbers, which is the
     * mistake the old comment was guarding against and the reason it talked
     * itself out of emitting any.
     *
     * Both are given a style, and not only so the numbers match the mockup: a
     * node built with `null` gets NO entry in the parallel `styles` array, and
     * an editor panel reading typography off `undefined` is exactly the crash
     * `FORM_FIELD`'s FormLabel comment records.
     */
    [
      node("CountdownNumber", {}, numberStyle, []),
      node("CountdownLabel", {}, labelStyle, []),
    ],
  );
}

/* ==========================================================================
   THE SHAPE OF THE BOX, AND OF THE TWO PICTURES IN IT.

   Neither was being stated, and both have to be. With no ratio on the root the
   element takes the natural height of whatever photograph the filler resolved,
   so a portrait shot made a band three screens tall; and with no `object-fit`
   on the two images they keep their own heights, so the before and the after
   ended at different points and the slider compared one picture against a
   white gap.

   The selectors are the ones `MD Json PageFly/fields.md` documents for this
   element — `& .pf-ba-content`, `& .pf-ba-before img`, `& .pf-ba-after img` —
   not guesses at its markup. `cover` rather than `contain`: a comparison
   slider whose halves are letterboxed is comparing two frames, not two
   photographs.

   ONE-TO-ONE, AND THE MOCKUP SAYS THE SAME. `lib/design/render.tsx` draws this
   node at the same ratio; the two are meant to be checkable against each other
   and a square here with 4:3 there is exactly the drift the one-tree design
   exists to prevent. Changing the ratio means changing both.
   ========================================================================== */
const BEFORE_AFTER_PARTS: Record<string, string> = {
  "&": "aspect-ratio: 1 / 1;",
  "& .pf-ba-content": "height: 100%; overflow: hidden;",
  "& .pf-ba-before img": "width: 100%; height: 100%; object-fit: cover;",
  "& .pf-ba-after img": "width: 100%; height: 100%; object-fit: cover;",
};

/**
 * `styleData` with the comparison's own rules folded into every device block.
 *
 * Returns a block even when the caller had none: without one the element gets
 * no `aspect-ratio` at all and hugs its content, which is the same failure by
 * a shorter route.
 */
/**
 * A string safe to sit inside a CSS `content: '…'`.
 *
 * The label is merchant copy — an apostrophe in `Kate's` would close the quote
 * and the rest of the rule after it becomes garbage the browser drops, taking
 * the label with it. A backslash has to go first or it escapes the escape.
 */
function cssQuoted(text: string): string {
  return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * The two captions, hung on the handle.
 *
 * THEY USED TO BE ALT TEXT AND NOTHING ELSE. `beforeImageAlt`/`afterImageAlt`
 * are what PageFly searches images with; it never paints them. So a comparison
 * captioned `6PM` and `9PM` — the two words the whole element is about —
 * imported with no captions at all, and the file looked correct because the
 * values were in it.
 *
 * `fields.md` gives this element no text field to put them in: `labelVisible`
 * is documented as a legacy flag with nothing to show. Drawing them is ours.
 * The handle is where the mockup hangs them — its `.ba-handle` spans the full
 * height with one caption to each side — and `::before`/`::after` sit beside
 * `.pf-ba-handle-circle` rather than replacing it, so the grip still draws.
 *
 * `white-space: nowrap` because a two-word caption on a 4px-wide handle wraps
 * to one letter per line otherwise.
 */
function handleLabels(
  beforeLabel: string,
  afterLabel: string,
  /** `corner` pins them to the frame; `handle` hangs them on the grip. */
  at: "corner" | "handle",
  /** the mockup's own chip styling, appended so it wins */
  look: string,
  glyph: string,
  knobLook: string,
  /** shapes the mockup DRAWS in the grip, when no character comes close */
  marks: { one?: string; two?: string },
): Record<string, string> {
  /* `?? ""` because export also runs over design trees stored before these
     captions were drawn, and on those the field is simply absent. */
  const chip =
    "position: absolute; z-index: 3; white-space: nowrap;" +
    " font-size: 10px; font-weight: 600; letter-spacing: .2em;" +
    " text-transform: uppercase; color: #FBFAF7;" +
    " background: rgba(18,16,12,.72); padding: 5px 8px; border-radius: 2px;";
  /* WHERE THEY HANG WAS PICKED HERE, AND IS NOT OURS TO PICK. Two mockups, two
     arrangements: one hangs the captions on the drag handle so they travel with
     it, the other pins them to the frame's bottom corners where they never
     move. On the handle they sit either side of a 4px bar and are pushed
     outward; in the corner they are pinned to the frame itself. */
  const place =
    at === "handle"
      ? { host: "& .pf-ba-handle", before: "top: 14px; right: 12px;", after: "top: 14px; left: 12px;" }
      : { host: "& .pf-ba-content", before: "bottom: 14px; left: 14px;", after: "bottom: 14px; right: 14px;" };

  const out: Record<string, string> = {};
  /* Empty is a caption the design chose not to write — an empty chip is a
     floating dark rectangle over the photograph. */
  const before = (beforeLabel ?? "").trim();
  const after = (afterLabel ?? "").trim();
  if (before) {
    out[`${place.host}::before`] = `content: ${cssQuoted(before)}; ${place.before} ${chip}${look}`;
  }
  if (after) {
    out[`${place.host}::after`] = `content: ${cssQuoted(after)}; ${place.after} ${chip}${look}`;
  }
  /* THE GRIP. PageFly draws a plain round dot and documents the element for
     styling; a mockup draws whatever it draws, and usually puts a mark in it.
     The mark goes on the dot's own ::after so it sits INSIDE rather than
     replacing the shape the design asked for. Escaped to a CSS code point for
     the same reason the arrow glyph is: the rule travels through JSON and a
     zip, and an ASCII-only one cannot be mangled by either. */
  const one = (marks?.one ?? "").trim();
  const two = (marks?.two ?? "").trim();
  const drawn = Boolean(one || two);
  /* A DRAWN MARK NEEDS THE GRIP TO BE A ROW, and only then. Two shapes on
     ::before and ::after are laid out by their host, so a grip carrying them
     centres them; a grip carrying a character, or nothing, is left exactly as
     it was, because this runs over every comparison ever exported. The
     design's own rules come after, so a stated `display` still wins. */
  const base = drawn ? "display: flex; align-items: center; justify-content: center;" : "";
  if (knobLook || base) out["& .pf-ba-handle-circle"] = `${base} ${knobLook.trim()}`.trim();
  const mark = (glyph ?? "").trim();
  if (mark) {
    out["& .pf-ba-handle-circle::after"] =
      `content: "${[...mark].map((c) => "\\" + c.codePointAt(0)!.toString(16)).join("")}";` +
      " line-height: 1; font-size: 13px;";
  }
  /* AFTER THE GLYPH, so a design that states both gets the drawing it drew
     rather than the character it also guessed at. `content` is what makes a
     pseudo-element exist at all; the shape, the size and the colour are the
     design's, read off the mockup's own path. */
  if (one) out["& .pf-ba-handle-circle::before"] = `content: ""; display: block; ${one}`;
  if (two) out["& .pf-ba-handle-circle::after"] = `content: ""; display: block; ${two}`;
  return out;
}

function beforeAfterStyles(styleData: StyleData, labels: Record<string, string>): StyleData {
  const devices = new Set<string>(["all", ...Object.keys(styleData ?? {})]);
  const out: Record<string, Record<string, string>> = {};
  for (const d of devices) {
    const had = styleData?.[d] ?? {};
    out[d] = {
      ...had,
      "&": `${had["&"] ?? ""} ${BEFORE_AFTER_PARTS["&"]}`.trim(),
    };
  }
  /* The children are the same at every width, so they ride on `all` alone —
     repeating them four times would be four copies of one fact. */
  out.all = { ...out.all, ...BEFORE_AFTER_PARTS, ...labels, "&": out.all["&"] };
  return out;
}

export function BEFORE_AFTER(
  before: string,
  after: string,
  beforeLabel: string,
  afterLabel: string,
  styleData: StyleData,
  look: {
    at?: "corner" | "handle";
    label?: string;
    knob?: string;
    glyph?: string;
    /** the mockup's own drawing, when its grip holds shapes and not a character */
    mark?: string;
    markTwo?: string;
  } = {},
) {
  return node(
    "ImageComparison",
    {
      beforeImageUrl: before,
      afterImageUrl: after,
      /* `alt` doubles as the image-search query in PageFly, so the label is the
         better value than a description of the label. */
      /* THE ALT KEEPS ITS FALLBACK AND THE CHIP DOES NOT. These two words are
         read by nobody when they are alt text — they are an accessibility
         value and PageFly's image-search phrase — so an empty one is a loss
         with no upside. Painted on the photograph they are the opposite: a
         design that drew no caption must not have two appear on it. */
      beforeImageAlt: (beforeLabel ?? "").trim() || "Before",
      afterImageAlt: (afterLabel ?? "").trim() || "After",
      initialPosition: 50,
      handleStyle: "circle",
      direction: "horizontal",
      imgQuality: "auto",
      loading: "lazy",
    },
    /* EVERY BREAKPOINT, not just `all`, and that was the bug.

       These four device blocks are not a cascade of deltas — each one carries a
       COMPLETE `&` rule, written out in full by `derive.ts`, and the narrower
       one replaces the wider one outright. Patching only `all` therefore put
       the ratio on exactly one width and left `--pf-flex-layout-height: hug` in
       charge of the other three, so the element sized to its content and came
       back taller than it is wide — which is what a merchant saw in the editor
       at 1440px, where `laptop` is the block that applies.

       The `&` entry is appended to whatever the caller wrote rather than
       replacing it, or a background, a radius or a border set on the node would
       vanish with it. The child selectors are width-independent and only need
       saying once. */
    beforeAfterStyles(
      styleData,
      handleLabels(
        beforeLabel,
        afterLabel,
        look.at ?? "corner",
        look.label ? ` ${look.label}` : "",
        look.glyph ?? "",
        look.knob ?? "",
        { one: look.mark, two: look.markTwo },
      ),
    ),
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
  /** Which form this field belongs to. Written onto the field and the input the
      way the reference does — see `context` below. */
  formType: "customer" | "contact" = "contact",
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
       * `{ text, on, position }` — SETTLED BY THE REFERENCE, not inferred. Every
       * one of the eleven Form2.Fields in PageFly's own export carries exactly
       * those three keys and no `value`. The `value` this file used to send
       * alongside `text` was the guess its own comment asked to have deleted
       * "when an import confirms which one PageFly reads"; the import has.
       *
       * `context` rides on the field AND on the input in the reference, and it
       * is the likeliest thing an inspector panel reads when it opens: a field
       * that does not know which form it belongs to cannot know which settings
       * to show.
       */
      label: { text: label, on: true, position: "top" },
      context: { formType },
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
      /* NO `label` KEY. The reference's eleven FormLabels carry `name` and a
         class and nothing else — the copy lives on the parent field's
         `label.text`, which is what "shown by the parent label.on sub-field"
         meant. A key on an element documented as having none is the shape of a
         panel reading something that is not there. */
      node("FormLabel", {}, labelStyle, []),
      /* NO STYLE, AND THAT IS THE DOCUMENTED RULE.

         `fields.md` marks exactly two elements "cannot be styled on its own" —
         this and TabHeader3 — and says this one's look "is set on the parent
         Form2". Giving it a style entry anyway made the editor answer
         "Something went wrong" the moment a merchant clicked the field, and
         took the whole page down with it.

         It was given one to fix a real problem: the wrapper had no width, so
         `& input { width: 100% }` was a hundred percent of a box that had
         already shrunk. The fix belongs where the documentation puts it — a
         rule on the Form2 reaching this element by type. See `toPagefly`. */
      /* `context` and `id`, both on every one of the reference's inputs. The
         id is what a label's `for` points at, and PageFly's own are
         `field-<8 hex>` — the shape is copied, the value is ours. */
      node(
        "FormInput",
        {
          required,
          inputType: INPUT_TYPE[kind] ?? 0,
          context: { formType },
          id: `field-${uid().replace(/-/g, "").slice(0, 8)}`,
        },
        null,
        [],
      ),
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
      /* Given one for the same reason the field and the input are: a node with
         no style entry hands an editor panel `undefined`, and a node with no
         width opinion is sized by whatever the engine assumes. The look is
         still the Form2's `& button` rule — this is the box, not the paint. */
      node(
        "Form2.Button2",
        {
          value: submit,
          /* `placeholder` beside `value` on every one of the reference's, and
             `context` for the same reason the fields carry it. */
          placeholder: submit,
          buttonType: "text",
          showIcon: false,
          iconPos: "right",
          context: { formType: intent === "signup" ? "customer" : "contact" },
        },
        { all: { "&": "--pf-flex-layout-width: hug;" } },
        [ICON2()],
      ),
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
  opts: {
    perView: number;
    autoplay: boolean;
    gutter?: number;
    perTablet?: number;
    perPhone?: number;
    gapPhone?: number;
  },
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
      slidesToShow: {
        all: per,
        laptop: per,
        tablet: opts.perTablet ?? Math.min(2, per),
        mobile: opts.perPhone ?? 1,
      },
      slidesToScroll: { all: 1, laptop: 1, tablet: 1, mobile: 1 },
      /* A phone gets a tighter gap for the same reason it gets one slide —
         unless the mockup states a number of its own. */
      gutter: { all: gap, laptop: gap, tablet: gap, mobile: opts.gapPhone ?? Math.min(gap, 16) },
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
  /* Two slots, or three when a badge was asked for. An exact match on one form
     would reject the other, and `fields.md` lists ProductBadge as a config child
     of this element rather than a sibling of it. */
  ProductMedia3: ["MediaMain3", "MediaList2"],
  "ProductMedia3+badge": ["MediaMain3", "MediaList2", "ProductBadge"],
  ProductPrice2: ["ProductPrice2Item", "ProductPrice2Item"],
  ProductQuantity: ["QuantityButton", "QuantityField", "QuantityButton"],
  ProductVariantSwatches: ["OptionLabel", "Swatch"],
  "Accordion3.Content.Wrapper": ["Accordion3.Header", "Accordion3.Content"],
  "Accordion3.Content": ["Accordion3.Flex.Content"],
  "Form2.Field": ["FormLabel", "FormInput"],
  /* One card template, repeated. Two ProductBoxes here is two identical cards
     stamped over every product in the grid. */
  ProductList2: ["ProductBox"],
  /* Four slots, exactly once each and in this order. The cells are DATA — a
     Table2 handed a tree of cells renders an empty table. */
  Table2: ["Table2.RowHeader", "Table2.ColumnHeader", "Table2.ColumnBody", "Table2.Body"],
  /* One figure and one unit name, which the element repeats across the units
     `timeData` turns on. Listed here so the empty timer cannot come back
     quietly: a CountDown with no children imports without complaint and draws
     nothing, which is the worst shape a bug can take in this file. */
  CountDown: ["CountdownNumber", "CountdownLabel"],
  /* FIVE SLOTS, AND THIS FILE KNEW ABOUT TWO OF THEM.

     The header row and the panel wrapper were the two anybody would guess, and
     `fields.md` lists two more it does not explain — `DropdownButton` and a
     `TabHeader3` collection. `reference/all-elements.pagefly`, the editor's own
     export, shows what they are for: the dropdown is the collapsed-navigation
     control, and the loose headers are the two scroll arrows, marked
     `isNavButton: "start"` and `"end"` where the menu's own headers carry
     `false`.

     A Tabs3 with only the first two imports as an element the renderer cannot
     finish building — which is the "Something went wrong" a merchant met where
     the size table should have been. */
  Tabs3: [
    "TabsMenu3",
    "TabContentWrapper3",
    "DropdownButton",
    "TabHeader3",
    "TabHeader3",
  ],
};

/** Parents whose children must ALL be one type (count is free). */
/**
 * Elements the editor refuses to open once they carry a style of their own.
 *
 * WRITTEN AFTER ONE OF THEM TOOK THE EDITOR DOWN. `fields.md` marks exactly
 * these two "cannot be styled on its own", and the note reads like a styling
 * preference rather than a rule — so a width was put on FormInput to fix a real
 * layout bug, and clicking the field answered "Something went wrong" over the
 * whole page. A merchant with a form on their page could not edit the page.
 *
 * The prose said so and prose is not enforced, which is why this is a list and
 * a throw. Anything these elements need is set on the parent that owns their
 * look: `& input` and `& [data-pf-type="FormInput"]` on the Form2,
 * `& [data-pf-type="TabsMenu3"] > label` on the Tabs3.
 */
/* ==========================================================================
   THE ICON CHILD THAT IS ALWAYS THERE.

   Five element types can show an icon, and `fields.md` describes the child as
   "config, shown by `showIcon`" — which reads as optional and is not. In
   PageFly's own export every one of them carries an `Icon2` whether the icon is
   shown or not: a TabHeader3 with `showIcon: false` still has the child, with
   no `icon` key on it.

   A component that renders its child and finds none is not an element with a
   hidden icon. It is the shape behind "Something went wrong".

   Read off `reference/all-elements.pagefly`, which is the editor's own file and
   the only artefact here that shows what a correct one looks like. */
export function ICON2(icon?: string) {
  return node("Icon2", icon ? { icon } : {}, null, []);
}

const UNSTYLEABLE = new Set(["FormInput", "TabHeader3"]);

/* ==========================================================================
   CONTAINERS MAY SHRINK; WORDS MAY NOT — inside a composite as well.

   `cssAt` in `toPagefly` gives every design-tree node this floor, and that is
   where the one-character-per-line fix lives. A composite's internals never
   pass through it: a table's cells, an accordion's rows, a media list's items
   and every bound part of a buy box are built here and reach the file with
   whatever this file wrote. Measured on a real export, 129 elements carried a
   style and no floor at all — 65 of them Paragraph4, which is the element the
   collapse shows on.

   The same split as `toPagefly`, read off PageFly's own types rather than the
   tree's: a box has no words of its own and shrinking is how a layout narrows,
   so it keeps the zero. Everything else carries words and keeps `min-content`,
   which is the width a browser would have given it before PageFly's base rules
   overrode it. A picture is not a box and not words — on a replaced element
   `min-content` is the source file's own width, so those keep the zero too.
   ========================================================================== */
const MAY_SHRINK = new Set([
  /* The boxes layouts are built out of. */
  "Body",
  "Layout",
  "FlexSection",
  "FlexBlock",
  /* Composites that lay their OWN children out in a row: a column's min-content
     is its widest word, a row's is the SUM of its children's, which on a narrow
     rail is wider than the rail. */
  "ProductBox",
  "ProductMedia3",
  "MediaMain3",
  "MediaList2",
  "MediaItem2",
  "Slideshow",
  "SlideshowSlide",
  "Tabs3",
  "TabsMenu3",
  "TabContentWrapper3",
  "TabsContent3",
  "ContentList2",
  "ContentListItem",
  "Accordion3",
  "Accordion3.Content.Wrapper",
  "Accordion3.Content",
  "Accordion3.Flex.Content",
  "Form2",
  "Form2.Field",
  "ProductVariantSwatches",
  "ProductQuantity",
  "ImageComparison",
  "CountDown",
  /* Replaced elements — `min-content` there is the source file's intrinsic
     width, which would refuse to shrink rather than refuse to break a word. */
  "Image5",
  "Divider2",
  "Custom.HTML",
]);

/* ==========================================================================
   SIZE IS RE-STATED PER BREAKPOINT; EVERYTHING ELSE CASCADES.

   `all` cascades the way a stylesheet does — a colour, a padding, a font size
   written once is what every width gets. The SIZE does not cascade. PageFly
   rebuilds each element's width and height at each breakpoint from that
   breakpoint's own settings, and an element with no entry at a breakpoint is
   read as the default, which is hug:

       @media (max-width: 767.5px) {
         .pf-64_ { width: fit-content; height: fit-content;
                   flex-grow: unset; align-self: unset; }
       }

   Four declarations, none of them ours, and they undo a `flex: 1 1 0` written
   at `all`. A table cell then shrinks past its own longest word and sets CLOTH
   one letter per line down the page — on the laptop, not some narrow phone,
   because everything under 1200px is a "breakpoint" to this engine.

   The styles this file writes itself — a table's rows and cells, the buy box,
   a stepper — describe one size and mean it at every width. So the sizing half
   of `all` is repeated into any breakpoint that does not already state its
   own, and nothing else is: colour, spacing and type still cascade, so a
   merchant editing the desktop view still changes the phone.

   Repeat only what the engine re-states, which is the list below — plus the
   custom properties it re-states them FROM, or its own defaults win again.
   ========================================================================== */
const SIZED = new Set([
  "--pf-flex-layout-width",
  "--pf-flex-layout-height",
  "--pf-flex-layout-direction",
  "--pf-flex-layout-parent-direction",
  "display",
  "flex-direction",
  "width",
  "height",
  "min-width",
  "flex",
  "flex-grow",
  "flex-basis",
  "flex-shrink",
  "align-self",
]);

/** Split on a separator that is not inside brackets — so declarations break on
    the semicolons that end them and not on the one in
    `url(data:image/png;base64,…)`, and a selector list breaks on its own commas
    and not on the ones in `:is(a, b)`. */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((d) => d.trim()).filter(Boolean);
}

const splitDecls = (css: string): string[] => splitTop(css, ";");

/* ==========================================================================
   ONE SELECTOR PER KEY. PageFly keeps what is before the first comma.

   `"& .pf-slider-prev, & .pf-slider-next"` is ordinary CSS and reads as one
   rule for two elements. PageFly's generator does not: the stylesheet it
   returned held

       .__pf .pf-18_ .pf-slider-prev { … }

   and nothing at all for the next arrow — a pale bordered plate on the left of
   the photograph and PageFly's stock dark circle on the right, in the same
   gallery. Its own `fields.md` names that styleable part with a comma in it,
   which is where the habit came from.

   Nothing is lost by splitting: a selector list means the same thing written
   out. Doing it here rather than at each composite means the next one cannot
   reintroduce it, and a key naming one selector passes through untouched.
   ========================================================================== */
function splitSelectors(styleData: StyleData): StyleData {
  if (styleData === null) return null;
  const out: Record<string, Record<string, string>> = {};
  for (const [device, rules] of Object.entries(styleData)) {
    const here: Record<string, string> = {};
    for (const [selector, css] of Object.entries(rules)) {
      for (const one of splitTop(selector, ",")) {
        here[one] = here[one] ? `${here[one]} ${css}` : css;
      }
    }
    out[device] = here;
  }
  return out;
}

const propOf = (decl: string): string =>
  decl.slice(0, decl.indexOf(":")).trim().toLowerCase();

/** `all`'s sizing, repeated into every breakpoint that is silent about its own.
    See the block above. Adds no declaration a breakpoint already states. */
function pinSize(styleData: StyleData): StyleData {
  if (styleData === null) return null;
  const base = styleData.all?.["&"];
  if (!base) return styleData;

  const sizing = splitDecls(base).filter((d) => SIZED.has(propOf(d)));
  if (sizing.length === 0) return styleData;

  const out: Record<string, Record<string, string>> = { ...styleData };
  for (const device of ["laptop", "tablet", "mobile"] as const) {
    const here = out[device];
    const css = here?.["&"] ?? "";
    const stated = new Set(splitDecls(css).map(propOf));
    const add = sizing.filter((d) => !stated.has(propOf(d)));
    if (add.length === 0) continue;
    out[device] = { ...here, "&": `${css} ${add.join("; ")};`.trim() };
  }
  return out;
}

/**
 * The floor, written into a style that already exists.
 *
 * NEVER CREATES A STYLE ENTRY. Forty-five elements in a real export carry none,
 * and two of them must never carry one — `fields.md` marks `FormInput` and
 * `TabHeader3` "cannot be styled on its own", and giving `FormInput` a style
 * once answered "Something went wrong" on the first click and took the page
 * with it. A floor is not worth walking back into that; a node with no style is
 * left exactly as it is.
 */
function withFloor(type: string, styleData: StyleData): StyleData {
  const pinned = pinSize(splitSelectors(styleData));
  if (pinned === null) return null;
  const want = MAY_SHRINK.has(type) ? "0" : "min-content";
  const out: Record<string, Record<string, string>> = {};
  for (const [device, rules] of Object.entries(pinned)) {
    const css = rules["&"] ?? "";
    out[device] =
      /(^|[;\s])min-width\s*:/.test(css)
        ? { ...rules }
        : { ...rules, "&": `${css} min-width: ${want};`.trim() };
  }
  return out;
}

const UNIFORM_CHILDREN: Record<string, string> = {
  Accordion3: "Accordion3.Content.Wrapper",
  Slideshow: "SlideshowSlide",
  MediaList2: "MediaItem2",
  ContentList2: "ContentListItem",
  /* One label per tab and one panel per tab; the two collections are read in
     step, so a stray node in either shifts every panel out from under its
     label without anything failing. */
  TabsMenu3: "TabHeader3",
  TabContentWrapper3: "TabsContent3",
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

  /** How many sections are on the page. Read by callers that build a page one
      section at a time and need to know whether any survived. */
  sectionCount(): number {
    return this.sections.length;
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
          styles: JSON.stringify(withFloor(n.type, n.styleData)),
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
        /* Some elements have a second legal shape — ProductMedia3 with a badge.
           Checked as alternatives rather than as one exact list, because an
           exact match on either form rejects the other. */
        const alt = SLOT_RULES[`${i.type}+badge`];
        const ok =
          kt.join("|") === rule.join("|") ||
          (alt !== undefined && kt.join("|") === alt.join("|"));
        if (!ok) throw new Error(`${i.type} slots must be ${rule}, got ${kt}`);
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
