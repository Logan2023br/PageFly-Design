import {
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
  ACCORDION,
  ACCORDION_HEADER,
  Page,
  type DeviceKey,
  type PFNode,
  type StyleData,
} from "../pagefly/builder";
import { WEBFONT_CSS_URL } from "../styleTokens";
import { DEVICES, styleAt, type Device } from "./derive";
import type { Css, DesignNode, DesignSection, DesignTree } from "./schema";

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
function widthMode(node: DesignNode | DesignSection, css: Css): "hug" | "fill" | "fixed" {
  const w = css.width === undefined ? undefined : String(css.width);

  if (w === "fit-content" || w === "max-content" || w === "auto") return "hug";
  if (w === "100%") return "fill";
  if (w && /^-?\d/.test(w)) return "fixed";

  if (css.alignSelf === "stretch") return "fill";
  const flex = css.flex === undefined ? "" : String(css.flex);
  if (flex && !flex.startsWith("0")) return "fill";
  if (Number(css.flexGrow ?? 0) > 0) return "fill";

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

const HAS_KIDS = new Set(["section", "row", "col"]);

/** The full CSS for one node at one breakpoint, engine properties included. */
function cssAt(
  node: DesignNode | DesignSection,
  device: Device,
  parentDir: Dir | null,
): string {
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

  const tail = [
    `--pf-flex-layout-width: ${widthMode(node, css)};`,
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
  parentDir: Dir | null,
): StyleData {
  const base = cssAt(node, "all", parentDir);
  const out: Record<string, Record<string, string>> = { all: { "&": base } };

  for (const device of DEVICES) {
    if (device === "all") continue;
    const here = cssAt(node, device, parentDir);
    if (here !== base) out[device] = { "&": here };
  }

  return out;
}

/* ---- emit --------------------------------------------------------------- */

export type EmitOptions = {
  /** query → resolved photo URL */
  images?: Record<string, string>;
  /** icon name → raw <svg> markup; icons are dropped when this is absent */
  iconSvg?: (name: string) => string | null;
};

function emit(
  node: DesignNode,
  parentDir: Dir,
  opts: EmitOptions,
): PFNode | null {
  const sd = styleDataFor(node, parentDir);

  switch (node.type) {
    case "heading":
      /* Heading2 carries the level in `data.tag`; the tree chose it, so the
         merchant's outline survives the round trip. */
      return withTag(H2(node.text, sd), `h${node.level}`);

    case "text":
      return P4(node.text, sd);

    case "button":
      /* No href: the enum has no "none" member and a mockup button has no real
         destination. The merchant sets it in the editor. */
      return BTN(node.text, "", sd);

    case "image": {
      const src = opts.images?.[node.query];
      return IMG(src ?? "", sd);
    }

    case "divider":
      /* Childless and textless. As a FlexBlock the editor would paint a drop
         zone over it; as Custom.HTML it is just the rule the mockup drew. */
      return CUSTOM_HTML("<div></div>", sd);

    case "icon": {
      const svg = opts.iconSvg?.(node.name);
      return svg ? CUSTOM_HTML(svg, sd) : null;
    }

    case "product":
      return productBox(node, sd);

    case "accordion":
      return accordionOf(node, sd);

    case "row":
    case "col": {
      const dir = directionOf(node, styleAt(node, "all"));
      const kids = node.children
        .map((c) => emit(c, dir, opts))
        .filter((n): n is PFNode => n !== null);

      /* A container that lost every child is decoration — a rail, a spacer, a
         coloured band. Same reasoning as `divider`. */
      if (kids.length === 0) return CUSTOM_HTML("<div></div>", sd);
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
): PFNode {
  const stacked = node.layout === "stacked";

  const media = PRODUCT_MEDIA(
    MEDIA_MAIN({ all: { "&": "width: 100%; aspect-ratio: 1 / 1;" } }),
    MEDIA_LIST(
      4,
      { all: { "&": "display: flex !important; gap: 8px; margin-top: 8px;" } },
      { all: { "&": "width: 64px; aspect-ratio: 1 / 1;" } },
    ),
    { all: { "&": "width: 100%;" } },
  );

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
    [
      PRODUCT_TITLE({ all: { "&": "font-size: 28px; font-weight: 600; line-height: 1.2;" } }),
      PRODUCT_PRICE(
        { all: { "&": "display: flex !important; gap: 10px; align-items: baseline;" } },
        { all: { "&": "font-size: 20px;" } },
        node.compareAt
          ? { all: { "&": "font-size: 16px; opacity: .5; text-decoration: line-through;" } }
          : { all: { "&": "display: none !important;" } },
      ),
      ...(node.swatches > 0
        ? [
            PRODUCT_SWATCHES(
              { all: { "&": "display: flex !important; gap: 8px;" } },
              { all: { "&": "font-size: 13px;" } },
              { all: { "&": "width: 26px; height: 26px; border-radius: 999px;" } },
            ),
          ]
        : []),
      /* The label must read exactly as the mockup showed it — left unset,
         PageFly renders its own "Add to Cart", which may not be the words the
         merchant just approved. */
      PRODUCT_ATC(
        {
          all: {
            "&":
              "padding: 14px 22px; font-weight: 600;" +
              " background-color: #111114; color: #ffffff; text-align: center;",
          },
        },
        node.atcText,
      ),
    ],
  );

  /* Styling targets `& > form`: ProductBox renders a <form action="/cart/add">,
     and styling `&` leaves that form at its own width. */
  const form =
    `display: flex; flex-direction: ${stacked ? "column" : "row"};` +
    ` gap: 40px; width: 100%; align-items: flex-start;`;

  const box = PRODUCT_BOX(media, info, form);
  /* The node's own declarations still apply, on a wrapper — ProductBox's
     styleData is spoken for by the form selector above. */
  return FB(sd, [box]);
}

function accordionOf(
  node: Extract<DesignNode, { type: "accordion" }>,
  sd: StyleData,
): PFNode {
  const rows = node.items.map((item) => ({
    header: ACCORDION_HEADER(
      [
        H2(item.q, {
          all: { "&": "font-size: 16px; font-weight: 600; margin: 0;" },
        }),
      ],
      {
        all: {
          "&":
            "display: flex !important; justify-content: space-between !important;" +
            " align-items: center !important; gap: 16px; padding: 18px 0;",
        },
      },
    ),
    /* Four tiers, and the copy has to reach the innermost one — ACCORDION
       builds the wrappers, so this is only the body content. */
    body: [
      P4(item.a, {
        all: { "&": "line-height: 1.6; opacity: .72; padding-bottom: 18px;" },
      }),
    ],
    style: { all: { "&": "border-bottom: 1px solid rgba(0,0,0,.12);" } },
  }));

  return ACCORDION(rows, sd);
}

/* ---- page --------------------------------------------------------------- */

function pageCss(width: number): string {
  return [
    /* First — @import is only valid before any other rule. Without it the store
       has no reason to have these faces installed and every heading falls back
       to the theme's system stack, which is exactly how an import came back in
       the wrong font. customCSS survives import and runs on preview and live. */
    `@import url("${WEBFONT_CSS_URL}");`,
    `/* PageFly Design export — keeps the imported page matching its mockup. */`,
    `.pf-design-export, .pf-design-export * { box-sizing: border-box; }`,
    `.pf-design-export p, .pf-design-export h1, .pf-design-export h2,`,
    `.pf-design-export h3, .pf-design-export h4, .pf-design-export h5,`,
    `.pf-design-export h6 { margin: 0; }`,
    `.pf-design-export a { color: inherit; text-decoration: none; }`,
    `.pf-design-export img, .pf-design-export svg { display: block; max-width: 100%; }`,
    /* The engine gives text elements a min-width from its own sizing model;
       landing on a flex child that breaks the line per character. */
    `.pf-design-export [data-pf-type] { min-width: 0; }`,
    `.pf-design-export { max-width: ${width}px; margin-left: auto; margin-right: auto; }`,
  ].join("\n");
}

export type BuiltPage = { blob: Blob; filename: string };

/**
 * Build the importable file for one design tree.
 *
 * `page` supplies only the filename and the page-level background and type
 * face — everything with a shape comes from the tree.
 */
export function pageflyFromTree(
  tree: DesignTree,
  page: { name: string; bg: string; ink: string; fontBody: string },
  width: number,
  opts: EmitOptions = {},
): BuiltPage {
  const sections = tree.sections.map((section) => {
    const kids = section.children
      .map((c) => emit(c, directionOf(section, styleAt(section, "all")), opts))
      .filter((n): n is PFNode => n !== null);

    const inner = FB(styleDataFor(section, null), kids, "pf-design-export");
    return FSECTION([inner], {
      all: { "&": `padding: 0px; background-color: ${page.bg};` },
    });
  });

  if (sections.length === 0)
    throw new Error("Nothing to export — the design has no sections");

  const doc = new Page({ name: page.name, customCSS: pageCss(width) });
  for (const s of sections) doc.addSection(s);

  return { blob: doc.toBlob(), filename: `${page.name}.pagefly` };
}

/** Exposed for tests: the exact styleData one node would carry. */
export const _internals = { styleDataFor, cssAt, widthMode, declarations };
export type { DeviceKey };
