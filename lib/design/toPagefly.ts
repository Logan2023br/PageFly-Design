import {
  BEFORE_AFTER,
  BTN,
  CONTENT_LIST,
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
  PRODUCT_ATC,
  PRODUCT_BOX,
  PRODUCT_LIST,
  PRODUCT_MEDIA,
  PRODUCT_PRICE,
  PRODUCT_SWATCHES,
  PRODUCT_TITLE,
  SLIDESHOW,
  ACCORDION,
  ACCORDION_HEADER,
  Page,
  type DeviceKey,
  type PFNode,
  type StyleData,
} from "../pagefly/builder";
import { WEBFONT_CSS_URL } from "../styleTokens";
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

/**
 * Force a block-level composite to fill its parent.
 *
 * A flex parent with `align-items: center` sizes its children by their content
 * — so an accordion or a product grid inside a centred column arrived at a
 * fraction of the width the mockup drew, floating in the middle of the band.
 * `--pf-flex-layout-width: fill` does not save it, because the CSS rule wins.
 * An explicit 100% does.
 */
/** `color: <ink>;` or nothing, so the caller can interpolate it unconditionally. */
function inkRule(opts: EmitOptions): string {
  return opts.ink ? `color: ${opts.ink};` : "";
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

function stickyCss(edge: "bottom" | "top", mobileOnly: boolean): string {
  const rules = [
    `.${STICKY_CLASS}{position:fixed;left:0;right:0;${edge}:0;z-index:60;}`,
    /* The page needs room for it or the bar covers the last section's content
       for ever, which is the failure everyone ships once. */
    `.${STICKY_CLASS}::after{content:"";display:block;}`,
  ];
  if (mobileOnly)
    rules.push(`@media (min-width: 768px){.${STICKY_CLASS}{position:static;}}`);
  return rules.join("\n");
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

function counterJs(cls: string, value: string): string {
  /* The digits only. A value of "1,240" animates to 1240 and is written back
     with its separators intact by the format below. */
  const target = Number(String(value).replace(/[^\d.]/g, "")) || 0;
  return `
var el=document.querySelector(".${cls} [data-pf-type]");
if(el&&"IntersectionObserver" in window){
  var done=false;
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    if(!e.isIntersecting||done)return; done=true; io.disconnect();
    var t=${target},s=null,txt=el.textContent||"",pre=txt.split(/[0-9]/)[0],suf=txt.slice(txt.search(/[0-9][^0-9]*$/)+1);
    function step(now){ if(!s)s=now; var p=Math.min(1,(now-s)/900);
      el.textContent=pre+Math.round(t*(1-Math.pow(1-p,3))).toLocaleString()+suf;
      if(p<1)requestAnimationFrame(step); }
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
   * The page's accent. Only the form needs it: Form2's submit button is
   * unstyled by default and renders as a bare native control, which is the one
   * element on an imported page that looks like it belongs to a different site.
   */
  accent?: string;
  /** icon name → raw <svg> markup; icons are dropped when this is absent */
  iconSvg?: (name: string) => string | null;
  /* Custom blocks write their own CSS and JS, and both belong on the PAGE
     rather than the element — PageFly has one stylesheet and one script per
     page. These collect what each block contributed on the way past. */
  customBlocks?: CleanBlock[];
  customCount?: { value: number };
};

function emit(node: DesignNode, parentDir: Dir, opts: EmitOptions): PFNode | null {
  const built = emitNode(node, parentDir, opts);
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
    const existing = typeof n.data.className === "string" ? n.data.className : "";
    n.data.className = [existing, ...classes].filter(Boolean).join(" ");
  }
  return n;
}

function emitNode(
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
      return IMG(src ?? "", capHeight(sd));
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
      return productBox(node, sd, opts);

    case "productList":
      return productGrid(node, sd, opts);

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
      const styled = withParts(sd, {
        "& > form": "display: flex; flex-direction: column; gap: 12px;",
        "& input":
          `border: 1px solid rgba(0,0,0,.16); border-radius: 6px; padding: 12px 14px; width: 100%;${inkRule(opts)}`,
        "& button": `background-color: ${opts.accent ?? "#111111"}; color: #FFFFFF; border: 0; border-radius: 6px; padding: 13px 26px; cursor: pointer;`,
      });
      /* The label carries the field's name, so it is type the merchant reads —
         and giving it a style is also what guarantees it a style entry at all.
         See FORM_FIELD. */
      const labelStyle: StyleData = {
        all: {
          "&": `font-size: 13px; letter-spacing: .02em; margin-bottom: 6px;${inkRule(opts)}`,
        },
      };

      return FORM(
        node.fields.map((f) =>
          FORM_FIELD(f.label, f.kind, f.required, null, labelStyle),
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
            /* The ratio is the shape the model asked for; `min-height` rather
               than `aspect-ratio` because the text inside must be able to make
               it taller, and an aspect-ratio box clips instead. */
            `min-height: ${Math.round(node.ratio * 100)}vw;`,
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

    case "counter": {
      /* A text node plus one line of page JS, next to the reveal observer that
         is already there. The number is written into the markup so the page
         reads correctly with no JavaScript at all — the script only animates a
         value that is already correct. */
      const n = (opts.customCount!.value += 1);
      const cls = `pfd-count-${n}`;
      opts.customBlocks?.push({
        className: cls,
        html: "",
        css: "",
        js: counterJs(cls, node.value),
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
          withTag(H2(shown, styleDataFor({ ...node, type: "heading" } as never, parentDir)), "div"),
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
      const dir = directionOf(node as never, styleAt(node, "all"));
      const slides = node.slides
        .map((c) => emit(c, dir, opts))
        .filter((n): n is PFNode => n !== null);
      /* Every slide dropped means an empty carousel with working arrows, which
         is worse than the row it replaced. */
      if (slides.length === 0) return CUSTOM_HTML("<div></div>", sd);
      return SLIDESHOW(slides, { perView: node.perView, autoplay: node.autoplay }, sd);
    }

    case "row":
    case "col": {
      const dir = directionOf(node, styleAt(node, "all"));
      const kids = node.children
        .map((c) => emit(c, dir, opts))
        .filter((n): n is PFNode => n !== null);

      /* A container that lost every child is decoration — a rail, a spacer, a
         coloured band. Same reasoning as `divider`. */
      if (kids.length === 0) return CUSTOM_HTML("<div></div>", sd);

      /* A row of cards is a card list, not a box holding boxes. See
         `asCardList` for what qualifies and why it matters on import. */
      const asList = cardList(node, kids, sd);
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

  /* The strip is turned on by the SETTING, not by CSS — see PRODUCT_MEDIA. The
     style below is spacing only; whether the list renders at all is data. */
  const EDGE = { bottom: "BOTTOM", left: "LEFT", right: "RIGHT", top: "TOP" } as const;
  const media = PRODUCT_MEDIA(
    MEDIA_MAIN({ all: { "&": "width: 100%; aspect-ratio: 1 / 1;" } }),
    MEDIA_LIST(
      4,
      { all: { "&": "gap: 8px; margin-top: 8px;" } },
      { all: { "&": "aspect-ratio: 1 / 1;" } },
    ),
    {
      all: {
        "&": "width: 100%;",
        "& .pf-media-wrapper img":
          "width: 100% !important; height: 100% !important; object-fit: cover !important;",
      },
    },
    { show: node.gallery, edge: EDGE[node.galleryEdge] },
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
      PRODUCT_TITLE({
        all: { "&": `font-size: 28px; font-weight: 600; line-height: 1.2; ${inkRule(opts)}` },
      }),
      PRODUCT_PRICE(
        { all: { "&": "display: flex !important; gap: 10px; align-items: baseline;" } },
        { all: { "&": `font-size: 20px; ${inkRule(opts)}` } },
        node.compareAt
          ? { all: { "&": "font-size: 16px; opacity: .5; text-decoration: line-through;" } }
          : { all: { "&": "display: none !important;" } },
      ),
      ...(node.swatches > 0
        ? [
            /* Styled through the documented swatch selectors, not through the
               child nodes: a colour option renders `.pf-vs-color`, a size grid
               renders `.pf-vs-label`, and the OptionLabel/Swatch children carry
               almost none of it. Round dots for colours, square tiles for
               sizes, and the selected state marked — without it a merchant
               cannot see which variant is chosen. */
            PRODUCT_SWATCHES(
              {
                all: {
                  "&": "display: flex !important; flex-direction: column !important; gap: 14px;",
                  "& .pf-vs-color label":
                    "width: 26px; height: 26px; border-radius: 999px;" +
                    " border: 1px solid rgba(0,0,0,.14); cursor: pointer;",
                  '& .pf-vs-color > input[type="radio"]:checked + label':
                    "box-shadow: 0 0 0 2px #fff, 0 0 0 4px currentColor;",
                  "& .pf-vs-label label":
                    "min-width: 44px; padding: 8px 12px; border: 1px solid rgba(0,0,0,.18);" +
                    " text-align: center; cursor: pointer;",
                  '& .pf-vs-label > input[type="radio"]:checked + label':
                    "border-color: currentColor;",
                },
              },
              {
                all: {
                  "&":
                    "font-size: 11px; font-weight: 600; letter-spacing: .08em;" +
                    ` text-transform: uppercase; opacity: .55; ${inkRule(opts)}`,
                },
              },
              { all: { "&": "display: flex !important; gap: 10px; flex-wrap: wrap;" } },
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
      MEDIA_LIST(1, null, null),
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
          { all: { "&": "display: none !important;" } },
        ),
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

function cardList(
  node: Extract<DesignNode, { type: "row" | "col" }>,
  kids: PFNode[],
  sd: StyleData,
): PFNode | null {
  const children = node.children;
  if (children.length < 3 || children.length !== kids.length) return null;

  /* One shape, repeated. */
  const shape = children[0].type;
  if (shape !== "col" && shape !== "row" && shape !== "image") return null;
  if (!children.every((c) => c.type === shape)) return null;

  for (const c of children) {
    if (c.css?.width !== undefined || c.css?.flexBasis !== undefined) return null;
    if (walkNode(c).some((n) => NOT_IN_A_CARD.has(n.type))) return null;
  }

  const css = styleAt(node, "all");
  const columns = declaredColumns(css) ?? children.length;
  const gap = Number(String(css.gap ?? css.columnGap ?? 24).replace(/[^\d.]/g, "")) || 24;

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
    style: { all: { "&": "border-bottom: 1px solid rgba(0,0,0,.12);" } },
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
      "& .pf-header-item-wrapper":
        `padding: 18px 0; font-size: 16px; font-weight: 600; ${inkRule(opts)}` +
        " border-bottom: 1px solid currentColor;",
      "& .pf-accordion-body":
        `padding-bottom: 18px; line-height: 1.6; opacity: .72; ${inkRule(opts)}`,
      "& .pf-accordion-icon": `font-size: 18px; opacity: .5; ${inkRule(opts)}`,
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
    `.pf-design-export, .pf-design-export * { box-sizing: border-box; }`,
    `.pf-design-export p, .pf-design-export h1, .pf-design-export h2,`,
    `.pf-design-export h3, .pf-design-export h4, .pf-design-export h5,`,
    `.pf-design-export h6 { margin: 0; }`,
    `.pf-design-export a { color: inherit; text-decoration: none; }`,
    `.pf-design-export img, .pf-design-export svg { display: block; max-width: 100%; }`,
    /* The engine gives text elements a min-width from its own sizing model;
       landing on a flex child that breaks the line per character. */
    `.pf-design-export [data-pf-type] { min-width: 0; }`,
    /* width:100% as well as the cap. Without it the block is free to shrink to
       its content — a centred flex parent in the theme, or a section whose
       children all hug, and the page narrows to a column adrift in the
       middle of the screen. The max-width still bounds it. */
    `.pf-design-export { max-width: ${width}px; margin-left: auto; margin-right: auto; width: 100%; }`,
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
    ink: opts.ink ?? page.ink,
    customBlocks,
    customCount: { value: 0 },
  };
  const sections = tree.sections.map((section) => {
    const fills = needsFill(section);
    const kids = section.children
      .map((c) => {
        const emitted = emit(c, directionOf(section, styleAt(section, "all")), opts);
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

    /* A section's reveal rides on the content block, not on the FlexSection.
       The band's paint stays put and its contents rise into it — fading the
       whole section would fade the background out of the page and back in,
       which reads as a flicker rather than an entrance. */
    const inner = FB(
      styleDataFor({ ...section, css: splitBleed(section.css).rest, mobile: splitBleed(section.mobile).rest }, null),
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

    return FSECTION([inner], band);
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
export const _internals = { styleDataFor, cssAt, widthMode, declarations };
export type { DeviceKey };
