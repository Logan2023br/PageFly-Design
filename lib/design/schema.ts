import { z } from "zod";

/* ==========================================================================
   The design tree.

   A model authors this; two things read it. `render.tsx` turns it into the
   mockup the merchant looks at, `toPagefly.ts` turns it into the .pagefly file
   they import. Both read the SAME tree, which is the point of it existing.

   Until now the export had to walk the rendered DOM and infer, from computed
   style, what the React components had meant — and every import bug so far was
   born in that inference: text collapsing to one character per line, grids
   arriving as broken flex, decoration landing as fifteen empty drop zones. A
   tree the model wrote down explicitly has nothing to infer.

   Three constraints shaped the shape:

   1. NODE TYPES ARE THE PAGEFLY VOCABULARY. There is no `type` here that
      PageFly cannot represent, so a valid tree cannot fail to export. The model
      is handed PageFly's alphabet rather than HTML's and then trusted.

   2. THE MODEL WRITES TWO BREAKPOINTS, NOT FOUR. It authors desktop, and only
      the mobile properties that actually differ. Laptop and tablet are derived
      (see `derive.ts`). PageFly wants four; asking a model for four doubled the
      output tokens and, on the small models, was where it started losing track
      of which override belonged to which node.

   3. COMPOSITE ELEMENTS STAY IN OUR HANDS. `product` and `accordion` expand to
      PageFly subtrees with required internal slots and a nesting order the
      editor silently rejects when it is wrong. The model says "a product box
      goes here"; the builder — which already gets this right — says how.
      ========================================================================== */

/** A CSS declaration block, camelCase keys, exactly as React wants them. */
const css = z.record(z.string(), z.union([z.string(), z.number()]));

export type Css = z.infer<typeof css>;

/* Properties that would let a node escape its section and land somewhere the
   mockup never showed it. A mockup that lies about where things sit is worse
   than a plain one, and in PageFly these also fight the layout engine. */
const BANNED = new Set([
  "position",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
  "float",
  "transform",
]);

/** Drop banned declarations rather than rejecting the node that carried them:
    one stray `position: absolute` should cost that property, not the page. */
function clean(value: Css | undefined): Css | undefined {
  if (!value) return undefined;
  const out: Css = {};
  for (const [k, v] of Object.entries(value)) {
    if (BANNED.has(k)) continue;
    if (v === "" || v === null || v === undefined) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/* ---- motion -------------------------------------------------------------

   Two kinds, and they reach PageFly by different roads.

   `hover` is PageFly's own: Button2, ContentListItem, Form2.Button2 and
   ProductATC2 all carry an `animationHover` field taking exactly these six
   values. Written as the field, it is a setting the merchant can see and change
   in the editor rather than CSS they would have to find and edit.

   `reveal` is not PageFly's. Nothing in the element model fires on scroll, so
   the exporter ships it as a class plus page-level CSS and a few lines of
   IntersectionObserver in the page's custom JS. That is the honest cost of an
   effect the platform does not have, and it keeps the mockup and the live page
   showing the same thing — which is the whole contract of this app.

   Both are optional and both default to nothing. A page with no motion is a
   page with no motion, not a page with broken motion. */

const anim = z
  .object({
    /** PageFly's canned button motion */
    hover: z
      .enum(["float", "shadow", "grow", "glow", "float-shadow", "grow-shadow"])
      .optional()
      .catch(undefined),
    /** ours: plays once when the element scrolls into view */
    reveal: z
      .enum(["fade", "fade-up", "slide-left", "slide-right", "zoom"])
      .optional()
      .catch(undefined),
    /** stagger this element behind its siblings, in steps of 80ms */
    delay: z.number().int().min(0).max(6).optional().catch(undefined),
  })
  .optional()
  .catch(undefined);

export type Anim = z.infer<typeof anim>;

const styled = {
  /** desktop, and the base every other breakpoint inherits from */
  css: css.optional().transform(clean),
  /** only the properties that differ on phones */
  mobile: css.optional().transform(clean),
  /** hover and scroll motion; see the note above */
  anim,
};

/* ---- leaves ------------------------------------------------------------- */

const heading = z.object({
  type: z.literal("heading"),
  /** h1..h6 — the merchant's SEO outline, which is why the model must choose it
      rather than us guessing from font size after the fact */
  level: z.number().int().min(1).max(6).default(2),
  text: z.string().min(1).max(300),
  ...styled,
});

const text = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(2000),
  ...styled,
});

const button = z.object({
  type: z.literal("button"),
  text: z.string().min(1).max(80),
  ...styled,
});

const image = z.object({
  type: z.literal("image"),
  /** English search terms for the stock library — "potter shaping clay on a
      wheel", not "image1". Resolved to a real photograph before render.

      Trimmed rather than rejected. This is a search phrase, never displayed, so
      a model that writes a sentence where a phrase belongs should cost the
      photograph at worst — and it used to cost the whole page: one over-long
      query failed validation and the merchant got the deterministic layout
      back instead. */
  query: z
    .string()
    .max(400)
    .catch("")
    .transform((v) => v.trim().slice(0, 160)),
  /** height / width */
  ratio: z.number().min(0.2).max(4).default(1),
  ...styled,
});

const divider = z.object({ type: z.literal("divider"), ...styled });

const icon = z.object({
  type: z.literal("icon"),
  /** a lucide name; unknown names render as a dot rather than nothing */
  name: z.string().max(40),
  ...styled,
});

/* ---- composites: the model places them, the builder expands them --------- */

const product = z.object({
  type: z.literal("product"),
  layout: z.enum(["sideBySide", "stacked"]).default("sideBySide"),
  title: z.string().max(120).default("Product name"),
  price: z.string().max(24).default("$48.00"),
  compareAt: z.string().max(24).optional(),
  /** must read exactly as it does in the mockup — merchants check this one */
  atcText: z.string().max(40).default("Add to cart"),
  swatches: z.number().int().min(0).max(8).default(0),
  query: z.string().max(120).default("product photography"),
  ...styled,
});

/**
 * A grid of the store's real products.
 *
 * Not a row of image + heading + text pretending to be one. Built by hand the
 * cards are dead pictures with invented names; as ProductList2 the editor binds
 * them to the collection and every card is a live product with its real title,
 * price and photo.
 */
const productList = z.object({
  type: z.literal("productList"),
  columns: z.number().int().min(1).max(4).default(3),
  /** how many cards the grid renders */
  limit: z.number().int().min(1).max(24).default(6),
  /** search phrase for the placeholder photo the mockup shows */
  query: z.string().max(400).catch("").transform((v) => v.trim().slice(0, 160)),
  ...styled,
});

/**
 * A Shopify form — contact, or an email capture.
 *
 * Real, not drawn. It exports as Form2, which posts to Shopify's own endpoint,
 * so the merchant receives what visitors type. Drawing one out of inputs-shaped
 * rectangles would look identical in the mockup and collect nothing.
 *
 * The field list is deliberately small. PageFly's FormInput supports nine input
 * types including radio and dropdown, and both of those need a `choices` array
 * that a page-design model has no way to invent for someone else's shop.
 */
const form = z.object({
  type: z.literal("form"),
  /** `contact` reaches the shop's contact inbox; `customer` creates a subscriber */
  intent: z.enum(["contact", "signup"]).default("contact"),
  fields: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        /** text = one line, email, phone, message = multi-line */
        kind: z.enum(["text", "email", "phone", "message"]).default("text"),
        required: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(8),
  submitText: z.string().min(1).max(40).default("Send"),
  ...styled,
});

/**
 * Anything PageFly has no element for.
 *
 * A wave divider between bands, an SVG progress ring, a marquee, a count-up —
 * these are real parts of real pages and the element model has none of them.
 * Without this the designer's only options were to approximate with a box or to
 * leave the section out, and both make the page less like the reference the
 * merchant pointed at.
 *
 * It exports as Custom.HTML with the CSS on the page's stylesheet and the JS in
 * the page's custom JS, which is the same road the scroll-reveal already
 * travels. Nothing new is being invented; the model is being handed a road that
 * was already there.
 *
 * WHAT IS STRIPPED, and why it is stripped rather than rejected: a page that
 * loses one decoration is better than a page that fails to build.
 *
 * - `<script>` inside `html`. Script belongs in `js`, where it is wrapped and
 *   scoped. Inline script in markup runs before anything can look at it.
 * - `on*` attributes — `onclick`, `onerror`, `onload`. Same reason, and
 *   `onerror` on an img is the oldest way to run code by accident.
 * - `<iframe>`, `<object>`, `<embed>`, `<form>`. A form here would not post
 *   anywhere; use the `form` node, which is a real Shopify form.
 * - `javascript:` and `data:text/html` URLs.
 *
 * The model writes this on a merchant's behalf, and the merchant imports it into
 * their own storefront. Neither of them is in a position to audit it.
 */
const custom = z.object({
  type: z.literal("custom"),
  /** what this is, in three or four words — shown to nobody, read by whoever
      debugs the page later */
  label: z.string().min(1).max(60),
  /** markup only; no script, no event attributes */
  html: z.string().min(1).max(4000),
  /* Named `stylesheet`, not `css`: every other node already has a `css` and it
     means something different — a style object for the node itself. Two keys
     one letter apart with different shapes is a bug waiting for a tired
     evening. */
  /** scoped to this node automatically — write `.wave`, not `.pfd-c-3 .wave` */
  stylesheet: z.string().max(2000).optional(),
  /** runs once, wrapped, with `root` bound to this node's element */
  js: z.string().max(1500).optional(),
  ...styled,
});

/* ==========================================================================
   The five that make a designed page possible.

   `position` and `transform` are banned in plain `css` and stay banned — a
   model that can position anything produces pages where things land on top of
   each other in ways the mockup never showed. But the ban also made the pages
   in every reference screenshot impossible to build: there was no way to put
   text on a photograph, so every generated hero was a text column beside an
   image column, and none of them looked like the pages merchants point at.

   These five own their positioning inside the builder, where it is written once
   and tested once instead of invented per page.
   ========================================================================== */

/**
 * Text ON a photograph. The node that makes a page look art-directed.
 *
 * `scrim` is a gradient, never a flat wash: a flat overlay greys the photograph
 * evenly and reads as a mistake, while a gradient from one edge keeps the image
 * intact where there is no text.
 */
const overlay = z.object({
  type: z.literal("overlay"),
  /** English stock-photo search terms, as `image` */
  query: z.string().max(400).catch("").transform((v) => v.trim().slice(0, 160)),
  ratio: z.number().min(0.2).max(4).default(0.62),
  scrim: z.enum(["left", "bottom", "full", "none"]).default("left"),
  align: z.enum(["bottom-left", "center", "top-left"]).default("bottom-left"),
  ...styled,
});

/**
 * A bar that stays put while the page scrolls past it.
 *
 * `mobileOnly` because that is the honest default for a buy bar: on a desktop
 * the buy box is usually still on screen, and a second one pinned to the bottom
 * is the same offer twice.
 */
const sticky = z.object({
  type: z.literal("sticky"),
  edge: z.enum(["bottom", "top"]).default("bottom"),
  mobileOnly: z.boolean().default(false),
  ...styled,
});

/** Two photographs and a handle. PageFly has a native element for this. */
const beforeAfter = z.object({
  type: z.literal("beforeAfter"),
  beforeQuery: z.string().max(400).catch("").transform((v) => v.trim().slice(0, 160)),
  afterQuery: z.string().max(400).catch("").transform((v) => v.trim().slice(0, 160)),
  beforeLabel: z.string().max(40).default("Before"),
  afterLabel: z.string().max(40).default("After"),
  ...styled,
});

/* `marquee` is declared inside the lazy union below — it holds children, so
   out here it would reference `node` before `node` exists. */

/**
 * A number that counts up when it arrives on screen.
 *
 * `suffix` and `prefix` are what make it a fact rather than a digit: `92` says
 * nothing, `92%` and `£92` say something. The audit rejects a bare one.
 */
const counter = z.object({
  type: z.literal("counter"),
  value: z.string().max(12),
  suffix: z.string().max(12).default(""),
  prefix: z.string().max(12).default(""),
  label: z.string().max(80).default(""),
  ...styled,
});

/* `slideshow` is NOT declared here. It holds design nodes, so it has to be
   built inside the `z.lazy` below alongside `row` and `col` — declared out
   here it would reference `node` before `node` exists, and TypeScript reports
   that as the whole union silently becoming `any`. */

const accordion = z.object({
  type: z.literal("accordion"),
  items: z
    .array(
      z.object({
        q: z.string().min(1).max(200),
        a: z.string().min(1).max(1200),
      }),
    )
    .min(1)
    .max(12),
  ...styled,
});

/* ---- containers --------------------------------------------------------- */

export type DesignNode =
  | z.infer<typeof heading>
  | z.infer<typeof text>
  | z.infer<typeof button>
  | z.infer<typeof image>
  | z.infer<typeof divider>
  | z.infer<typeof icon>
  | z.infer<typeof product>
  | z.infer<typeof productList>
  | z.infer<typeof form>
  | z.infer<typeof custom>
  | z.infer<typeof beforeAfter>
  | z.infer<typeof counter>
  | {
      type: "overlay";
      query: string;
      ratio: number;
      scrim: "left" | "bottom" | "full" | "none";
      align: "bottom-left" | "center" | "top-left";
      css?: Css;
      mobile?: Css;
      anim?: Anim;
      children: DesignNode[];
    }
  | {
      type: "marquee";
      speed: number;
      css?: Css;
      mobile?: Css;
      anim?: Anim;
      children: DesignNode[];
    }
  | {
      type: "sticky";
      edge: "bottom" | "top";
      mobileOnly: boolean;
      css?: Css;
      mobile?: Css;
      anim?: Anim;
      children: DesignNode[];
    }
  | z.infer<typeof accordion>
  | {
      type: "slideshow";
      perView: number;
      autoplay: boolean;
      css?: Css;
      mobile?: Css;
      anim?: Anim;
      slides: DesignNode[];
    }
  | { type: "row"; css?: Css; mobile?: Css; anim?: Anim; children: DesignNode[] }
  | { type: "col"; css?: Css; mobile?: Css; anim?: Anim; children: DesignNode[] };

const node: z.ZodType<DesignNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    heading,
    text,
    button,
    image,
    divider,
    icon,
    product,
    productList,
    form,
    custom,
    beforeAfter,
    counter,
    accordion,
    /* Only when the brief or the reference asks for a carousel. A row of three
       cards that fits on the screen is a row of three cards; turning it into a
       slider hides two thirds of it behind an arrow nobody presses. PageFly's
       own note on the element says the same. */
    z.object({
      type: z.literal("slideshow"),
      /** visible slides on desktop; one on mobile either way */
      perView: z.number().int().min(1).max(4).default(3),
      autoplay: z.boolean().default(false),
      ...styled,
      slides: z.array(node).min(1).max(12),
    }),
    /* Both hold children, so both are built here rather than above — declared
       outside the lazy union they would reference `node` before it exists, and
       TypeScript reports that as the whole union silently becoming `any`. */
    z.object({
      type: z.literal("overlay"),
      query: z.string().max(400).catch("").transform((v) => v.trim().slice(0, 160)),
      ratio: z.number().min(0.2).max(4).default(0.62),
      scrim: z.enum(["left", "bottom", "full", "none"]).default("left"),
      align: z.enum(["bottom-left", "center", "top-left"]).default("bottom-left"),
      ...styled,
      children: z.array(node).max(24),
    }),
    z.object({
      type: z.literal("marquee"),
      /** seconds for one full pass; lower is faster */
      speed: z.number().min(8).max(120).default(28),
      ...styled,
      children: z.array(node).min(1).max(24),
    }),
    z.object({
      type: z.literal("sticky"),
      edge: z.enum(["bottom", "top"]).default("bottom"),
      mobileOnly: z.boolean().default(false),
      ...styled,
      children: z.array(node).max(12),
    }),
    z.object({
      type: z.literal("row"),
      ...styled,
      children: z.array(node).max(24),
    }),
    z.object({
      type: z.literal("col"),
      ...styled,
      children: z.array(node).max(24),
    }),
  ]),
);

/** A full-width horizontal band. Maps to FlexSection, which is the only thing
    PageFly accepts as a direct child of the page body. */
const section = z.object({
  type: z.literal("section"),
  /**
   * The pattern id this section was ordered to build, copied back verbatim.
   *
   * It is how the audit knows what to check a section against. Optional so a
   * tree built without a resolver still parses — `USE_PLAN=false` is the
   * rollback and must not start rejecting pages.
   */
  pattern: z.string().max(60).optional(),
  /** what this band is for — nav, hero, footer… Not rendered; it is how the
      renderer knows a nav from a footer and how failures name themselves. */
  role: z.string().max(40).default("section"),
  ...styled,
  children: z.array(node).max(32),
});

export const designTreeSchema = z.object({
  /**
   * One line per section saying what moves there and why, written BEFORE the
   * sections themselves.
   *
   * This exists to make the model look. Told to choose motion freely it reached
   * for the same two fields on every page; told to justify nothing, it justified
   * nothing. Made to name a decision per section — including "none, dense text"
   * — it has to visit each one, and a page that genuinely wants no animation
   * still reads as a page someone considered.
   *
   * Optional in the schema and required in the prompt. A model that forgets it
   * should cost a line of reasoning, never the whole page.
   */
  motionPlan: z.string().max(600).optional(),
  sections: z.array(section).min(1).max(24),
});

export type DesignSection = z.infer<typeof section>;
export type DesignTree = z.infer<typeof designTreeSchema>;

/** Containers, for the walkers that need to recurse without a type switch. */
export function childrenOf(n: DesignNode | DesignSection): DesignNode[] {
  return "children" in n && Array.isArray(n.children) ? n.children : [];
}

/** Every node in document order, parents before children. */
export function walk(tree: DesignTree): (DesignNode | DesignSection)[] {
  const out: (DesignNode | DesignSection)[] = [];
  const visit = (n: DesignNode | DesignSection) => {
    out.push(n);
    childrenOf(n).forEach(visit);
  };
  tree.sections.forEach(visit);
  return out;
}
