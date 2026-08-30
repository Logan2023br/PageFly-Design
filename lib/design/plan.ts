import "server-only";

import { createHash } from "node:crypto";
import { sliceSkill, sliceIds } from "../ai/skills";
import { GENERAL_VERTICAL, isKnownVertical, slugForLabel } from "../verticals";
import { elementForPattern } from "./elementFor";
import type { Brief } from "../validation";

/* ==========================================================================
   The build order. Deterministic, no model, no network, no tokens.

   This is the change the whole rebuild turns on. v1 asked the model to choose a
   structure and every page came back with the same one, because a prompt that
   describes a good page IS a template — the model was obeying, not deciding
   badly. Structure is now decided here, in code that can be tested, and the
   model is left the work it is genuinely good at: this store's words and this
   store's pictures.

   THE ORDER IS ALWAYS COMPLETE. A merchant who filled in Step 1 and Step 2 and
   nothing else still gets a vertical, an archetype, a signature slot, a hero
   pattern, a ban list, a motion register and a padding rhythm. Nothing in here
   reads `brief.prompt` or the reference images — that is the guarantee that an
   empty brief cannot produce a basic page, and it is why those two are handled
   downstream as narrowing rather than as input.

   WHERE PER-STORE DIFFERENCE COMES FROM. Not from asking a model to be
   creative — v1 tried that and got randomly bad instead of usefully different.
   It comes from a seed: two stores in the same vertical roll different
   candidates from the same validated list, so both pages are good and neither
   is the other.
   ========================================================================== */

export type SectionRole =
  | "hero"
  /**
   * The product itself — a buy box, or a grid of the store's products.
   *
   * The role the library did not have. Every other role here is editorial: it
   * says something ABOUT a product. A Product page whose arc contains only
   * editorial roles comes back as eight bands of story with nothing to buy, and
   * a Collection page comes back with none of the collection on it. Both did,
   * and no prompt could have fixed it — the model was never given a slot to put
   * a product in.
   */
  | "commerce"
  | "proof"
  | "media"
  | "content"
  | "conversion"
  | "utility";

export type Padding = "statement" | "standard" | "dense" | "utility";

/**
 * What a text-bearing element is FOR, in type terms — not a pixel size.
 *
 * The pass that fills this in writes blind: it has not seen a word of the copy.
 * A `font-size` chosen there is a guess, and a headline of fourteen words under
 * a size picked for four is a broken page. Layout has no such problem — 44/56
 * is 44/56 whatever the words turn out to be — so layout is given as numbers
 * and type as intent, and the model that knows the words turns the intent into
 * pixels.
 */
export type Scale = "oversized" | "large" | "body" | "caption" | "eyebrow";

/** One element the design pass wants inside a band, and what it does. */
export type SpecNode = {
  /** an element type from `schema.ts`, or "row" / "col" */
  el: string;
  /** text-bearing elements only */
  scale?: Scale;
  /** `bound` only: which part of the buy box goes at this position */
  slot?: string;
  /**
   * One phrase saying what this element is FOR on this store's page.
   *
   * The difference between "a text node here" and a design. Free text, because
   * it is read by the model that writes the copy rather than matched by code —
   * the band's `brief` says what the band is about, and this says what one
   * element inside it carries.
   */
  note?: string;
  /** this child's share of its row, e.g. "44%" */
  basis?: string;
  /** space between this node's children, px */
  gap?: number;
  /** images: height ÷ width */
  ratio?: number;
  anim?: { hover?: string; reveal?: string; delay?: number };
  /**
   * Exact declarations for THIS element, and only what differs from `PageStyle`.
   *
   * The field that closes the gap between what stage 2b could think and what it
   * could say. It used to have `basis`, `gap` and `ratio` — three numbers — so
   * a padding, a radius, a shadow, a letter-spacing or a font size had to be
   * described in the `note` as English and translated back into CSS by the
   * build model, which is a lossy round trip through prose for something that
   * was already a value.
   *
   * Same key set the tree accepts, and the same ban list: `position`, `inset`,
   * `top/right/bottom/left`, `zIndex`, `float` and `transform` are dropped here
   * exactly as `schema.ts` drops them. That is not an oversight to fix — a
   * mockup that lies about where a thing sits is worse than a plain one, and
   * those properties fight PageFly's layout engine on export. A spec asking for
   * them would be a spec the page cannot honour.
   */
  css?: Css;
  /** a name from `PageStyle.treatments`, applied before `css` */
  use?: string;
  /**
   * Absent or false means the built section must contain it.
   *
   * Required is the default rather than optional because a spec whose every
   * line is a suggestion is the situation this whole stage exists to end.
   */
  optional?: boolean;
  children?: SpecNode[];
};

export type SectionSpec = { nodes: SpecNode[] };

/**
 * The declarations every band on a page shares, written ONCE.
 *
 * Stage 2b used to say everything per node, in prose, capped at 200 characters.
 * The palette, the type scale and the motion curve are the same on band one and
 * band nine, so repeating them nine times bought nothing and cost output tokens
 * at $25/MTok — the most expensive place in the pipeline to be redundant.
 *
 * So they are stated here and referenced below. A node carries only what
 * DIFFERS from these, and `treatments` lets a recurring object — a card, a pill
 * — be named once and applied by name.
 */
export type PageStyle = {
  /** role → exact declarations, e.g. `heading: { fontSize: "clamp(52px,7.2vw,92px)" }` */
  type?: Record<string, Css>;
  /** name → declarations applied wherever a node says `use: name` */
  treatments?: Record<string, Css>;
  /** one line on the page's motion: durations, easing, stagger */
  motion?: string;
  /** anything that is true of the whole page and is not type or a treatment */
  note?: string;
};

/** Exactly the shape `schema.ts` accepts on a node's `css`. */
export type Css = Record<string, string | number>;

export type OrderSection = {
  role: SectionRole;
  /** block id in 20-patterns.md */
  pattern: string;
  /**
   * One sentence saying what this band contains on THIS store's page.
   *
   * Only `deckPlan.ts` sets it — the two older deciders name a pattern and stop
   * there, and a pattern id is a shape rather than a subject. Null on both of
   * those paths, and the prompt simply omits the line, so nothing downstream
   * has to know which decider ran.
   */
  brief?: string | null;
  /** exactly one section in an order has this */
  signature: boolean;
  dark: boolean;
  padding: Padding;
  /** block id in 40-motion.md, or null */
  motion: string | null;
  /**
   * May this band carry a photograph or a video behind it?
   *
   * DECIDED HERE, not by the model, and the reason is arithmetic before it is
   * taste. Asking "does this section want a background?" of eight sections is
   * eight judgements per page, and Phase 3 measured that building to a precise
   * spec costs MORE reasoning than choosing freely — so the question would be
   * paid for eight times. Worse, a model asked eight times says yes too often:
   * a page with photographs behind six of eight bands is a worse page than one
   * with two, and "every section is special" is how v1 produced one skeleton.
   *
   * At most two per page, and the model still chooses WHAT — a photograph, a
   * video, a gradient, or nothing at all. Structure in code, content in the
   * model, which is the whole shape of this rebuild.
   */
  mayHaveBg: boolean;
  /**
   * The elements inside this band, when stage 2b ran and its answer survived.
   *
   * Null on every other path, exactly as `brief` is — the older deciders name a
   * band and stop. The prompt omits the block when it is null, so nothing
   * downstream has to know which decider ran.
   */
  spec?: SectionSpec | null;
};

/**
 * One decided slot: a role, and the pattern that fills it.
 *
 * The unit both deciders speak in — `planPage` resolving from the arc, and
 * `structure.ts` reading a model's answer. Everything downstream of a list of
 * these is shared, which is the point of naming it.
 */
export type Slot = { role: SectionRole; pattern: string };

export type Order = {
  /**
   * What every band of this page shares, from stage 2b.
   *
   * On the Order rather than on each `OrderSection` because that is exactly the
   * property it has: one per page. Optional — the two older deciders never set
   * it, and a page without one is the page as it was before this existed.
   */
  style?: PageStyle | null;
  vertical: string;
  archetype: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  sections: OrderSection[];
  /** union of the above, for sliceSkill — deduped, in first-use order */
  motionIds: string[];
  patternIds: string[];
};

/* ---- the vertical row, parsed ------------------------------------------- */

export type VerticalRow = {
  archetype: Order["archetype"];
  hero: string | null;
  signature: string | null;
  /** the vertical's second-choice signature, when it names one */
  also: string[];
  /** patterns and treatments this trade must not use */
  ban: string[];
  /** the register, verbatim, for the motion picker to read */
  motion: string;
};

/* `ban` is prose — "spec-grid, ingredient-list, comparison-table, urgency
   countdowns" — mixing pattern ids with descriptions of treatments. Only the
   ids can be enforced here; the prose reaches the model through the sliced
   block, which is where a sentence like "no urgency countdowns" belongs. */
function parseVertical(slug: string): VerticalRow {
  const text = sliceSkill("verticals", [slug]);

  const arch = /(?:^|\s)arch\s+([A-G])\b/.exec(text)?.[1] as Order["archetype"] | undefined;
  const hero = /hero\s+`([a-z0-9-]+)`/.exec(text)?.[1] ?? null;

  /* The signature line names one pattern in backticks and sometimes a second
     after "also". Both are read; the first is preferred and the rest become
     alternates the seed can reach. */
  const sigLine = /^signature\s+(.+)$/m.exec(text)?.[1] ?? "";
  const sigIds = [...sigLine.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);

  const banLine = /^ban\s+(.+)$/m.exec(text)?.[1] ?? "";
  /* Split on commas, keep only the tokens that are real pattern ids. A `ban`
     entry like "urgency countdowns" is not a pattern and cannot be enforced by
     removing one — it is guidance, and it travels in the block itself. */
  const banIds = banLine
    .split(/[,·]/)
    .map((s) => s.trim().replace(/`/g, ""))
    .filter(Boolean);

  return {
    archetype: arch ?? "E",
    hero,
    signature: sigIds[0] ?? null,
    also: sigIds.slice(1),
    ban: banIds,
    motion: /^motion\s+(.+)$/m.exec(text)?.[1] ?? "",
  };
}

/* ---- candidates per role ------------------------------------------------ */

/**
 * Which patterns can fill which role.
 *
 * Read from the `## ` group headings of `20-patterns.md` rather than listed
 * here, so a pattern added to the file is available the moment it lands. A
 * hand-kept copy of this list is a list that goes stale silently.
 */
const GROUP_ROLE: Record<string, SectionRole> = {
  "Hero patterns": "hero",
  Commerce: "commerce",
  "Proof and specification": "proof",
  "Image and atmosphere": "media",
  "Content and story": "content",
  Conversion: "conversion",
};

/* A handful of Conversion and Proof patterns are what a `utility` slot wants —
   a thin band of reassurance rather than a section of argument. Named because
   the file has no `## Utility` group and inventing one would mean editing a
   file the package owns. */
const UTILITY_PATTERNS = [
  "guarantee-row",
  "certification-logo-row",
  "newsletter-inline",
];

let candidateCache: Map<SectionRole, string[]> | null = null;

function candidates(): Map<SectionRole, string[]> {
  if (candidateCache) return candidateCache;

  const byRole = new Map<SectionRole, string[]>();
  for (const role of ["hero", "commerce", "proof", "media", "content", "conversion", "utility"] as SectionRole[])
    byRole.set(role, []);

  /* `sliceIds` gives ids in file order; the group each belongs to is recovered
     by walking the file's headings once. */
  const ids = sliceIds("patterns");
  const groups = groupOf(ids);

  for (const id of ids) {
    const role = GROUP_ROLE[groups.get(id) ?? ""];
    if (role) byRole.get(role)!.push(id);
    if (UTILITY_PATTERNS.includes(id)) byRole.get("utility")!.push(id);
  }

  candidateCache = byRole;
  return byRole;
}

/** Which role a pattern belongs to, from the candidate map. */
function roleOfPattern(pool: Map<SectionRole, string[]>, id: string): SectionRole | null {
  for (const [role, ids] of pool)
    /* `utility` is a second home for three Conversion patterns, so it is
       checked last — a `guarantee-row` signature means the conversion slot. */
    if (role !== "utility" && ids.includes(id)) return role;
  return pool.get("utility")?.includes(id) ? "utility" : null;
}

/** id → the `## ` heading it sits under. */
function groupOf(ids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  /* The file is read through sliceSkill for its blocks; the headings are not
     part of any block, so they are recovered from the raw text. Reading it a
     second time is cheap and happens once per process. */
  const text = sliceSkill("patterns", ids);
  /* sliceSkill strips the headings, so fall back to reading the file directly.
     Kept behind a try: a missing file already yields no candidates elsewhere. */
  try {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const dir = process.env.PFD_SKILLS_DIR ?? join(process.cwd(), "skills");
    const raw = readFileSync(join(dir, "_sliced", "20-patterns.md"), "utf8");
    let heading = "";
    for (const line of raw.split("\n")) {
      const h = /^##\s+(.+)$/.exec(line);
      if (h) heading = h[1].trim();
      const b = /^<!--#([a-z0-9-]+)-->/.exec(line);
      if (b && b[1] !== "id") out.set(b[1], heading);
    }
  } catch {
    /* No file: every role ends up empty and `planPage` falls back. */
  }
  void text;
  return out;
}

/* ---- arcs ---------------------------------------------------------------- */

/**
 * The running order of ROLES for a page type. Patterns are resolved per role.
 *
 * Roles rather than patterns because the arc is the argument a page makes —
 * show it, reassure, prove it, explain it, ask — and that argument is the same
 * for every store selling the same kind of thing. What differs by store is
 * which pattern makes each move, and that is the seed's job.
 */
/* ==========================================================================
   ONE ARC PER PAGE TYPE, because a page type IS an arc.

   Eight types had their own and eighteen fell through to `about`, so a Sale page
   had no products on it, a Bundle had nothing to bundle, a Gift card could not
   be bought and a Lookbook was a page of prose. Exactly the failure the Product
   and Collection pages had, spread across half the catalogue and invisible
   because `about` is a perfectly reasonable arc — for an About page.

   Written as a table because that is what it is. Reading down a row should tell
   you what the page is FOR:

     a Sale page shows products twice and states the offer between them
     a Careers page tells a story and ends in a form
     a Wholesale page argues, proves, and ends in a form
     a Lookbook is photographs with one place to buy from

   `commerce` appears wherever a shopper on that page could reasonably buy
   something. It is absent from `careers`, `press`, `shipping` and `legal`
   because a products row there is a shop interrupting a conversation.
   ========================================================================== */
const ARCS: Record<string, SectionRole[]> = {
  /* ---- core --------------------------------------------------------------- */
  home: ["hero", "utility", "media", "commerce", "proof", "content", "proof", "conversion"],
  /* A product page OPENS with the product. No separate hero: a real PDP puts
     the gallery and the price on the first screen, and a hero above them
     pushes the price to 900px. */
  product: ["commerce", "utility", "proof", "media", "content", "proof", "content", "conversion"],
  /* Two commerce slots, and they are different sections: a wide grid of the
     collection, then — after one editorial band to break the wall — a carousel.
     A collection page whose products appear once, six cards wide, is a landing
     page wearing a collection's name. */
  collection: ["hero", "commerce", "content", "commerce", "media", "conversion"],

  /* ---- trust & info ------------------------------------------------------- */
  about: ["hero", "content", "media", "proof", "content", "conversion"],
  contact: ["hero", "conversion", "utility"],
  faq: ["hero", "content", "utility", "conversion"],
  reviews: ["hero", "proof", "proof", "media", "conversion"],
  /* A size guide is a reference document. The table is the page; everything
     around it is how to read the table. */
  "size-guide": ["hero", "content", "proof", "content", "conversion"],
  /* Policy. Short, scannable, and it ends in the question the reader actually
     came with — which is why the FAQ-shaped content slot is last, not first. */
  shipping: ["hero", "utility", "content", "content", "conversion"],
  "store-locator": ["hero", "content", "utility", "conversion"],
  /* A careers page is a story about working somewhere, and it ends in a form.
     No commerce: a products row in the middle of a job advert is a shop
     interrupting a conversation. */
  careers: ["hero", "content", "media", "content", "conversion"],
  press: ["hero", "utility", "proof", "content", "conversion"],
  sustainability: ["hero", "content", "proof", "media", "content", "conversion"],

  /* ---- content ------------------------------------------------------------ */
  /* Neither of these can be right yet — see the note under ARCS on the two
     missing nodes. A blog listing with no article list is the same bug as a
     collection with no products, and it is a vocabulary gap rather than an arc
     one. The arcs here are the best a page can do without them. */
  "blog-list": ["hero", "content", "content", "media", "conversion"],
  "blog-article": ["hero", "content", "media", "content", "proof", "conversion"],
  /* Photographs, and one place to buy from. The commerce slot is what separates
     a lookbook from a gallery. */
  lookbook: ["hero", "media", "media", "commerce", "media", "conversion"],
  ugc: ["hero", "media", "proof", "media", "conversion"],

  /* ---- conversion --------------------------------------------------------- */
  /* A sale page is a shop with a reason. Products twice, the offer stated
     between them. */
  sale: ["hero", "utility", "commerce", "proof", "commerce", "conversion"],
  bundle: ["hero", "commerce", "content", "proof", "conversion"],
  /* A gift card IS a product; the page is a buy box with an explanation. */
  "gift-card": ["hero", "commerce", "content", "proof", "conversion"],
  comparison: ["hero", "proof", "content", "proof", "conversion"],
  /* A quiz is a form with a promise above it. Nothing else earns the room. */
  quiz: ["hero", "content", "conversion", "utility"],
  upsell: ["hero", "commerce", "proof", "conversion"],
  membership: ["hero", "content", "proof", "conversion", "conversion"],
  /* B2B: argue, prove, then ask. The last slot is a real form, not a CTA band —
     a wholesale enquiry that ends in "email us" loses the enquiry. */
  wholesale: ["hero", "proof", "content", "content", "conversion"],
  affiliate: ["hero", "proof", "content", "conversion"],

  /* ---- landing pages -----------------------------------------------------
     Nine types shared one arc, which was defensible — they are all one offer
     and one CTA — and wrong for the four where the offer IS a product. Those
     four get commerce; the rest keep the shape LP_ARC had. */
  "lp-launch": ["hero", "commerce", "utility", "proof", "media", "content", "proof", "conversion"],
  "lp-bfcm": ["hero", "utility", "commerce", "proof", "commerce", "conversion"],
  "lp-discount": ["hero", "utility", "commerce", "proof", "conversion"],
  "lp-influencer": ["hero", "media", "commerce", "proof", "conversion"],
  /* Long-form prose that argues its way to a product. Three content slots is
     the point of the format, not padding. */
  "lp-advertorial": ["hero", "content", "content", "media", "proof", "content", "conversion"],
  "lp-waitlist": ["hero", "content", "proof", "conversion"],
  "lp-lead-gen": ["hero", "content", "proof", "conversion", "utility"],
  "lp-event": ["hero", "content", "proof", "content", "conversion"],
  "lp-app": ["hero", "media", "proof", "content", "conversion"],
};

/* Every `lp-*` shares one arc — a landing page is a landing page whatever it is
   landing. Kept separate from the table so a new lp type needs no edit. */
const LP_ARC: SectionRole[] = [
  "hero",
  "utility",
  "content",
  "media",
  "proof",
  "conversion",
  "proof",
  "content",
  "conversion",
];

/* Pages that are a form, a gate or a legal notice. An arc would be a fiction:
   they have one job and the page is that job. */
/* ==========================================================================
   SLOTS THAT ARE NOT A MATTER OF TASTE.

   Everywhere else in this resolver the seed picks, because two stores in one
   trade must not get the same page. Some slots have one right answer and rolling
   for them means some pages come back wrong:

   - A product page's first section is a buy box. Nobody asked for variety in
     whether their product is on their product page.
   - A wholesale, careers or quiz page ENDS IN A FORM. Left to the seed, a
     wholesale page ended in a price band — an enquiry page that does not take
     the enquiry.
   - A blog listing does not end in a price band either. It ends in a newsletter.

   Keyed by page type, then by role, then by occurrence — so a page with two
   commerce slots gets two DIFFERENT sections rather than the same grid twice.
   A role absent here is drawn by the seed as normal, which is the right default
   for everything that IS a matter of taste.
   ========================================================================== */
type Pins = Partial<Record<SectionRole, string[]>>;

/** The ending a page type earns, when its ending is not a choice. */
const FORM_END: Pins = { conversion: ["lead-form-split"] };
const LETTER_END: Pins = { conversion: ["newsletter-inline"] };

const PINNED: Record<string, Pins> = {
  /* ---- one product, and the page is about it ---------------------------- */
  product: { commerce: ["product-detail-gallery"] },
  "gift-card": { commerce: ["product-detail-wide"], conversion: ["cta-band-full"] },
  "lp-launch": { commerce: ["product-detail-gallery"] },

  /* ---- a shop: many products, twice where the arc has room -------------- */
  collection: { commerce: ["collection-grid-3up", "collection-carousel"] },
  sale: { commerce: ["collection-grid-4up", "collection-carousel"] },
  "lp-bfcm": { commerce: ["collection-grid-4up", "collection-carousel"] },
  "lp-discount": { commerce: ["collection-grid-3up"] },

  /* ---- a deliberate few, not a wall ------------------------------------- */
  home: { commerce: ["collection-featured-row"] },
  lookbook: { commerce: ["collection-featured-row"], conversion: ["cta-band-full"] },
  upsell: { commerce: ["collection-featured-row"] },
  bundle: { commerce: ["collection-featured-row"], conversion: ["bundle-picker"] },
  "lp-influencer": { commerce: ["collection-featured-row"] },

  /* ---- pages whose whole purpose is the form at the end ---------------- */
  contact: FORM_END,
  wholesale: FORM_END,
  careers: FORM_END,
  quiz: FORM_END,
  affiliate: FORM_END,
  "lp-lead-gen": FORM_END,
  "lp-waitlist": FORM_END,
  "lp-event": FORM_END,

  /* ---- pages that end by asking to stay in touch ----------------------- */
  "blog-list": LETTER_END,
  "blog-article": LETTER_END,
  ugc: LETTER_END,
  press: LETTER_END,
  sustainability: LETTER_END,
  shipping: LETTER_END,
  "size-guide": LETTER_END,
  "store-locator": LETTER_END,

  /* ---- and one that is a price comparison, twice ------------------------ */
  membership: { conversion: ["plan-comparison", "cta-band-full"] },
};

const MINIMAL_ARC: SectionRole[] = ["hero", "conversion"];
const MINIMAL_TYPES = new Set([
  "password",
  "login",
  "404",
  "legal",
  "dashboard",
  "order-tracking",
  "cart",
  "search",
  "thank-you",
  "coming-soon",
]);

/**
 * The arc for a page type, most specific first.
 *
 * ORDER MATTERS AND IT WAS WRONG. The `lp-` prefix was tested before the table,
 * so the nine landing arcs written into `ARCS` were unreachable and every
 * landing page kept the one generic shape — a change that typechecks, passes,
 * and does nothing. The table is now consulted before either fallback.
 *
 * Both fallbacks stay, for a page type added to the catalogue before it is added
 * here: a new `lp-` gets the landing shape, anything else gets `about`. Neither
 * is silent — `scripts/test-plan.ts` walks the catalogue and names any type
 * still relying on one.
 */
function arcFor(pageType: string): SectionRole[] {
  if (MINIMAL_TYPES.has(pageType)) return MINIMAL_ARC;
  if (ARCS[pageType]) return ARCS[pageType];
  if (pageType.startsWith("lp-")) return LP_ARC;
  return ARCS.about;
}

/** Which page types are getting a generic arc rather than their own. */
export function _fallbackArcTypes(types: string[]): string[] {
  return types.filter((t) => !MINIMAL_TYPES.has(t) && !ARCS[t]);
}

/* ==========================================================================
   WHAT THE OTHER DECIDER NEEDS.

   `structure.ts` asks a model for the section list instead of drawing it from
   the arc. These are the facts it has to hand the model, and the facts it has to
   check the answer against — exported rather than duplicated, because a copy of
   the pattern vocabulary or of the correctness pins would go stale the day
   somebody edits the file it came from.
   ========================================================================== */

/** Every pattern id, grouped by the role it can fill. */
export function patternsByRole(): Map<SectionRole, string[]> {
  return candidates();
}

/** The role a pattern belongs to — a fact about the pattern file, not a choice. */
export function roleFor(pattern: string): SectionRole | null {
  return roleOfPattern(candidates(), pattern);
}

/** The vertical's row, parsed. */
export function verticalRow(slug: string): VerticalRow {
  return parseVertical(slug);
}

/** Which vertical a brief resolves to. */
export function verticalFor(
  brief: Pick<Brief, "whatYouSell" | "verticalSlug">,
): string {
  return verticalOf(brief as never);
}

/**
 * The patterns this page type must contain whatever else it contains.
 *
 * Not taste. A product page without a buy box, a wholesale page that does not
 * take the enquiry — the comment above `PINNED` calls these matters of
 * correctness, and they stay true no matter who decided the rest of the page.
 */
export function pinnedFor(pageType: string): string[] {
  const pins = PINNED[pageType] ?? {};
  return Object.values(pins).flat().filter(Boolean) as string[];
}

/**
 * The two pins that are a FORM, and are no longer inserted behind the designer.
 *
 * WHY THEY WERE SPLIT OUT. Sixteen page types pin one of these — eight end in
 * `lead-form-split`, eight in `newsletter-inline` — so a deck of seven pages
 * came back with the same form band bolted to the foot of nearly all of them,
 * whether the page had earned it or not. The insert is silent: a designer that
 * chose to end an About page on its own photograph got a newsletter appended
 * underneath anyway, and the note saying so goes to a log nobody reads.
 *
 * They stay in `PINNED` because two things still want them. The deterministic
 * planner fills its conversion slot from the table, and a Contact page built
 * without a model must still take the enquiry. And the deck prompt still names
 * them per page type — as the ending this page type usually earns, which the
 * designer may overrule, rather than as a requirement.
 *
 * What changed is only the repair: a form the designer left out stays out.
 * Every other pin — the buy box, the collection grids — is still correctness
 * and is still inserted, because a product page without a buy box is not a
 * page with a different ending, it is a broken page.
 */
const FORM_PINS = new Set(["lead-form-split", "newsletter-inline"]);

/** True for a pin the designer may decline: see `FORM_PINS`. */
export function isAdvisoryPin(pattern: string): boolean {
  return FORM_PINS.has(pattern);
}

/**
 * The `vertical` a free design carries, and a sentinel rather than a trade.
 *
 * Free mode has no vertical: nothing looked one up, and the skill file that
 * describes trades is exactly what the mode exists not to read. It still has to
 * put SOMETHING in the field, because `Order` is the shape four deciders agree
 * on — so it puts this, and everything that would otherwise go looking checks
 * for it first. Without that, stage 3 asked `30-verticals.md` for a block named
 * "free" on every page and logged a miss.
 */
export const FREE_VERTICAL = "free";

/** True when this order was designed with no pattern library behind it. */
export function isFreeOrder(order: { vertical: string }): boolean {
  return order.vertical === FREE_VERTICAL;
}

/** True when this page type has ONE product in context — see `isBanned`. */
export function pageHasOneProduct(pageType: string): boolean {
  return (PINNED[pageType]?.commerce ?? []).some((id) => id.startsWith("product-detail"));
}

/** How many sections this page type's arc asks for, as a length to aim at. */
export function arcLength(pageType: string): number {
  return arcFor(pageType).length;
}

/**
 * Where this page type's arc puts a role — the position a missing pin belongs at.
 *
 * -1 when the arc has no slot for it. Asked for rather than guessed because
 * guessing produced a home page opening with a products row: a commerce pin put
 * at index 0 is right for a product page and wrong for every page whose commerce
 * slot is a row in the middle of something else.
 */
export function arcIndexOf(pageType: string, role: SectionRole): number {
  return arcFor(pageType).indexOf(role);
}

/**
 * An Order from a list of slots somebody else decided.
 *
 * The seam. Everything after this point is identical whether the arc chose the
 * slots or a model did, which is the only way the two paths can be held to the
 * same standard by the same test.
 */
export function orderFromSlots(
  brief: Pick<Brief, "whatYouSell" | "verticalSlug" | "visualStyle">,
  seed: string,
  slots: Slot[],
): Order {
  const vertical = verticalOf(brief);
  const row = parseVertical(vertical);
  const preferredSignature = row.signature
    ? slots.findIndex((s, i) => i > 0 && s.pattern === row.signature)
    : -1;
  return finish(slots, { vertical, row, seed, preferredSignature });
}

/* ---- the seed ------------------------------------------------------------ */

/**
 * A stable stream of numbers from a string.
 *
 * Two stores in the same vertical must differ; the same store rebuilding the
 * same page must not. A hash of domain, page type and style gives both — and
 * counter-based rather than stateful so the nth draw is the same regardless of
 * how many draws happened before it.
 */
function draw(seed: string, counter: number, limit: number): number {
  if (limit <= 0) return 0;
  const h = createHash("sha256").update(`${seed}|${counter}`).digest();
  return h.readUInt32BE(0) % limit;
}

export function seedFor(domain: string, pageType: string, visualStyle: string): string {
  return createHash("sha256")
    .update(`${domain}|${pageType}|${visualStyle}`)
    .digest("hex");
}

/* ---- motion -------------------------------------------------------------- */

/**
 * Up to three motion ids for a page, read from the vertical's register.
 *
 * The register is a sentence — "editorial — slow clip reveals, image-swap on
 * card hover · no counters" — and what it is for is to keep a jewellery page
 * from moving like a pet-supplies page. Matching on the words it uses is
 * cruder than a table would be and does not go stale when the file is edited,
 * which the table would.
 */
function motionFor(row: VerticalRow, seed: string): string[] {
  const said = row.motion.toLowerCase();

  /* Negation-aware. The registers say things like "no counters" and "no hover",
     and a plain substring test reads those as requests for exactly the effect
     being ruled out — `fashion-apparel` says "no counters" and was handed
     `counter-up`. A word preceded by "no ", "never " or "not " within a few
     characters is a prohibition, not a preference. */
  const has = (...words: string[]) =>
    words.some((w) => {
      let from = 0;
      for (;;) {
        const at = said.indexOf(w, from);
        if (at === -1) return false;
        const before = said.slice(Math.max(0, at - 12), at);
        if (!/\b(no|never|not|without|avoid)\s+$/.test(before)) return true;
        from = at + w.length;
      }
    });
  const available = new Set(sliceIds("motion"));

  const wanted: string[] = [];

  /* A reveal is the baseline unless the trade is explicitly still. */
  if (!has("no motion", "nothing moves", "still")) wanted.push("reveal");

  /* The signature effect, from what the register names. Order matters: the
     first match wins, so the more specific words come first. */
  const signature: [string[], string][] = [
    [["counter", "figures", "numbers"], "counter-up"],
    [["marquee"], "marquee"],
    [["before/after", "before-after", "drag"], "before-after-drag"],
    [["spec bar", "spec-bar", "bars fill"], "spec-bar-fill"],
    [["shine", "sheen"], "shine-sweep"],
    [["countdown", "urgency"], "countdown"],
    [["parallax"], "parallax-lite"],
    [["image-swap", "image swap"], "image-swap-hover"],
    [["stagger"], "stagger-grid"],
  ];
  for (const [words, id] of signature) {
    if (has(...words) && available.has(id)) {
      wanted.push(id);
      break;
    }
  }

  /* Hover, unless the register rules it out. `no counters` is common and is
     about counters, not about hover — matched precisely for that reason. */
  if (!has("no hover")) wanted.push("hover");

  const filtered = wanted.filter((id) => available.has(id));

  /* Never more than three. A page carrying five different effects has none
     that read as deliberate, and each id is prompt tokens. */
  if (filtered.length <= 3) return filtered;
  return [filtered[0], filtered[1], filtered[2 + (draw(seed, 91, filtered.length - 2) % Math.max(1, filtered.length - 2))]];
}

/* ---- the resolver -------------------------------------------------------- */

/** The vertical a brief resolves to, without guessing when it need not guess. */
export function verticalOf(brief: Pick<Brief, "whatYouSell" | "verticalSlug">): string {
  /* The chip is exact — the merchant told us. */
  if (brief.verticalSlug && isKnownVertical(brief.verticalSlug)) return brief.verticalSlug;

  /* A label typed or pasted verbatim still resolves exactly. */
  const byLabel = slugForLabel(brief.whatYouSell ?? "");
  if (byLabel) return byLabel;

  /* Free text. Deliberately NOT run through the twelve-vertical keyword matcher
     — its ids are a different taxonomy and mapping one onto the other is how
     `Team sports` became `food`. An unrecognised store gets the `general` row,
     which is a real block with a restrained register rather than a gap. */
  return GENERAL_VERTICAL;
}

/**
 * The complete build order for one page.
 *
 * Never throws and never returns a partial order: every failure inside — an
 * unknown vertical, a missing pattern file, an arc with no candidates for a
 * role — degrades to something buildable, because the caller's alternative is
 * a page that does not get built.
 */
/**
 * The hero the reference actually uses, as a pattern id.
 *
 * The one field of the style read that changes STRUCTURE rather than
 * appearance, which is why it comes into the resolver and the other seven go
 * straight to the model as facts. A merchant who uploads a page with a
 * full-bleed hero and gets a split one has been given a different page.
 */
const HERO_FOR_KIND: Record<string, string> = {
  "full-bleed-overlay": "hero-full-bleed-scrim",
  split: "hero-split-asymmetric",
  centered: "hero-centered-statement",
  "product-lead": "hero-product-lead",
  "type-only": "hero-type-only",
};

export function planPage(
  brief: Pick<Brief, "whatYouSell" | "verticalSlug" | "visualStyle">,
  pageType: string,
  seed: string,
  /** `heroKind` from the reference style read, when there was one */
  heroKind?: string | null,
): Order {
  const vertical = verticalOf(brief);
  const row = parseVertical(vertical);
  const pool = candidates();
  const arc = arcFor(pageType);

  /* Ban entries are written as families — `spec-grid` bans `spec-grid-4x2`,
     `ingredient-list` bans itself. Exact matching looked correct and banned
     nothing: no vertical's ban line names a full pattern id, so every ban in
     the file was inert and a fashion store could be handed a spec grid whenever
     the seed reached for one. */
  const bannedByVertical = (id: string) =>
    row.ban.some((b) => id === b || id.startsWith(`${b}-`));

  /* A HOME PAGE THAT OPENS WITH A BUY BOX.

     `hero-product-lead` is a `ProductBox` — its own block calls it "the product
     page opener" — and it sits under `## Hero` in the pattern file, so the hero
     slot offered it to every page type there is. A home page and a product page
     for the same store came back with the same first screen: the same photograph,
     the same price, the same Add to cart.

     Three separate routes delivered it, which is why the fix is here rather than
     at any one of them. The pool offered it on a plain seed draw; `row.hero`
     weighted it DOUBLE for the three trades that name it in `30-verticals.md`;
     and `HERO_FOR_KIND["product-lead"]` PINNED it — beating both the seed and the
     vertical — for any merchant who uploaded a product-page screenshot, since one
     style read is applied to every page in the deck. All three read this list.

     It is not only a repeated screen. A `ProductBox` is bound to nothing by the
     exporter; it takes the product from the page's own context, and only a
     product page has one. On a home page the buy box arrives with no product in
     it, so this is correctness before it is taste.

     WHICH PAGES HAVE ONE PRODUCT is not a new list — it is already written down
     in `PINNED`, as the page types whose commerce slot is a `product-detail`.
     Derived rather than restated, because a second list goes stale silently: the
     nine landing arcs were unreachable for a week because `arcFor` tested a
     prefix before consulting its table. */
  const pageHasOneProduct = (PINNED[pageType]?.commerce ?? []).some((id) =>
    id.startsWith("product-detail"),
  );
  const needsAProduct = (id: string) => elementForPattern(id) === "ProductBox";

  const isBanned = (id: string) =>
    bannedByVertical(id) || (needsAProduct(id) && !pageHasOneProduct);
  const used = new Set<string>();

  /* Pattern per slot. The candidate list for the role, minus the vertical's
     bans, minus what this page already used — then the seed picks. */
  const chosen: Slot[] = [];

  /* The signature slot is decided BEFORE the others and gets the vertical's own
     signature pattern. The first version put that pattern at the head of the
     candidate list and left the seed to pick uniformly, which is the same as
     not preferring it at all — fashion, skincare and tools all came back with
     `gallery-masonry-3`, and no vertical ever got the section it is known for.

     `null` when the pattern's role does not appear in this arc: a contact page
     has no media slot and should not grow one to hold a lookbook. */
  const signatureRole = row.signature ? roleOfPattern(pool, row.signature) : null;
  const signatureSlot =
    row.signature && signatureRole && !isBanned(row.signature)
      ? arc.findIndex((role, i) => i > 0 && role === signatureRole)
      : -1;

  /* How many slots of each role have been filled, so the second commerce slot
     and the second conversion slot get the second pin rather than the first. */
  const seen = new Map<SectionRole, number>();

  arc.forEach((role, i) => {
    /* Pinned before anything else, including the vertical's signature: a
       vertical's signature pattern is a matter of taste and a product page
       without a buy box is a matter of correctness. */
    const nth = seen.get(role) ?? 0;
    seen.set(role, nth + 1);
    const pinned = PINNED[pageType]?.[role]?.[nth];
    if (pinned && !isBanned(pinned)) {
      used.add(pinned);
      chosen.push({ role, pattern: pinned });
      return;
    }

    if (i === signatureSlot && row.signature) {
      used.add(row.signature);
      chosen.push({ role, pattern: row.signature });
      return;
    }

    const list = (pool.get(role) ?? []).filter((id) => !isBanned(id));

    /* Repeats only when the role has run out of unused patterns — the arc asks
       for `proof` twice on purpose, and two `social-proof-wall` sections is a
       page repeating itself. */
    const fresh = list.filter((id) => !used.has(id));
    const from = fresh.length > 0 ? fresh : list;

    if (from.length === 0) {
      /* No candidates: the pattern file is missing, or the vertical bans the
         whole role. Emit the slot with an empty pattern rather than dropping
         it — the audit names it, which is more useful than a short page with no
         explanation. */
      chosen.push({ role, pattern: "" });
      return;
    }

    /* A hero the reference actually uses beats both the seed and the vertical.
       The merchant pointed at that page; rolling a different opening is
       answering a question they did not ask. */
    const fromReference = heroKind ? HERO_FOR_KIND[heroKind] : undefined;
    if (role === "hero" && fromReference && list.includes(fromReference)) {
      used.add(fromReference);
      chosen.push({ role, pattern: fromReference });
      return;
    }

    /* The vertical's preferred hero is weighted rather than pinned. Pinned, one
       trade's stores would all open identically; unweighted, the preference in
       the file would mean nothing. Twice the chance is the compromise: most
       stores in a trade open the way the trade opens, and enough do not. */
    const weighted =
      role === "hero" && row.hero && from.includes(row.hero) ? [row.hero, ...from] : from;

    const pick = weighted[draw(seed, i, weighted.length)];
    used.add(pick);
    chosen.push({ role, pattern: pick });
  });

  return finish(chosen, { vertical, row, seed, preferredSignature: signatureSlot });
}

/* ==========================================================================
   THE RHYTHM, applied to a decided list of slots.

   Split out of `planPage` so that a list of slots decided some OTHER way — by a
   model, in `structure.ts` — arrives at the same page. Everything below this
   line is composition rather than choice: which band is the signature, which
   are dark, which get room, which may carry a photograph, which move. None of
   it is a matter of taste per trade, all of it is measured by `test-plan.ts`,
   and duplicating it for a second caller is how the two would drift.

   `preferredSignature` is the index the caller already knows wants it — the arc
   slot holding the vertical's own signature pattern — or -1 to let the rules
   below decide from scratch.
   ========================================================================== */
function finish(
  chosen: Slot[],
  ctx: { vertical: string; row: VerticalRow; seed: string; preferredSignature: number },
): Order {
  const { vertical, row, seed } = ctx;

  /* The signature slot: the vertical's signature pattern where the arc has it,
     otherwise the first `media` slot, otherwise the longest non-hero slot. The
     hero is never the signature — it is the opening, and a page whose only
     investment is its first screen has nothing below the fold. */
  let signatureIndex = ctx.preferredSignature;

  /* WHERE THE ARC PUTS COMMERCE IS WHETHER COMMERCE IS THE POINT.

     Read off the arc rather than listed per page type, because the arc already
     encodes the answer and a second list would drift from it. A commerce slot in
     the first two positions means the page opens with the thing it sells — a
     product page, a collection, a gift card, a launch — and then the product is
     the signature whatever the vertical's own signature pattern is. Spending the
     page's most room and best photograph on a lookbook while the buy box gets
     standard padding is the wrong emphasis, and it is the emphasis the vertical
     file would otherwise have chosen.

     Commerce further down is a products row inside a page about something else —
     a home page, a sale, a lookbook — and there the signature belongs to
     whatever that page is actually about. */
  const commerceIndex = chosen.findIndex((s) => s.role === "commerce" && s.pattern);
  if (commerceIndex !== -1 && commerceIndex <= 1) signatureIndex = commerceIndex;

  if (signatureIndex === -1) signatureIndex = chosen.findIndex((s, i) => i > 0 && s.role === "media");
  if (signatureIndex === -1) signatureIndex = chosen.findIndex((s, i) => i > 0 && s.role === "proof");
  if (signatureIndex === -1) signatureIndex = chosen.length > 1 ? 1 : 0;

  const motionIds = motionFor(row, seed);

  const sections: OrderSection[] = chosen.map((s, i) => ({
    role: s.role,
    pattern: s.pattern,
    signature: i === signatureIndex,
    dark: false,
    padding: "standard",
    motion: null,
    mayHaveBg: false,
  }));

  assignBackgrounds(sections, signatureIndex);

  assignDark(sections, seed);
  assignPadding(sections, signatureIndex);
  assignMotion(sections, motionIds, seed);

  return {
    vertical,
    archetype: row.archetype,
    sections,
    motionIds: [...new Set(sections.map((s) => s.motion).filter(Boolean))] as string[],
    patternIds: [...new Set(sections.map((s) => s.pattern).filter(Boolean))],
  };
}

/**
 * At least one dark band, never two adjacent.
 *
 * A page in a single tone reads flat however good the copy is, and two dark
 * bands touching read as one tall dark band. The signature is a candidate but
 * not automatically dark: a dark signature on a light page is strong, and on a
 * page whose whole register is stillness it is shouting.
 */
/* ==========================================================================
   WHICH BANDS MAY CARRY A BACKGROUND.

   Two per page, and never more, because the failure mode is not subtlety — it
   is a page where every band is shouting and none of it reads. A background
   photograph is the loudest thing a section can do and it only works as a
   contrast against bands that are not doing it.

   The two are chosen structurally rather than by taste:

     THE OPENING. A hero is the one band whose job is atmosphere before
     information, and it is the band a merchant points at when they say the page
     should feel like something. Skipped when the hero is `hero-type-only` or
     `hero-product-lead`: the first is type as the whole image and a photograph
     behind it fights the only thing on the screen, and the second is a buy box,
     where a photograph behind the price is a photograph over the price.

     ONE STATEMENT BAND, as far from the hero as the page allows. A full-bleed
     quote, an origin story, a closing call — a band that is mood rather than
     detail. Never a commerce, proof or utility slot: cards, tables, spec rows
     and forms on a photograph are unreadable, and a `productList` on one is
     nine product cards fighting a landscape.
   ========================================================================== */

/** Patterns whose whole design is that there is nothing behind the words. */
const NO_BG_PATTERNS = new Set(["hero-type-only", "hero-product-lead"]);

/** Roles that carry detail, and detail on a photograph is unreadable. */
const NO_BG_ROLES = new Set<SectionRole>(["commerce", "proof", "utility"]);

function assignBackgrounds(sections: OrderSection[], signatureIndex: number): void {
  const eligible = (s: OrderSection) =>
    !NO_BG_ROLES.has(s.role) && !NO_BG_PATTERNS.has(s.pattern);

  let given = 0;

  if (sections[0] && sections[0].role === "hero" && eligible(sections[0])) {
    sections[0].mayHaveBg = true;
    given++;
  }

  /* Searched from the end: the second background wants to be as far from the
     first as the page allows, or the two read as one long picture with a strip
     of page between them. The signature band is preferred when it qualifies,
     because that is the band already given the most room. */
  const rest = sections
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i > 0 && eligible(s) && !s.mayHaveBg);

  const pick =
    rest.find(({ i }) => i === signatureIndex) ?? rest[rest.length - 1];

  if (pick && given < 2) pick.s.mayHaveBg = true;
}

function assignDark(sections: OrderSection[], seed: string): void {
  if (sections.length < 3) {
    /* A two-section page: dark would be half the page. */
    return;
  }

  /* Candidates: anything that is not the hero and not the last section, plus
     the last section — a dark closing CTA is the most common good answer. */
  const closing = sections.length - 1;
  const middle = sections.map((_, i) => i).filter((i) => i > 0 && i < closing);

  const first = draw(seed, 41, Math.max(1, middle.length));
  const chosen = new Set<number>([middle[first] ?? closing]);

  /* A second dark band on a long page, if it can sit two apart. */
  if (sections.length >= 7) {
    const far = [closing, ...middle].filter(
      (i) => ![...chosen].some((c) => Math.abs(c - i) < 2),
    );
    if (far.length > 0) chosen.add(far[draw(seed, 42, far.length)]);
  }

  for (const i of chosen) if (sections[i]) sections[i].dark = true;
}

/**
 * Three distinct padding values at least, and the signature gets the largest.
 *
 * One padding value down a page is the fastest way an otherwise correct page
 * still reads machine-made — it is what every v1 page had in common, and the
 * first thing the baseline script counts.
 *
 * The floor is met by construction rather than by a repair at the end. The
 * first version assigned by role and then patched the last section if the count
 * came up short, which fixed nothing on a three-section page: the hero and the
 * signature were both `statement`, so swapping one value still left two. 132 of
 * 528 orders failed that way — every `faq` and every `contact`.
 */
function assignPadding(sections: OrderSection[], signatureIndex: number): void {
  const ORDER: Padding[] = ["statement", "standard", "dense", "utility"];

  sections.forEach((s, i) => {
    if (i === signatureIndex) s.padding = "statement";
    else if (s.role === "utility") s.padding = "utility";
    else if (s.role === "hero") s.padding = "statement";
    /* Grids and lists are denser than argument; alternating the rest reaches
       the third and fourth value without a rule per pattern. */
    else s.padding = i % 3 === 2 ? "dense" : "standard";
  });

  if (sections.length < 3) return;

  /* Now force the floor. Slots that may be changed, in the order it is least
     costly to change them: the signature keeps `statement` because that is what
     makes it the signature, and the hero keeps it unless there is nowhere else
     to take a value from. */
  const movable = sections
    .map((_, i) => i)
    .filter((i) => i !== signatureIndex && sections[i].role !== "hero");
  const lastResort = sections
    .map((_, i) => i)
    .filter((i) => i !== signatureIndex && sections[i].role === "hero");

  for (const pool of [movable, lastResort]) {
    for (const value of ORDER) {
      if (new Set(sections.map((s) => s.padding)).size >= 3) return;
      if (sections.some((s) => s.padding === value)) continue;
      /* Take the slot whose current value is the most duplicated, so removing
         it cannot drop another value to zero occurrences. */
      const counts = new Map<Padding, number>();
      for (const s of sections) counts.set(s.padding, (counts.get(s.padding) ?? 0) + 1);
      const target = pool
        .filter((i) => (counts.get(sections[i].padding) ?? 0) > 1)
        .sort((a, b) => (counts.get(sections[b].padding) ?? 0) - (counts.get(sections[a].padding) ?? 0))[0];
      if (target === undefined) break;
      sections[target].padding = value;
    }
  }
}

/**
 * Motion onto sections, not onto everything.
 *
 * The first id is the page's reveal and goes on the sections below the fold —
 * never the hero, which is on screen before an observer can run, so a hero that
 * reveals is a hero that flickers. The signature effect goes on the signature
 * section. Hover is not placed here: it belongs to buttons and cards, which are
 * nodes, and the contract tells the model where.
 */
function assignMotion(sections: OrderSection[], ids: string[], seed: string): void {
  const reveal = ids.find((id) => id === "reveal") ?? null;
  const signature = ids.find((id) => id !== "reveal" && id !== "hover") ?? null;

  sections.forEach((s, i) => {
    if (i === 0) return;
    if (s.signature && signature) {
      s.motion = signature;
      return;
    }
    /* Not every section: a page where everything arrives has no emphasis left
       to spend. Roughly every other one, chosen by seed so two stores differ. */
    if (reveal && draw(seed, 60 + i, 3) > 0) s.motion = reveal;
  });
}

/** Exposed for the tests and for the audit to check an order against. */
export const _plan = { parseVertical, candidates, arcFor, motionFor, ARCS, LP_ARC, MINIMAL_TYPES };
