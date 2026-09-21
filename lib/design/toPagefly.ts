import {
  BEFORE_AFTER,
  BTN,
  CONTENT_LIST,
  COUNTDOWN,
  CUSTOM_HTML,
  FB,
  FORM,
  FORM_FIELD,
  FSECTION,
  H2,
  IMG,
  MEDIA_LIST,
  MEDIA_MAIN,
  OVERLAY,
  SCRIM_CSS,
  P4,
  DYNAMIC_CHECKOUT,
  PRODUCT_ATC,
  PRODUCT_BADGE,
  PRODUCT_BOX,
  PRODUCT_LIST,
  PRODUCT_MEDIA,
  PRODUCT_PRICE,
  PRODUCT_QUANTITY,
  PRODUCT_SWATCHES,
  PRODUCT_TITLE,
  DIVIDER,
  SLIDESHOW,
  TABS,
  SLIDESHOW_PARTS,
  STOCK_INDICATOR,
  ACCORDION,
  ACCORDION_HEADER,
  Page,
  type DeviceKey,
  type PFNode,
  type StyleData,
} from "../pagefly/builder";
import { readableInk, WEBFONT_CSS_URL } from "../styleTokens";
import { cleanBlock, type CleanBlock } from "./customBlock";
import { DEVICES, styleAt, type Device } from "./derive";
import {
  HOVER_NATIVE_TYPES,
  MOTION_CSS,
  MOTION_JS,
  hasMotion,
  hoverClass,
  motionClasses,
} from "./motion";
import {
  childrenOf,
  walk,
  type Anim,
  type Css,
  type DesignNode,
  type DesignSection,
  type DesignTree,
} from "./schema";

/* ==========================================================================
   Design tree → .pagefly, with no DOM in the path.

   `fromDom.ts` had to reconstruct intent from computed style: it measured
   boxes to decide whether a node filled or hugged, read `display` off elements
   that declared none, and matched children across four separate renders by
   longest-common-subsequence because it had no other way to know which box was
   which. Every fidelity bug this project has shipped came out of that gap.

   None of those questions exist here. The tree says a node is a row; it is a
   row. The tree says the width is 100%; it fills. The four breakpoints are one
   node with four resolved style sets, not four DOM trees to align.

   What is NOT inferred away, because PageFly still requires it:

   - `--pf-flex-layout-*`. The Flex engine sizes from these, and without them it
     applies its own base rules — which collapse a text container to roughly one
     character wide. Derived from the tree's own declarations rather than from a
     measured box.
   - `!important` on layout properties only. Those same base rules outrank
     plain styleData. Colours and type never needed it, and applying it broadly
     fights the editor's own resize handles.
   - Decoration emitted as Custom.HTML. A styled node with no text and no
     children is a rule or a dot; as a childless FlexBlock the editor paints
     "Drop element here" across it.

   ==========================================================================
   THE GOVERNING RULE, and every fidelity bug so far has been a breach of it:

     THE MOCKUP IS THE SPECIFICATION. For each element, use the SETTING where
     the platform has one, and write CSS only for the part no setting reaches.
     Where a default disagrees with the mockup, override it explicitly — a
     default you did not write is still a decision you shipped.

   Settings first because a setting is what the merchant can change afterwards.
   A column count written as CSS is a column count they have to find in a code
   box; written as `slidesToShow` it is a number with a slider next to it. And
   a CSS grid over a native one does not merely duplicate it — `fields.md` says
   it collapses every card to one per row.

   Defaults are the trap. They are invisible in the diff and they are almost
   never what a designed page wants:

     Slideshow.navStyle          nav-style-1        arrows nobody asked for
     Slideshow.paginationStyle   pagination-style-1 dots on a 3-of-3 carousel
     Slideshow.gutter            0                  slides edge to edge
     ProductList2.listLayout     slideshow          a grid becomes a carousel
     ProductList2.source         all                a collection page shows the
                                                    whole store
     ProductMedia3.showList      false              a PDP with no gallery

   Each of those shipped. Each looked right in the mockup, because the mockup
   never had the default.

   The reverse trap is writing CSS for something a setting owns: a `gap` on a
   Slideshow root does not reach the slider track, and `display:flex` on a
   MediaList2 does not show a thumbnail strip whose `showList` is false. Both
   render as nothing and neither reports anything.
   ========================================================================== */

/** Numbers are px in CSS except for these. Matches React's own list. */
const UNITLESS = new Set([
  "opacity",
  "zIndex",
  "fontWeight",
  "lineHeight",
  "flexGrow",
  "flexShrink",
  "order",
  "flex",
  "zoom",
  "aspectRatio",
]);

const LAYOUT_PROPS = new Set([
  "display",
  "flex",
  "flex-flow",
  "flex-direction",
  "flex-wrap",
  "flex-basis",
  "flex-grow",
  "flex-shrink",
  "align-items",
  "align-self",
  "align-content",
  "justify-content",
  "gap",
  "row-gap",
  "column-gap",
  "width",
  "max-width",
  "min-width",
  "height",
  "grid-template-columns",
]);

function kebab(key: string): string {
  return key.startsWith("--")
    ? key
    : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function value(key: string, raw: string | number): string {
  if (typeof raw === "number" && !UNITLESS.has(key)) return `${raw}px`;
  return String(raw);
}

/** One resolved style set as a CSS declaration string. */
function declarations(css: Css): string {
  return Object.entries(css)
    .map(([k, v]) => {
      const prop = kebab(k);
      const val = value(k, v);
      const bang =
        LAYOUT_PROPS.has(prop) && !String(val).includes("!important")
          ? " !important"
          : "";
      return `${prop}: ${val}${bang};`;
    })
    .join(" ");
}

/* ---- the layout engine's four custom properties -------------------------- */

type Dir = "horizontal" | "vertical";

/**
 * Does this node take the width its parent offers, size to its content, or hold
 * a fixed width?
 *
 * `fromDom` answered this by measuring the rendered box against its parent's
 * content box — which is why a node that happened to fill its line was recorded
 * as `fill` even when it was meant to hug. Here the declarations answer it.
 */
/** Leaves that carry words. They size to the words unless told otherwise. */
const WORDS = new Set(["heading", "text", "counter"]);

function widthMode(
  node: DesignNode | DesignSection,
  css: Css,
  parentDir: Dir | null,
): "hug" | "fill" | "fixed" {
  const w = css.width === undefined ? undefined : String(css.width);

  if (w === "fit-content" || w === "max-content" || w === "auto") return "hug";
  if (w === "100%") return "fill";
  if (w && /^-?\d/.test(w)) return "fixed";

  if (css.alignSelf === "stretch") return "fill";
  const flex = css.flex === undefined ? "" : String(css.flex);
  if (flex && !flex.startsWith("0")) return "fill";
  if (Number(css.flexGrow ?? 0) > 0) return "fill";

  /* ==========================================================================
     TEXT IN A ROW HUGS. This is CSS's own default and the mockup's behaviour.

     `fill` is not a hint here — PageFly's engine expands it to
     `flex-grow: 1; flex-basis: 0px`, so a `WOOL CONTENT` label declared `fill`
     inside a label/value row took the whole row and pushed `80%` to the far
     edge, with a full-width blue box around the label in the editor. In the
     mockup the same node is a flex child at its default `flex: 0 1 auto` and
     sits at the width of its words.

     Only in a row. In a column `fill` is right and is what makes a paragraph
     wrap at the container's measure rather than at its own longest line — the
     column-direction default `align-items: stretch`, which is the same rule
     read the other way.
     ========================================================================== */
  if (parentDir === "horizontal" && WORDS.has(node.type)) return "hug";

  /* Inline things hug by nature; everything else is a block that fills. Getting
     this backwards on a button stretches it across the whole row, which is the
     most visible way an imported page stops matching its mockup. */
  return node.type === "button" || node.type === "icon" ? "hug" : "fill";
}

function heightMode(css: Css): "hug" | "fill" | "fixed" {
  const h = css.height === undefined ? undefined : String(css.height);
  if (h === "100%") return "fill";
  if (h && /^-?\d/.test(h)) return "fixed";
  return "hug";
}

function directionOf(node: DesignNode | DesignSection, css: Css): Dir {
  if (node.type === "row") {
    return String(css.flexDirection ?? "row").startsWith("column")
      ? "vertical"
      : "horizontal";
  }
  return "vertical";
}

/* ==========================================================================
   A PARENT'S DIRECTION IS NOT ONE VALUE. It was written as one, and that is
   how a stacked phone layout kept describing itself as a row.

   `floorFor` turns a two-column row into a column on the phone, and has for a
   while. But the direction handed down to its children was computed ONCE, off
   the row's desktop css, and then written into all four breakpoints — so every
   child of a row that had just stacked still carried
   `--pf-flex-layout-parent-direction: horizontal` in its `mobile` entry, and
   `widthMode` still read "my parent is a row" and gave a paragraph `hug`.

   A paragraph told to hug inside a stack wraps at its own longest line rather
   than the screen's, which is the four-words-wide column of text sitting over
   the photograph above it. The mockup never had the bug because the mockup is
   real CSS and a flex column stretches its children without being told; only
   the export has to say it out loud, and it was saying the opposite.

   So: one value where the direction genuinely cannot change with the
   breakpoint — the composites this file builds itself, which are a row or a
   column at every size — and one value PER breakpoint for anything read off a
   node's own css, which `styleAt` may answer differently at each.
   ========================================================================== */
type ParentDir = Dir | Record<Device, Dir>;

function dirAt(parent: ParentDir | null, device: Device): Dir | null {
  if (parent === null) return null;
  return typeof parent === "string" ? parent : parent[device];
}

/** What this container's children should be told, at each breakpoint. */
function dirsOf(node: DesignNode | DesignSection): Record<Device, Dir> {
  return {
    all: directionOf(node, styleAt(node, "all")),
    laptop: directionOf(node, styleAt(node, "laptop")),
    tablet: directionOf(node, styleAt(node, "tablet")),
    mobile: directionOf(node, styleAt(node, "mobile")),
  };
}

const HAS_KIDS = new Set(["section", "row", "col"]);

/* ==========================================================================
   WHAT MAY SHRINK PAST ITS CONTENT, and it is everything that is not words.

   The floor in `cssAt` defaults to `min-content` because the failure this
   project keeps shipping is text coming apart one character per line, and a
   default of `0` is what removes the only thing keeping a word whole. So the
   default is the safe one and these are the exceptions — read against the node
   vocabulary in `schema.ts`, which is where a new type gets added.

   Three reasons a node belongs here:

     HAS_KIDS      a box. It has no words of its own, and shrinking is how a
                   two-column row narrows on a phone.
     WORDLESS      a leaf with no text. On a picture `min-content` is not a
                   sensible minimum at all — it is the source file's intrinsic
                   width, so a 2000px photograph would refuse to shrink below
                   2000px and take the row open with it.
     LAYS_OUT_A_ROW  a composite that arranges its OWN children horizontally. A
                   column's min-content is its widest word; a row's is the SUM
                   of its children's, which on a narrow rail is wider than the
                   rail — so these overflow instead of reflowing without it.

   Everything else carries words and keeps the floor without being named, which
   is the half of this that must not become a list: `Button2` and
   `Form2.Button2` were once forgotten and a filter rail came back with CLEAR
   ALL set one letter per line.
   ========================================================================== */
const WORDLESS = new Set(["image", "divider", "icon", "custom"]);

const LAYS_OUT_A_ROW = new Set([
  "product",
  "productList",
  "slideshow",
  "tabs",
  "marquee",
  "beforeAfter",
  "table",
  "accordion",
  "form",
  "overlay",
  "sticky",
]);

/** True when this node may shrink past its own content. See the block above. */
const mayShrink = (type: string): boolean =>
  HAS_KIDS.has(type) || WORDLESS.has(type) || LAYS_OUT_A_ROW.has(type);

/** The full CSS for one node at one breakpoint, engine properties included. */
function cssAt(
  node: DesignNode | DesignSection,
  device: Device,
  parent: ParentDir | null,
): string {
  /* Asked per breakpoint, not once — see `ParentDir` above. */
  const parentDir = dirAt(parent, device);
  const css = styleAt(node, device);
  const own: string[] = [declarations(css)];

  /* Containers state their flex intent outright. The tree already said row or
     col; leaving the engine to work it out from `display` is what produced
     grids that arrived as a single stacked column. */
  if (HAS_KIDS.has(node.type)) {
    if (css.display === undefined) own.push("display: flex !important;");
    if (css.flexDirection === undefined)
      own.push(
        `flex-direction: ${node.type === "row" ? "row" : "column"} !important;`,
      );
  }

  /* ==========================================================================
     `max-width` WITHOUT `width` MEANS SOMETHING DIFFERENT IN THE TWO READERS.

     This is the widest-reaching difference between the mockup and the import,
     and it is not a bug in either of them.

     In the mockup a `col` with `maxWidth: 1180px` sits inside a section that is
     `display: flex; flex-direction: column`, so it inherits `align-items:
     stretch` — the CSS default — and fills the section's width up to its
     maximum. That is the ordinary centred-container idiom and it reads exactly
     as intended.

     In PageFly the same node is a flex child of a FlexSection whose base rules
     do not stretch it, so `max-width` is a ceiling on a box that is already
     hugging its content. The imported page showed a 1180px container collapsed
     to the width of its longest line — a two-column split squeezed into 400px
     with `Two years of development with a` wrapping every three words.

     `width: 100%` reconciles them. It changes nothing in the mockup, where the
     box already filled, and it is what the merchant would otherwise have to
     type by hand into every container on the page.

     ONLY WHEN THE PARENT STACKS. In a row, `width: 100%` on a child with a
     `maxWidth` is wrong — that child is one side of a measured composition, and
     making it ask for the whole row turns a 42/58 split into something the flex
     shrink factor decides. A `maxWidth` there is a reading-width cap on a
     column that is meant to hug.
     ========================================================================== */
  if (
    css.maxWidth !== undefined &&
    css.width === undefined &&
    parentDir !== "horizontal"
  ) {
    own.push("width: 100% !important;");
  }

  /* ==========================================================================
     CONTAINERS MAY SHRINK; WORDS MAY NOT — AND THE ELEMENT HAS TO SAY SO.

     This floor spent three commits in `pageCss()`, as a blanket `min-width: 0`,
     then as a `min-content` exception naming Paragraph4 and Heading2, then as a
     list of boxes. Every version was correct CSS and none of them reached the
     editor, because `customCSS` runs on preview and live and not in the editor
     canvas. Written here it is in the element's own styleData, which the editor
     reads, so the merchant meets the same page the mockup drew.

     The default is the safe one and the list is of BOXES — that much the third
     version got right. A flex container genuinely needs to shrink, which is how
     a two-column row narrows, and a box has no words of its own to break.
     Anything carrying words keeps the `min-content` a browser would have given
     it, without having to be remembered by name.

     Which nodes are the exceptions, and why each one is, is `mayShrink` above.
     A design that states its own `minWidth` is left alone. */
  if (css.minWidth === undefined)
    own.push(`min-width: ${mayShrink(node.type) ? "0" : "min-content"};`);

  const tail = [
    `--pf-flex-layout-width: ${widthMode(node, css, parentDir)};`,
    `--pf-flex-layout-height: ${heightMode(css)};`,
    HAS_KIDS.has(node.type)
      ? `--pf-flex-layout-direction: ${directionOf(node, css)};`
      : "",
    /* Denormalised on purpose — schema.md requires each node to mirror its
       parent's direction at every breakpoint. */
    parentDir ? `--pf-flex-layout-parent-direction: ${parentDir};` : "",
  ].filter(Boolean);

  return [...own, ...tail].filter(Boolean).join(" ").trim();
}

/**
 * A node's style at all four breakpoints.
 *
 * `all` is always written; the rest only when they say something different.
 * PageFly cascades the narrower keys over `all`, so an identical repeat is
 * bytes that change nothing — and on a 300-node page that is most of the file.
 */
function styleDataFor(
  node: DesignNode | DesignSection,
  parent: ParentDir | null,
): StyleData {
  const base = cssAt(node, "all", parent);
  const out: Record<string, Record<string, string>> = { all: { "&": base } };

  for (const device of DEVICES) {
    if (device === "all") continue;
    const here = cssAt(node, device, parent);
    if (here !== base) out[device] = { "&": here };
  }

  return out;
}

/**
 * Force a block-level composite to fill its parent.
 *
 * A flex parent with `align-items: center` sizes its children by their content
 * — so an accordion or a product grid inside a centred column arrived at a
 * fraction of the width the mockup drew, floating in the middle of the band.
 * `--pf-flex-layout-width: fill` does not save it, because the CSS rule wins.
 * An explicit 100% does.
 */
/** `color: <ink>;` or nothing, so the caller can interpolate it unconditionally.
 *
 * `sd` is the composite's OWN style, and it wins when it carries a colour. The
 * design writes one on a node it wants a particular shade of — a muted spec
 * table, a quieter FAQ — and the mockup honours it because the cells inherit.
 * Restating the band's ink over the top would quietly flatten every one of
 * those back to the default. */
function inkRule(opts: EmitOptions, sd?: StyleData): string {
  const own = /(?:^|[;\s])color\s*:\s*([^;]+)/.exec(sd?.all?.["&"] ?? "")?.[1]?.trim();
  if (own) return `color: ${own};`;
  return opts.ink ? `color: ${opts.ink};` : "";
}

/**
 * The ink for one band, which is not always the page's.
 *
 * WHY THIS EXISTS. `opts.ink` is set once, from the page, and travels to every
 * composite — the table's cells, the accordion's rows, the buy box's labels.
 * That was added because PageFly makes a composite inherit from the MERCHANT'S
 * THEME rather than from the surface it sits on, so a page with no colour
 * stated came back dark-on-dark and invisible.
 *
 * One colour for a whole page is right until a band inverts. A dark band's text
 * is the page's background, not its ink, and the export was writing the page's
 * ink into every cell of a table sitting on near-black — present, correctly
 * positioned, and unreadable. The mockup never had it: there the cells state no
 * colour and inherit the one the design put on the band.
 *
 * CONTRAST, NOT A FLAG. `dark` is a hint the design may or may not set, and a
 * band painted with the accent — a green conversion strip — is neither dark nor
 * the page background. Asking which of the two candidates actually reads on
 * this paint answers all three cases with one rule.
 */
function bandInk(section: DesignSection, page: { bg: string; ink: string }): string {
  /* A photograph under a scrim is dark whatever the CSS says, and the scrim is
     the thing that makes the heading readable — so the text goes light. */
  if (section.bg?.query && section.bg.scrim !== "none") return page.bg;

  const paint = String(
    (section.css as Record<string, unknown> | undefined)?.background ??
      (section.css as Record<string, unknown> | undefined)?.backgroundImage ??
      "",
  );

  /* The first colour in the value: a gradient's first stop is the one the top
     of the band is painted in, and a band is read from the top. */
  const hex = /#[0-9a-f]{3,8}\b/i.exec(paint)?.[0];
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(paint);
  const colour = hex
    ? hex.slice(0, 7)
    : rgb
      ? `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`
      : null;

  if (!colour) return page.ink;
  return readableInk(colour, page.bg, page.ink);
}

/**
 * The first length in a CSS value, as a number of pixels.
 *
 * WRITTEN AFTER A PAGE SHIPPED WITH A 4,432-PIXEL GAP. `gap` takes a shorthand
 * — `44px 32px` is a row gap and a column gap — and the code here read it by
 * stripping every character that was not a digit, which turned two numbers into
 * one enormous one. The export set that as a slider's spacing, every card
 * collapsed to nothing, and the words came out one letter per line down a
 * section thousands of pixels tall. The mockup was correct throughout, because
 * a browser understands the shorthand.
 *
 * The row gap is taken because that is what `gap: X` means when a design writes
 * one value, and a design writing two is describing a grid whose rows are the
 * looser axis more often than not.
 *
 * `0` is a length. Returning the fallback for it — which `|| fallback` does —
 * is how a deliberate flush-together grid becomes a 24px one.
 */
function firstLength(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;

  const m = /(-?\d*\.?\d+)\s*(px|rem|em|%)?/.exec(String(value).trim());
  if (!m) return fallback;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return fallback;

  /* A percentage gap has no pixel meaning without the container's width, which
     is not knowable here. The fallback is the honest answer. */
  if (m[2] === "%") return fallback;

  const px = m[2] === "rem" || m[2] === "em" ? n * 16 : n;
  return Math.max(0, Math.round(px));
}

/**
 * No photograph taller than the screen it is shown on.
 *
 * A ratio the model picks is a shape, not a size, and the two stop agreeing at
 * full width: `ratio: 2` inside a three-column grid is a 400x800 portrait,
 * while the same 2 on a full-bleed band is 1440x2880 — nearly three screens of
 * one picture, which is what a merchant scrolls past wondering whether the page
 * has broken. Capping the ratio instead would fix the band and ruin the grid,
 * because the cap that is right depends on a width the tree never states.
 *
 * `100vh` is the honest bound: whatever the element's width turns out to be,
 * the picture stops at one screen. `object-fit: cover` on the `<img>` is what
 * makes the cap a crop rather than a squash — without it the image keeps its
 * declared width against a clamped height and distorts. Anything already
 * shorter than a screen is untouched.
 */
function capHeight(sd: StyleData): StyleData {
  if (!sd) return sd;
  const out: Record<string, Record<string, string>> = {};
  for (const [device, rules] of Object.entries(sd)) {
    const css = rules["&"] ?? "";
    out[device] = {
      ...rules,
      /* Only when the tree did not state one itself — an explicit max-height is
         a decision, and this is a backstop. */
      "&": /(^|[;\s])max-height\s*:/.test(css) ? css : `${css} max-height: 100vh;`.trim(),
      /* The documented sub-selector for Image5's own <img>; see fields.md. */
      "& img": [rules["& img"], "object-fit: cover;"].filter(Boolean).join(" "),
    };
  }
  return out;
}

/** Where the text sits inside an overlay, as flex alignment. */
const OVERLAY_ALIGN: Record<string, string> = {
  "bottom-left": "align-items: flex-end !important; justify-content: flex-start !important;",
  center: "align-items: center !important; justify-content: center !important;",
  "top-left": "align-items: flex-start !important; justify-content: flex-start !important;",
};

/* One class for every sticky bar on a page. Two sticky bars would overlap
   whatever the class, so there is nothing to gain from numbering them. */
const STICKY_CLASS = "pfd-sticky";

/* ==========================================================================
   `sticky`, NOT `fixed`, and the difference is the whole bug.

   This shipped as `position: fixed; left: 0; right: 0; top: 0`, and the mockup
   has always rendered the same node as `position: sticky`. Two readers, two
   answers, which is the failure the one-tree design exists to prevent.

   `fixed` takes the block out of the document entirely and pins it to the
   VIEWPORT. So a spec rail inside a product page — a column meant to stay
   beside the specs while they scroll — left its column, went to the top-left of
   the screen, and sat on top of the store's own header: the heading, the price
   and the Add to bag button overlapping the theme's navigation, at 489px wide
   because it no longer had a parent to be a fraction of.

   `sticky` stays in the flow. It occupies its space, scrolls with the page, and
   holds at its edge within its own container — which is what every use of this
   node has actually wanted.

   THE RULE, and it generalises past this node: reach for `sticky` first. It
   cannot escape its parent, so the worst it can do is not stick. `fixed` can
   only be right for something that genuinely belongs to the viewport rather
   than to the page — a buy bar pinned across the bottom of a phone — and even
   then it needs checking afterwards, because "out of the flow" means every
   guarantee the layout gave you is gone.

   The buy bar is the one case, and it is narrow enough to name: a `sticky` node
   with `mobileOnly` and `edge: "bottom"`. There, `fixed` is the point — the bar
   is meant to leave the flow and float over the page on a phone. Anything else
   gets `sticky`.
   ========================================================================== */
function stickyCss(edge: "bottom" | "top", mobileOnly: boolean): string {
  /* A phone buy bar belongs to the viewport. Everything else belongs to its
     container, and taking it out of the flow is how it ends up on the header. */
  const pinned = mobileOnly && edge === "bottom";

  if (pinned)
    return [
      `.${STICKY_CLASS}{position:fixed;left:0;right:0;bottom:0;z-index:60;}`,
      /* The page needs room for it or the bar covers the last section's content
         for ever, which is the failure everyone ships once. */
      `.${STICKY_CLASS}::after{content:"";display:block;}`,
      /* Above the phone it goes back into the flow entirely — not `static` on a
         `fixed` element, which leaves the offsets behind. */
      `@media (min-width: 768px){.${STICKY_CLASS}{position:static;left:auto;right:auto;bottom:auto;z-index:auto;}}`,
    ].join("\n");

  return [
    /* No `left`/`right`: a sticky element keeps its own width from its parent,
     and pinning both edges of one is how a column becomes a full-width band. */
    `.${STICKY_CLASS}{position:sticky;${edge}:0;z-index:20;align-self:flex-start;}`,
  ].join("\n");
}

function marqueeCss(cls: string, speed: number): string {
  return [
    `.${cls}{overflow:hidden;display:flex !important;flex-wrap:nowrap !important;}`,
    `.${cls} > *{flex:0 0 auto;display:flex;animation:${cls}-run ${speed}s linear infinite;}`,
    `@keyframes ${cls}-run{from{transform:translateX(0)}to{transform:translateX(-100%)}}`,
    /* A visitor who asked for less motion gets a static row rather than a row
       that never stops. */
    `@media (prefers-reduced-motion: reduce){.${cls} > *{animation:none;}}`,
  ].join("\n");
}

/* ==========================================================================
   THE GALLERY'S PAGE NUMBER, WHICH PAGEFLY DOES NOT HAVE.

   `paginationStyle` has four settings and all four are dots or dashes. A
   gallery that pages with `01 / 06` in the corner of the photograph is asking
   for an element that does not exist, so it is written: the dashes go off and
   this pair of blocks puts a badge over the slider and keeps it in step.

   The badge is appended to the slider's PARENT, not the slider: PageFly
   rewrites the slides as the gallery moves, and a node inside that subtree is
   a node that disappears on the second click.

   Runs on preview and live, NOT in the editor canvas — PageFly runs no custom
   JS there, so in the editor the corner is simply empty.
   ========================================================================== */
function galleryBadgeCss(cls: string, style: Css | undefined): string {
  /* THE PLATE IS A FALLBACK, NOT A HOUSE STYLE.

     White words over a photograph need something to stay legible against, and
     absent any instruction a dark plate is the safe answer. But it is an
     ANSWER, and a design that already gave one — a `text-shadow`, or a
     background of its own — does not want a second. The mockup this was built
     from captions its slides in white uppercase with a soft shadow and no
     plate at all; imported, the caption gained a dark chip the mockup never
     draws, and the plate was the reason. */
  const own = style ? declarations(style) : "";
  const solved = /(^|[;\s])(background|text-shadow)\s*:/.test(own);
  return [
    "#__pf [data-pf-type=MediaMain3]{position:relative;}",
    `.${cls}{position:absolute;left:14px;bottom:14px;z-index:4;` +
      "pointer-events:none;font-size:11px;font-weight:600;letter-spacing:.2em;" +
      "line-height:1;padding:7px 12px;color:#fff;" +
      (solved ? "" : "background:rgba(18,16,12,.55);") +
      own +
      "}",
  ].join("\n");
}

/**
 * The badge, and the one line that decides which badge it is.
 *
 * TWO THINGS GALLERIES WRITE OVER THE PHOTOGRAPH, one machine. A page number
 * (`04 / 06`) and a caption (`04 — Strap and hem detail`) are the same object
 * by every mechanical measure — a span appended beside the slider, kept in step
 * with the active slide — and differ only in what they say. Written twice they
 * would drift twice.
 *
 * The caption's WORDS are the merchant's, not ours to invent: Shopify's media
 * alt text is the field a shop fills in to describe a photograph, and it is
 * what the slide carries. A photo with none gets the number alone rather than
 * a dangling dash.
 *
 * NO `<` ANYWHERE — see `counterJs` for why one character refuses the whole
 * file. Hence `("0"+n).slice(-2)` for the pad and an unquoted attribute
 * selector, neither of which needs one.
 */
function galleryBadgeJs(cls: string, kind: "count" | "caption"): string {
  const say =
    kind === "count"
      ? 'badge.textContent=pad(at+1)+" / "+pad(slides.length);'
      : [
          'var img=slides[at].querySelector("img");',
          'var alt=img?(img.getAttribute("alt")||""):"";',
          'badge.textContent=alt?pad(at+1)+" \u2014 "+alt:pad(at+1);',
        ].join("\n      ");
  return `
var host=document.querySelector("#__pf [data-pf-type=MediaMain3]");
if(host){
  var slider=host.querySelector(".pf-media-slider");
  if(slider){
    var box=slider.parentElement||host;
    var badge=document.createElement("span");
    badge.className="${cls}";
    box.appendChild(badge);
    var pad=function(n){return ("0"+n).slice(-2);};
    var sync=function(){
      var slides=slider.querySelectorAll(".pf-slide-main-media");
      if(!slides.length){badge.textContent="";return;}
      var at=0;
      slides.forEach(function(s,n){
        if(s.getAttribute("data-active")==="true"||s.classList.contains("is-current"))at=n;
      });
      ${say}
    };
    sync();
    var tick=0;
    slider.addEventListener("scroll",function(){clearTimeout(tick);tick=setTimeout(sync,90);});
    new MutationObserver(sync).observe(slider,{subtree:true,attributes:true,attributeFilter:["data-active","class"]});
  }
}`.trim();
}

function counterJs(cls: string, value: string): string {
  /* The digits only. A value of "1,240" animates to 1240 and is written back
     with its separators intact by the format below. */
  const target = Number(String(value).replace(/[^\d.]/g, "")) || 0;
  /* NO `<` ANYWHERE IN THIS STRING. PageFly's custom-code validator rejects any
     `<` in customJS and decodes percent-encoding before it looks, so there is no
     way to smuggle one past it — and one character refuses the whole stylesheet
     or script, not the line it is on. The loop below reads `p!==1` for that
     reason alone; `p` is clamped to 1 the line above, so it is the same test. */
  return `
var el=document.querySelector(".${cls}");
if(el&&"IntersectionObserver" in window){
  var done=false;
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    if(!e.isIntersecting||done)return; done=true; io.disconnect();
    var t=${target},s=null,txt=el.textContent||"",pre=txt.split(/[0-9]/)[0],suf=txt.slice(txt.search(/[0-9][^0-9]*$/)+1);
    function step(now){ if(!s)s=now; var p=Math.min(1,(now-s)/900);
      el.textContent=pre+Math.round(t*(1-Math.pow(1-p,3))).toLocaleString()+suf;
      if(p!==1)requestAnimationFrame(step); }
    requestAnimationFrame(step);
  });},{threshold:.4});
  io.observe(el);
}`.trim();
}

/** A fresh id for every node in a duplicated subtree. */
function cloneNode(n: PFNode): PFNode {
  return { ...n, _kids: n._kids.map(cloneNode) };
}

/**
 * Attach documented sub-selectors to a node's `all` breakpoint.
 *
 * PageFly composites are styled through named parts — `& input`, `& button`,
 * `& .pf-r-dg` — and a declaration meant for one of those is silently inert on
 * `&`. This is the same shape the product grid and the accordion already build
 * by hand, named once so the next one does not have to.
 */
function withParts(sd: StyleData, parts: Record<string, string>): StyleData {
  if (!sd) return { all: { "&": "", ...parts } };
  return { ...sd, all: { ...sd.all, ...parts } };
}

function filling(sd: StyleData, extra = ""): StyleData {
  if (!sd) return sd;
  const out: Record<string, Record<string, string>> = {};
  for (const [device, rules] of Object.entries(sd)) {
    const css = rules["&"] ?? "";
    out[device] = {
      ...rules,
      "&": /(^|[;\s])width\s*:/.test(css)
        ? `${css} ${extra}`.trim()
        : `${css} width: 100% !important; ${extra}`.trim(),
    };
  }
  return out;
}

/* ---- emit --------------------------------------------------------------- */

export type EmitOptions = {
  /** query → resolved photo URL */
  images?: Record<string, string>;
  /** query → resolved background-video URL. At most one per page — see
      `designServer`, where the cap lives so that two autoplaying videos cannot
      reach a merchant's storefront whatever the prompt said. */
  videos?: Record<string, string>;
  /**
   * Does this page have product context — a `product` node anywhere in it?
   *
   * A standalone add-to-cart button uses `source:"auto"` when the page is bound
   * to a product and `source:"custom"` when it is not, and getting that backwards
   * ships a button that renders "Please select a product" on a live storefront.
   * Computed once in `pageflyFromTree` rather than asked per node.
   */
  hasProduct?: boolean;
  /**
   * The page's text colour.
   *
   * Composites need it stated. In the mockup a product title or an accordion
   * row inherits `color` from the page surface React renders it on; in PageFly
   * it inherits from the merchant's theme instead, which on a dark page meant
   * dark text on a dark background — present, correct, and invisible.
   */
  ink?: string;
  /**
   * The page's accent.
   *
   * Two composites need it, both for the same reason: the platform ships them
   * unstyled and this file is the only place that knows the palette. Form2's
   * submit button renders as a bare native control without it, and the buy
   * button was emitted as a hard-coded near-black — which is the strongest
   * thing on a white page and nearly invisible on a dark one.
   */
  accent?: string;
  /**
   * The page's border colour.
   *
   * The quantity stepper and the express checkout button are outlined controls,
   * and the platform leaves both unstyled — a native input and a native button.
   * Given no colour they arrive in the browser's own grey, which on a designed
   * page is the one detail that says the section came from somewhere else.
   */
  border?: string;
  /**
   * The style's corner radius, in pixels.
   *
   * Only the composites need it. Everything the design builds by hand carries
   * its own `border-radius` in `css`, but a buy button is emitted by this file
   * — so a store whose whole visual identity is soft corners was shipping the
   * one square control on the page.
   */
  radius?: number;
  /**
   * The page's band colour — the surface a section steps onto when it steps off
   * the page background.
   *
   * Only the gallery arrows need it. PageFly draws them as bare browser buttons
   * over a photograph, and the plate they sit on has to be a colour belonging to
   * this page rather than a white one guessed at.
   */
  band?: string;
  /**
   * Inside a buy box: the bound element for a named slot.
   *
   * Set only while `productBox` emits a product's own children, and the reason
   * it travels here rather than being handled at the top level is depth. A
   * design that puts the price inside a row beside the words "per bottle" has
   * placed a marker two levels down, and `emit` is the only thing that goes
   * there. Absent everywhere else, which is how a stray marker on a landing
   * page comes to nothing.
   */
  boundSlot?: (slot: string) => PFNode | null;
  /** icon name → raw <svg> markup; icons are dropped when this is absent */
  iconSvg?: (name: string) => string | null;
  /* Custom blocks write their own CSS and JS, and both belong on the PAGE
     rather than the element — PageFly has one stylesheet and one script per
     page. These collect what each block contributed on the way past. */
  customBlocks?: CleanBlock[];
  customCount?: { value: number };
  /**
   * True while emitting anything that will end up inside a ContentListItem.
   *
   * `nesting.md` lets a `ContentListItem` hold 140 of the 241 types and
   * `ContentList` / `ContentList2` are two of the exceptions — a card list
   * cannot contain a card list. It happened because the test for one is
   * "three or more children of the same shape", and a card is very often
   * exactly that: a photograph, a block of copy, a row of buttons. The outer
   * row of product cards qualified, and so did every card inside it.
   */
  inCard?: boolean;
};

function emit(node: DesignNode, parent: ParentDir, opts: EmitOptions): PFNode | null {
  const built = emitNode(node, parent, opts);
  return built && hasMotion(node.anim) ? withMotion(built, node.anim) : built;
}

/**
 * Attach the node's motion to the PageFly element it became.
 *
 * Hover takes whichever of two roads is open. On the four element types that
 * carry `animationHover` it is written as that field, so the merchant opens the
 * element in the editor and sees "Float" selected in a dropdown — a setting
 * they can change, not CSS they would have to hunt for. Everywhere else the
 * class carries it and the page stylesheet does the work, because the field
 * would simply be ignored.
 *
 * Reveal is always the class: PageFly has nothing that fires on scroll.
 */
function withMotion(n: PFNode, anim: Anim): PFNode {
  const classes = motionClasses(anim);

  if (anim?.hover && HOVER_NATIVE_TYPES.has(n.type)) {
    n.data.animationHover = anim.hover;
    /* Dropping our class here matters. Left on, the element would carry
       PageFly's transform and ours at once and travel twice as far. */
    const ours = hoverClass(anim);
    const i = classes.indexOf(ours!);
    if (i >= 0) classes.splice(i, 1);
  }

  if (classes.length) {
    /* `classGlobalStyling`, THE SAME KEY THE BUILDER USES. This was the second
       path writing `className` and the builder's own change did not reach it —
       so a heading with a reveal kept its animation classes on a key the editor
       does not read, while the block around it had them on the right one. Both
       are appended to whatever is already there, because a node can arrive here
       with the builder's class on it already. */
    const existing =
      typeof n.data.classGlobalStyling === "string" ? n.data.classGlobalStyling : "";
    n.data.classGlobalStyling = [existing, ...classes].filter(Boolean).join(" ");
  }
  return n;
}

function emitNode(
  node: DesignNode,
  parent: ParentDir,
  opts: EmitOptions,
): PFNode | null {
  const sd = styleDataFor(node, parent);

  switch (node.type) {
    case "heading":
      /* Heading2 carries the level in `data.tag`; the tree chose it, so the
         merchant's outline survives the round trip. */
      return withTag(H2(node.text, sd), `h${node.level}`);

    case "text":
      return P4(node.text, sd);

    /* A marker for a bound part of a buy box. Inside one, `boundSlot` returns
       the real element — the price, the cart button, whichever the design named
       — and the marker's own `css` rides on it. Outside one it names a place
       that does not exist, and comes to nothing. */
    case "bound":
      return opts.boundSlot?.(node.slot) ?? null;

    case "button":
      /* ==========================================================================
         AN ADD-TO-CART BUTTON IS NOT A BUTTON.

         `Button2` is a styled anchor. It cannot add anything to a cart, so a
         beautifully styled `Add to bag` was a dead link — and the merchant's only
         route to a working one was to delete it and rebuild the button they had
         just been given. `ProductATC2` adds the item, changes its own label while
         the request is in flight, says so when it lands, and disables itself when
         the variant is sold out. None of that can be bolted on afterwards.

         `source` decides whether it works. Inside a `product` node the buy box
         emits its own ATC with `auto`, which knows what it is adding. This is the
         standalone case — a hero on a single-product home page — where there is no
         product context, so it is `custom` and the merchant selects the product
         once. That is the honest cost, and it is one setting rather than a rebuild.
         ========================================================================== */
      if (node.action === "atc")
        return PRODUCT_ATC(sd, node.text, {
          source: opts.hasProduct ? "auto" : "custom",
          adding: node.atc?.adding,
          added: node.atc?.added,
          soldout: node.atc?.soldout,
        });

      /* No href: the enum has no "none" member and a mockup button has no real
         destination. The merchant sets it in the editor. */
      return BTN(node.text, "", sd);

    case "image": {
      const src = opts.images?.[node.query];
      return IMG(src ?? "", capHeight(sd));
    }

    case "divider":
      /* PageFly's own, not `<div></div>` in a code box. `DIVIDER` converts the
         design's `height` + `background` into the border Divider2 draws with —
         passing both through would leave two lines half a pixel apart. */
      return DIVIDER(sd);

    case "icon": {
      const svg = opts.iconSvg?.(node.name);
      return svg ? CUSTOM_HTML(svg, sd) : null;
    }

    case "product":
      return productBox(node, sd, opts);

    case "productList":
      return productGrid(node, sd, opts);

    /* Cells are data. A hand-built grid of rows is what this replaces: its
       columns stop aligning the moment two cells hold different lengths, it
       carries no header semantics, and on a phone it either overflows the page
       or collapses into nonsense. */
    case "table":
      return tableAsFlex(node.rows, node.headerColumn, sd, opts);

    case "tabs":
      return tabsOf(node, sd, opts);

    case "accordion":
      return accordionOf(node, sd, opts);

    case "custom": {
      /* Numbered per page so two blocks cannot collide, and stable within a
         page so the CSS and the JS agree on which element they mean. */
      const n = (opts.customCount!.value += 1);
      const clean = cleanBlock(node, n);
      opts.customBlocks!.push(clean);
      return CUSTOM_HTML(clean.html, filling(sd), clean.className);
    }

    case "form": {
      /* Form2 styles its inputs and its button through documented
         sub-selectors, not on itself: `& input`, `& button`. Left off, the
         merchant gets PageFly's unstyled defaults — a native grey button in the
         system font sitting inside a page that looks nothing like it. */
      /* The button already took the accent. The INPUT did not take anything —
         it carried `rgba(0,0,0,.16)` and a 6px corner written here, so a
         newsletter band on an inverted section exported a field outlined in a
         colour that is not there, and a store built on square corners got its
         one rounded control on the page it asks for an email. Same three
         values every other composite in this file reads. */
      const inputRule = opts.border ?? "rgba(0,0,0,.16)";
      const inputRadius = opts.radius ?? 6;
      const styled = withParts(sd, {
        "& > form": "display: flex; flex-direction: column; gap: 12px;",
        /* Transparent, not the browser's white: an input painted white on a
           dark band is the brightest thing in the section. */
        "& input":
          `border: 1px solid ${inputRule}; border-radius: ${inputRadius}px; padding: 12px 14px;` +
          ` width: 100%; background: transparent;${inkRule(opts)}`,
        /* THE BOX THE INPUT IS A HUNDRED PERCENT OF.

           `& input` reaches the rendered `<input>`; the FormInput wrapper around
           it is a node of its own, and a node with no width opinion is hugged by
           the layout engine. So the rule above was a hundred percent of a box
           that had already shrunk to the width of nothing — a forty-pixel email
           field beside a full-width button.

           Written HERE rather than on the FormInput, because `fields.md` marks
           that element "cannot be styled on its own" and a style entry on it
           makes the editor answer "Something went wrong" over the whole page.
           Its look is set on this parent; so is its width. */
        '& [data-pf-type="FormInput"]': "width: 100%;",
        '& [data-pf-type="Form2.Field"]': "width: 100%;",
        "& button": `background-color: ${opts.accent ?? "#111111"}; color: #FFFFFF; border: 0; border-radius: ${inputRadius}px; padding: 13px 26px; cursor: pointer;`,
      });
      /* The label carries the field's name, so it is type the merchant reads —
         and giving it a style is also what guarantees it a style entry at all.
         See FORM_FIELD. */
      const labelStyle: StyleData = {
        all: {
          "&": `font-size: 13px; letter-spacing: .02em; margin-bottom: 6px;${inkRule(opts)}`,
        },
      };

      /* ==================================================================
         THE FIELD HAS TO BE TOLD TO FILL, AND IT WAS TOLD NOTHING.

         `& input { width: 100% }` was already here and it is 100% of whatever
         box the input sits in — which is `Form2.Field`, which was built with a
         null styleData. Every other node in this file goes through `filling`
         and comes out carrying `width: 100%` and `--pf-flex-layout-width:
         fill`; a null one goes through it untouched, so the field arrived with
         neither and PageFly's layout engine did what it does with a node that
         has no width opinion: hugged the content.

         What that shipped is a newsletter block with a label, a forty-pixel
         input beside it, and a full-width button underneath — the button being
         the one control that had a width of its own.
         ================================================================== */
      const fieldStyle: StyleData = {
        all: {
          "&": "width: 100% !important; --pf-flex-layout-width: fill;",
        },
      };

      return FORM(
        node.fields.map((f) =>
          FORM_FIELD(f.label, f.kind, f.required, fieldStyle, labelStyle),
        ),
        node.submitText,
        node.intent,
        styled,
      );
    }

    case "overlay": {
      const src = opts.images?.[node.query] ?? "";
      const scrim = SCRIM_CSS[node.scrim] ?? "";
      /* The gradient first, then the photograph: CSS paints the first layer on
         top, and a scrim under the image is a scrim doing nothing. */
      const layers = [scrim, src ? `url("${src}")` : ""].filter(Boolean).join(", ");
      const align = OVERLAY_ALIGN[node.align] ?? OVERLAY_ALIGN["bottom-left"];

      return OVERLAY(
        src,
        node.scrim,
        withParts(
          filling(sd, [
            layers && `background-image: ${layers};`,
            "background-size: cover;",
            "background-position: center;",
            /* THE SHAPE, AGAINST THIS BOX'S OWN WIDTH.

               `ratio` is height ÷ width — `stock.ts` reads the same number as
               orientation, `<= 1.05` being landscape. Written as `min-height:
               <ratio*100>vw` it was a fraction of the VIEWPORT instead, which is
               only the same thing when the overlay is full-bleed. In a
               three-across grid it is not: `usecase-tiles-overlay` asks for 1.15
               on a tile one third of the row wide, so a tile that should be
               ~400px tall asked for 115vw and hit the `100vh` bound below —
               three empty full-screen boxes with the words at the bottom, which
               is exactly what shipped.

               `min-height: min-content` is what the old comment was protecting:
               an aspect-ratio box does clip text taller than its shape, and this
               is the floor that lets the text win instead. It also means that if
               the Flex engine ever declines the aspect-ratio, the tile falls
               back to hugging its words — short, not a screen tall. */
            `aspect-ratio: 1 / ${node.ratio};`,
            "min-height: min-content;",
            "max-height: 100vh;",
            `display: flex !important; ${align}`,
          ]
            .filter(Boolean)
            .join(" ")),
          {},
        ),
        node.children
          .map((c) => emit(c, "vertical", opts))
          .filter((n): n is PFNode => n !== null),
      );
    }

    case "sticky": {
      /* Custom.HTML with a fixed bar, NOT FlexSection's isStickyBar.
         `isStickyBar` is a property of a SECTION, and this is a node inside
         one — promoting it would mean restructuring the tree around a child,
         which is the kind of rewrite that breaks the section it was inside.

         SWITCH TO NATIVE when the probe import confirms a nested sticky section
         survives: then emit the parent section with isStickyBar/stickyPosition
         instead and delete this branch. */
      const kids = node.children
        .map((c) => emit(c, "horizontal", opts))
        .filter((n): n is PFNode => n !== null);
      if (kids.length === 0) return null;

      opts.customBlocks?.push({
        className: STICKY_CLASS,
        html: "",
        css: stickyCss(node.edge, node.mobileOnly),
        js: "",
      });
      return FB(filling(sd, "display: flex !important; flex-direction: row !important;"), kids, STICKY_CLASS);
    }

    case "beforeAfter":
      return BEFORE_AFTER(
        opts.images?.[node.beforeQuery] ?? "",
        opts.images?.[node.afterQuery] ?? "",
        node.beforeLabel,
        node.afterLabel,
        filling(sd),
      );

    case "marquee": {
      /* The track is duplicated AT BUILD TIME rather than by script: a marquee
         that needs JavaScript to look right is a marquee that shows one static
         row in the PageFly editor, which does not run custom JS. */
      const kids = node.children
        .map((c) => emit(c, "horizontal", opts))
        .filter((n): n is PFNode => n !== null);
      if (kids.length === 0) return null;

      const n = (opts.customCount!.value += 1);
      const cls = `pfd-mq-${n}`;
      opts.customBlocks?.push({
        className: cls,
        html: "",
        css: marqueeCss(cls, node.speed),
        js: "",
      });
      /* Two copies of the row, so the second arrives as the first leaves. */
      return FB(filling(sd, "display: flex !important; flex-direction: row !important;"), [FB(null, kids), FB(null, kids.map(cloneNode))], cls);
    }

    case "countdown": {
      /* PageFly's own element, not markup pretending to be one — see
         `COUNTDOWN` in the builder for the two fields that are objects wearing
         a string's type in the field table.

         The caption is a sibling rather than a child: `CountDown` contains only
         its number and label slots, and a paragraph pushed inside them is a
         paragraph the element does not know it has. */
      /* THE TYPE GOES ON THE SLOTS, for the reason `counter` below spells out
         at length: a figure and its unit name are two elements, and if only the
         wrapper is styled the unstyled one inherits. PageFly's own defaults for
         an untouched CountDown are a small figure with a small name beside it —
         which is what the element looks like the moment you drag it in, and
         nothing like the mockup's 44px column of digits.

         The numbers are the mockup's: 44px/700, line-height 1, the same
         negative tracking, and tabular figures so the row holds still while the
         seconds run rather than shuffling sideways on every 1. The label takes
         12px at .7 — a size of its own, never left to chance. Colour is the one
         thing not written here: it inherits from the timer's own style, which
         already carries the page's ink.

         AND THE SPACING, which type alone does not buy. Written with only the
         fonts, the imported timer read `77154920` — four 44px numbers touching,
         a part code where the mockup has `77 15 48 50`. PageFly sizes each unit
         column by its content and leaves no gap between them.

         The gap is put on the SLOTS rather than on the timer's root, as half of
         it each. The root would be the obvious place and cannot be relied on:
         it carries no gap of PageFly's own, and whether the element's internal
         wrapper is a flex container — the one thing that would make `gap` mean
         anything there — is not written down in `MD Json PageFly/`, so setting
         it is a guess that fails silently. A margin on a child is not a guess.
         Both slots carry the same 9px because the column is sized by whichever
         of the two is wider — `hours` under `15`, `5` under `secs` — so equal
         margins hold the units 18px apart whichever one wins, and the mockup's
         18px is what lands.

         `text-align: center` for the same reason the mockup centres its column:
         a one-digit figure under a five-letter name is otherwise left-aligned
         against it. */
      /* `!== false`, not the field itself: export runs over design trees that
         were stored before this field existed, and on those it is absent. The
         platform's own default for `showColon` is true, so absent must read as
         true — reading it raw shipped `showColon: undefined` and PageFly chose
         for itself. */
      const timer = COUNTDOWN(node.endsAt, node.units, node.labels, node.separator !== false, sd, {
        all: {
          "&":
            "font-size: 44px; font-weight: 700; line-height: 1;" +
            " letter-spacing: -0.02em; font-variant-numeric: tabular-nums;" +
            " margin: 0 9px; text-align: center;",
        },
      }, {
        all: {
          "&":
            "font-size: 12px; line-height: 1.35; opacity: .7;" +
            " margin: 8px 9px 0; text-align: center;",
        },
      });
      if (!node.caption) return timer;
      return FB(
        { ...sd, all: { ...(sd?.all ?? {}), "&": `${sd?.all?.["&"] ?? ""} display: flex; flex-direction: column; gap: 10px;` } },
        [P4(node.caption, null), timer],
      );
    }

    case "counter": {
      /* A text node plus one line of page JS, next to the reveal observer that
         is already there. The number is written into the markup so the page
         reads correctly with no JavaScript at all — the script only animates a
         value that is already correct. */
      const n = (opts.customCount!.value += 1);
      const cls = `pfd-count-${n}`;
      /* THE ELEMENT THE SCRIPT REWRITES CARRIES ITS OWN NAME.

         The script used to reach the number as `.pfd-count-N [data-pf-type]` —
         the first descendant of the wrapper that happens to be an element. It
         worked, and it left the one node on the page whose text is replaced on
         every load carrying no class at all: a merchant clicking it saw an
         ordinary heading, with nothing to say why editing the number changes
         nothing on the live page.

         Anything this export scripts or styles should be findable from the
         element, so the class goes on the number itself and the selector names
         it. */
      const valueCls = `${cls}-value`;
      opts.customBlocks?.push({
        className: cls,
        html: "",
        css: "",
        js: counterJs(valueCls, node.value),
      });

      const shown = `${node.prefix}${node.value}${node.suffix}`;
      /* THE DIRECTION IS STATED, and it has to be.

         `cssAt` only writes a flex-direction for the types in `HAS_KIDS` —
         section, row, col — because those are the types that have children in
         the schema. This one does not have children in the schema and grows two
         of them here, so it fell through to PageFly's own FlexBlock default,
         which is `row`. The mockup stacks the number over its label; the
         imported page put them side by side and they collided: "14oz" running
         into "denim weight" on a real storefront.

         That is precisely the failure the one-tree design exists to prevent, so
         it is fixed here rather than in the mockup — the mockup was right.

         `sticky`, `marquee` and `overlay` reach FlexBlock the same way and are
         all genuinely `row`, which is why the default has been getting away with
         it; each of them states it too, so the next person does not have to know
         that a leaf's direction comes from somewhere else. */
      /* AND THE TYPE STAYS ON THE NUMBER.

         The node's own `fontSize` is the size of the NUMBER — the mockup puts it
         on the number's element and gives the label a fixed 13px. Left on the
         wrapper here it was inherited by the label, which had no style of its
         own, so `Ideal brewing temperature` came in at 48px and wrapped across
         three lines under a 48px `94°C`. Two elements, one of them styled: the
         unstyled one inherits, and inheritance is the whole bug.

         So the wrapper keeps layout and spacing only, the number keeps the type,
         and the label is given its own size rather than left to chance. */
      return FB(
        without(
          filling(sd, "display: flex !important; flex-direction: column !important;"),
          TYPE_PROPS,
        ),
        [
          withTag(
            H2(shown, styleDataFor({ ...node, type: "heading" } as never, parent), valueCls),
            "div",
          ),
          ...(node.label
            ? [
                P4(node.label, {
                  all: {
                    "&": `font-size: 13px; line-height: 1.35; opacity: .7; margin-top: 8px; ${inkRule(opts)}`,
                  },
                }),
              ]
            : []),
        ],
        cls,
      );
    }

    case "slideshow": {
      const dir = dirsOf(node as never);
      const slides = node.slides
        .map((c) => emit(c, dir, opts))
        .filter((n): n is PFNode => n !== null);
      /* Every slide dropped means an empty carousel with working arrows, which
         is worse than the row it replaced. */
      if (slides.length === 0) return CUSTOM_HTML("<div></div>", sd);

      /* The gap between slides is a SETTING, so it is read off the node's own
         `gap` and handed over as data rather than written as CSS — a CSS gap on
         the root does not reach the slider track. The mockup's own 24 is the
         fallback, because that is the number it draws when the design says
         nothing. */
      const css = styleAt(node, "all");
      const gutter = firstLength(css.gap, 24);

      /* And the dots' LOOK, which no setting can express — see
         SLIDESHOW_PARTS. Setting for the shape, CSS for the rest. */
      return SLIDESHOW(
        slides,
        { perView: node.perView, autoplay: node.autoplay, gutter },
        withParts(without(sd, new Set(["gap"])), SLIDESHOW_PARTS),
      );
    }

    case "row":
    case "col": {
      const dir = dirsOf(node);
      /* DECIDED BEFORE THE CHILDREN ARE BUILT, because the answer changes how
         they must be built: everything inside a card list is inside a card,
         and a card may not hold another list. Every disqualifier reads the
         DESIGN node, so the question can be asked this early — which is the
         whole reason `becomesCardList` is separate from `cardList`. */
      const willList = !opts.inCard && becomesCardList(node);
      const inner = willList || opts.inCard ? { ...opts, inCard: true } : opts;
      const kids = node.children
        .map((c) => emit(c, dir, inner))
        .filter((n): n is PFNode => n !== null);

      /* A container that lost every child is decoration — a rail, a spacer, a
         coloured band. Same reasoning as `divider`. */
      if (kids.length === 0) return CUSTOM_HTML("<div></div>", sd);

      /* A row of cards is a card list, not a box holding boxes. See
         `asCardList` for what qualifies and why it matters on import. */
      const asList = willList ? cardList(node, kids, sd) : null;
      if (asList) return asList;

      return FB(sd, kids);
    }
  }
}

/** Heading2's tag lives in `data`, and the light form built by H2 has no slot
    for it, so it is set after construction rather than by widening H2. */
function withTag(n: PFNode, tag: string): PFNode {
  n.data.tag = tag;
  return n;
}

function productBox(
  node: Extract<DesignNode, { type: "product" }>,
  sd: StyleData,
  opts: EmitOptions,
): PFNode {
  const stacked = node.layout === "stacked";

  /* Falls back to the old near-black only where no palette reached this call —
     a page exported without tokens is the one case where guessing is all there
     is, and near-black on an unknown surface is the safer guess. */
  const atcBg = opts.accent ?? "#111114";

  /* The strip is turned on by the SETTING, not by CSS — see PRODUCT_MEDIA. The
     style below is spacing only; whether the list renders at all is data. */
  const EDGE = { bottom: "BOTTOM", left: "LEFT", right: "RIGHT", top: "TOP" } as const;
  /* ==========================================================================
     THE GALLERY, DESIGNED RATHER THAN DEFAULTED.

     `ProductMedia3` has nine styleable parts and this file was using two of
     them, which is how a product page's largest element came out as a square
     grey rectangle with a strip of squares under it. The rest are here now: the
     photograph's own corners, the thumbnails' corners and their selected state,
     the slider arrows, and the shape of the main image.

     Square was hardcoded and square is right for a bottle and wrong for a coat.
     The design says which. */
  const ratio = node.mediaRatio || 1;
  const mediaRule = opts.border ?? "rgba(0,0,0,.14)";
  const mediaAccent = opts.accent ?? "currentColor";
  const mediaRadius = opts.radius ? `border-radius: ${opts.radius}px;` : "";

  /* The gallery's own controls. PageFly ships two canned looks for each and
     neither is "round white arrows and thin dashes", so the page states it and
     these rules carry it — written on the MediaMain3, which is the element the
     slider markup lives inside. */
  const shot = (name: "nav" | "dot" | "dotActive" | "thumb" | "thumbSelected") => {
    const declared = node.mediaStyle?.[name];
    return declared ? ` ${declarations(declared)}` : "";
  };

  /* A counter is a thing to build, not a setting — see `galleryCountCss`. The
     dashes and the number are two answers to one question, so declaring the
     counter switches the dashes off rather than stacking one on the other. */
  const counter = node.mediaStyle?.counter;
  if (counter) {
    opts.customBlocks?.push({
      className: "pfd-slide-count",
      html: "",
      css: galleryBadgeCss("pfd-slide-count", counter),
      js: galleryBadgeJs("pfd-slide-count", "count"),
    });
  }

  /* The caption is the counter's sibling, not its rival: `04 — Strap and hem
     detail` low in the corner says what the frame is showing, and a gallery can
     want that AND the dots. So declaring it switches nothing off. */
  const slideCaption = node.mediaStyle?.caption;
  if (slideCaption) {
    opts.customBlocks?.push({
      className: "pfd-slide-caption",
      html: "",
      css: galleryBadgeCss("pfd-slide-caption", slideCaption),
      js: galleryBadgeJs("pfd-slide-caption", "caption"),
    });
  }

  /* ======================================================================
     WHERE THE CONTROLS SIT, which the element has no field for.

     PageFly pins both arrows halfway down the photograph and floats the dots
     over its lower edge. That is one of the two arrangements mockups use; the
     other puts them in a strip UNDER the frame — prev far left, dots centred,
     next far right — and every export got the first one whatever the mockup
     drew, because nothing in the tree could say otherwise.

     The band is reserved with `padding-bottom` on the frame itself rather than
     by wrapping the gallery in another block: PageFly's markup puts the arrows
     and the dots INSIDE the slider, so a sibling strip would be an empty one
     with the real controls still over the photograph. Every `.__pf` element is
     `border-box`, so the padding comes out of the aspect box and the frame
     keeps the proportion the design asked for.

     `transform` is the trap here. PageFly draws ONE chevron and turns the prev
     arrow round with `rotate(180deg)`, bundled into the same declaration as
     the vertical offset it also has to be rid of. Clearing the whole transform
     to move the arrow leaves two arrows pointing the same way — a worse bug
     than the placement, and one that looks deliberate. The rotation is kept
     and only the offset is replaced. */
  const below = node.mediaControls === "below";
  /* Declared here rather than beside the glyph rules below, because the arrow
     placement a few lines down has to know about it too: a text arrow carries
     its own direction and must not be stood on its head by the rotation
     PageFly uses to point the chevron. */
  const wantsArrow = node.mediaArrow === "arrow";
  const BAND = 58;
  /* The dots' own rule is `left: 50%; transform: translate(-50%, 50%)` — the
     vertical half-shift is what hangs them over the photograph's edge, so it
     goes and the horizontal centring stays. */
  const navPlace: Record<string, string> = below
    ? {
        "& .pf-slider-nav":
          "top: auto !important; bottom: 20px !important;" +
          " transform: translateX(-50%) !important;",
      }
    : {};
  /* `rotate(180deg)` is how PageFly points the prev chevron left, so it stays
     for a chevron and goes for an arrow — which carries its own direction and
     would be stood on its head by it. In the platform's own placement the
     offset is `translateY(-100%)`, and an arrow needs that offset WITHOUT the
     rotation bundled into it. */
  const prevTurn = wantsArrow ? "none" : "rotate(180deg)";
  const arrowPlace = (side: "prev" | "next"): string => {
    if (!below) {
      return wantsArrow && side === "prev"
        ? " transform: translateY(-100%) !important;"
        : "";
    }
    return (
      ` top: auto !important; bottom: 0 !important;` +
      (side === "prev"
        ? ` left: 0 !important; right: auto !important; transform: ${prevTurn} !important;`
        : " right: 0 !important; left: auto !important; transform: none !important;")
    );
  };
  /* The shared look, written once and given to each arrow by name. It used to
     be one comma key; PageFly keeps only what precedes the first comma, and
     the two arrows now need different `transform`s anyway. */
  /* ======================================================================
     THE GLYPH INSIDE THE BUTTON.

     PageFly draws one shape — two 1px bars meeting at a point — and paints it
     `#fff` on its own dark circle. Colouring it is all most galleries need.

     A mockup that draws a long arrow instead, shaft and all, needs the bars
     replaced. The rotation is the catch: PageFly points the prev chevron left
     by turning the whole BUTTON 180°, in the same declaration as the offset
     that holds it in place. A text arrow inside a button turned upside down
     points the wrong way, so the rotation has to go and the offset has to stay
     — and the offset differs between the two placements. */
  const GLYPH: Record<string, string> = { prev: "\\2190", next: "\\2192" };
  const glyphRules: Record<string, string> = {};
  for (const side of ["prev", "next"] as const) {
    if (wantsArrow) {
      glyphRules[`& .pf-slider-${side}::before`] =
        `content: "${GLYPH[side]}" !important; position: static !important;` +
        " background: none !important; width: auto !important; height: auto !important;" +
        " transform: none !important; font-size: 15px; line-height: 1;";
      /* The second bar is the other half of the chevron. Left in, it lies
         across the arrow as a stray tick. */
      glyphRules[`& .pf-slider-${side}::after`] = "display: none !important;";
    } else {
      for (const half of ["before", "after"]) {
        glyphRules[`& .pf-slider-${side}::${half}`] = "background: currentColor !important;";
      }
    }
  }

  const arrowLook =
    "width: 44px; height: 44px; border-radius: 999px; background: rgba(255,255,255,.92);" +
    ` border: 1px solid ${opts.border ?? "rgba(0,0,0,.10)"}; cursor: pointer;` +
    " display: flex; align-items: center; justify-content: center;" +
    /* Before the design's own `nav` rules, so a stated colour still wins — and
       after it there would be no ink at all for the chevron to inherit. */
    ` ${inkRule(opts)}` +
    shot("nav");

  const media = PRODUCT_MEDIA(
    MEDIA_MAIN(
      {
        all: {
          "&":
            `width: 100%; aspect-ratio: 1 / ${ratio}; overflow: hidden; ${mediaRadius}` +
            (below ? ` padding-bottom: ${BAND}px;` : ""),
          /* ==================================================================
             THE PHOTOGRAPH FILLS THE FRAME, and until now it did not.

             The frame is `aspect-ratio: 1 / ratio` with `overflow: hidden`,
             which only crops something that is already as tall as the box.
             PageFly's own rule leaves the image `height: auto`, so a wide
             photograph sat in the top of a portrait frame with the rest empty
             and a tall one was cut off at the bottom — the design's shape
             applied to the box and not to the picture inside it.

             The old rule meant to say this and named `.pf-media-wrapper`,
             which a rendered gallery does not have: the live DOM holds
             `.pf-slide-main-media` for the photograph and keeps that wrapper
             for video and 3D media. A selector that matches nothing fails
             quietly, which is why it survived several passes.
             ================================================================== */
          "& .pf-slide-main-media": "height: 100%;",
          "& .pf-slide-main-media img":
            "width: 100% !important; height: 100% !important; object-fit: cover !important;",
          "& .pf-slider-prev": arrowLook + arrowPlace("prev"),
          "& .pf-slider-next": arrowLook + arrowPlace("next"),
          /* ==================================================================
             THE GLYPH, WHICH IS WHITE AND HAS NO SETTING.

             PageFly draws the arrow as two 1px bars on the button's own
             ::before and ::after, both `background:#fff` — right on its stock
             dark circle, invisible the moment the button takes a pale plate.
             The imported gallery showed two empty bordered squares.

             It hid behind the comma key for as long as that lasted: only
             `prev` took our plate, `next` kept PageFly's dark circle, and the
             pair read as a mismatched style rather than a missing glyph.

             `currentColor` rather than a literal, so the one `color` the plate
             already carries — the band's ink, or whatever the design wrote on
             the `nav` part — decides the chevron too, and the two can never
             disagree. */
          ...glyphRules,
          ...navPlace,
          "& .pf-slider-nav button":
            "width: 28px; height: 2px; border-radius: 0; border: 0; padding: 0;" +
            " background: rgba(255,255,255,.55); cursor: pointer;" +
            shot("dot"),
          "& .pf-slider-nav button.active":
            "background: #FFFFFF;" + shot("dotActive"),
        },
      },
      { nav: "nav-style-1", pagination: counter ? "none" : "pagination-style-1" },
    ),
    MEDIA_LIST(
      node.mediaThumbs,
      { all: { "&": "gap: 10px; margin-top: 10px;" } },
      {
        all: {
          "&": `aspect-ratio: 1 / 1; overflow: hidden; cursor: pointer;` +
            ` border: 1px solid transparent; ${mediaRadius}` +
            " opacity: .62; transition: opacity .18s ease, border-color .18s ease;" +
            shot("thumb"),
          /* The chosen thumbnail has to be visible as chosen. Left alone the
             strip is six identical squares and a shopper cannot tell which one
             they are looking at. */
          /* Same miss, the other half of the gallery. PageFly gives a
             thumbnail `object-fit: contain`, so every photograph letterboxes
             inside its square at its own size and the strip reads as a ragged
             row rather than a row. The tile is already square and clipped; the
             picture has to fill it. */
          "& img": "width: 100% !important; height: 100% !important; object-fit: cover !important;",
          "&:hover": "opacity: 1;",
          '&[data-active="true"]':
            `opacity: 1; border-color: ${mediaAccent};` + shot("thumbSelected"),
        },
      },
    ),
    {
      all: {
        "&": "width: 100%;",
        /* The photograph itself. `object-fit: cover` is what makes the ratio
           above a crop rather than a squash. */
        "& .pf-media-wrapper img":
          "width: 100% !important; height: 100% !important; object-fit: cover !important;",
        "& .pf-media-wrapper": `overflow: hidden; ${mediaRadius}`,
        "& .pf-main-media": mediaRadius,
        /* PageFly's arrows arrive as bare browser buttons on a designed page. */
        "& .splide__arrow--prev, & .splide__arrow--next":
          `background: ${opts.band ?? "rgba(255,255,255,.86)"}; border: 1px solid ${mediaRule};` +
          " border-radius: 999px; width: 36px; height: 36px; opacity: .9;",
        "& .pf-r-dg": "gap: 10px;",
      },
    },
    {
      show: node.gallery,
      edge: EDGE[node.galleryEdge],
      /* A setting, not something to build — and the one a shopper reaches for
         on a product page. */
      hover: node.mediaHover === "magnifier" ? "MAGNIFIER" : "NONE",
    },
    /* A CHILD of the media element, shown by its own flag. A badge drawn on top
       needs `position:absolute`, which is banned, and `fields.md` says a
       separate badge node is dropped on import. */
    (node.badge ?? "").trim()
      ? {
          node: PRODUCT_BADGE(node.badge.trim(), {
            all: {
              "&":
                "padding: 5px 10px; border-radius: 4px; font-size: 11px;" +
                " font-weight: 700; letter-spacing: .08em; text-transform: uppercase;" +
                ` background-color: ${opts.accent ?? "#111114"}; color: #ffffff;`,
            },
          }),
          corner: node.badgeCorner ?? "TOP_LEFT",
        }
      : undefined,
  );

  /* ==========================================================================
     THE SEVEN PARTS THAT CANNOT BE DRAWN, each behind a name.

     They were written inline, in one sequence, which is how the sequence became
     a rule nobody had decided on: the order title → price → swatches → qty →
     stock → cart → express → rows was never PageFly's, it was this array's.
     PageFly asks for a ProductBox holding a media element and one FlexBlock,
     and about the inside of that FlexBlock it asks for nothing.

     Named, they can be placed by whoever knows better — the design, when it
     said, and this file's own order when it did not. */
  const slot: Record<string, () => PFNode | null> = {
    title: () =>
      PRODUCT_TITLE({
        all: { "&": `font-size: 28px; font-weight: 600; line-height: 1.2; ${inkRule(opts)}` },
      }),

    price: () =>
      PRODUCT_PRICE(
        { all: { "&": "display: flex !important; gap: 10px; align-items: baseline;" } },
        { all: { "&": `font-size: 20px; ${inkRule(opts)}` } },
        node.compareAt
          ? { all: { "&": "font-size: 16px; opacity: .5; text-decoration: line-through;" } }
          : { all: { "&": "display: none !important;" } },
      ),

    swatches: () => {
      const groups = node.variants ?? [];
      if (groups.length === 0 && node.swatches <= 0) return null;

      const rule = opts.border ?? "rgba(0,0,0,.18)";
      const accent = opts.accent ?? "currentColor";
      const r = opts.radius ?? 0;

      /* THE PAGE'S OWN LOOK, LAID OVER THE DEFAULTS.

         Every rule below is a base the page may amend, not a decision it has to
         accept. `part("dot")` appends what the design stated for that part, so
         a mockup drawing 54px squares gets 54px squares while keeping the
         border, the cursor and the transition it never mentioned.

         Appended rather than merged because CSS already settles this: the last
         declaration of a property wins, and a partial override is exactly what
         "state the size, keep the rest" means. */
      const part = (name: "dot" | "dotSelected" | "tile" | "tileSelected" | "label" | "dropdown") => {
        const declared = node.swatchStyle?.[name];
        return declared ? ` ${declarations(declared)}` : "";
      };

      /* ======================================================================
         EVERY FORM STYLED, NO FORM FORCED.

         PageFly renders each option group the way the MERCHANT configured it —
         a Colour option as dots, a Size option as tiles — and their product's
         real options are unknown while this page is being designed. Forcing one
         look is how a colour grid meets a size option and collapses into broken
         one-character labels; `fields.md` says so in as many words.

         So all four forms carry the page's own border, accent and radius, and
         whichever arrives is the one that was designed for. The dropdown gets
         the same treatment rather than being left as the browser's own control,
         which is the single detail that says "imported from somewhere else".
         ====================================================================== */
      return PRODUCT_SWATCHES(
        {
          all: {
            "&": "display: flex !important; flex-direction: column !important; gap: 16px;",

            /* the dropdown */
            "& .pf-variant-select":
              `padding: 12px 14px; border: 1px solid ${rule}; background: transparent;` +
              ` font-size: 15px; ${inkRule(opts)}` +
              (r ? ` border-radius: ${r}px;` : "") +
              " appearance: none; cursor: pointer; width: 100%;" +
              part("dropdown"),

            /* ==============================================================
               COLOUR DOTS — AND `>` IS LOAD-BEARING.

               PageFly wraps a label swatch twice, and the OUTER wrapper carries
               the colour classes whichever kind it is:

                 div.pf-vs-color.pf-vs-square      colour: label is a child
                   input + label
                 div.pf-vs-color.pf-vs-square      size: SAME classes
                   div.pf-vs-label
                     input + label                 label is a grandchild

               Written as a descendant, the round 30px chip rule below also
               matched every size box. Both rules are two classes deep, so
               specificity ties and source order decides — the square rule is
               written last, won, and the mockup's square size boxes imported
               as pills.
               ============================================================== */
            "& .pf-vs-color > label":
              `width: 28px; height: 28px; border-radius: 999px; border: 1px solid ${rule};` +
              " cursor: pointer; transition: box-shadow .15s ease;" +
              part("dot"),
            '& .pf-vs-color > input[type="radio"]:checked + label':
              `box-shadow: 0 0 0 2px ${opts.ink ?? "#fff"}, 0 0 0 4px ${accent};` +
              part("dotSelected"),
            '& .pf-vs-color > input[type="radio"]:disabled + label':
              `opacity: .3; cursor: not-allowed;`,

            /* text tiles — a size grid */
            /* FLEX, NOT `text-align`. The label holds a `<span>` and PageFly
               gives it a fixed `line-height: 22px`, so a tile told to be 62px
               tall renders its text against the top of the box and the padding
               pushes it below centre — which is what "the size sits low" was.
               Centring both axes makes the tile the same height whatever is in
               it, which a size grid needs anyway. */
            "& .pf-vs-label > label":
              `min-width: 48px; padding: 10px 14px; border: 1px solid ${rule};` +
              " display: flex; align-items: center; justify-content: center;" +
              ` text-align: center; cursor: pointer; font-size: 14px; ${inkRule(opts)}` +
              (r ? ` border-radius: ${r}px;` : "") +
              " transition: border-color .15s ease, background .15s ease;" +
              part("tile"),
            '& .pf-vs-label > input[type="radio"]:checked + label':
              `border-color: ${accent}; background: ${accent}; color: ${readableInk(accent)};` +
              part("tileSelected"),
            /* Sold out has to READ as sold out. It ships at opacity .4, which is
               indistinguishable from "faint" — a shopper clicks it and nothing
               happens. */
            '& .pf-vs-label > input[type="radio"]:disabled + label':
              `opacity: .35; cursor: not-allowed; text-decoration: line-through;`,

            /* image / square swatches */
            /* A square swatch is a dot that is not round, so it takes the same
               amendment — a mockup stating 54px squares means both. */
            "& .pf-vs-square > label":
              `border: 1px solid ${rule}; cursor: pointer;` +
              (r ? ` border-radius: ${r}px;` : "") +
              part("dot"),
            '& .pf-vs-square > input[type="radio"]:checked + label':
              `border-color: ${accent};` + part("dotSelected"),
            '& .pf-vs-square > input[type="radio"]:disabled + label':
              `opacity: .35; cursor: not-allowed;`,

            /* round radios, the universal fallback */
            "& .pf-vs-radio": `font-size: 14px; ${inkRule(opts)}`,
            '& .pf-vs-radio > input[type="radio"]:checked + label': `color: ${accent};`,

            /* ==================================================================
               THE OPTION NAME AND THE ROW, STYLED FROM HERE.

               Both are passed below as their own elements with their own style
               data, and BOTH OF THOSE ARE DEAD. PageFly's renderer draws the
               swatch block itself — `.pf-variant-label`, `.pf-option-swatches`
               — and never attaches a style class to the OptionLabel or the
               Swatch child. Its own export agrees: neither child has an entry
               in `styles` at all, only a global class.

               So "Colour — Ivory" arrived as plain sentence-case body text with
               a rule sitting one element away that could never reach it. The
               children still ship, because the element requires them; the look
               is written here, where the class exists.
               ================================================================== */
            "& .pf-variant-label":
              "display: block; font-size: 11px; font-weight: 600; letter-spacing: .08em;" +
              ` text-transform: uppercase; opacity: .55; ${inkRule(opts)}` +
              part("label"),
            "& .pf-option-swatches": "display: flex !important; gap: 10px; flex-wrap: wrap;",
          },
        },
        { all: {} },
        { all: {} },
        /* A design that named ONE group and asked for a dropdown or tiles knows
           what it is looking at, so its choice is forced. Two groups, or none
           named, and the merchant's own per-option config wins — it is the only
           thing that can render a colour and a size correctly at once. */
        groups.length === 1 && groups[0].as !== "dots"
          ? { display: groups[0].as === "dropdown" ? "dropdown" : "label" }
          : {},
      );
    },

    qty: () =>
      node.qty
        ? PRODUCT_QUANTITY({
              all: {
                "&": "display: flex !important; align-items: stretch; width: fit-content;",
                "& input":
                  `width: 56px; text-align: center; border: 1px solid ${opts.border ?? "rgba(0,0,0,.16)"}; ${inkRule(opts)}`,
                "& button":
                  `width: 40px; border: 1px solid ${opts.border ?? "rgba(0,0,0,.16)"}; background: transparent; ${inkRule(opts)}`,
              },
          })
        : null,

    stock: () =>
      node.stock
        ? /* The colours are passed because the component's defaults were
               chosen against a white theme: on a near-black page the green is
               the only one of the three that reads. */
          STOCK_INDICATOR({
              all: {
                "&": "font-size: 12.5px; letter-spacing: .06em; text-transform: uppercase;",
            },
          })
        : null,

    /* The label must read exactly as the mockup showed it — left unset,
       PageFly renders its own "Add to Cart", which may not be the words the
       merchant just approved.

       THE ACCENT, NOT A HARD-CODED BLACK. `#111114` was written when a page
         was always on white, where near-black is the strongest thing on the
         surface. On a page whose own background is near-black it is the
         weakest: the most important control on a product page arrives almost
         invisible, and the merchant reads that as the generator not knowing
         what the page looks like — which was exactly true.

         The accent is the one colour on a page chosen to be looked at, so it
         is what the buy button should be, and `readableInk` settles the label
         against it rather than assuming white. `opts.accent` already reaches
         this function; only the form was using it. */
    atc: () =>
      PRODUCT_ATC(
        {
          all: {
            "&":
              "padding: 15px 22px; font-weight: 600; text-align: center;" +
              ` background-color: ${atcBg}; color: ${readableInk(atcBg)};` +
              (opts.radius ? ` border-radius: ${opts.radius}px;` : ""),
          },
        },
        node.atcText,
      ),

    express: () =>
      node.express
        ? DYNAMIC_CHECKOUT({
            all: {
              "&": "width: 100%;",
              "& .shopify-payment-button__button--unbranded":
                `width: 100%; padding: 13px 22px; background: transparent;` +
                ` border: 1px solid ${opts.border ?? "rgba(0,0,0,.24)"}; ${inkRule(opts)}`,
            },
          })
        : null,
  };

  /* ==========================================================================
     THE COLUMN, arranged by whoever knew better.

     `children` is the design's own arrangement and it wins outright: the
     markers say where the bound parts go, everything between them is an
     ordinary tree, and `boundSlot` lets a marker sit at ANY depth — a price
     inside a row beside the words "per bottle" is a thing designs want and a
     top-level-only rule would refuse.

     Three parts are not optional however the column is arranged. A buy box
     without a title, a price or a cart button is not a buy box, and a design
     that forgets one gets it appended rather than losing the page — the same
     bargain the rest of this file makes.

     No `children` is the old fixed sequence, unchanged, which is what every
     page built before this ran on and every saved run still has to render as.
     ========================================================================== */
  const FIXED = ["title", "price", "swatches", "qty", "stock", "atc", "express"];
  const REQUIRED = ["title", "price", "atc"];

  const arranged = node.children?.length
    ? (() => {
        const asked = new Set<string>();
        const seek = (list: DesignNode[]): void => {
          for (const n of list) {
            if (n.type === "bound") asked.add(n.slot);
            const kids = (n as { children?: DesignNode[] }).children;
            if (Array.isArray(kids)) seek(kids);
          }
        };
        seek(node.children);

        const inner = { ...opts, boundSlot: (name: string) => slot[name]?.() ?? null };
        const built = node.children
          .map((child) => emit(child, "vertical", inner))
          .filter((n): n is PFNode => n !== null);

        const missing = REQUIRED.filter((r) => !asked.has(r))
          .map((r) => slot[r]())
          .filter((n): n is PFNode => n !== null);

        /* A design that filled BOTH is a design that wrote in two shapes, not a
           design that meant one of them to be thrown away. The first real
           arranged column did exactly this — its `extras` held a delivery
           promise with real dates and a three-item benefit grid — and dropping
           them would have been the failure this file keeps naming: the design
           correct, the export correct, and a part of the page gone with nothing
           anywhere saying so. They go where `extras` has always gone, after the
           column. */
        const also = (node.extras ?? [])
          .map((child) => emit(child, "vertical", opts))
          .filter((n): n is PFNode => n !== null);

        return [...built, ...missing, ...also];
      })()
    : [
        ...FIXED.map((name) => slot[name]()).filter((n): n is PFNode => n !== null),
        /* The design's own rows, under the cart button. Only the fixed sequence
           has them: a design that arranged the column put its rows where it
           wanted them, and appending a second set below would be adding rows
           nobody asked for twice. */
        ...(node.extras ?? [])
          .map((child) => emit(child, "vertical", opts))
          .filter((n): n is PFNode => n !== null),
      ];

  const info = FB(
    {
      all: {
        "&":
          "display: flex !important; flex-direction: column !important;" +
          " gap: 14px !important; width: 100% !important;" +
          " --pf-flex-layout-width: fill; --pf-flex-layout-height: hug;" +
          " --pf-flex-layout-direction: vertical;",
      },
    },
    arranged,
  );

  /* Styling targets `& > form`: ProductBox renders a <form action="/cart/add">,
     and styling `&` leaves that form at its own width. */
  const form =
    `display: flex; flex-direction: ${stacked ? "column" : "row"};` +
    ` gap: 40px; width: 100%; align-items: flex-start;`;

  const box = PRODUCT_BOX(media, info, form);
  /* The node's own declarations still apply, on a wrapper — ProductBox's
     styleData is spoken for by the form selector above. */
  return FB(filling(sd), [box]);
}

/**
 * A live product grid.
 *
 * Exactly one ProductBox goes in — the renderer stamps that card over every
 * product, so handing it three is three identical cards on top of each other.
 * The card's core is ProductMedia3 → ProductTitle → ProductPrice2; a card
 * without the title ships a product with no name.
 */
function productGrid(
  node: Extract<DesignNode, { type: "productList" }>,
  sd: StyleData,
  opts: EmitOptions,
): PFNode {
  const card = PRODUCT_BOX(
    PRODUCT_MEDIA(
      MEDIA_MAIN({ all: { "&": "width: 100%; aspect-ratio: 1 / 1;" } }),
      /* No thumbnail strip on a grid card — the gallery belongs on the product
         page, and on a card it is noise under every tile. */
      /* No CSS hiding it: a card's `showList` is false, which is the default
         PRODUCT_MEDIA applies, so the list is not rendered at all. Hiding a
         rendered list with `display:none` left it in the editor's tree as an
         element a merchant could turn back on and get a broken card. */
      MEDIA_LIST(undefined, null, null),
      /* SHAPE THE PHOTO, or the grid arrives ragged.
         `aspect-ratio` on the root gives every card the same box; `object-fit`
         on the `img` is what makes the photograph fill it. `fields.md` names
         that selector for exactly this and says a square is the safe product
         default. Without the img rule the box was square and the picture inside
         it was whatever shape the merchant uploaded, so one card came in tall
         and two came in short — which is what a real store's mixed photography
         looks like the moment it is not placeholder art. */
      {
        all: {
          "&": "width: 100%; aspect-ratio: 1 / 1;",
          "& .pf-media-wrapper img":
            "width: 100% !important; height: 100% !important; object-fit: cover !important;",
        },
      },
    ),
    FB(
      {
        all: {
          "&":
            "display: flex !important; flex-direction: column !important;" +
            " gap: 6px !important; width: 100% !important;" +
            " --pf-flex-layout-width: fill; --pf-flex-layout-height: hug;" +
            " --pf-flex-layout-direction: vertical;",
        },
      },
      [
        PRODUCT_TITLE({ all: { "&": `font-size: 16px; font-weight: 600; ${inkRule(opts)}` } }),
        PRODUCT_PRICE(
          { all: { "&": "display: flex !important; gap: 8px; align-items: baseline;" } },
          { all: { "&": `font-size: 15px; ${inkRule(opts)}` } },
          /* THE SECOND SLOT IS HIDDEN UNLESS THE DESIGN ASKS, and that is not
             timidity. PageFly falls back to the price itself when a product
             carries no compare-at, so a card with this shown over a catalogue
             that is not discounted reads `$188.00 $188.00`, the second struck
             through, on every tile. A mockup drawing a was-price is the only
             signal that the row is a sale row. */
          node.showCompareAt
            ? { all: { "&": `font-size: 14px; opacity: .55; text-decoration: line-through; ${inkRule(opts)}` } }
            : { all: { "&": "display: none !important;" } },
        ),
        /* A real ProductATC2, not a link: the card repeats over the shop's
           products and the button has to add whichever one it landed on. Inside
           the card's own block, which is where the PDP already puts its. */
        ...(node.atcLabel?.trim()
          ? [
              PRODUCT_ATC(
                {
                  all: {
                    "&":
                      "width: 100% !important; margin-top: 6px; padding: 14px 12px;" +
                      " font-size: 11px; font-weight: 600; letter-spacing: .18em;" +
                      " text-transform: uppercase; text-align: center; cursor: pointer;" +
                      ` background: transparent; border: 1px solid ${opts.border ?? "rgba(0,0,0,.22)"};` +
                      ` ${inkRule(opts)}`,
                  },
                },
                node.atcLabel.trim(),
              ),
            ]
          : []),
      ],
    ),
    "display: flex; flex-direction: column; gap: 12px; width: 100%;",
  );

  /* `&` on ProductList2 takes spacing only — the grid itself is
     `& .pf-r-dg`, which owns gap, direction and alignment. Putting the layout
     on the root is valid CSS that changes nothing, and the cards came in
     squeezed into a fraction of the row. */
  const shell = filling(sd);
  /* Only in grid mode. In slideshow mode the track is a Splide slider and a CSS
     grid laid over it puts every card on one row inside a viewport built to
     scroll one — the cards arrive overlapping. The columns are `slidesToShow`
     either way; this is the wrapper the platform's own note says owns gap and
     alignment for the grid. */
  const withGrid: StyleData =
    node.listLayout === "slideshow"
      ? shell
      : shell && {
          ...shell,
          all: {
            ...shell.all,
            "& .pf-r-dg":
              `display: grid !important; grid-template-columns: repeat(${node.columns}, minmax(0, 1fr)) !important;` +
              " gap: 24px !important; width: 100% !important; align-items: start !important;",
          },
        };

  return PRODUCT_LIST(card, withGrid, {
    columns: node.columns,
    limit: node.limit,
    /* The one field a merchant cannot fix by editing: bound to the wrong
       source, the grid looks right and lists the wrong products. */
    source: node.source === "collection" ? "auto" : "all",
    layout: node.listLayout,
  });
}

/* ==========================================================================
   Is this row of children a card LIST?

   The exporter's default is a FlexBlock holding FlexBlocks, and for two columns
   of a split that is exactly right. For three, four or six sibling cards of the
   same shape it is the wrong element: the platform has a repeating card grid
   with a column count and a spacing control, and a nest of boxes has neither —
   the merchant opens the section in the editor and finds no way to say "four
   across" except by editing CSS, which is the thing this app exists to avoid.

   WHAT DISQUALIFIES A ROW, and each of these is a real failure rather than a
   preference:

   - Fewer than three children. Two is a split, and a split in a ContentList2
     gains nothing and loses the independent widths a split needs.
   - Children of mixed types. An image beside a column is a layout, not a list.
   - Any Product* element in the subtree. `fields.md`: Product elements inside a
     ContentList2 have no product context and render "Please select a product"
     on every card. A row of product cards is a ProductList2 with ONE template.
   - Any node that owns its own layout engine — a form, an accordion, a
     slideshow, a comparison, a sticky bar. Nesting one inside a repeating item
     puts two layout engines on the same box.
   - A child with its own width. `basis 42%` on a card means the row is a
     measured composition; a card list distributes its columns evenly.
   ========================================================================== */

/** Types that cannot appear anywhere inside a ContentList2 card. */
const NOT_IN_A_CARD = new Set([
  "product",
  "productList",
  "form",
  "accordion",
  "slideshow",
  "beforeAfter",
  "sticky",
]);

/** `repeat(3, minmax(0, 1fr))` → 3. The model's own column count, when it said one. */
function declaredColumns(css: Css): number | null {
  const raw = css.gridTemplateColumns;
  if (raw === undefined) return null;
  const m = /repeat\(\s*(\d+)/.exec(String(raw));
  if (m) return Number(m[1]);
  /* A hand-written track list: count the tracks. */
  const tracks = String(raw).trim().split(/\s+/).filter(Boolean).length;
  return tracks > 1 ? tracks : null;
}

/**
 * Does this row or column become a ContentList2?
 *
 * SPLIT OUT OF `cardList` SO IT CAN BE ASKED EARLY. Every disqualifier below
 * reads the design node — the child count, their type, their declared width,
 * what is in their subtree — so the answer is knowable before a single child
 * has been emitted. That matters because the answer decides how the children
 * must be built: inside a card list they are inside a card, and `nesting.md`
 * refuses a card holding another card list.
 */
function becomesCardList(node: Extract<DesignNode, { type: "row" | "col" }>): boolean {
  const children = node.children;
  if (children.length < 3) return false;

  const shape = children[0].type;
  if (shape !== "col" && shape !== "row" && shape !== "image" && shape !== "overlay")
    return false;
  if (!children.every((c) => c.type === shape)) return false;

  for (const c of children) {
    if (statesAWidth(c.css)) return false;
    if (walkNode(c).some((n) => NOT_IN_A_CARD.has(n.type))) return false;
  }
  return true;
}

/**
 * Does this child say how wide it is?
 *
 * A ROW WHOSE CHILDREN STATE THEIR OWN WIDTHS IS A ROW OF SIZED COLUMNS, not a
 * grid of repeating cards — a rule this file already had, reading two keys. A
 * stylesheet says it a third way, and this is the one that shipped broken:
 *
 *     .s2-col{flex:0 0 25%;max-width:25%}
 *
 * Neither `width` nor `flexBasis` present, so four columns read as four cards
 * and became a ContentList2. The width then applied INSIDE the cell the list
 * had already sized — `slidesToShow: 4` made each cell a quarter of the row and
 * `flex: 0 0 25%` took a quarter of that. Six per cent of the row, and the band
 * came back one character per line.
 *
 * THE BASIS IS WHAT COUNTS, not the shorthand's presence. `flex: 1 1 0` states
 * no width at all — it says "share what is there equally", which is what a grid
 * of cards does and how half of them are written. Disqualifying on the property
 * would have stopped every real card grid from listing.
 */
function statesAWidth(css: Css | undefined): boolean {
  if (!css) return false;
  if (css.width !== undefined || css.flexBasis !== undefined) return true;
  if (css.maxWidth !== undefined) return true;
  const short = css.flex;
  if (short === undefined) return false;
  /* `grow shrink basis`, and the basis is the last word. A one- or two-value
     shorthand has no basis to read. */
  const parts = String(short).trim().split(/\s+/);
  if (parts.length < 3) return false;
  const basis = parts[2];
  return !/^0(?:[a-z%]*)$/i.test(basis) && basis !== "auto";
}

function cardList(
  node: Extract<DesignNode, { type: "row" | "col" }>,
  kids: PFNode[],
  sd: StyleData,
): PFNode | null {
  const children = node.children;
  /* The one thing `becomesCardList` cannot answer: a child that emitted
     nothing leaves the list one card short of the design. */
  if (children.length !== kids.length) return null;
  if (!becomesCardList(node)) return null;

  /* One shape, repeated.

     `overlay` belongs here and its absence was a plain omission rather than a
     decision: none of the disqualifiers above describe it — it is not a mixed
     row, it carries no Product*, it brings no layout engine of its own, and it
     states no width. `elementFor` already says `usecase-tiles-overlay` IS a
     ContentList2, and two files disagreeing is what shipped three photo tiles
     as a nest of FlexBlocks with no column control in the editor. */
  const css = styleAt(node, "all");

  /* THE DIRECTION DECIDES THE COLUMN COUNT.

     A `col` stacks: four spec rows in a col are four rows, so `slidesToShow` is
     ONE. Taking the child count regardless is what shipped four full-width spec
     bars — label, value and a rule each — squeezed side by side into four narrow
     columns, with `11,000 st` broken across two lines. The mockup stacked them
     because a col stacks, and the element was told 4.

     For a `row` the model's own `gridTemplateColumns` wins, because six cards at
     three across is three columns and not six. Only when it says nothing does
     the child count answer, which for a single row of cards is the same thing. */
  const columns =
    node.type === "col" ? 1 : (declaredColumns(css) ?? children.length);

  const gap = firstLength(css.gap ?? css.rowGap ?? css.columnGap, 24);

  /* The layout properties move into the element's own data, so they are not ALSO
     written as CSS — `display:grid` on the root or on the native wrappers is
     what collapses the grid to one card per row. Everything that is not layout
     (a background, a border, padding) stays. */
  const kept: StyleData = sd && Object.fromEntries(
    Object.entries(sd).map(([device, rules]) => [
      device,
      {
        ...rules,
        "&": String(rules["&"] ?? "")
          .split(";")
          .filter((d) => {
            const prop = d.split(":")[0]?.trim().toLowerCase();
            return prop !== "" && !CARD_LIST_OWNS.has(prop);
          })
          .join(";"),
      },
    ]),
  );

  return CONTENT_LIST(kids, kept, { columns, gap });
}

/**
 * Type declarations, which belong on the element that carries the words.
 *
 * A wrapper that carries a font size hands it to every unstyled descendant, and
 * an unstyled descendant is easy to create by accident: `P4(label, null)` is one
 * argument short of a bug. Stripping them from wrappers makes inheritance stop
 * being load-bearing.
 */
const TYPE_PROPS = new Set([
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-transform",
  "font-family",
]);

/** The same style set, minus a list of declarations. */
function without(sd: StyleData, drop: Set<string>): StyleData {
  if (!sd) return sd;
  return Object.fromEntries(
    Object.entries(sd).map(([device, rules]) => [
      device,
      {
        ...rules,
        "&": String(rules["&"] ?? "")
          .split(";")
          .filter((d) => {
            const prop = d.split(":")[0]?.trim().toLowerCase();
            return prop !== "" && !drop.has(prop);
          })
          .join(";"),
      },
    ]),
  );
}

/** Declarations the element's own settings own. Written as CSS they fight it. */
const CARD_LIST_OWNS = new Set([
  "display",
  "grid-template-columns",
  "grid-auto-flow",
  "flex-direction",
  "flex-wrap",
  "gap",
  "row-gap",
  "column-gap",
  "align-items",
  "justify-content",
]);

/** Every node in a subtree, parent first. */
function walkNode(n: DesignNode): DesignNode[] {
  const out: DesignNode[] = [n];
  for (const kid of childrenOf(n)) out.push(...walkNode(kid));
  return out;
}


/**
 * A table, built out of flex blocks rather than PageFly's Table2.
 *
 * TWO ATTEMPTS AT THE REAL ELEMENT FAILED, and the editor said why. It shows
 * "Please add an item in General -> Rows or General -> Columns" — so Table2 has
 * `rows` and `columns` LIST fields in its General tab, and `fields.md` lists
 * four fields for the element and neither of them is there. The documentation
 * is incomplete, and both attempts were guesses at a shape nobody wrote down:
 * `data.rows` did nothing, and a sibling `content` key did worse than nothing —
 * it was outside the six keys `page-json.md` allows on a node, and the import
 * reported success while the page never reached the editor's list.
 *
 * So this stops guessing. A row is a FlexBlock, a cell is a Paragraph, and both
 * are emitted correctly everywhere else in this file. It renders, the merchant
 * can edit any cell as ordinary text, and nothing here depends on a field table
 * that is missing entries.
 *
 * WHAT IT COSTS, since it is a real trade. Table2's per-breakpoint
 * `columnsWidth` is gone, so the columns are even flex children and a wide
 * table scrolls rather than reflowing. The editor's table panel is gone with
 * it. And a six-by-four table is about thirty items instead of five. A table
 * that renders beats a table that is configurable and empty.
 *
 * The first row is the header and the first column is one too when the design
 * asked for it — `headerColumn` is right for a size chart and wrong for a spec
 * list, which is why the design gets to say.
 */
function tableAsFlex(
  rows: string[][],
  headerColumn: boolean,
  sd: StyleData,
  opts: EmitOptions,
): PFNode | null {
  if (rows.length === 0) return null;

  const rule = opts.border ?? "rgba(0,0,0,.14)";
  const ink = inkRule(opts, sd);
  const columns = rows.reduce((n, r) => Math.max(n, r.length), 0);
  if (columns === 0) return null;

  /* Padded here, as `TABLE` padded before it: a ragged row is a table with
     holes in it, and this function is reachable from a tree nobody parsed. */
  const square = rows.map((r) => [...r, ...Array(Math.max(0, columns - r.length)).fill("")]);

  const cell = (text: string, header: boolean, first: boolean): PFNode =>
    P4(text, {
      all: {
        "&":
          /* NO `min-width: 0` HERE. It was the line that made a table of four
             columns wrap one letter per line: with the floor removed a flex
             cell shrinks past its own longest word, and the `overflow-x: auto`
             on the wrapper below never fires because the row is never wider
             than the box. The two rules were asking for opposite things. */
          `flex: 1 1 0; padding: 12px 14px; font-size: 14px;` +
          ` line-height: 1.4; ${ink}` +
          (header
            ? ` font-weight: 600; letter-spacing: .04em; text-transform: uppercase; font-size: 12.5px;`
            : "") +
          (first && headerColumn ? ` font-weight: 600;` : "") +
          /* Digits in a column have to line up or the table reads as a list. */
          (/\d/.test(text) ? ` font-variant-numeric: tabular-nums;` : ""),
      },
    });

  const line = (cells: string[], i: number): PFNode =>
    FB(
      {
        all: {
          "&":
            /* `min-width` rather than `width`, and 110px a column — the same
               floor `render.tsx` gives the mockup's table. Capped at 100% the
               row can only shrink; with a floor it grows past the container
               and the wrapper scrolls, which is what the mockup does and what
               the export promised and did not deliver. */
            `display: flex; flex-direction: row; align-items: stretch;` +
            ` width: 100%; min-width: ${columns * 110}px;` +
            (i < square.length - 1 ? ` border-bottom: 1px solid ${rule};` : ""),
        },
      },
      cells.map((c, n) => cell(c, i === 0, n === 0)),
    );

  return FB(
    filling(sd, `display: flex; flex-direction: column; width: 100%; overflow-x: auto;`),
    square.map(line),
  );
}

function tabsOf(
  node: Extract<DesignNode, { type: "tabs" }>,
  sd: StyleData,
  opts: EmitOptions,
): PFNode | null {
  if (node.items.length < 2) return null;

  const rule = opts.border ?? "rgba(0,0,0,.16)";
  const accent = opts.accent ?? "currentColor";

  /* ==========================================================================
     PAGEFLY'S TABS, NOT A BAR OF HIDDEN RADIOS.

     What this replaces worked: a `Custom.HTML` block holding one hidden radio
     and one label per tab, a `:has()` rule per panel, and a `@supports`
     fallback that showed everything at once where `:has()` is missing. The
     live page switched panels correctly.

     It was still the wrong answer, and the editor is where that shows. A
     merchant who opened the tabs found `HTML/Liquid` and a code panel — no
     list of tabs, nothing to rename, nothing to reorder, no way to add a
     fifth. The whole point of exporting to PageFly rather than to a
     screenshot is that the page stays editable afterwards, and tabs are near
     the top of the list of things somebody wants to change.

     A PREVIOUS ATTEMPT AT Tabs3 FAILED, AND THIS IS NOT THAT ATTEMPT. The note
     this replaces recorded it: the placement rule in `fields.md` says to "emit
     the type alone, no child nodes" and fill `content.items:[{label,content}]`,
     an item-level `content` key twice made an export import successfully and
     never reach the editor's list. That route is still wrong and is not the one
     taken here. `nesting.md` describes a different shape for the same element —
     Tabs3 holding TabsMenu3 and TabContentWrapper3, and TabsContent3 accepting
     152 of the 241 element types — which is the ordinary four-slot composite
     this file already builds for Accordion3, ProductBox and Form2. Real nodes
     in the panels, so a table or a buy box inside a tab stays one.

     STYLED THROUGH THE DOCUMENTED PARTS. `TabHeader3` says in `fields.md` that
     it "cannot be styled on its own — its look is set on the parent", so the
     label rules go on the Tabs3 through `& [data-pf-type="TabsMenu3"] > label`
     and the bar through `& .tab3-headers-wrapper`. A rule written against the
     element itself would be valid CSS reaching nothing, which is this file's
     most frequent way of shipping a bug that reports no error.

     THE ACTIVE UNDERLINE IS LEFT TO PAGEFLY. `fields.md` says the active state
     is a sibling rule against a radio id the renderer generates — `&
     .pf-tab-radio:checked ~ …` — and the id is not knowable from here. Writing
     a guess at it would be the same dead rule by a different route, so the
     accent below marks the bar and the platform's own active styling does the
     rest.
     ========================================================================== */
  const tabs = node.items.map((t) => ({
    label: t.label,
    body: t.children.map((c) => emit(c, "vertical", opts)).filter(Boolean) as PFNode[],
  }));

  /* Same contract as the buy box's: named parts over the defaults. */
  const tab = (name: "bar" | "label" | "labelActive" | "panel") => {
    const declared = node.tabStyle?.[name];
    return declared ? ` ${declarations(declared)}` : "";
  };

  return TABS(
    tabs,
    node.open,
    withParts(filling(sd, "width: 100%;"), {
      "& .tab3-headers-wrapper":
        `display: flex; flex-wrap: wrap; border-bottom: 1px solid ${rule};` + tab("bar"),
      /* THE GAP GOES ON THE MENU, NOT ON THE BAR. The wrapper's children are
         the dropdown button, the scroll arrows and the group that holds the
         menu — three things, so a gap there spaces those and never the labels.
         The labels are the menu's own children, and with no gap and no
         horizontal padding they render touching: three tabs reading as one run
         of words, "The inch chartOn a real bodyCare, in four steps". */
      '& [data-pf-type="TabsMenu3"]': "display: flex; flex-wrap: wrap; gap: 28px;",
      /* `background: transparent` IS NOT DECORATION. PageFly's own label class
         ships `background:#f0f2f3`, so a bar designed as plain underlined text
         imported as a row of grey boxes — the rule below set the padding and
         the colour and left the fill standing. A tab bar that is transparent in
         the mockup has to say so here, because the default is not nothing.

         The colour is the page's INK, not its accent. Every label in the accent
         reads as every tab being the chosen one. */
      '& [data-pf-type="TabsMenu3"] > label':
        "cursor: pointer; padding: 12px 0; font-size: 12.5px; letter-spacing: .12em;" +
        " background: transparent; border-radius: 0;" +
        ` text-transform: uppercase; border-bottom: 2px solid transparent; ${inkRule(opts)}` +
        " opacity: .55; transition: opacity .15s ease, border-color .15s ease;" +
        tab("label"),
      /* THE CHOSEN TAB, and this is the only hook a file has. `fields.md`
         describes the active state as a sibling rule against the radio the
         panels switch on, and that radio's id is generated at publish time —
         a guess at it is a dead rule that reports no error. PageFly's renderer
         also marks the label itself with `data-pf-tab-active`, which is
         knowable, stable, and what its own tab script maintains. */
      '& [data-pf-type="TabsMenu3"] > label[data-pf-tab-active="true"]':
        `opacity: 1; border-bottom-color: ${accent};` + tab("labelActive"),
      "& .pf-tab3-content-container": "padding-top: 28px;" + tab("panel"),
    }),
  );
}

function accordionOf(
  node: Extract<DesignNode, { type: "accordion" }>,
  sd: StyleData,
  opts: EmitOptions,
): PFNode {
  const rows = node.items.map((item) => ({
    /* The question is the header's own `label`, not a Heading nested under it.
       Nested, the editor showed an empty header with the answer orphaned
       beneath — the copy was in the file and nothing displayed it. */
    header: ACCORDION_HEADER(item.q, {
      all: {
        "&":
          "display: flex !important; justify-content: space-between !important;" +
          " align-items: center !important; gap: 16px; padding: 18px 0;" +
          " font-size: 16px; font-weight: 600;",
      },
    }),
    /* Four tiers, and the copy has to reach the innermost one — ACCORDION
       builds the wrappers, so this is only the body content. */
    body: [
      P4(item.a, {
        all: { "&": "line-height: 1.6; opacity: .72; padding-bottom: 18px;" },
      }),
    ],
    /* ONE border, on the row, from the palette.

       There were two. This one, and a `border-bottom: 1px solid currentColor`
       on `.pf-header-item-wrapper` below — and the live page drew both, which
       is why an accordion that looked right in the editor arrived on the
       storefront with a heavy rule and a faint one under every row. The mockup
       draws one: `render.tsx` gives the item wrapper a hairline and the header
       `border: 0`.

       The colour comes from the palette rather than the hardcoded black it used
       to be, because black at 12% on a near-black page is not a hairline, it is
       nothing. */
    style: {
      all: { "&": `border-bottom: 1px solid ${opts.border ?? "rgba(0,0,0,.12)"};` },
    },
  }));

  /* The clickable row and the answer panel are styled through the accordion's
     own selectors — `& .pf-header-item-wrapper` and `& .pf-accordion-body`.
     Styling the header node's `&` instead is valid CSS that reaches nothing,
     which is why the imported rows carried none of the mockup's spacing. */
  const shell = filling(sd);
  const withParts: StyleData = shell && {
    ...shell,
    all: {
      ...shell.all,
      /* No border here. The row wrapper above carries it, and both drawing one
         is what put two rules under every header on the live page. */
      "& .pf-header-item-wrapper":
        `padding: 18px 0; font-size: 16px; font-weight: 600; ${inkRule(opts, sd)}`,
      "& .pf-accordion-body":
        `padding-bottom: 18px; line-height: 1.6; opacity: .72; ${inkRule(opts, sd)}`,
      "& .pf-accordion-icon": `font-size: 18px; opacity: .5; ${inkRule(opts, sd)}`,
    },
  };

  return ACCORDION(rows, withParts);
}

/* ---- page --------------------------------------------------------------- */

function pageCss(width: number, motion: boolean): string {
  return [
    /* First — @import is only valid before any other rule. Without it the store
       has no reason to have these faces installed and every heading falls back
       to the theme's system stack, which is exactly how an import came back in
       the wrong font. customCSS survives import and runs on preview and live. */
    `@import url("${WEBFONT_CSS_URL}");`,
    `/* PageFly Design export — keeps the imported page matching its mockup. */`,
    `#__pf, #__pf * { box-sizing: border-box; }`,
    `#__pf p, #__pf h1, #__pf h2,`,
    `#__pf h3, #__pf h4, #__pf h5,`,
    `#__pf h6 { margin: 0; }`,
    `#__pf a { color: inherit; text-decoration: none; }`,
    `#__pf img, #__pf svg { display: block; max-width: 100%; }`,
    /* SCOPED TO `#__pf`, WHICH IS ALWAYS THERE.

       Every rule here used to read `.pf-design-export …` — a class put on the
       content block through `className`, a key PageFly does not read. So the
       class never reached the DOM and not one of these rules has ever applied,
       which is why three separate rewrites of the `min-width` line changed
       nothing.

       `#__pf` is the id PageFly wraps the whole page in. Its own custom CSS
       uses it 92 times in `reference/all-elements.pagefly`, and its own custom
       JS finds the page with `getElementById('__pf')`. A selector that is
       always there beats one we have to attach and can fail to.

       NOTHING THAT DECIDES A LAYOUT BELONGS IN THIS FILE.

       The `min-width` floor and the page's own `max-width` cap both used to be
       here, and both have moved onto the elements: the floor into `cssAt`, the
       cap onto the content block in `pageflyFromTree`. The reason is the whole
       point of the move — `customCSS` runs on preview and live and NOT in the
       editor canvas, so a layout guarantee written here is missing from the one
       place the merchant meets the page first. Three separate fixes rewrote the
       floor in this file and the editor stayed broken through all three.

       What is left is decoration: the webfont, the margin and list resets that
       stop the host theme's base styles reaching the tree, and a cap that keeps
       a picture inside a box which already has a width of its own. If a rule
       added here would change where a box ends up, it is in the wrong file. */
    /* Only when something on the page moves. A page with no motion should not
       ship a stylesheet for motion — the merchant reads this field. */
    motion && `\n/* motion — matches the mockup */\n${MOTION_CSS}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type BuiltPage = { blob: Blob; filename: string };

/**
 * Build the importable file for one design tree.
 *
 * `page` supplies only the filename and the page-level background and type
 * face — everything with a shape comes from the tree.
 */
/* Properties that paint the band itself rather than lay out its contents. They
   belong on the FlexSection, which is full width; everything else belongs on
   the content block inside it, which is capped at the page width. */
const BLEED_PROPS = new Set([
  "background",
  "backgroundColor",
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
  "backgroundRepeat",
  "borderTop",
  "borderBottom",
]);

function splitBleed(css: Css | undefined): { bleed: Css; rest: Css | undefined } {
  const bleed: Css = {};
  if (!css) return { bleed, rest: undefined };
  const rest: Css = {};
  for (const [k, v] of Object.entries(css)) {
    if (BLEED_PROPS.has(k)) bleed[k] = v;
    else rest[k] = v;
  }
  return { bleed, rest: Object.keys(rest).length ? rest : undefined };
}

/**
 * Whether this band's own layout blocks have to be forced to full width.
 *
 * Only three things need it, and they need it for the same reason: `product`,
 * `productList` and `accordion` expand into PageFly subtrees that size
 * themselves from their own contents rather than from the block holding them,
 * so the wrapper shrink-wraps and the grid lands narrow in the middle of the
 * band.
 *
 * Everywhere else the force is wrong. A `width: 100% !important` on a block
 * holding a centred headline overrides whatever width the tree asked for — and
 * `!important` means the merchant cannot take it back from the editor's own
 * width control, only by finding it in the CSS panel. Wrong, unremovable and
 * hidden is a bad combination to apply to sections that never needed it.
 */
const FILL_TYPES = new Set(["product", "productList", "accordion"]);

function needsFill(section: DesignSection): boolean {
  /* The whole subtree, not the direct children: a product grid two columns deep
     inside a row still drags the wrapper narrow. */
  const has = (n: DesignNode | DesignSection): boolean =>
    FILL_TYPES.has(n.type) || childrenOf(n).some(has);
  return section.children.some(has);
}

/** `firstLength`, so a shorthand gap cannot silently become one number again. */
export const __firstLengthForTest = firstLength;

export function pageflyFromTree(
  tree: DesignTree,
  page: { name: string; bg: string; ink: string; fontBody: string },
  width: number,
  opts: EmitOptions = {},
): BuiltPage {
  /* The page's own text colour travels with every emit, so composites can
     state it rather than inherit whatever the merchant's theme sets. */
  const customBlocks: CleanBlock[] = [];
  opts = {
    ...opts,
    /* Whether the page is bound to a product decides whether a standalone
       add-to-cart button uses `auto` or `custom`. Computed once here from the
       whole tree rather than asked per node. */
    hasProduct: walk(tree).some((n) => n.type === "product"),
    ink: opts.ink ?? page.ink,
    customBlocks,
    customCount: { value: 0 },
  };
  const sections = tree.sections.map((section) => {
    const fills = needsFill(section);
    /* THE BAND'S OWN INK, NOT THE PAGE'S. Everything emitted below inherits it,
       which is what makes a table on an inverted band readable — see
       `bandInk`. */
    const bandOpts: EmitOptions = { ...opts, ink: bandInk(section, page) };
    const kids = section.children
      .map((c) => {
        const emitted = emit(c, dirsOf(section), bandOpts);
        /* A row or col sitting straight under the content block is the band's
           own layout, and in a band built around a composite it has to claim the
           full width or the block collapses to its content. Leaves are left
           alone: a button forced to 100% stretches across the page. */
        return emitted && fills && (c.type === "row" || c.type === "col")
          ? { ...emitted, styleData: filling(emitted.styleData) }
          : emitted;
      })
      .filter((n): n is PFNode => n !== null);

    /* A dark band has to reach both edges of the screen. Its background used to
       ride on the content block, which carries the page's max-width — so a
       full-bleed section imported as an inset rectangle floating on the page
       background, which is exactly what it looked like. The paint goes on the
       section; the layout stays on the block inside it. */
    const desktop = splitBleed(styleAt(section, "all")).bleed;
    const mobile = splitBleed(styleAt(section, "mobile")).bleed;

    /* The content block. Two things ride on it and neither is obvious.

       A SECTION'S REVEAL, not the FlexSection's. The band's paint stays put and
       its contents rise into it — fading the whole section would fade the
       background out of the page and back in, which reads as a flicker rather
       than an entrance.

       AND THE PAGE'S WIDTH, which is the load-bearing one. This was
       `#__pf { max-width: Npx; margin: auto; width: 100% }` in
       `customCSS`: every block below it is `--pf-flex-layout-width: fill`, which
       the engine expands to `flex-grow: 1; flex-basis: 0px`, and a chain of
       those resolves to nothing unless something at the top states a real width.

       `customCSS` does not run in the editor canvas. So in the editor nothing
       held the page open, the whole chain resolved to its flex share of an
       indefinite width, and a band with no picture in it to give the row a
       definite size came apart one character per line. Live and preview were
       fine, which is why this read as an editor bug for three fixes running.

       On the block it is styleData, which the editor reads. */
    const inner = FB(
      filling(
        styleDataFor(
          { ...section, css: splitBleed(section.css).rest, mobile: splitBleed(section.mobile).rest },
          null,
        ),
        `max-width: ${width}px !important; margin-left: auto; margin-right: auto;`,
      ),
      kids,
      ["pf-design-export", ...motionClasses(section.anim)].join(" "),
    );

    const bandCss = declarations(desktop);
    const bandMobile = declarations(mobile);
    const band: Record<string, Record<string, string>> = {
      all: { "&": `padding: 0px; ${bandCss || `background-color: ${page.bg};`}` },
    };
    if (bandMobile && bandMobile !== bandCss)
      band.mobile = { "&": `padding: 0px; ${bandMobile}` };

    /* The band's own background, as SETTINGS — see FSECTION. A photograph or a
       video is not CSS here: it is `src` / `videoBg` / `filterColor`, which is
       what a merchant can open and change afterwards. A gradient stays in `css`
       and needs nothing, which is why the vocabulary has no `kind` for it. */
    const wantsVideo = section.bg?.kind === "video";
    const photo = section.bg?.query ? opts.images?.[section.bg.query] : undefined;
    const video = wantsVideo && section.bg?.query ? opts.videos?.[section.bg.query] : undefined;

    return FSECTION([inner], band, section.bg ? { photo, video, scrim: section.bg.scrim } : undefined);
  });

  if (sections.length === 0)
    throw new Error("Nothing to export — the design has no sections");

  /* Asked of the tree, not of what was emitted: a node whose motion the
     exporter turned into an `animationHover` field still needs the stylesheet
     if some other node on the page reveals on scroll. */
  const moves = walk(tree).some((n) => hasMotion((n as { anim?: Anim }).anim));
  const reveals = walk(tree).some((n) => (n as { anim?: Anim }).anim?.reveal);

  /* Block CSS goes after the page's own so a block can override a base rule if
     it means to, and block JS after the reveal observer so `root` is findable —
     PageFly runs custom JS once, after the page is in the DOM. */
  const blockCss = customBlocks.map((b) => b.css).filter(Boolean).join("\n");
  const blockJs = customBlocks.map((b) => b.js).filter(Boolean).join("\n");

  const doc = new Page({
    name: page.name,
    customCSS: [pageCss(width, moves), blockCss].filter(Boolean).join("\n\n"),
    /* The observer only ships when something actually reveals. Hover needs no
       JS, and a page that runs a MutationObserver for nothing is a page that
       costs the storefront something for nothing. */
    customJS: [reveals ? MOTION_JS : "", blockJs].filter(Boolean).join("\n"),
  });
  for (const s of sections) doc.addSection(s);

  return { blob: doc.toBlob(), filename: `${page.name}.pagefly` };
}

/** Exposed for tests: the exact styleData one node would carry. */
export const _internals = { styleDataFor, cssAt, widthMode, declarations, mayShrink };
export type { DeviceKey };
