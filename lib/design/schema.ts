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

const styled = {
  /** desktop, and the base every other breakpoint inherits from */
  css: css.optional().transform(clean),
  /** only the properties that differ on phones */
  mobile: css.optional().transform(clean),
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
  | z.infer<typeof accordion>
  | { type: "row"; css?: Css; mobile?: Css; children: DesignNode[] }
  | { type: "col"; css?: Css; mobile?: Css; children: DesignNode[] };

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
    accordion,
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
  /** what this band is for — nav, hero, footer… Not rendered; it is how the
      renderer knows a nav from a footer and how failures name themselves. */
  role: z.string().max(40).default("section"),
  ...styled,
  children: z.array(node).max(32),
});

export const designTreeSchema = z.object({
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
