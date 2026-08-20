import "server-only";

import { createHash } from "node:crypto";
import { sliceSkill, sliceIds } from "../ai/skills";
import { GENERAL_VERTICAL, isKnownVertical, slugForLabel } from "../verticals";
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

export type OrderSection = {
  role: SectionRole;
  /** block id in 20-patterns.md */
  pattern: string;
  /** exactly one section in an order has this */
  signature: boolean;
  dark: boolean;
  padding: Padding;
  /** block id in 40-motion.md, or null */
  motion: string | null;
};

export type Order = {
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
const ARCS: Record<string, SectionRole[]> = {
  home: ["hero", "utility", "media", "commerce", "proof", "content", "proof", "conversion"],
  /* A product page OPENS with the product. No separate hero: a real PDP puts
     the gallery and the price on the first screen, and a hero above them
     pushes the price to 900px. The commerce slot is also this page's
     signature — see `planPage`. */
  product: ["commerce", "utility", "proof", "media", "content", "proof", "content", "conversion"],
  /* Two commerce slots, and they are different sections: a wide grid of the
     collection, then — after one editorial band to break the wall — a carousel
     or a second grid. A collection page whose products appear once, six cards
     wide, is a landing page wearing a collection's name. */
  collection: ["hero", "commerce", "content", "commerce", "media", "conversion"],
  about: ["hero", "content", "media", "proof", "content", "conversion"],
  faq: ["hero", "content", "conversion"],
  contact: ["hero", "conversion", "utility"],
  reviews: ["hero", "proof", "proof", "conversion"],
  comparison: ["hero", "proof", "content", "conversion"],
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
   The commerce slots are PINNED, not drawn.

   Everywhere else in this resolver the seed picks, because two stores in one
   trade must not get the same page. A buy box is the exception: there is one
   right answer to "what goes at the top of a product page" and rolling for it
   means some product pages come back without one. The merchant did not ask for
   variety in whether their product is on their product page.

   Listed per page type and per occurrence, so the collection page's two slots
   get two DIFFERENT sections rather than the same grid twice.

   A page type absent from this map still gets its commerce slot filled — the
   seed draws from the group, as with any other role. That is the right default
   for the long tail (`bundle`, `comparison`, a landing page): they can carry a
   product row, and which one is a matter of taste rather than correctness.
   ========================================================================== */
const PINNED_COMMERCE: Record<string, string[]> = {
  product: ["product-detail-gallery"],
  collection: ["collection-grid-3up", "collection-carousel"],
  home: ["collection-featured-row"],
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

function arcFor(pageType: string): SectionRole[] {
  if (MINIMAL_TYPES.has(pageType)) return MINIMAL_ARC;
  if (pageType.startsWith("lp-")) return LP_ARC;
  return ARCS[pageType] ?? ARCS.about;
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
  const isBanned = (id: string) =>
    row.ban.some((b) => id === b || id.startsWith(`${b}-`));
  const used = new Set<string>();

  /* Pattern per slot. The candidate list for the role, minus the vertical's
     bans, minus what this page already used — then the seed picks. */
  const chosen: { role: SectionRole; pattern: string }[] = [];

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

  /* Which commerce slot this is, so a page with two gets two different ones. */
  let commerceSeen = 0;

  arc.forEach((role, i) => {
    /* Pinned before anything else, including the vertical's signature: a
       vertical's signature pattern is a matter of taste and a product page
       without a buy box is a matter of correctness. */
    if (role === "commerce") {
      const pinned = PINNED_COMMERCE[pageType]?.[commerceSeen];
      commerceSeen++;
      if (pinned && !isBanned(pinned)) {
        used.add(pinned);
        chosen.push({ role, pattern: pinned });
        return;
      }
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

  /* The signature slot: the vertical's signature pattern where the arc has it,
     otherwise the first `media` slot, otherwise the longest non-hero slot. The
     hero is never the signature — it is the opening, and a page whose only
     investment is its first screen has nothing below the fold. */
  let signatureIndex = signatureSlot;

  /* On a product or collection page the PRODUCT is the signature, whatever the
     vertical's own signature pattern is. Those pages exist to sell the thing;
     spending the page's most room and its best photograph on a lookbook while
     the buy box gets standard padding is the wrong emphasis, and it is the
     emphasis the vertical file would have chosen. */
  const commerceIndex = chosen.findIndex((s) => s.role === "commerce" && s.pattern);
  if (commerceIndex !== -1 && (pageType === "product" || pageType === "collection"))
    signatureIndex = commerceIndex;

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
  }));

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
