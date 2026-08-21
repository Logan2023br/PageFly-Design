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

/* ==========================================================================
   NOTHING BELOW THIS LINE MAY REJECT.

   This schema validates a document a language model wrote in one pass, and for
   most of its life it was strict: a field that did not match its type failed,
   a failed field failed its node, and a failed node failed the tree. The whole
   page was thrown away and the merchant was told the designer did not respond.

   Three times now that has happened over one leaf:

     image.query   a search phrase two words too long   — page lost
     perView       2.5 where an integer was wanted      — page lost, 34,961 tokens
     fields[].kind "textarea", not in the enum          — page lost, 30,268 tokens

   Every one of those pages was otherwise complete and every one of them was
   thrown away over a value nobody would have noticed being corrected. Strictness
   was buying nothing: there is no second author to catch, and no downstream
   reader that a rounded column count or a truncated search phrase would break.

   So the rule for this file is now: COERCE, CLAMP, TRUNCATE, DROP — in that
   order — and never reject. Every helper below is built on `loose()`, which
   accepts anything including nothing, so the coercion runs where a type check
   used to fail. A malformed value costs itself; a malformed node costs itself;
   only a document with no sections left is a failure, and that is the one check
   kept at the bottom of the file.
   ========================================================================== */

/**
 * The base every helper in this file is built on.
 *
 * `z.unknown()` alone is not enough: zod 4 treats a key whose schema is piped
 * through a transform as required, so a node that simply omitted `level` was
 * rejected — the exact failure this file exists to prevent, reintroduced by the
 * fix for it. `.optional()` hands the transform an `undefined` to deal with
 * instead of failing before it runs, and every helper below deals with it.
 */
function loose() {
  return z.unknown().optional();
}

/** A CSS declaration block, camelCase keys, exactly as React wants them. */
export type Css = Record<string, string | number>;

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

/**
 * A style object, keeping the declarations that make sense and dropping the
 * rest.
 *
 * Banned properties, empty strings, nulls, nested objects, arrays — all
 * dropped. One stray `position: absolute` or one `padding: null` costs that
 * property; it used to cost the node, which cost the section, which cost the
 * page.
 */
const css = loose().transform((value): Css | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Css = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (BANNED.has(k)) continue;
    if (typeof v === "string" && v !== "") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
});

/** A number out of whatever was written — `"3"` and `3` both read as 3. */
function numberish(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** A whole number, rounded and clamped into range. */
function whole(min: number, max: number, fallback: number) {
  return loose().transform((v) => {
    const n = numberish(v);
    return n === null ? fallback : Math.min(max, Math.max(min, Math.round(n)));
  });
}

/** The same, for values that are meant to be fractional. */
function within(min: number, max: number, fallback: number) {
  return loose().transform((v) => {
    const n = numberish(v);
    return n === null ? fallback : Math.min(max, Math.max(min, n));
  });
}

/**
 * One of a fixed set of values.
 *
 * A model reaching for a word the enum does not have — `textarea` where
 * `message` was wanted, `subscribe` where `signup` was — is picking a synonym,
 * not describing something else. Falling back to the sane member loses a
 * nuance. Rejecting loses the page.
 */
function choice<const T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
) {
  return loose().transform((v) =>
      typeof v === "string" && (values as readonly string[]).includes(v)
        ? (v as T[number])
        : fallback,
    );
}

/** A boolean, out of `true`, `"true"`, `"yes"` or `1`. */
function flag(fallback: boolean) {
  return loose().transform((v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return /^(true|yes|on|1)$/i.test(v.trim());
    return fallback;
  });
}

/**
 * Text, cut to fit rather than refused for being long.
 *
 * The limits here are generous — 300 characters is already four times any
 * heading worth writing — so anything hitting one is a model that has run on,
 * and the first 300 characters of a run-on heading are still the heading.
 */
function words(max: number, fallback = "") {
  return loose().transform((v) => {
    const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
    /* A non-empty fallback is how this file says "this has to read as
       something" — an add-to-cart button labelled "" is a bug on a real
       storefront, so an empty value there takes the fallback too. */
    if (s.trim() === "") return fallback;
    return s.length > max ? s.slice(0, max).trimEnd() : s;
  });
}

/**
 * Text a node exists to show, which therefore cannot be empty.
 *
 * This is the one place a leaf is still allowed to fail, and it fails on
 * purpose: a heading with no words is not a heading, and letting it through
 * puts an empty `<h2>` on the merchant's page, which is worse than not putting
 * anything there. Because every list drops the items that fail, an empty
 * heading now costs one heading — the sentence above the rule, applied.
 */
function saying(max: number) {
  return words(max).refine((s) => s.trim() !== "");
}

/**
 * Text that is allowed to be absent, and reads as absent when it is blank.
 *
 * The `.optional()` is not decoration: zod treats a transform that returns
 * `undefined` at a required key as an error, so without it every one of these
 * would fail its node — which is the exact bug this file exists to prevent.
 */
function spare(max: number) {
  return words(max).transform((v) => v || undefined).optional();
}

/** A stock-photo search phrase. Never displayed, so trimming costs nothing. */
const query = words(400).transform((v) => v.trim().slice(0, 160));

/**
 * A list, keeping the items that parse and dropping the ones that do not.
 *
 * This is the single most important helper in the file. Without it one node the
 * model invented — a `video`, a `map`, a `type` it half-remembered — takes its
 * parent down, and the parent takes the section, and the section takes the
 * page. With it, an unknown node costs exactly itself and the merchant gets the
 * other thirty.
 *
 * Items beyond `max` are dropped for the same reason: a slideshow with fifteen
 * slides should lose three, not become nothing.
 */
function list<T>(item: z.ZodType<T>, max: number): z.ZodType<T[], unknown> {
  return loose().transform((value) => {
    if (!Array.isArray(value)) return [];
    const out: T[] = [];
    for (const raw of value) {
      if (out.length >= max) break;
      const parsed = item.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
      else if (DEBUG) {
        const what = (raw as { type?: string })?.type ?? typeof raw;
        console.warn(`[schema] dropped ${what}: ${JSON.stringify(parsed.error.issues[0])}`);
      }
    }
    return out;
  });
}

/* Dropping quietly is right in production — a merchant does not need to hear
   that one node was discarded — and useless the moment something is dropped
   that should not have been. `PFD_SCHEMA_DEBUG=1` says what went and why. */
const DEBUG = process.env.PFD_SCHEMA_DEBUG === "1";

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

/** PageFly's canned button motion */
const HOVERS = ["float", "shadow", "grow", "glow", "float-shadow", "grow-shadow"] as const;
/** ours: plays once when the element scrolls into view */
const REVEALS = ["fade", "fade-up", "slide-left", "slide-right", "zoom"] as const;

type Hover = (typeof HOVERS)[number];
type Reveal = (typeof REVEALS)[number];

const anim = loose().transform((v): Anim => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const hover = (HOVERS as readonly string[]).includes(o.hover as string)
    ? (o.hover as Hover)
    : undefined;
  const reveal = (REVEALS as readonly string[]).includes(o.reveal as string)
    ? (o.reveal as Reveal)
    : undefined;
  const n = numberish(o.delay);
  const delay = n === null ? undefined : Math.min(6, Math.max(0, Math.round(n)));
  /* Nothing recognised is no motion, not an empty motion object — the renderer
     and the exporter both branch on the property being absent. */
  if (!hover && !reveal && delay === undefined) return undefined;
  return { hover, reveal, delay };
});

export type Anim =
  | { hover?: Hover; reveal?: Reveal; delay?: number }
  | undefined;

const styled = {
  /** desktop, and the base every other breakpoint inherits from */
  css,
  /** only the properties that differ on phones */
  mobile: css,
  /** hover and scroll motion; see the note above */
  anim,
};

/* ---- leaves ------------------------------------------------------------- */

const heading = z.object({
  type: z.literal("heading"),
  /** h1..h6 — the merchant's SEO outline, which is why the model must choose it
      rather than us guessing from font size after the fact */
  level: whole(1, 6, 2),
  text: saying(300),
  ...styled,
});

const text = z.object({
  type: z.literal("text"),
  text: saying(2000),
  ...styled,
});

const button = z.object({
  type: z.literal("button"),
  text: saying(80),
  /**
   * What this button DOES, which decides which element it becomes.
   *
   * `link` is a styled anchor. `atc` is PageFly's own add-to-cart control: it
   * puts the item in the cart, changes its own label while the request is in
   * flight, says so when it lands, and disables itself when the variant is sold
   * out. None of that can be added to a link afterwards.
   *
   * STATED RATHER THAN GUESSED FROM THE WORDS. Reading intent off the label
   * would work in English and fail on the pages that matter: a store whose brief
   * is in Vietnamese writes `Thêm vào giỏ`, and a matcher tuned to "add to
   * cart" turns their only real button into a dead link. The design says what
   * the button is; nobody has to parse it.
   */
  action: choice(["link", "atc"] as const, "link"),
  /**
   * The three labels an add-to-cart button shows in its other states.
   *
   * In the page's own language, which is why they are here rather than left to
   * PageFly's English defaults: a Vietnamese page whose button says `Thêm vào
   * giỏ` and then `Adding...` is a page that changes language when you click it.
   *
   * Only read when `action` is `atc`, so a page of links pays nothing for them.
   */
  atc: z
    .object({
      adding: words(40, "Adding…"),
      added: words(40, "Added"),
      soldout: words(40, "Sold out"),
    })
    .nullish()
    .catch(null),
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
  query,
  /** height / width */
  ratio: within(0.2, 4, 1),
  ...styled,
});

const divider = z.object({ type: z.literal("divider"), ...styled });

const icon = z.object({
  type: z.literal("icon"),
  /** a lucide name; unknown names render as a dot rather than nothing */
  name: words(40),
  ...styled,
});

/* ---- composites: the model places them, the builder expands them --------- */

/**
 * `product.extras`, deferred.
 *
 * `product` is declared out here rather than inside the lazy union below, so it
 * cannot name `node` directly. `z.lazy` closes over it and is called at PARSE
 * time, long after the module has finished initialising — the same trick the
 * union itself uses, for the same reason.
 *
 * The four refused types are refused because each needs a product binding or a
 * behaviour of its own: inside a ProductBox they would fight the box's own
 * binding, and a nested `product` is a buy box inside a buy box.
 */
const NOT_AN_EXTRA = new Set(["product", "productList", "form", "sticky"]);

const productExtras: z.ZodType<DesignNode[]> = z.lazy(() =>
  list(
    node.refine((n) => !NOT_AN_EXTRA.has((n as { type: string }).type)),
    6,
  ),
);

const product = z.object({
  type: z.literal("product"),
  layout: choice(["sideBySide", "stacked"] as const, "sideBySide"),
  title: words(120, "Product name"),
  price: words(24, "$48.00"),
  compareAt: spare(24),
  /** must read exactly as it does in the mockup — merchants check this one */
  atcText: words(40, "Add to cart"),
  swatches: whole(0, 8, 0),
  /**
   * The thumbnail strip under (or beside) the main photograph.
   *
   * A property of the node rather than something the exporter guesses, because
   * in PageFly it is a property of the element: ProductMedia3 has `showList`
   * and `listPosition`, and a gallery is that one flag on that one element —
   * NOT a main image plus a separate row of thumbnails, which is how it was
   * being drawn and which renders raw Liquid on import.
   *
   * Off by default. A card in a grid shows one photograph; only a product page
   * that is the point of the page earns a gallery.
   */
  gallery: flag(false),
  /** where the strip sits relative to the main image */
  galleryEdge: choice(["bottom", "left", "right", "top"] as const, "bottom"),

  /* ==========================================================================
     FOUR THINGS PAGEFLY ALREADY HAS, and the buy box was shipping without.

     A reference showing a quantity stepper, a stock line, an express checkout
     button or a corner badge could not be built at all: the vocabulary had no
     way to ask for them, so the model either left them out or drew them, and a
     drawn stepper is three boxes nobody can press.

     Flags rather than something the design composes, because each is bound to
     the product. A stock line written as copy says IN STOCK on a sold-out
     variant; a hand-placed badge needs `position:absolute`, which is banned for
     the reason the whole ban exists.
     ========================================================================== */

  /** the − 1 + stepper. `ProductQuantity`, on the same product. */
  qty: flag(false),
  /** "IN STOCK" / "Only 3 left" / "Sold out", from real inventory. */
  stock: flag(false),
  /** "Buy it now" — Shopify express checkout, on its own row BELOW the cart. */
  express: flag(false),
  /** a corner badge over the photograph: "NEW", "-33%". Empty means none. */
  badge: words(20),
  badgeCorner: choice(
    ["TOP_LEFT", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_RIGHT"] as const,
    "TOP_LEFT",
  ),

  /**
   * Rows of your own, in the buy column, under the cart button.
   *
   * THE OPEN SLOT, and the closed composite was the real limit. `product` has
   * no `children`: the design places it and the builder expands it, which is
   * what keeps ProductBox's required slot order correct. The cost was that a
   * reference showing `4.8 ★ 42 reviews`, or three trust lines under the cart
   * button, could not be built — the fields did not cover it and there was
   * nowhere to put it.
   *
   * STATIC PRESENTATION ONLY, and that distinction is the one this file keeps
   * making. A rating row is an icon and two numbers: nothing binds, nothing
   * behaves, and the merchant swaps in their review app later. A product grid
   * or a cart button is the opposite — it needs binding or behaviour, and
   * hand-built it is a dead picture. Those are refused here; everything else is
   * allowed.
   */
  extras: productExtras,

  query: words(120, "product photography"),
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
  columns: whole(1, 4, 3),
  /** how many cards the grid renders */
  limit: whole(1, 24, 6),
  /**
   * Where the products come from.
   *
   * `collection` binds to the products IN the collection the page is showing,
   * which is the only correct answer on a collection page and the reason this
   * field exists: exported with the store-wide source, a collection page shows
   * the same products as every other page and the collection it is named after
   * is nowhere on it.
   *
   * `store` is the store-wide list — bestsellers or featured on a home page.
   */
  source: choice(["store", "collection"] as const, "store"),
  /** a grid, or a carousel when the row would otherwise run off the page */
  listLayout: choice(["grid", "slideshow"] as const, "grid"),
  /** search phrase for the placeholder photo the mockup shows */
  query,
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
 *
 * `kind` is the field that cost a finished page and 30,268 tokens by being an
 * enum the model reached past — it wrote `textarea`, which is what the thing is
 * called everywhere except here. It now reads as `text` instead of failing, and
 * the synonyms the model is most likely to try are mapped to what they mean.
 */
const FIELD_KIND: Record<string, "text" | "email" | "phone" | "message"> = {
  text: "text",
  email: "email",
  phone: "phone",
  message: "message",
  /* what a model calls these when it is not reading our enum */
  tel: "phone",
  telephone: "phone",
  number: "phone",
  textarea: "message",
  multiline: "message",
  comment: "message",
  name: "text",
  string: "text",
};

const form = z.object({
  type: z.literal("form"),
  /** `contact` reaches the shop's contact inbox; `signup` creates a subscriber */
  intent: choice(["contact", "signup"] as const, "contact"),
  fields: list(
    z.object({
      label: saying(60),
      /** text = one line, email, phone, message = multi-line */
      kind: z
        .unknown()
        .transform((v) =>
          typeof v === "string" ? (FIELD_KIND[v.trim().toLowerCase()] ?? "text") : "text",
        ),
      required: flag(false),
    }),
    8,
  ).transform((fields) =>
    /* A form with no usable fields is a Send button over nothing. One email
       input is the honest minimum and is what both intents want anyway. */
    fields.length ? fields : [{ label: "Email", kind: "email" as const, required: true }],
  ),
  submitText: words(40, "Send"),
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
  label: words(60, "custom"),
  /** markup only; no script, no event attributes */
  html: saying(4000),
  /* Named `stylesheet`, not `css`: every other node already has a `css` and it
     means something different — a style object for the node itself. Two keys
     one letter apart with different shapes is a bug waiting for a tired
     evening. */
  /** scoped to this node automatically — write `.wave`, not `.pfd-c-3 .wave` */
  stylesheet: spare(2000),
  /** runs once, wrapped, with `root` bound to this node's element */
  js: spare(1500),
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
  query,
  ratio: within(0.2, 4, 0.62),
  scrim: choice(["left", "bottom", "full", "none"] as const, "left"),
  align: choice(["bottom-left", "center", "top-left"] as const, "bottom-left"),
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
  edge: choice(["bottom", "top"] as const, "bottom"),
  mobileOnly: flag(false),
  ...styled,
});

/** Two photographs and a handle. PageFly has a native element for this. */
const beforeAfter = z.object({
  type: z.literal("beforeAfter"),
  beforeQuery: query,
  afterQuery: query,
  beforeLabel: words(40, "Before"),
  afterLabel: words(40, "After"),
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
  value: saying(12),
  suffix: words(12),
  prefix: words(12),
  label: words(80),
  ...styled,
});

/* `slideshow` is NOT declared here. It holds design nodes, so it has to be
   built inside the `z.lazy` below alongside `row` and `col` — declared out
   here it would reference `node` before `node` exists, and TypeScript reports
   that as the whole union silently becoming `any`. */

const accordion = z.object({
  type: z.literal("accordion"),
  /* No fallback row here, unlike `form`: an accordion whose questions all
     failed has nothing to ask, and inventing one for a merchant's FAQ would be
     putting words in their mouth. It fails, and the list above it drops it. */
  items: list(z.object({ q: saying(200), a: saying(1200) }), 12).refine(
    (v) => v.length > 0,
  ),
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
  | {
      /* Written out rather than inferred: `extras` holds DesignNode[], and
         `z.infer` on a schema whose own type refers back to this union is a
         circular reference TypeScript resolves to `any`. Every other container
         in this file is written out for the same reason. */
      type: "product";
      layout: "sideBySide" | "stacked";
      title: string;
      price: string;
      compareAt?: string;
      atcText: string;
      swatches: number;
      gallery: boolean;
      galleryEdge: "bottom" | "left" | "right" | "top";
      qty: boolean;
      stock: boolean;
      express: boolean;
      badge: string;
      badgeCorner: "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT";
      extras: DesignNode[];
      query: string;
      css?: Css;
      mobile?: Css;
      anim?: Anim;
    }
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
      perView: whole(1, 4, 3),
      autoplay: flag(false),
      ...styled,
      slides: list(node, 12).refine((v) => v.length > 0),
    }),
    /* Both hold children, so both are built here rather than above — declared
       outside the lazy union they would reference `node` before it exists, and
       TypeScript reports that as the whole union silently becoming `any`. */
    z.object({
      type: z.literal("overlay"),
      query,
      ratio: within(0.2, 4, 0.62),
      scrim: choice(["left", "bottom", "full", "none"] as const, "left"),
      align: choice(["bottom-left", "center", "top-left"] as const, "bottom-left"),
      ...styled,
      children: list(node, 24),
    }),
    z.object({
      type: z.literal("marquee"),
      /** seconds for one full pass; lower is faster */
      speed: within(8, 120, 28),
      ...styled,
      children: list(node, 24).refine((v) => v.length > 0),
    }),
    z.object({
      type: z.literal("sticky"),
      edge: choice(["bottom", "top"] as const, "bottom"),
      mobileOnly: flag(false),
      ...styled,
      children: list(node, 12),
    }),
    z.object({
      type: z.literal("row"),
      ...styled,
      children: list(node, 24),
    }),
    z.object({
      type: z.literal("col"),
      ...styled,
      children: list(node, 24),
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
  pattern: spare(60),
  /** what this band is for — nav, hero, footer… Not rendered; it is how the
      renderer knows a nav from a footer and how failures name themselves. */
  role: words(40, "section"),
  /**
   * A photograph or a video behind the whole band.
   *
   * A NEW FIELD RATHER THAN CSS, for the reason every other setting on this
   * page is a setting: PageFly's FlexSection owns `src`, `videoBg`, `bgType`
   * and `filterColor`, so a background written as CSS would be a background the
   * merchant cannot change and a video that cannot exist at all.
   *
   * A GRADIENT IS NOT HERE. `css.backgroundImage` already takes one and the
   * exporter already passes it through, so adding a third `kind` would be
   * vocabulary that buys nothing. The skill says when a gradient is the right
   * answer, which is more often than a photograph.
   *
   * `scrim` is the legibility layer, and it is not optional on a band with text
   * over it: `filterColor` is what makes a heading readable on someone else's
   * photograph, and the audit checks it.
   */
  bg: z
    .object({
      kind: choice(["photo", "video"] as const, "photo"),
      /** English stock search terms, as `image.query` */
      query,
      scrim: choice(["none", "soft", "strong"] as const, "soft"),
    })
    .nullish()
    .catch(null),
  ...styled,
  children: list(node, 32),
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
  motionPlan: spare(600),
  /**
   * The one check in this file that is still allowed to reject the document.
   *
   * Everything above drops what it cannot use, so reaching here with no
   * sections means the model returned something that was not a page at all —
   * the wrong shape, or an apology, or an empty object. That is worth failing
   * on and worth saying out loud, because it is the only remaining failure that
   * a merchant could hit, and the log line names it.
   */
  sections: list(section, 24).refine((v) => v.length > 0, {
    message: "no usable sections",
  }),
});

export type DesignSection = z.infer<typeof section>;
export type DesignTree = z.infer<typeof designTreeSchema>;

/**
 * Containers, for the walkers that need to recurse without a type switch.
 *
 * `slides` counts. Slideshow is the one container that does not call its
 * children `children`, and leaving it out made this function quietly lie: the
 * exporter asks it whether the page contains any scroll-reveal before deciding
 * to emit the observer script, so a reveal inside a carousel produced an
 * element marked to animate and nothing to animate it. `needsFill` and the
 * node count in `designServer` read it too, and were undercounting for the
 * same reason.
 */
export function childrenOf(n: DesignNode | DesignSection): DesignNode[] {
  if ("children" in n && Array.isArray(n.children)) return n.children;
  if ("slides" in n && Array.isArray(n.slides)) return n.slides;
  return [];
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
