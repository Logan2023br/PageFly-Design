import type { Vertical } from "../generate/content";

/* ==========================================================================
   How many sections a page should have.

   The table lives in code, not in the prompt. Thirty-five rows of page types is
   about seven hundred tokens on every call to tell the model thirty-four things
   that do not apply to the page in front of it — and the page type is known
   before the call is made. One resolved line goes out instead.

   `min` is a floor on real content, never a quota. A six-section page of real
   content beats an eight-section page carrying two filler bands, so the line
   sent to the model says so in as many words.
   ========================================================================== */

type Plan = { min: number; target: string; cap: number };

const PAGES: Record<string, Plan> = {
  home: { min: 7, target: "7-9", cap: 9 },
  product: { min: 8, target: "8-11", cap: 12 },
  collection: { min: 5, target: "5-6", cap: 7 },
  about: { min: 6, target: "6-8", cap: 8 },
  contact: { min: 3, target: "3-4", cap: 5 },
  faq: { min: 3, target: "3-4", cap: 5 },
  reviews: { min: 4, target: "4-5", cap: 6 },
  "size-guide": { min: 3, target: "3-4", cap: 5 },
  shipping: { min: 3, target: "3-4", cap: 5 },
  "store-locator": { min: 3, target: "3-4", cap: 5 },
  comparison: { min: 5, target: "5-6", cap: 7 },
  quiz: { min: 4, target: "4-5", cap: 6 },
  upsell: { min: 4, target: "4-5", cap: 6 },
  "thank-you": { min: 3, target: "3-4", cap: 5 },
  membership: { min: 6, target: "6-8", cap: 9 },
  wholesale: { min: 6, target: "6-7", cap: 8 },
  "gift-card": { min: 4, target: "4-5", cap: 6 },
  careers: { min: 5, target: "5-6", cap: 7 },
  press: { min: 4, target: "4-5", cap: 6 },
  sustainability: { min: 6, target: "6-8", cap: 9 },
  "coming-soon": { min: 3, target: "3", cap: 3 },
  "404": { min: 1, target: "1-2", cap: 2 },
  password: { min: 1, target: "1", cap: 1 },
  login: { min: 2, target: "2-3", cap: 3 },
  dashboard: { min: 2, target: "2-3", cap: 4 },
  "order-tracking": { min: 2, target: "2-3", cap: 4 },
  "lp-launch": { min: 7, target: "7-9", cap: 10 },
  "lp-lead-gen": { min: 5, target: "5-6", cap: 7 },
  "lp-bfcm": { min: 5, target: "5-7", cap: 8 },
  "lp-event": { min: 6, target: "6-7", cap: 8 },
  "lp-app": { min: 6, target: "6-8", cap: 9 },
  "lp-discount": { min: 4, target: "4-5", cap: 6 },
  "lp-influencer": { min: 5, target: "5-6", cap: 7 },
  "lp-advertorial": { min: 6, target: "6-8", cap: 9 },
  "lp-waitlist": { min: 3, target: "3-4", cap: 5 },

  /* Page types this app offers that the table did not name. Set from the
     nearest listed neighbour rather than invented: a lookbook is a collection
     that leads with photography, a sale page is a discount landing page. */
  cart: { min: 2, target: "2-3", cap: 4 },
  search: { min: 2, target: "2-3", cap: 4 },
  "blog-list": { min: 3, target: "3-4", cap: 5 },
  "blog-article": { min: 3, target: "3-5", cap: 6 },
  lookbook: { min: 4, target: "4-6", cap: 7 },
  ugc: { min: 4, target: "4-5", cap: 6 },
  sale: { min: 4, target: "4-5", cap: 6 },
  bundle: { min: 4, target: "4-6", cap: 7 },
  affiliate: { min: 5, target: "5-6", cap: 7 },
  legal: { min: 2, target: "2-3", cap: 4 },
};

const FALLBACK: Plan = { min: 4, target: "4-6", cap: 7 };

/* ---- homepage archetypes ------------------------------------------------ */

type Archetype = { letter: string; name: string; sections: number };

const ARCHETYPES: Record<string, Archetype> = {
  A: { letter: "A", name: "spec-led", sections: 8 },
  B: { letter: "B", name: "efficacy-led", sections: 9 },
  C: { letter: "C", name: "lookbook-led", sections: 7 },
  D: { letter: "D", name: "craft / origin-led", sections: 8 },
  E: { letter: "E", name: "consultative-led", sections: 8 },
  F: { letter: "F", name: "offer / subscription-led", sections: 8 },
  G: { letter: "G", name: "occasion-led", sections: 7 },
};

/* The homepage count is a fixed number rather than a range, and which number
   depends on how the store sells rather than on what it sells. */
const BY_VERTICAL: Record<Vertical, keyof typeof ARCHETYPES> = {
  tech: "A",
  fitness: "A",
  beauty: "B",
  apparel: "C",
  footwear: "C",
  jewelry: "C",
  home: "C",
  food: "D",
  digital: "F",
  pets: "F",
  kids: "G",
  general: "C",
};

/**
 * The one line about section count that applies to THIS page.
 *
 * Returns the whole instruction, ready to drop into the prompt, so the caller
 * never assembles rules it does not own.
 */
export function sectionPlanLine(pageType: string, vertical: string): string {
  if (pageType === "home") {
    const arc = ARCHETYPES[BY_VERTICAL[vertical as Vertical] ?? "C"];
    return (
      `Section count: exactly ${arc.sections}. This store is archetype ` +
      `${arc.letter} (${arc.name}), and a homepage arc is a fixed length, not a range.`
    );
  }

  const plan = PAGES[pageType] ?? FALLBACK;
  const head = `Section count: ${plan.target}, never more than ${plan.cap}.`;

  /* The floor only needs defending where there is room to pad. On a login or a
     password page the floor IS the page, and the sentence came out as "a
     0-section page of real content beats a 1-section page carrying filler",
     which is advice to return nothing. */
  if (plan.min < 3) return head;

  return (
    `${head} ${plan.min} is a floor on REAL content, not a quota — if the brief ` +
    `cannot fill it, go under and add nothing. A ${plan.min - 1}-section page of ` +
    `real content beats ${article(plan.min)} ${plan.min}-section page carrying filler.`
  );
}

/** "an 8-section page", not "a 8-section page". The model reads this. */
function article(n: number): string {
  return n === 8 || n === 11 || n === 18 ? "an" : "a";
}

/** Exposed for tests and for anything that wants the numbers without the prose. */
export const _plans = { PAGES, ARCHETYPES, BY_VERTICAL, FALLBACK };
