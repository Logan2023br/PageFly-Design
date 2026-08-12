import type { Vertical } from "./generate/content";

/* ==========================================================================
   The industry list, with names a person can read.

   Its own module because three places need it and they are on different sides
   of the client/server line: the generator detects a vertical, the admin
   training screen offers them in a dropdown, and the API validates what comes
   back. Importing `generate/content` into a client component to get a list of
   twelve strings would drag the whole content generator into the browser
   bundle for nothing.

   `satisfies` rather than a hand-kept copy: adding a vertical to the type
   without adding it here is a type error, which is the only way a list like
   this stays in step with the one that matters.
   ========================================================================== */

export const VERTICAL_IDS = [
  "apparel",
  "footwear",
  "beauty",
  "food",
  "home",
  "jewelry",
  "tech",
  "pets",
  "fitness",
  "kids",
  "digital",
  "general",
] as const satisfies readonly Vertical[];

export type VerticalId = (typeof VERTICAL_IDS)[number];

export const VERTICAL_LABELS: Record<VerticalId, string> = {
  apparel: "Apparel & fashion",
  footwear: "Footwear",
  beauty: "Beauty & skincare",
  food: "Food & drink",
  home: "Home & living",
  jewelry: "Jewellery & accessories",
  tech: "Tech & electronics",
  pets: "Pets",
  fitness: "Fitness & outdoor",
  kids: "Kids & baby",
  digital: "Digital & services",
  /* Last in the dropdown as well as here: it is the fallback the detector
     lands on, not a choice an operator should reach for first. */
  general: "General / other",
};

export function verticalLabel(id: string): string {
  return VERTICAL_LABELS[id as VerticalId] ?? id;
}
