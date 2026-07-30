import type { BlockKind } from "./types";

/* ==========================================================================
   pageRecipes — the block sequence for every page type.

   This is declarative on purpose: it is the one place to look to answer
   "what is on a Product page?", and it is what the real generator will be
   asked to produce once the Claude skill replaces the mock.
   ========================================================================== */

export const PAGE_RECIPES: Record<string, BlockKind[]> = {
  /* ---- core ------------------------------------------------------------ */
  home: [
    "nav",
    "hero",
    "logoStrip",
    "productGrid",
    "featureRow",
    "imageSplit",
    "testimonials",
    "promoBanner",
    "footer",
  ],
  collection: [
    "nav",
    "collectionHeader",
    "productGrid",
    "promoBanner",
    "faqAccordion",
    "footer",
  ],
  product: [
    "nav",
    "productDetail",
    "featureRow",
    "testimonials",
    "productGrid",
    "faqAccordion",
    "footer",
  ],
  cart: ["nav", "cartSummary", "productGrid", "footer"],
  search: ["nav", "searchResults", "productGrid", "footer"],
  "404": ["nav", "emptyState", "productGrid", "footer"],
  password: ["passwordGate"],
  "coming-soon": ["hero", "leadForm", "featureRow", "footer"],

  /* ---- trust & info ---------------------------------------------------- */
  about: [
    "nav",
    "hero",
    "richText",
    "imageSplit",
    "statsRow",
    "mediaWall",
    "testimonials",
    "footer",
  ],
  contact: ["nav", "contactPanel", "faqAccordion", "footer"],
  faq: ["nav", "richText", "faqAccordion", "contactPanel", "footer"],
  reviews: [
    "nav",
    "hero",
    "statsRow",
    "testimonials",
    "mediaWall",
    "productGrid",
    "footer",
  ],
  "size-guide": ["nav", "richText", "dataTable", "faqAccordion", "footer"],
  shipping: ["nav", "richText", "dataTable", "faqAccordion", "footer"],
  "store-locator": ["nav", "hero", "listPanel", "contactPanel", "footer"],
  careers: ["nav", "hero", "richText", "featureRow", "listPanel", "footer"],
  press: ["nav", "hero", "mediaWall", "listPanel", "footer"],
  sustainability: [
    "nav",
    "hero",
    "richText",
    "statsRow",
    "featureRow",
    "imageSplit",
    "footer",
  ],
  legal: ["nav", "richText", "footer"],

  /* ---- content --------------------------------------------------------- */
  "blog-list": ["nav", "blogList", "promoBanner", "footer"],
  "blog-article": ["nav", "blogArticle", "productGrid", "blogList", "footer"],
  lookbook: ["nav", "hero", "mediaWall", "productGrid", "footer"],
  ugc: ["nav", "hero", "mediaWall", "productGrid", "footer"],

  /* ---- conversion ------------------------------------------------------ */
  sale: [
    "nav",
    "promoBanner",
    "countdown",
    "productGrid",
    "testimonials",
    "faqAccordion",
    "footer",
  ],
  bundle: [
    "nav",
    "hero",
    "bundleBuilder",
    "featureRow",
    "testimonials",
    "faqAccordion",
    "footer",
  ],
  "gift-card": ["nav", "giftCardPicker", "featureRow", "faqAccordion", "footer"],
  comparison: ["nav", "hero", "dataTable", "featureRow", "testimonials", "footer"],
  quiz: ["nav", "quizStep", "featureRow", "testimonials", "footer"],
  upsell: ["nav", "upsellOffer", "testimonials", "footer"],
  "thank-you": ["nav", "thankYouPanel", "orderTracker", "productGrid", "footer"],
  membership: [
    "nav",
    "hero",
    "pricingTiers",
    "featureRow",
    "testimonials",
    "faqAccordion",
    "footer",
  ],
  wholesale: ["nav", "hero", "leadForm", "dataTable", "logoStrip", "footer"],
  affiliate: [
    "nav",
    "hero",
    "featureRow",
    "pricingTiers",
    "leadForm",
    "faqAccordion",
    "footer",
  ],

  /* ---- account --------------------------------------------------------- */
  login: ["nav", "accountPanel", "footer"],
  dashboard: ["nav", "accountPanel", "listPanel", "footer"],
  "order-tracking": ["nav", "orderTracker", "productGrid", "footer"],

  /* ---- landing pages --------------------------------------------------- */
  "lp-launch": [
    "nav",
    "hero",
    "logoStrip",
    "featureRow",
    "imageSplit",
    "testimonials",
    "promoBanner",
    "faqAccordion",
    "footer",
  ],
  "lp-lead-gen": ["nav", "hero", "featureRow", "leadForm", "testimonials", "footer"],
  "lp-bfcm": [
    "nav",
    "promoBanner",
    "countdown",
    "hero",
    "productGrid",
    "testimonials",
    "promoBanner",
    "footer",
  ],
  "lp-event": [
    "nav",
    "hero",
    "countdown",
    "featureRow",
    "listPanel",
    "leadForm",
    "faqAccordion",
    "footer",
  ],
  "lp-app": [
    "nav",
    "hero",
    "featureRow",
    "mediaWall",
    "statsRow",
    "testimonials",
    "promoBanner",
    "footer",
  ],
  "lp-discount": [
    "nav",
    "promoBanner",
    "hero",
    "countdown",
    "productGrid",
    "faqAccordion",
    "footer",
  ],
  "lp-influencer": [
    "nav",
    "hero",
    "imageSplit",
    "productGrid",
    "testimonials",
    "promoBanner",
    "footer",
  ],
  "lp-advertorial": [
    "nav",
    "blogArticle",
    "productGrid",
    "testimonials",
    "promoBanner",
    "footer",
  ],
  "lp-waitlist": [
    "nav",
    "hero",
    "leadForm",
    "featureRow",
    "statsRow",
    "faqAccordion",
    "footer",
  ],
};

/** Fallback for any page id without an explicit recipe. */
export const DEFAULT_RECIPE: BlockKind[] = [
  "nav",
  "hero",
  "featureRow",
  "productGrid",
  "testimonials",
  "footer",
];

export function recipeFor(pageType: string): BlockKind[] {
  return PAGE_RECIPES[pageType] ?? DEFAULT_RECIPE;
}

/**
 * Which band each block sits on. Mirrors the reference site's dark/light
 * alternation: consecutive content blocks flip bands so a long page reads as
 * distinct sections rather than one wall.
 */
export function assignBands(
  blocks: BlockKind[],
  /** when the reference alternates light/dark hard, mirror that rhythm */
  strictAlternation = false,
): ("base" | "alt" | "accent")[] {
  const FIXED: Partial<Record<BlockKind, "base" | "alt" | "accent">> = {
    nav: "base",
    footer: "alt",
    promoBanner: "accent",
    countdown: "accent",
    upsellOffer: "accent",
    hero: "base",
    passwordGate: "base",
  };

  let flip = false;
  return blocks.map((kind) => {
    const fixed = FIXED[kind];
    // Under strict alternation even the hero and footer join the rhythm, so a
    // reference with hard light/dark banding is actually reproduced.
    if (fixed && !(strictAlternation && (kind === "hero" || kind === "footer"))) {
      return fixed;
    }
    flip = !flip;
    return flip ? "alt" : "base";
  });
}
