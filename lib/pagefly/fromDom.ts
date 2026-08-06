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

   WHAT THIS STILL CANNOT GUARANTEE — see README:
   fonts resolve per-machine, the Shopify theme injects its own base styles,
   and PageFly's container width is not the mockup's. The page-level reset in
   `pageCss()` neutralises as much of that as CSS can reach.
   ========================================================================== */

const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

function styleOf(el: Element): StyleData {
  const css = el.getAttribute("style");
  return css ? { all: { "&": css } } : null;
}

/** True when the subtree is pure imagery — MockImage sets aspect-ratio and
    paints with gradients + an inline SVG. Emitting the whole thing as one
    Custom.HTML reproduces it byte-for-byte instead of approximating it. */
function isDrawnArtwork(el: Element): boolean {
  const css = el.getAttribute("style") ?? "";
  if (!css.includes("aspect-ratio")) return false;
  return (el.textContent ?? "").trim().length === 0;
}

function hasElementChildren(el: Element): boolean {
  for (const c of Array.from(el.children)) {
    if (!SKIP_TAGS.has(c.tagName)) return true;
  }
  return false;
}

/** Liquid tokens are eaten by Shopify on publish; the builder rejects them.
    Mockup copy never contains them, but an uploaded reference could. */
function liquidSafe(html: string): string {
  return html.replace(/\{\{/g, "{​{").replace(/\{%/g, "{​%");
}

function convert(el: Element): PFNode | null {
  if (SKIP_TAGS.has(el.tagName)) return null;

  // Whole drawn-artwork subtrees go through verbatim.
  if (isDrawnArtwork(el)) {
    return CUSTOM_HTML(liquidSafe(el.outerHTML), styleOf(el));
  }

  if (el.tagName === "SVG" || el.tagName === "svg") {
    return CUSTOM_HTML(liquidSafe(el.outerHTML), styleOf(el));
  }

  if (el.tagName === "IMG") {
    const src = el.getAttribute("src") ?? "";
    return IMG(src, styleOf(el));
  }

  const kids = Array.from(el.children)
    .map(convert)
    .filter((n): n is PFNode => n !== null);

  const text = (el.textContent ?? "").trim();

  /* Headings and paragraphs become real PageFly text elements so they stay
     editable in the editor. innerHTML rather than textContent, because the hero
     colours exactly one word with a nested span — textContent would flatten it
     back to a single colour. */
  if (TEXT_TAGS.has(el.tagName) && text) {
    const value = liquidSafe(el.innerHTML);
    return el.tagName === "P"
      ? P4(value, styleOf(el))
      : H2(value, styleOf(el));
  }

  // A leaf carrying only text is a text element regardless of its tag.
  if (!hasElementChildren(el) && text) {
    return P4(liquidSafe(el.innerHTML), styleOf(el));
  }

  return FB(styleOf(el), kids);
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

  const children = Array.from(inner.children)
    .map(convert)
    .filter((n): n is PFNode => n !== null);

  if (children.length === 0)
    throw new Error("Nothing to export — the mockup rendered empty");

  /* One FlexSection wrapping the page, carrying the mockup's own background so
     the area outside the content column matches too. */
  const wrapper = FB(
    {
      all: {
        "&":
          `display: flex; flex-flow: column; align-items: stretch; width: 100%;` +
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
