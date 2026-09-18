"use client";

import {
  ACCORDION,
  onlyOn,
  type DeviceKey,
  ACCORDION_HEADER,
  BTN,
  CUSTOM_HTML,
  FB,
  FSECTION,
  H2,
  IMG,
  MEDIA_LIST,
  MEDIA_MAIN,
  P4,
  PRODUCT_ATC,
  PRODUCT_BOX,
  PRODUCT_MEDIA,
  PRODUCT_PRICE,
  PRODUCT_SWATCHES,
  PRODUCT_TITLE,
  Page,
  type PFNode,
  type StyleData,
} from "./builder";
import type { PageMockup } from "../generate/types";
import { WEBFONT_CSS_URL } from "../styleTokens";

/* ==========================================================================
   Mockup DOM → PageFly nodes.

   WHY THE DOM AND NOT THE BLOCK DATA.

   The obvious approach is to map each of the 34 block kinds onto PageFly's
   element vocabulary by hand. That is a second implementation of the layout,
   and every one of those 34 mappers is a place for the export to drift away
   from the mockup the merchant approved.

   The mockup renders with inline styles exclusively — 250 `style={{…}}` across
   the block components, zero classNames. So the rendered DOM already carries,
   on every element, the exact CSS string that produced the picture. Walking it
   and copying `getAttribute("style")` verbatim into `styleData` means the
   exported CSS *is* the CSS that rendered the mockup, not a translation of it.
   There is one layout, so there is nothing to drift.

   THREE THINGS THE NAIVE WALK GOT WRONG, all found by importing into a real
   editor and comparing against the mockup:

   1. MIXED CONTENT LOST ITS TEXT. `Stars` renders
        <div style="…">★★★★<span style="…">★</span></div>
      — a bare text node next to an element child. Recursing over `children`
      only visits the span, so the four filled stars were silently dropped. A
      4-star row imported as a lone grey star. Elements whose element children
      are all inline now emit as ONE text element carrying `innerHTML`, which
      is both exact and far fewer nodes.

   2. THE LAYOUT ENGINE PROPS WERE MISSING. PageFly's Flex engine reads
      `--pf-flex-layout-width|height|direction` and the denormalized
      `--pf-flex-layout-parent-direction` (schema.md: "MUST mirror parent's
      direction per breakpoint"). Without them its own base rules decided the
      sizing, collapsing text containers to about one character wide — which is
      why FAQ answers and prices imported as a vertical column of letters.
      Layout properties also carry `!important` now, because those base rules
      otherwise outrank the styleData that drew the mockup.

   3. CSS-ONLY DECORATION BECAME AN EMPTY DROP ZONE. A styled div with no text
      and no children is a divider, rail or dot. As a childless FlexBlock the
      editor draws its "Drop element here" affordance over it. Emitting it as
      Custom.HTML keeps the pixels and leaves no drop zone.

   WHAT THIS STILL CANNOT GUARANTEE — see README:
   fonts resolve per-machine, the Shopify theme injects its own base styles,
   and PageFly's container width is not the mockup's. The page-level reset in
   `pageCss()` neutralises as much of that as CSS can reach.
   ========================================================================== */

const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

/** Children of these keep the parent renderable as one text element. */
const INLINE_TAGS = new Set([
  "SPAN",
  "A",
  "B",
  "STRONG",
  "EM",
  "I",
  "U",
  "S",
  "SMALL",
  "BR",
  "SUP",
  "SUB",
  "MARK",
  "CODE",
  "ABBR",
  "TIME",
  "LABEL",
]);

/** PageFly's own base rules outrank styleData on these, so the mockup's value
    wins only with `!important`. Restricted to layout — colours and type never
    collapsed, and blanket !important fights the editor's resize handles. */
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
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column",
  "grid-row",
  "box-sizing",
  "position",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "overflow",
  "white-space",
]);

type Dir = "horizontal" | "vertical" | "wrap";

/* ==========================================================================
   Translating a browser layout into a PageFly layout.

   The export used to copy each element's inline CSS and assume the result would
   render the same. It does not, for a reason that only shows up on import: a
   PageFly FlexBlock is NOT a plain <div>. It has a layout engine, and an element
   that declares no `display` inherits that engine's default rather than the
   browser's `block`.

   In one Home page, 254 of 310 elements declare no display at all — they stack
   because that is what block elements do. Imported, they became rows: navigation
   links ran together with no gaps, product images sat beside their titles, and
   prices broke one character per line.

   Another 32 declare `display: grid`. The Flex editor has no grid at all.

   So every container is made EXPLICIT here, from what the browser actually
   computed rather than from what the markup happened to declare, and grid is
   translated into the flex-wrap that reproduces it.
   ========================================================================== */

/** A plain vertical stack, for the fixed slots whose parent is not walked. */
const STACK: ParentLayout = { dir: "vertical", columns: 1, gapPx: 0 };
const ROW: ParentLayout = { dir: "horizontal", columns: 1, gapPx: 0 };

type ParentLayout = {
  dir: Dir;
  /** a translated grid: children need an explicit basis to keep their columns */
  columns: number;
  gapPx: number;
};

type Layout = {
  display: string;
  dir: Dir;
  rowGap: number;
  columnGap: number;
  /** a CSS grid, which the Flex editor has no equivalent for */
  isGrid: boolean;
  /** how many children sat on the first row, measured. Only meaningful for a grid. */
  columns: number;
};

function px(value: string | undefined): number {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/**
 * What the browser actually laid out, not what the markup declared.
 *
 * The export stage is attached and laid out, so computed values are real. jsdom —
 * used by the tests — has no layout engine, so it falls back to the inline
 * declarations and to parsing `repeat(N, …)` for the column count.
 */
function readLayout(el: Element): Layout {
  const inline = decl(el);
  const view =
    typeof window !== "undefined" && window.getComputedStyle
      ? window.getComputedStyle(el)
      : null;

  const display = (view?.display ?? lookup(inline, "display") ?? "block").trim();
  /* Tokens, never substrings. `"nowrap".includes("wrap")` is true, and reading it
     that way classified every non-wrapping row in the mockup as a wrapping one —
     which then handed each of its children an equal-width basis and collapsed the
     hero headline into a one-character column. */
  const tokens = new Set(
    `${view?.flexDirection ?? ""} ${view?.flexWrap ?? ""} ${
      lookup(inline, "flex-flow") ?? ""
    } ${lookup(inline, "flex-direction") ?? ""} ${lookup(inline, "flex-wrap") ?? ""}`
      .split(/\s+/)
      .filter(Boolean),
  );
  const wraps = tokens.has("wrap") || tokens.has("wrap-reverse");
  const column = tokens.has("column") || tokens.has("column-reverse");

  const rowGap = view ? px(view.rowGap) : px(lookup(inline, "gap"));
  const columnGap = view ? px(view.columnGap) : px(lookup(inline, "gap"));

  const isGrid = display.includes("grid");

  let dir: Dir;
  if (isGrid) dir = "wrap";
  else if (display.includes("flex"))
    dir = wraps ? "wrap" : column ? "vertical" : "horizontal";
  /* Block-level children stack. That is a vertical flex column in PageFly terms,
     and saying so explicitly is the whole point of this function. */
  else dir = "vertical";

  return {
    display,
    dir,
    rowGap,
    columnGap,
    isGrid,
    columns: isGrid ? countColumns(el, display, inline) : 1,
  };
}

/** Children sharing the first row. Measured where there is layout; parsed from
    `repeat(N, …)` where there is not. */
function countColumns(
  el: Element,
  display: string,
  inline: [string, string][],
): number {
  const kids = elementChildren(el);
  if (kids.length === 0) return 1;

  const first = kids[0].getBoundingClientRect?.();
  if (first && first.width > 0) {
    let n = 0;
    for (const kid of kids) {
      const box = kid.getBoundingClientRect();
      if (Math.abs(box.top - first.top) > 2) break;
      n++;
    }
    return Math.max(1, n);
  }

  const template = lookup(inline, "grid-template-columns") ?? "";
  const repeat = /repeat\(\s*(\d+)/.exec(template);
  if (repeat) return Number(repeat[1]);
  if (template.trim()) return template.trim().split(/\s+/).length;
  return display.includes("grid") ? 1 : kids.length || 1;
}

/* ---- inline-style parsing ----------------------------------------------- */

/** Split a declaration list without cutting inside url(), gradients or quotes. */
function declarations(css: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0;
  let quote = "";
  let buf = "";
  const flush = () => {
    const d = buf.trim();
    buf = "";
    if (!d) return;
    const i = d.indexOf(":");
    if (i < 0) return;
    out.push([d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]);
  };
  for (const ch of css) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      flush();
      continue;
    }
    buf += ch;
  }
  flush();
  return out;
}

function decl(el: Element): [string, string][] {
  return declarations(el.getAttribute("style") ?? "");
}

function lookup(d: [string, string][], prop: string): string | undefined {
  for (let i = d.length - 1; i >= 0; i--) if (d[i][0] === prop) return d[i][1];
  return undefined;
}

/* ---- sizing -------------------------------------------------------------- */

/** hug | fill | fixed, the three modes PageFly's engine understands.

    Measured from the laid-out stage when there is one — the export runs against
    a real 1440px stage, so the numbers are the mockup's actual geometry rather
    than a guess. jsdom (the test) has no layout engine, so it falls back to the
    declared CSS, defaulting to `fill`: an over-wide block reflows, whereas a
    wrongly-hugged one collapses to a column of letters. */
function widthMode(el: Element, d: [string, string][]): "hug" | "fill" | "fixed" {
  const declared = lookup(d, "width");
  if (declared === "fit-content" || declared === "max-content") return "hug";
  if (declared && /^\d/.test(declared) && !declared.startsWith("100%"))
    return "fixed";

  const parent = el.parentElement;
  const own = el.getBoundingClientRect?.().width ?? 0;
  if (own > 0 && parent) {
    const box = parent.getBoundingClientRect().width;
    if (box > 0) {
      const view =
        typeof window !== "undefined" && window.getComputedStyle
          ? window.getComputedStyle(parent)
          : null;
      const inner = view
        ? box -
          (parseFloat(view.paddingLeft) || 0) -
          (parseFloat(view.paddingRight) || 0)
        : box;
      if (own >= inner - 1.5) return "fill";
      const grow = parseFloat(lookup(d, "flex-grow") ?? "0");
      return grow > 0 ? "fill" : "hug";
    }
  }

  if (lookup(d, "align-self") === "stretch") return "fill";
  if (declared === "100%") return "fill";
  const display = lookup(d, "display") ?? "";
  if (display.startsWith("inline")) return "hug";
  return "fill";
}

function heightMode(d: [string, string][]): "hug" | "fill" | "fixed" {
  const h = lookup(d, "height");
  if (h === "100%" || h === "fill") return "fill";
  if (h && /^\d/.test(h)) return "fixed";
  return "hug";
}

/* ---- one element, seen at every breakpoint ------------------------------- */

/**
 * The same element as rendered at each breakpoint. `[0]` is desktop and is the
 * canonical one — it is never null, and the exported tree's structure comes from
 * it. A null entry means the element is not rendered at that width, which becomes
 * a `hideOn…` flag rather than a missing node.
 */
type Src = { key: DeviceKey; el: Element | null };

/* A tuple, not an array: the first entry is desktop and must always be present.
   Encoding that in the type removes a null check from every reader. */
export type Sources = [{ key: "all"; el: Element }, ...Src[]];

/** Enough to recognise the same element in a differently-shaped render.
    Tag and role are structural; a little text disambiguates siblings that share
    both. Deliberately not the CSS — the CSS is exactly what differs. */
function signature(el: Element): string {
  const role = el.getAttribute("data-pf") ?? "";
  const text = (el.textContent ?? "").trim().slice(0, 24).replace(/\s+/g, " ");
  return `${el.tagName}|${role}|${el.children.length}|${text}`;
}

/**
 * Line up one device's children against desktop's.
 *
 * Index alignment is not enough: mobile renders a different number of children in
 * places, and from the first mismatch onwards every later pair would be wrong.
 * This is a longest-common-subsequence over signatures, which keeps the matched
 * pairs aligned and reports the leftovers on each side honestly.
 */
function align(
  base: Element[],
  other: Element[],
): { pairs: Map<number, Element>; extra: { after: number; el: Element }[] } {
  /* BY POSITION WHEN THE COUNTS AGREE, and in verbatim mode they always do.

     LCS over signatures is the right tool for the React mockup, whose four
     renders are four separate component trees that may genuinely differ — an
     element can be rendered at one width and not another.

     The HTML path is not that. The four renders are ONE document laid out at
     four widths, so child n is child n everywhere, and matching by signature
     only introduces a way to be wrong: the signature counts children, a
     materialised pseudo-element can exist at one width and not another, and a
     single mismatch makes LCS drop the pair — which silently hands that
     element AND ITS WHOLE SUBTREE the desktop stylesheet at every width.

     Measured: 139 of 451 elements had no mobile entry, and the export rendered
     18,359px tall at 390px against the mockup's 12,507. Converted from the
     mobile render alone — where no alignment happens — the same code produced
     12,625px. The conversion was never wrong; the pairing was. */
  if (verbatim && base.length === other.length) {
    const pairs = new Map<number, Element>();
    base.forEach((_, i) => pairs.set(i, other[i]));
    return { pairs, extra: [] };
  }

  const a = base.map(signature);
  const b = other.map(signature);

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const pairs = new Map<number, Element>();
  const extra: { after: number; el: Element }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.set(i, other[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      extra.push({ after: i - 1, el: other[j] });
      j++;
    }
  }
  for (; j < b.length; j++) extra.push({ after: a.length - 1, el: other[j] });

  return { pairs, extra };
}


/** The same child, located in every device that still renders it. */
function childSources(
  parent: Sources,
  index: number,
  alignments: Map<DeviceKey, Map<number, Element>>,
): Sources {
  const desktopKid = elementChildren(parent[0].el)[index];
  const rest: Src[] = parent
    .slice(1)
    .map((s) => ({ key: s.key, el: alignments.get(s.key)?.get(index) ?? null }));
  return [{ key: "all", el: desktopKid }, ...rest];
}

/** Which breakpoints actually render this element. */
function presentOn(sources: Sources): DeviceKey[] {
  return sources.filter((s) => s.el !== null).map((s) => s.key);
}

/** A single element promoted to a Sources tuple — for nodes that exist at one
    breakpoint only, and for the paths that never needed the others. */
function only(key: DeviceKey, el: Element): Sources {
  return [{ key: "all", el }, ...(key === "all" ? [] : [{ key, el }])] as Sources;
}

/* ---- style composition --------------------------------------------------- */

/**
 * The mockup's own declarations, plus the layout-engine props PageFly needs to
 * leave them alone.
 */
/* ==========================================================================
   VERBATIM MODE — for a page whose CSS is already complete.

   Everything below was written for the React mockup, whose elements carry a few
   inline declarations and nothing else: no `display`, no `flex-flow`, no gaps.
   So `cssFor` supplies them, from what the browser laid out, and forces them
   with `!important` because silence in PageFly means PageFly's default rather
   than the browser's.

   A page the build model wrote as HTML, flattened through `flatten.ts`, arrives
   with the opposite problem. Its declarations are the FULL computed set — the
   whole `@media` cascade already resolved at the width it was measured at — and
   the rules this function adds do not supplement them, they overrule them.
   Measured on the first real page: `display: grid` dropped and `display: flex
   !important; flex-flow: row nowrap !important` written over it, on every
   container. The page came out 31,026px tall against the mockup's 16,720, with
   the hero headline 7,697px down a page where it belongs at 500.

   In verbatim mode the copied CSS is the last word and this function adds only
   what PageFly cannot infer: the `--pf-flex-layout-*` variables the editor
   reads to show Fill/Hug correctly, and the min-width floor. Grid survives —
   `styles[]` is plain CSS and the browser renders it whatever the editor's
   layout panel makes of it.
   ========================================================================== */
/** Tags whose layout comes from what they ARE, not from what CSS says about
    them. `<button>` is absent deliberately: it is an inline-block box and a
    FlexBlock carrying the same declarations reproduces it exactly, while a
    Custom.HTML would take a real, editable call-to-action out of the editor. */
/** The wrapper of a pass-through, reduced to nothing that can be applied
    twice.

    Everything it might copy — padding, background, border, type, margins,
    width, and `display` above all — is on the element inside it too, and a
    declaration made in both places is made twice: the size chart wrapped in its
    own `display: table` shrank to its content and moved 407px, the sign-up form
    wrapped in its own centring margin moved 180px, and even the flex-child
    properties shifted 34 leaves by 11-30px each.

    So it states only that it is a block filling its parent, and lets the markup
    inside do the rest. */
const PASS_THROUGH: StyleData = {
  all: {
    "&":
      "display: block !important; width: 100%; max-width: 100%;" +
      /* THE ONE THING A PASS-THROUGH CANNOT DO IS REFLOW. `data.code` is the
         DESKTOP markup with the desktop measurements baked into it, and there
         is no per-breakpoint form of it — so a size chart that is 1,220px wide
         on a laptop is still 1,220px wide on a phone. Left alone it does not
         merely look wrong: it makes the whole PAGE 1,352px wide at a 390px
         viewport, and every section slides sideways under a horizontal
         scrollbar.

         Scrolling it inside its own box is what the mockup does with the same
         tables (`.tbl-wrap{overflow-x:auto}`), so this is the source's own
         answer rather than a new invention. */
      " overflow-x: auto; --pf-flex-layout-width: fill;",
  },
};

const TAG_SEMANTIC = new Set(["TABLE", "UL", "OL", "FORM", "SELECT", "DL"]);

let verbatim = false;

/** Turn verbatim mode on for the next conversion. Off is the behaviour every
    caller had before this existed. */
export function setVerbatimStyles(on: boolean): void {
  verbatim = on;
}

function cssFor(el: Element, parent: ParentLayout | null): string {
  /* Grid and its properties are dropped: the Flex editor has no grid, so
     `display: grid` and `grid-template-columns` are dead weight that also stop
     the explicit flex rules below from being the last word. */
  const all = decl(el);
  const d = verbatim
    ? all
    : all.filter(
        ([p, v]) => !p.startsWith("grid-") && !(p === "display" && v.includes("grid")),
      );

  const body = d
    .map(([p, v]) =>
      LAYOUT_PROPS.has(p) && !v.includes("!important")
        ? `${p}: ${v} !important;`
        : `${p}: ${v};`,
    )
    .join(" ");

  const layout = readLayout(el);
  const hasKids = elementChildren(el).length > 0;

  /* Stated for every container, because silence means "PageFly's default" rather
     than "the browser's default", and those differ. */
  const own: string[] = [];
  if (hasKids && !verbatim) {
    own.push("display: flex !important;");
    own.push(
      layout.dir === "vertical"
        ? "flex-flow: column nowrap !important;"
        : layout.dir === "wrap"
          ? "flex-flow: row wrap !important;"
          : "flex-flow: row nowrap !important;",
    );
    if (layout.rowGap || layout.columnGap)
      own.push(`gap: ${layout.rowGap}px ${layout.columnGap}px !important;`);
  }

  /* Only a translated GRID hands its children a width. A grid's columns really are
     equal, so an equal basis reproduces it. A flex row's children are not — they
     size themselves — and forcing a basis on them is how a headline ended up one
     character wide. */
  if (parent && parent.columns > 1 && !verbatim) {
    const gaps = parent.gapPx * (parent.columns - 1);
    own.push(
      `flex: 0 0 calc((100% - ${gaps}px) / ${parent.columns}) !important;`,
      "min-width: 0 !important;",
    );
  }

  /* The floor, stated on the element rather than in the page stylesheet. The
     engine gives a text element a min-width from its own sizing model, and on a
     flex child that breaks the line per character; this path's containers
     already carry the real widths measured off the mockup, so a zero here costs
     nothing and stops the engine's floor being applied instead. In `customCSS`
     — where it lived — it never reached the editor canvas at all. */
  if (!/(^|[;\s])min-width\s*:/.test(body)) own.push("min-width: 0;");

  const tail = [
    `--pf-flex-layout-width: ${widthMode(el, d)};`,
    `--pf-flex-layout-height: ${heightMode(d)};`,
    hasKids ? `--pf-flex-layout-direction: ${layout.dir};` : "",
    parent ? `--pf-flex-layout-parent-direction: ${parent.dir};` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `${body} ${own.join(" ")} ${tail}`.trim();
}

/** What this element imposes on its children. */
function layoutFor(el: Element): ParentLayout {
  const l = readLayout(el);
  return {
    dir: l.dir,
    columns: l.isGrid ? l.columns : 1,
    gapPx: Math.max(l.rowGap, l.columnGap),
  };
}

/**
 * One element's CSS across every breakpoint it appears at.
 *
 * `all` is the desktop render and the base. A narrower breakpoint is written only
 * when its CSS actually differs, and it is written in FULL rather than as a diff:
 * a narrower key overrides the properties it names but does not reset the ones it
 * omits, so a partial rule would leave desktop values leaking through wherever a
 * property exists on desktop and not on mobile.
 */
function styleOfAll(sources: Sources, parent: ParentLayout | null): StyleData {
  const base = cssFor(sources[0].el, parent);
  const out: Record<string, Record<string, string>> = { all: { "&": base } };

  for (const s of sources.slice(1)) {
    if (!s.el) continue;
    const css = cssFor(s.el, parent);
    if (css !== base) out[s.key] = { "&": css };
  }
  return verbatim ? evenOut(out, sources) : out;
}

/* ==========================================================================
   EVERY BREAKPOINT STATES WHAT ANY BREAKPOINT STATES.

   Breakpoint CSS is an override, not a replacement: a property written at `all`
   and left out of `mobile` still applies on a phone. So the four sets have to
   agree about WHICH properties exist, and `flatten`'s probe does not guarantee
   that — it cancels a value the element merely inherited, and whether a value
   counts as inherited can itself change with the width. Measured: the hero
   headline kept `font-size` at 1440 and 860 and lost it at 390, so a 95px
   headline rendered on a 390px screen and ran off the side.

   This fills the holes rather than widening the sets: for every property some
   breakpoint states, each of the others gets ITS OWN measured value, read from
   the full set `flatten` left on the element. Nothing is invented and nothing
   is copied across widths.
   ========================================================================== */
function evenOut(
  out: Record<string, Record<string, string>>,
  sources: Sources,
): StyleData {
  const keys = Object.keys(out);
  if (keys.length < 2) return out as StyleData;

  const parsed = new Map<string, Map<string, string>>();
  for (const k of keys) parsed.set(k, new Map(declarations(out[k]["&"])));

  const union = new Set<string>();
  for (const m of parsed.values()) for (const p of m.keys()) union.add(p);

  const fullOf = (key: string): Map<string, string> => {
    const el = key === "all" ? sources[0].el : sources.find((s) => s.key === key)?.el;
    return new Map(declarations(el?.getAttribute("data-pf-full") ?? ""));
  };

  const fixed: Record<string, Record<string, string>> = {};
  for (const k of keys) {
    const mine = parsed.get(k)!;
    const missing = [...union].filter((p) => !mine.has(p));
    if (missing.length === 0) {
      fixed[k] = out[k];
      continue;
    }
    const full = fullOf(k);
    const add = missing
      .map((p) => [p, full.get(p)] as const)
      .filter(([, v]) => v !== undefined)
      .map(([p, v]) =>
        LAYOUT_PROPS.has(p) && !v!.includes("!important")
          ? `${p}: ${v} !important;`
          : `${p}: ${v};`,
      );
    fixed[k] = { "&": `${out[k]["&"]} ${add.join(" ")}`.trim() };
  }
  return fixed as StyleData;
}

/** Kept for the single-breakpoint paths (drawn artwork, loose text). */
function styleOf(el: Element, parent: ParentLayout | null): StyleData {
  const d = decl(el);
  if (d.length === 0 && parent === null) return null;
  return { all: { "&": cssFor(el, parent) } };
}

/** True when the subtree is pure imagery — MockImage sets aspect-ratio and
    paints with gradients + an inline SVG. Emitting the whole thing as one
    Custom.HTML reproduces it byte-for-byte instead of approximating it. */
function isDrawnArtwork(el: Element): boolean {
  const css = el.getAttribute("style") ?? "";
  if (!css.includes("aspect-ratio")) return false;
  return (el.textContent ?? "").trim().length === 0;
}

function elementChildren(el: Element): Element[] {
  return Array.from(el.children).filter((c) => !SKIP_TAGS.has(c.tagName));
}

/** An inline tag is only really part of a text run when nothing about it says
    "I am my own element". Getting this wrong in the greedy direction is worse
    than the bug it fixes: `Btn` renders a <span>, so a container holding
    "Add to cart" and "Buy it now" collapsed into ONE paragraph and both buttons
    stopped being buttons. */
function isInlineRun(c: Element): boolean {
  if (!INLINE_TAGS.has(c.tagName)) return false;
  // A semantic element anywhere inside has to be reached by the walk.
  if (c.hasAttribute("data-pf") || c.querySelector("[data-pf]")) return false;
  if (isDrawnArtwork(c) || c.querySelector("svg,img")) return false;
  // An inline tag laid out as a box (inline-flex, flex, block) is a chip or a
  // button, not a phrase.
  const display = lookup(decl(c), "display");
  if (display && display.trim() !== "inline") return false;
  return true;
}

/** All element children inline and no artwork among them → the element is a
    single run of text and `innerHTML` reproduces it exactly. */
function isTextRun(el: Element, kids: Element[]): boolean {
  if ((el.textContent ?? "").trim().length === 0) return false;
  return kids.every(isInlineRun);
}

/** Liquid tokens are eaten by Shopify on publish; the builder rejects them.
    Mockup copy never contains them, but an uploaded reference could. */
function liquidSafe(html: string): string {
  return html.replace(/\{\{/g, "{​{").replace(/\{%/g, "{​%");
}

/** A bare text node sitting beside block-level siblings. Inherits everything so
    it reads as part of its parent rather than as a Paragraph4 with defaults. */
function looseText(text: string): PFNode {
  return P4(liquidSafe(text), {
    all: {
      "&": "font: inherit; color: inherit; letter-spacing: inherit; margin: 0px;",
    },
  });
}

/* ==========================================================================
   Semantic elements.

   The DOM walk on its own can only ever produce containers and text, because
   the mockup markup has no <button>, no <a> and no <details> — everything is a
   styled div. So "Add to cart" was indistinguishable from a paragraph, which is
   why an imported page was all FlexBlock and Paragraph4.

   The signal has to come from the source, so the mockup primitives now carry a
   `data-pf` attribute. It changes no pixel of the mockup and is the only thing
   these mappers key off.

   The tradeoff is deliberate and was chosen explicitly: a ProductBox binds to a
   real Shopify product, so its title, price, swatches and Add-to-cart WORK —
   but they show the merchant's product rather than the mockup's invented one,
   and their internal slots are PageFly's, not ours. Static elements (Button2,
   Accordion3) keep the mockup's own copy and CSS, so they cost no fidelity.
   ========================================================================== */

/** Drops `display: none` so a body the mockup had collapsed still renders once
    the imported accordion opens it. */
function unhide(style: StyleData): StyleData {
  const css = style?.all?.["&"];
  if (!css) return style;
  const kept = declarations(css).filter(
    ([p, v]) => !(p === "display" && v.replace("!important", "").trim() === "none"),
  );
  return {
    ...style,
    all: {
      ...style!.all,
      "&": kept
        .map(([p, v]) =>
          LAYOUT_PROPS.has(p) && !v.includes("!important")
            ? `${p}: ${v} !important;`
            : `${p}: ${v};`,
        )
        .join(" "),
    },
  };
}

function pfRole(el: Element): string {
  return el.getAttribute("data-pf") ?? "";
}

function findRole(el: Element, role: string): Element | null {
  return el.querySelector(`[data-pf="${role}"]`);
}

/** A styled div wrapping one product element, so the mockup's own spacing and
    borders survive around an element whose internals PageFly owns. */
function shell(sources: Sources, parent: ParentLayout | null, inner: PFNode): PFNode {
  return FB(styleOfAll(sources, parent), [inner]);
}

function productBox(sources: Sources, parent: ParentLayout | null): PFNode | null {
  const el = sources[0].el;
  /* Locate the same part in every render, by role. These are fixed-slot elements
     whose internals PageFly owns, so only their CSS varies by width. */
  const part = (role: string): Sources | null => {
    const found = findRole(el, role);
    if (!found) return null;
    return [
      { key: "all", el: found },
      ...sources.slice(1).map((s) => ({
        key: s.key,
        el: s.el ? findRole(s.el, role) : null,
      })),
    ] as Sources;
  };
  const mediaEl = findRole(el, "product-media");
  const infoEl = findRole(el, "product-info");
  if (!mediaEl || !infoEl) return null;

  const mainEl = findRole(mediaEl, "product-media-main");
  const listEl = findRole(mediaEl, "product-media-list");
  if (!mainEl || !listEl) return null;

  const media = PRODUCT_MEDIA(
    MEDIA_MAIN(styleOfAll(part("product-media-main")!, STACK)),
    MEDIA_LIST(
      elementChildren(listEl).length,
      styleOfAll(part("product-media-list")!, STACK),
      null,
    ),
    part("product-media") ? styleOfAll(part("product-media")!, parent) : null,
  );

  /* The info column is ProductBox's second required slot and has to be a plain
     FlexBlock, so it is walked normally — every product element inside it is
     picked up by `convert` on the way down. */
  const infoSources = part("product-info")!;
  const info = FB(
    styleOfAll(infoSources, parent),
    walkChildren(infoSources, layoutFor(infoEl)),
  );

  /* ProductBox renders a <form>, so the grid that lays the two columns out has
     to be applied to `& > form`. Styling `&` leaves the form at its default
     width and the two columns stack. */
  const own = styleOfAll(sources, parent);
  return PRODUCT_BOX(media, info, own?.all?.["&"] ?? "");
}

function accordion(sources: Sources, parent: ParentLayout | null): PFNode | null {
  const el = sources[0].el;
  /* Rows are matched across renders by their index: the row list is generated
     from the same data at every width, so the nth row is the nth row. */
  const rowsAt = (key: DeviceKey): Element[] => {
    const src = sources.find((x) => x.key === key)?.el ?? null;
    return src ? Array.from(src.querySelectorAll('[data-pf="accordion-row"]')) : [];
  };
  const rowPart = (i: number, role: string): Sources | null => {
    const found = findRole(rowEls[i], role);
    if (!found) return null;
    return [
      { key: "all", el: found },
      ...sources.slice(1).map((s) => {
        const row = rowsAt(s.key)[i] ?? null;
        return { key: s.key, el: row ? findRole(row, role) : null };
      }),
    ] as Sources;
  };
  const rowEls = Array.from(el.querySelectorAll('[data-pf="accordion-row"]'));
  if (rowEls.length === 0) return null;

  const rows = rowEls.map((row, i) => {
    const headEl = findRole(row, "accordion-header");
    const bodyEl = findRole(row, "accordion-body");
    const headSources = rowPart(i, "accordion-header");
    /* The question goes in `label`. Emitted as children it vanished: the
       editor reads the header's own field and shows nothing else. */
    const header = ACCORDION_HEADER(
      (headEl?.textContent ?? "").replace(/\s+/g, " ").trim(),
      headSources ? styleOfAll(headSources, STACK) : null,
    );
    /* Real content MUST land in Accordion3.Flex.Content — the builder nests the
       four tiers. A row whose answer is collapsed in the mockup still gets its
       body, because in the editor every row can be opened. */
    /* The mockup hides the closed answers with display:none — laid out
       identically to not rendering them, so the picture is unchanged, but the
       DOM carries every answer. Strip that hiding here: in the editor every row
       can be opened, and Accordion3 does the showing itself. */
    const bodySources = rowPart(i, "accordion-body");
    const body = bodySources
      ? [P4(liquidSafe(bodyEl!.innerHTML), unhide(styleOfAll(bodySources, STACK)))]
      : [];
    /* The mockup puts each row's padding on a container between the row and its
       header; without it the imported accordion loses all its inner spacing. */
    const padEl = headEl?.parentElement ?? null;
    return {
      header,
      body,
      style: padEl && padEl !== row ? styleOf(padEl, STACK) : null,
    };
  });

  return ACCORDION(rows, styleOfAll(sources, parent));
}

function semantic(sources: Sources, parent: ParentLayout | null): PFNode | null {
  const el = sources[0].el;

  /* The same element, located in the other renders, so a semantic node still gets
     per-breakpoint CSS. Structure comes from desktop: these are fixed-slot
     elements whose internals PageFly owns, so they do not reshape by width. */
  const sub = (found: Element | null): Sources =>
    [
      { key: "all", el: found ?? el },
      ...sources.slice(1).map((s) => ({
        key: s.key,
        el: s.el && found ? s.el.querySelector(`[data-pf="${found.getAttribute("data-pf")}"]`) : s.el,
      })),
    ] as Sources;

  switch (pfRole(el)) {
    case "button":
      // Keeps the mockup's own label and CSS — a real button, same pixels.
      return BTN(liquidSafe(el.innerHTML), "", styleOfAll(sources, parent));
    case "product-box":
      return productBox(sources, parent);
    case "accordion":
      return accordion(sources, parent);
    case "product-title":
      return PRODUCT_TITLE(styleOfAll(sources, parent));
    case "product-price": {
      const main = findRole(el, "product-price-main");
      const compare = findRole(el, "product-price-compare");
      return shell(
        sources,
        parent,
        PRODUCT_PRICE(
          null,
          main ? styleOfAll(sub(main), ROW) : null,
          /* Both items are required. When the mockup has no compare-at price the
             second slot is hidden rather than dropped — a one-child
             ProductPrice2 renders empty. */
          compare
            ? styleOfAll(sub(compare), ROW)
            : { all: { "&": "display: none !important;" } },
        ),
      );
    }
    case "product-swatches": {
      const label = findRole(el, "product-swatch-label");
      const options = findRole(el, "product-swatch-options");
      return shell(
        sources,
        parent,
        PRODUCT_SWATCHES(
          null,
          label ? styleOfAll(sub(label), STACK) : null,
          options ? styleOfAll(sub(options), STACK) : null,
        ),
      );
    }
    case "product-atc":
      /* The mockup's own label, not PageFly's default "Add to Cart". */
      return PRODUCT_ATC(
        styleOfAll(sources, parent),
        (el.textContent ?? "").trim(),
      );
    default:
      return null;
  }
}

/**
 * Children, merged across breakpoints.
 *
 * Desktop supplies the order and the structure. Each other device is aligned to it
 * by signature; a desktop child the device does not render is hidden there, and a
 * child only that device renders is inserted in place and hidden everywhere else.
 * That is what makes the export a responsive page rather than a desktop snapshot
 * with the widths rewritten.
 */
function walkChildren(sources: Sources, dir: ParentLayout | null): PFNode[] {
  const desktop = sources[0].el;
  const kids = elementChildren(desktop);

  const alignments = new Map<DeviceKey, Map<number, Element>>();
  const extras = new Map<number, { key: DeviceKey; el: Element }[]>();

  for (const s of sources.slice(1)) {
    if (!s.el) continue;
    const { pairs, extra } = align(kids, elementChildren(s.el));
    alignments.set(s.key, pairs);
    for (const e of extra) {
      const list = extras.get(e.after) ?? [];
      list.push({ key: s.key, el: e.el });
      extras.set(e.after, list);
    }
  }

  const out: PFNode[] = [];

  const emitExtras = (after: number) => {
    for (const e of extras.get(after) ?? []) {
      const node = convert(only(e.key, e.el), dir);
      if (node) out.push(onlyOn(node, [e.key]));
    }
  };

  emitExtras(-1);

  /* Bare text nodes are read from desktop only. They carry no per-breakpoint
     styling of their own — whatever differs sits on the parent. */
  let index = 0;
  for (const child of Array.from(desktop.childNodes)) {
    if (child.nodeType === 3) {
      const t = (child.nodeValue ?? "").trim();
      if (t) out.push(looseText(t));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    if (SKIP_TAGS.has(el.tagName)) continue;

    const childAt = childSources(sources, index, alignments);
    const node = convert(childAt, dir);
    if (node) {
      const present = presentOn(childAt);
      if (present.length < sources.length) onlyOn(node, present);
      out.push(node);
    }
    emitExtras(index);
    index++;
  }

  return out;
}

function convert(sources: Sources, parent: ParentLayout | null): PFNode | null {
  const el = sources[0].el;
  if (SKIP_TAGS.has(el.tagName)) return null;

  /* Semantic elements come first — a tagged node must not be reduced to a
     FlexBlock by the generic rules below. A mapper returning null (a tag whose
     expected inner parts are missing) falls through to the generic walk rather
     than dropping the subtree. */
  if (pfRole(el)) {
    const mapped = semantic(sources, parent);
    if (mapped) return mapped;
  }

  /* ==========================================================================
     TAG-SEMANTIC SUBTREES GO THROUGH WHOLE.

     A table does not lay out because of its CSS; it lays out because it is a
     table. The same is true of a list's markers and a form's controls. Walked
     into FlexBlocks they keep every declaration and lose the thing that made
     them work — measured on the first real page, the size chart's cells landed
     434px left of where they belong and 122px too narrow, every one of them.

     So in verbatim mode these arrive as `Custom.HTML`, markup intact. The cost
     is that PageFly cannot edit inside them, which is the honest trade: a table
     that renders correctly and cannot be restyled beats a table of forty loose
     boxes that can. Everything around them stays real PageFly elements.

     Only in verbatim mode. The React mockup builds its tables out of divs and
     has no forms, so this would change nothing there but the risk. */
  if (verbatim && TAG_SEMANTIC.has(el.tagName)) {
    /* A PLAIN WRAPPER, not the element's own style.

       `styleOfAll` would give the wrapper the declarations of the thing inside
       it, and the thing inside it is already carrying them — the markup went
       through flattened. A `<table>` wrapped in a `display: table` div becomes
       a table inside a table: the outer one shrinks to its content and the
       whole block moves. Measured, the size chart landed 407px left and 119px
       narrow with every cell in it.

       The wrapper exists only to occupy the parent's flow, so that is all it
       states. */
    /* THE WRAPPER KEEPS EVERYTHING BUT `display`.

       Blanking it entirely was too much: the sign-up form lost the box that
       centred it and went 180px left, taking the footer 91px down with it. The
       wrapper still has to sit in its parent's flow the way the element did —
       its margins, its basis, its alignment.

       Only `display` is wrong to copy, and only for the tag that carries its
       layout in it: a `display: table` div wrapping a `<table>` makes a table
       inside a table, and the outer one shrinks to its content. */
    return CUSTOM_HTML(liquidSafe(el.outerHTML), PASS_THROUGH);
  }

  /* Whole drawn-artwork subtrees go through verbatim.

     NOT IN VERBATIM MODE. `isDrawnArtwork` asks whether the inline style states
     an `aspect-ratio` and the subtree holds no text — a sound test for the
     React mockup, where only `MockImage` writes that inline. Flattened, EVERY
     element carries its computed `aspect-ratio`, so the test matches every
     image frame on the page and freezes each one as desktop markup. `data.code`
     has no per-breakpoint form, so those frames kept their 1440px boxes at
     390px: the atelier section came out 2,191px too tall and the proof section
     2,574px, which between them is most of a 50% overrun.

     Drawn artwork keeps DESKTOP's markup. `data.code` has no per-breakpoint
     form, so the SVG cannot vary; what does vary is its box, and that is CSS. */
  if (!verbatim && isDrawnArtwork(el)) {
    return CUSTOM_HTML(
      liquidSafe(el.outerHTML),
      verbatim ? PASS_THROUGH : styleOfAll(sources, parent),
    );
  }

  if (el.tagName === "SVG" || el.tagName === "svg") {
    return CUSTOM_HTML(
      liquidSafe(el.outerHTML),
      verbatim ? PASS_THROUGH : styleOfAll(sources, parent),
    );
  }

  if (el.tagName === "IMG") {
    const src = el.getAttribute("src") ?? "";
    return IMG(src, styleOfAll(sources, parent));
  }

  const kids = elementChildren(el);
  const text = (el.textContent ?? "").trim();

  /* Headings, paragraphs and any element that is really one run of text become
     real PageFly text elements so they stay editable. innerHTML rather than
     textContent — the hero colours exactly one word with a nested span, and
     Stars puts the filled and unfilled halves in different colours. */
  if (text && (TEXT_TAGS.has(el.tagName) || isTextRun(el, kids))) {
    const value = liquidSafe(el.innerHTML);
    const style = styleOfAll(sources, parent);
    return TEXT_TAGS.has(el.tagName) && el.tagName !== "P"
      ? H2(value, style)
      : P4(value, style);
  }

  /* CSS-only decoration: a divider, rail or dot. As a childless FlexBlock the
     editor covers it with a "Drop element here" placeholder.

     THE STYLE GOES ON ONE OF THE TWO, NOT BOTH. `data.code` is the element's
     own `outerHTML`, which in verbatim mode is carrying its full flattened
     style already — so giving the wrapper the same declarations paints
     everything twice. Invisible on a photograph, since one copy covers the
     other exactly; not invisible on a translucent one. The hero's scrim is
     `rgba(18,16,12,.74)` at the top, and two of them made the headline
     underneath it almost unreadable. */
  if (kids.length === 0 && !text) {
    /* AN EMPTY BOX IS CSS, SO IT STAYS CSS.

       Wrapping it as `Custom.HTML` keeps the editor from stamping a "Drop
       element here" placeholder on it, which is why it was done — and it freezes
       the DESKTOP markup, because `data.code` has no per-breakpoint form. For a
       drawn SVG that is the right trade. For a box whose whole appearance is a
       background and a border it is the wrong one: the hero's photograph layer
       and the page's rules kept their 1,440px and 1,320px widths at a 390px
       viewport and made the page itself 1,352px wide.

       As a FlexBlock the same box carries four breakpoints of CSS and reflows.
       The placeholder is a cosmetic cost in the editor; a page that scrolls
       sideways on a phone is not cosmetic. */
    if (verbatim) return FB(styleOfAll(sources, parent), []);
    return CUSTOM_HTML(liquidSafe(el.outerHTML), styleOfAll(sources, parent));
  }

  return FB(styleOfAll(sources, parent), walkChildren(sources, layoutFor(el)));
}

/* ==========================================================================
   Page assembly.
   ========================================================================== */

/** Page-level CSS. Two jobs: stop the host theme's base styles from reaching
    the imported tree, and pin the section to the width the mockup was laid out
    at so nothing re-wraps. Scoped to the page — it does not touch the theme. */
function pageCss(): string {
  return [
    /* First, because @import is only valid before any other rule. This is what
       makes the exported page use the same faces the mockup did: the store has no
       reason to have Plus Jakarta Sans, Nunito or Archivo Narrow installed, and
       without loading them every heading falls back to whatever the theme's system
       stack resolves to — which is exactly how an import came back in the wrong
       font. customCSS survives import and runs on preview and live. */
    `@import url("${WEBFONT_CSS_URL}");`,
    `/* PageFly Design export — keeps the imported page matching its mockup. */`,
    `#__pf, #__pf * { box-sizing: border-box; }`,
    `#__pf p, #__pf h1, #__pf h2,`,
    `#__pf h3, #__pf h4 { margin: 0; }`,
    `#__pf ul, #__pf ol { margin: 0; padding: 0; list-style: none; }`,
    `#__pf a { color: inherit; text-decoration: none; }`,
    `#__pf img, #__pf svg { display: block; max-width: 100%; }`,
    /* NOTHING THAT DECIDES A LAYOUT BELONGS IN THIS FILE — the same rule the
       tree path now keeps, and for the same reason. The floor that stops the
       engine breaking a line per character, and the cap that gives the page a
       width at all, were both here and both are now written onto the elements
       in `cssFor` and `pageFromBreakpoints`. `customCSS` runs on preview and
       live and NOT in the editor canvas, so a layout guarantee written here is
       missing from the first place the merchant sees the page. */
  ].join("\n");
}

/** Exposed for tests: the page stylesheet this path ships. The rest of the file
    needs a laid-out DOM and cannot be reached from Node — see `test-export.ts`. */
export const __pageCssForTest = pageCss;

export type BuiltPage = { blob: Blob; filename: string };

/** One rendered mockup, per breakpoint. All four must be laid out and attached:
    the layout custom properties are measured, and a detached clone measures 0. */
export type Rendered = { key: DeviceKey; root: HTMLElement };

/**
 * Convert the rendered mockup into a .pagefly import file.
 *
 * Every breakpoint the mockup supports is walked, not just desktop. Exporting one
 * width produced a page that only looked right on a desktop: the mockup genuinely
 * reshapes below 834px — different CSS on about a third of its nodes, and a
 * handful of elements that appear or disappear — and none of that reached the
 * file. Now the desktop render supplies the structure, each narrower render
 * contributes its own `styleData` key where it differs, and elements that exist at
 * only some widths carry the matching `hideOn…` flags.
 */
export function pageFromBreakpoints(
  renders: Rendered[],
  page: PageMockup,
  width: number,
): BuiltPage {
  const desktop = renders.find((r) => r.key === "all");
  if (!desktop) throw new Error("The desktop render is required");

  /* THE ONLY child, not the first one.
     
     The React mockup renders one surface div inside the stage, so "unwrap one
     level" and "take the first child" were the same instruction and the cheaper
     one was written. A page the build model wrote as HTML has a body with five
     children — header, main, three more — and taking the first exported the
     header alone: 21 elements for a ten-section page, the other four silently
     gone. Unwrap only when there is genuinely one wrapper to unwrap. */
  const innerOf = (root: HTMLElement) =>
    root.children.length === 1
      ? ((root.firstElementChild as HTMLElement | null) ?? root)
      : root;

  const roots: Sources = [
    { key: "all", el: innerOf(desktop.root) },
    ...renders
      .filter((r) => r.key !== "all")
      .map((r) => ({ key: r.key, el: innerOf(r.root) as Element | null })),
  ] as Sources;

  const children = walkChildren(roots, STACK);

  if (children.length === 0)
    throw new Error("Nothing to export — the mockup rendered empty");

  /* One FlexSection wrapping the page, carrying the mockup's own background so
     the area outside the content column matches too. */
  /* THE WRAPPER MATCHES WHAT IT WRAPS.

     A flex column with `align-items: stretch` is right for the React mockup,
     whose surface is exactly that. It is wrong for a document: a body is a
     block, adjacent block margins COLLAPSE inside one and do not inside a flex
     container, so every collapsed margin in the source became a real gap in the
     export and the error accumulated down the page. Measured: 26 of 198 leaves
     within 2px of where they belong, with a spread of −224 to +271 while their
     own heights were right to the pixel.

     The width cap goes for the same reason. The mockup's own sections decide
     where the page is full-bleed and where it caps; imposing 1440px over the
     top of that turns every full-bleed band into a centred column. */
  const wrapper = FB(
    {
      all: {
        "&": verbatim
          ? `display: block; width: 100%;` +
            ` background-color: ${page.tokens.bg}; color: ${page.tokens.ink};` +
            ` font-family: ${page.tokens.fontBody};` +
            ` --pf-flex-layout-width: fill; --pf-flex-layout-height: hug;` +
            ` --pf-flex-layout-direction: vertical;`
          : `display: flex !important; flex-flow: column !important;` +
          ` align-items: stretch !important; width: 100% !important;` +
          /* The cap, on the block rather than in the stylesheet. `width: 100%`
             was already here and the `max-width` that bounds it was not — it was
             the `#__pf` rule in `customCSS`, which the editor canvas
             does not read, so the imported page ran the full width of the screen
             there and the merchant's first look was the wrong measure. */
          ` max-width: ${width}px !important; margin-left: auto; margin-right: auto;` +
          ` background-color: ${page.tokens.bg}; color: ${page.tokens.ink};` +
          ` font-family: ${page.tokens.fontBody};` +
          ` --pf-flex-layout-width: fill; --pf-flex-layout-height: hug;` +
          ` --pf-flex-layout-direction: vertical;`,
      },
    },
    children,
    "pf-design-export",
  );

  const section = FSECTION([wrapper], {
    all: {
      "&": `padding: 0px; background-color: ${page.tokens.bg};`,
    },
  });

  const name = fileStem(page);
  const doc = new Page({
    name,
    customCSS: pageCss(),
  });
  doc.addSection(section);

  return { blob: doc.toBlob(), filename: `${name}.pagefly` };
}

export function fileStem(page: PageMockup): string {
  const base = page.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const copy =
    page.copyTotal && page.copyTotal > 1 ? `-${page.copyIndex}` : "";
  return `${base}${copy}`;
}
