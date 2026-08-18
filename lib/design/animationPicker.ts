import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ==========================================================================
   Choosing which animations to put in front of the designer.

   `skills/animation-mechanics.md` holds 162 patterns, each with the trigger,
   the mechanism and the values that make it read correctly. It is 18,000
   tokens. Sending it whole would quadruple the prompt — and DeepSeek bills its
   own reasoning against the same ceiling as its answer, so more to weigh is
   more thinking, which is precisely what pushed a build past 32,000 tokens and
   returned JSON cut off mid-property.

   So the file stays out of the prompt and this picks from it. Two stages, and
   which stage does what matters:

     CODE  narrows 162 to the handful that suit this page type. Deterministic,
           free, and a product page can never be offered a pattern that only
           makes sense on a homepage.
     MODEL chooses among those and writes the html/css/js, because only it knows
           how many sections this page ended up with and what each one holds.

   The file is edited by hand and often. Nothing here names a pattern that does
   not exist without noticing: an unknown name is dropped, and a page type with
   nothing left falls back to the universal set rather than sending an empty
   list that reads as "no animation is appropriate here".
   ========================================================================== */

const FILE = "animation-mechanics.md";

/* Patterns needing a WebGL context, a shader pipeline or a physics engine.
   The exporter can carry html, css and js — it cannot carry three.js. Offering
   these is inviting the model to write something that cannot ship. */
const UNBUILDABLE = new Set([
  "webgl-shader-hero",
  "3d-model-viewer",
  "ar-quick-look",
  "scroll-driven-3d-camera",
  "physics-cards",
  "cloth-simulation",
  "liquid-distortion",
  "particle-field",
  "image-sequence-spin",
  "sprite-360-viewer",
  "scroll-scrub-video",
]);

/**
 * The candidates for a page type, and nothing more than candidates.
 *
 * This used to be the answer: `home` always got these six, every store, every
 * build. That is wrong twice over. A furniture shop and a Black Friday page do
 * not want the same motion, and a merchant building one page can afford a
 * signature effect that would be noise repeated across ten.
 *
 * So this narrows; the model decides. It gets the full catalogue of names, the
 * detail for these candidates, its own vertical and how many pages are being
 * built — and it is told outright that the list is a starting point.
 */
const CANDIDATES: Record<string, string[]> = {
  home: ["fade-up", "stagger-reveal", "hover-lift", "counter-up", "wave-divider", "logo-marquee", "clip-reveal", "shine-sweep"],
  product: ["fade-up", "image-zoom-on-hover", "sticky-buy-box", "thumbnail-sync-gallery", "variant-swatch-swap", "hover-lift", "counter-up"],
  collection: ["stagger-reveal", "hover-lift", "image-zoom-on-hover", "filter-morph-grid", "fade-up", "masonry-load-in"],
  about: ["fade-up", "clip-reveal", "parallax-background", "line-draw", "counter-up", "split-text-reveal"],
  reviews: ["stagger-reveal", "fade-up", "testimonial-rotator", "hover-lift", "star-rating-fill"],
  faq: ["accordion", "fade-up"],
  contact: ["fade-up", "inline-validation", "button-loading-state"],
  comparison: ["stagger-reveal", "fade-up", "hover-lift", "sticky-header-shrink"],
  quiz: ["fade-up", "progress-bar-fill", "segmented-progress"],
  upsell: ["fade-up", "hover-lift", "add-to-cart-fly", "countdown-timer"],
  sale: ["countdown-timer", "counter-up", "stagger-reveal", "hover-lift", "shine-sweep"],
  "lp-launch": ["fade-up", "stagger-reveal", "counter-up", "parallax-background", "sticky-buy-box", "wave-divider", "curtain-reveal"],
  "lp-bfcm": ["countdown-timer", "counter-up", "stagger-reveal", "hover-lift", "marquee", "stock-urgency-pulse"],
  "lp-lead-gen": ["fade-up", "inline-validation", "progress-bar-fill", "button-loading-state"],
  "lp-app": ["fade-up", "parallax-layers", "sticky-scroll-section", "stagger-reveal", "phone-mockup-scroll"],
  "lp-advertorial": ["fade-up", "clip-reveal", "counter-up", "scroll-progress-bar", "highlight-sweep"],
  "lp-waitlist": ["fade-up", "inline-validation", "counter-up", "button-loading-state"],
  "coming-soon": ["fade-up", "countdown-timer", "animated-gradient"],
};

/**
 * How each trade tends to move, in one line.
 *
 * Not a list of patterns — a description of the register. The model already
 * knows what `blur-in` does; what it cannot know is that a jewellery page and a
 * pet-supplies page should not share a temperament. One line each because this
 * is a nudge, and a paragraph of adjectives per vertical would be the model
 * arguing with itself instead of building.
 */
const BY_VERTICAL: Record<string, string> = {
  apparel: "Editorial and unhurried. Long clip and curtain reveals, image-led. No counters, no urgency.",
  footwear: "Same register as apparel, plus one energetic moment — a marquee or a fast hover on the product grid.",
  beauty: "Soft and precise. Blur and scale reveals, gentle glow on hover. Numbers only when they are clinical results.",
  jewelry: "The quietest of all. One shine-sweep, slow fades, nothing that bounces. Motion here reads as cheap very fast.",
  home: "Calm and spacious. Parallax on a room shot, slow reveals. Let the photography do the work.",
  food: "Warm and physical. Grow-on-hover, a marquee of ingredients, a divider with a shape.",
  tech: "Precise and mechanical. Counters, spec reveals, sticky comparisons. Nothing decorative.",
  fitness: "Fast and confident. Counters, progress bars, urgent hovers.",
  pets: "Playful. Bounce, wiggle, a heart pop. This is the one vertical where a cute effect is on-brand.",
  kids: "Playful and bright, same register as pets, plus colour and movement in the background.",
  digital: "Interface-led. Scroll-driven sections, sticky panels, a phone or laptop that scrolls with the reader.",
  general: "Restrained. Two effects, both quiet, until the brief says otherwise.",
};

/* The fallback when a page type has no candidate list, and when its list is
   emptied by unknown names. The plainest four: whatever the page is, none of
   them look wrong on it. */
const UNIVERSAL = ["fade-up", "stagger-reveal", "hover-lift", "fade-in"];

/* Pages where motion is wrong rather than merely unnecessary. A password gate
   is one field and a button; a legal page is text someone came to read; a
   dashboard is a tool. Animating any of them reads as decoration applied
   because it was available. */
const NO_ANIMATION = new Set([
  "password",
  "login",
  "404",
  "legal",
  "dashboard",
  "order-tracking",
  "cart",
  "search",
  "thank-you",
]);

/**
 * Patterns the `anim` field already covers.
 *
 * Everything else needs a `custom` node, and the model has to be TOLD which is
 * which rather than left to work it out. Handed the list without labels it used
 * the field five times and wrote no custom block at all — reaching for a field
 * it already knows is the safe move.
 */
const NATIVE_FIELD = new Set([
  "fade-in",
  "fade-up",
  "fade-in-left",
  "fade-in-right",
  "scale-in",
  "hover-lift",
  "hover-grow",
  "hover-shadow",
  "hover-glow",
  "stagger-reveal",
]);

/* Read once. The file changes on deploy, not per request, and re-reading 72KB
   on every page of every build would put disk IO in the path of something a
   merchant is waiting on. */
let cache: Map<string, string> | null = null;

/**
 * Every pattern in the file, keyed by its `### name` heading.
 *
 * Parsed rather than imported so the file stays a document someone edits by
 * hand. A heading that stops matching simply disappears from the map, and the
 * caller's fallback covers it.
 */
function patterns(): Map<string, string> {
  if (cache) return cache;

  const map = new Map<string, string>();
  let text: string;
  try {
    text = readFileSync(
      join(process.env.PFD_SKILLS_DIR ?? join(process.cwd(), "skills"), FILE),
      "utf8",
    );
  } catch {
    /* No file is a page without extra animation, not a failed build. */
    cache = map;
    return map;
  }

  /* Split on `### name`, keeping what follows until the next heading of any
     level. The body already carries Trigger/Mechanism/Values as the model needs
     them, so it is passed through rather than reformatted. */
  const parts = text.split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    if (nl === -1) continue;
    const name = part.slice(0, nl).trim().replace(/^`|`$/g, "");
    const body = part
      .slice(nl + 1)
      .split(/^##+ /m)[0]
      .trim();
    if (name && body) map.set(name, body);
  }

  cache = map;
  return map;
}

/**
 * The animation section of the prompt for one page, or "" when there is none.
 *
 * Returns the whole block, ready to drop in, so the caller never assembles
 * rules it does not own.
 */
export function animationLines(
  pageType: string,
  vertical: string,
  /** how many pages this build is producing, for pacing across the deck */
  deckSize: number,
): string {
  const all = patterns();
  if (all.size === 0 || NO_ANIMATION.has(pageType)) return "";

  const wanted = (CANDIDATES[pageType] ?? UNIVERSAL).filter(
    (n) => !UNBUILDABLE.has(n) && all.has(n),
  );
  const names = wanted.length > 0 ? wanted : UNIVERSAL.filter((n) => all.has(n));
  if (names.length === 0) return "";

  return [
    ``,
    `## Animation`,
    ``,
    /* The register, not a list. What the model cannot work out on its own is
       that a jewellery page and a pet-supplies page should not share a
       temperament — it knows perfectly well what blur-in does. */
    `This store is ${vertical}. ${BY_VERTICAL[vertical] ?? BY_VERTICAL.general}`,
    ``,
    /* Deck size changes the answer. One page can carry a signature effect; the
       same effect on all ten is wallpaper, and ten pages that each invented
       their own motion do not look like one site. */
    deckSize === 1
      ? `This is the only page in the build, so it can carry one signature effect the merchant will remember.`
      : `This build is ${deckSize} pages. Keep the motion consistent across them — the same reveal, the same hover — and give ONE page the signature effect, not all of them.`,
    ``,
    `Every pattern below is described in full: what starts it, what moves, and`,
    `the durations and easings that make it read correctly. Those values are`,
    `measured — use them rather than rounding to something plainer.`,
    ``,
    ...names.map(
      (n) =>
        `### ${n}  [${NATIVE_FIELD.has(n) ? 'use the "anim" field' : 'write a "custom" node'}]\n${all.get(n)!}`,
    ),
    ``,
    /* The catalogue exists because the candidate list is a starting point, not
       a menu. A pet-supplies homepage that wants `wishlist-heart-pop` should
       take it — but it cannot ask for what it has never been shown, and the
       full detail for 162 patterns is 18,000 tokens. Names are 800. */
    `You are not limited to those. The full catalogue, by name:`,
    ``,
    ...catalogue(all),
    ``,
    `Pick from the catalogue when this store or this page genuinely calls for`,
    `something the candidates above do not cover, and write it from what the`,
    `name describes.`,
    ``,
    /* Not a quota. An earlier version said "pick at least two", which is an
       instruction to decorate rather than to decide — and a page that did not
       need motion got it anyway. What is required is the judgement, not the
       animation. */
    `DECIDE, section by section, and WRITE THE DECISION DOWN.`,
    ``,
    /* The forcing function. Free choice produced the same two fields on every
       page; asking for judgement without asking for evidence of it produced
       none. Naming a decision per section means visiting each section. */
    `Your JSON starts with "motionPlan": one short line per section — its role,`,
    `what moves there, and why. "none" is a valid answer and needs its reason:`,
    ``,
    `  "motionPlan": "hero: fade-up, arrives as the reader lands. stats:`,
    `  counter-up custom, the numbers are the point. story: none, dense text.`,
    `  reviews: stagger, reading order. cta: hover-lift only."`,
    ``,
    `Then build the sections to match what you wrote. A page with no animation`,
    `because you weighed it is finished work; a page with no animation because`,
    `you did not look is not.`,
    ``,
    `When motion does belong, one from the "anim field" group is the baseline,`,
    `and one that needs a "custom" node is what stops the page looking generic —`,
    `a counter that counts, a divider with a shape, a row that moves. Its`,
    `stylesheet carries the movement; prefer CSS keyframes over js, because CSS`,
    `runs in the PageFly editor and with JavaScript disabled and js does not.`,
    ``,
  ].join("\n");
}

/**
 * Every pattern name, grouped as the file groups them.
 *
 * Names only. The model knows roughly what `ken-burns` or `text-scramble` mean,
 * and a name it recognises is enough to write from — where full detail for all
 * 162 would be 18,000 tokens and most of it about patterns this page will never
 * use.
 */
function catalogue(all: Map<string, string>): string[] {
  const groups = groupNames();
  return [...groups.entries()]
    .map(([group, names]) => {
      const usable = names.filter((n) => all.has(n) && !UNBUILDABLE.has(n));
      return usable.length ? `  ${group}: ${usable.join(", ")}` : "";
    })
    .filter(Boolean);
}

/** `## 3. HOVER & MICRO-INTERACTION` -> its pattern names. Read from the file
    so a section added by hand appears without touching this code. */
function groupNames(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let text: string;
  try {
    text = readFileSync(
      join(process.env.PFD_SKILLS_DIR ?? join(process.cwd(), "skills"), FILE),
      "utf8",
    );
  } catch {
    return map;
  }

  for (const chunk of text.split(/^## /m).slice(1)) {
    const title = chunk.split("\n")[0].replace(/^\d+\.\s*/, "").trim();
    const names = [...chunk.matchAll(/^### (.+)$/gm)].map((m) =>
      m[1].trim().replace(/^`|`$/g, ""),
    );
    if (names.length) map.set(title, names);
  }
  return map;
}

/** Exposed for tests. */
export const _picker = { CANDIDATES, BY_VERTICAL, UNIVERSAL, UNBUILDABLE, NO_ANIMATION, NATIVE_FIELD, patterns };
