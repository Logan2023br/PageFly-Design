"use client";

import {
  CUSTOM_HTML,
  FB,
  FSECTION,
  H2,
  IMG,
  P4,
  Page,
  type PFNode,
  type StyleData,
} from "./builder";
import type { PageMockup } from "../generate/types";

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

/** The element's own flex direction, for its children to mirror. */
function directionOf(d: [string, string][]): Dir | null {
  const display = lookup(d, "display") ?? "";
  if (!display.includes("flex")) return null;
  const flow = `${lookup(d, "flex-flow") ?? ""} ${lookup(d, "flex-direction") ?? ""} ${
    lookup(d, "flex-wrap") ?? ""
  }`;
  if (flow.includes("wrap")) return "wrap";
  return flow.includes("column") ? "vertical" : "horizontal";
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

/* ---- style composition --------------------------------------------------- */

/**
 * The mockup's own declarations, plus the layout-engine props PageFly needs to
 * leave them alone.
 */
function styleOf(el: Element, parentDir: Dir | null): StyleData {
  const d = decl(el);
  if (d.length === 0 && parentDir === null) return null;

  const body = d
    .map(([p, v]) =>
      LAYOUT_PROPS.has(p) && !v.includes("!important")
        ? `${p}: ${v} !important;`
        : `${p}: ${v};`,
    )
    .join(" ");

  const own = directionOf(d);
  const tail = [
    `--pf-flex-layout-width: ${widthMode(el, d)};`,
    `--pf-flex-layout-height: ${heightMode(d)};`,
    own ? `--pf-flex-layout-direction: ${own};` : "",
    parentDir ? `--pf-flex-layout-parent-direction: ${parentDir};` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { all: { "&": `${body} ${tail}`.trim() } };
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

/** All element children inline and no artwork among them → the element is a
    single run of text and `innerHTML` reproduces it exactly. */
function isTextRun(el: Element, kids: Element[]): boolean {
  if ((el.textContent ?? "").trim().length === 0) return false;
  return kids.every(
    (c) => INLINE_TAGS.has(c.tagName) && !isDrawnArtwork(c) && !c.querySelector("svg,img"),
  );
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

function convert(el: Element, parentDir: Dir | null): PFNode | null {
  if (SKIP_TAGS.has(el.tagName)) return null;

  // Whole drawn-artwork subtrees go through verbatim.
  if (isDrawnArtwork(el)) {
    return CUSTOM_HTML(liquidSafe(el.outerHTML), styleOf(el, parentDir));
  }

  if (el.tagName === "SVG" || el.tagName === "svg") {
    return CUSTOM_HTML(liquidSafe(el.outerHTML), styleOf(el, parentDir));
  }

  if (el.tagName === "IMG") {
    const src = el.getAttribute("src") ?? "";
    return IMG(src, styleOf(el, parentDir));
  }

  const kids = elementChildren(el);
  const text = (el.textContent ?? "").trim();

  /* Headings, paragraphs and any element that is really one run of text become
     real PageFly text elements so they stay editable. innerHTML rather than
     textContent — the hero colours exactly one word with a nested span, and
     Stars puts the filled and unfilled halves in different colours. */
  if (text && (TEXT_TAGS.has(el.tagName) || isTextRun(el, kids))) {
    const value = liquidSafe(el.innerHTML);
    const style = styleOf(el, parentDir);
    return TEXT_TAGS.has(el.tagName) && el.tagName !== "P"
      ? H2(value, style)
      : P4(value, style);
  }

  /* CSS-only decoration: a divider, rail or dot. As a childless FlexBlock the
     editor covers it with a "Drop element here" placeholder. */
  if (kids.length === 0 && !text) {
    return CUSTOM_HTML(liquidSafe(el.outerHTML), styleOf(el, parentDir));
  }

  const dir = directionOf(decl(el));
  const out: PFNode[] = [];
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 1) {
      const n = convert(child as Element, dir);
      if (n) out.push(n);
    } else if (child.nodeType === 3) {
      // Bare text beside block siblings — dropped entirely before this fix.
      const t = (child.nodeValue ?? "").trim();
      if (t) out.push(looseText(t));
    }
  }

  return FB(styleOf(el, parentDir), out);
}

/* ==========================================================================
   Page assembly.
   ========================================================================== */

/** Page-level CSS. Two jobs: stop the host theme's base styles from reaching
    the imported tree, and pin the section to the width the mockup was laid out
    at so nothing re-wraps. Scoped to the page — it does not touch the theme. */
function pageCss(width: number): string {
  return [
    `/* PageFly Design export — keeps the imported page matching its mockup. */`,
    `.pf-design-export, .pf-design-export * { box-sizing: border-box; }`,
    `.pf-design-export p, .pf-design-export h1, .pf-design-export h2,`,
    `.pf-design-export h3, .pf-design-export h4 { margin: 0; }`,
    `.pf-design-export ul, .pf-design-export ol { margin: 0; padding: 0; list-style: none; }`,
    `.pf-design-export a { color: inherit; text-decoration: none; }`,
    `.pf-design-export img, .pf-design-export svg { display: block; max-width: 100%; }`,
    /* The engine gives text elements a min-width it computes from its own
       sizing model; when that lands on a flex child the line breaks per
       character. The mockup's containers already carry their real widths. */
    `.pf-design-export [data-pf-type] { min-width: 0; }`,
    `.pf-design-export { max-width: ${width}px; margin-left: auto; margin-right: auto; }`,
  ].join("\n");
}

export type BuiltPage = { blob: Blob; filename: string };

/**
 * Convert one rendered mockup into a .pagefly import file.
 *
 * `root` must be the element MockupPage rendered into, already laid out at
 * `width` — the same off-screen stage the PNG export uses.
 */
export function pageFromDom(
  root: HTMLElement,
  page: PageMockup,
  width: number,
): BuiltPage {
  const inner = (root.firstElementChild as HTMLElement | null) ?? root;

  const children = elementChildren(inner)
    .map((c) => convert(c, "vertical"))
    .filter((n): n is PFNode => n !== null);

  if (children.length === 0)
    throw new Error("Nothing to export — the mockup rendered empty");

  /* One FlexSection wrapping the page, carrying the mockup's own background so
     the area outside the content column matches too. */
  const wrapper = FB(
    {
      all: {
        "&":
          `display: flex !important; flex-flow: column !important;` +
          ` align-items: stretch !important; width: 100% !important;` +
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
    customCSS: pageCss(width),
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
