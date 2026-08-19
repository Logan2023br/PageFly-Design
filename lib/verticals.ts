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


/* ==========================================================================
   The Step 1 chips — a second, finer taxonomy, and deliberately separate.

   The twelve ids above are what `detectVertical` guesses from free text and
   what the admin training screen groups by. The sixty-six below are what a
   merchant CLICKS, and each one is a block id in
   `skills/_sliced/30-verticals.md` carrying that trade's archetype, signature
   pattern, ban list and proof vocabulary.

   They are not merged because they answer different questions. Twelve is as
   fine as a keyword matcher can be trusted to be; sixty-six is as fine as a
   person choosing from a list can be.

   WHY THE SLUG EXISTS. A chip used to be a display string, and the vertical was
   guessed from it by the same substring match used on free text. Twenty-seven
   of the sixty-six landed on `general` — including `Footwear`, which has a
   vertical of its own the matcher never reached because the keyword list holds
   `shoe` and `sneaker` but not `footwear`. Worse, `Team sports & racket`
   resolved to `food`, because "Team" contains "tea".

   Guessing is now only for what has to be guessed.
   ========================================================================== */

export type VerticalChip = {
  /** what the merchant reads and what lands in `brief.whatYouSell` */
  label: string;
  /** block id in 30-verticals.md, and the resolver's key */
  slug: string;
};

export const VERTICAL_CHIPS: VerticalChip[] = [
  { label: "Fashion & apparel", slug: "fashion-apparel" },
  { label: "Footwear", slug: "footwear" },
  { label: "Jewelry & watches", slug: "jewelry-watches" },
  { label: "Bags & accessories", slug: "bags-accessories" },
  { label: "Eyewear", slug: "eyewear" },
  { label: "Kids & baby clothing", slug: "kids-apparel" },
  { label: "Skincare", slug: "skincare" },
  { label: "Makeup & cosmetics", slug: "cosmetics" },
  { label: "Hair care & styling", slug: "haircare" },
  { label: "Fragrance", slug: "fragrance" },
  { label: "Supplements & nutrition", slug: "supplements" },
  { label: "Personal care devices", slug: "personal-care-devices" },
  { label: "Intimate & sexual wellness", slug: "intimate-wellness" },
  { label: "Coffee & tea", slug: "coffee-tea" },
  { label: "Specialty & gourmet food", slug: "specialty-food" },
  { label: "Snacks & confectionery", slug: "snacks-confectionery" },
  { label: "Bakery & desserts", slug: "bakery-desserts" },
  { label: "Wine, beer & spirits", slug: "alcohol" },
  { label: "Meal kits & prepared food", slug: "meal-kits" },
  { label: "Health & functional food", slug: "health-food" },
  { label: "Furniture", slug: "furniture" },
  { label: "Home decor & art", slug: "home-decor" },
  { label: "Bedding & textiles", slug: "bedding-textiles" },
  { label: "Kitchen & tableware", slug: "kitchenware" },
  { label: "Lighting", slug: "lighting" },
  { label: "Garden & outdoor living", slug: "garden-outdoor" },
  { label: "Home improvement & storage", slug: "home-improvement" },
  { label: "Cleaning & household", slug: "cleaning-household" },
  { label: "Consumer electronics", slug: "consumer-electronics" },
  { label: "Audio & headphones", slug: "audio" },
  { label: "Phone & tech accessories", slug: "phone-accessories" },
  { label: "Computers & gaming gear", slug: "computer-gaming" },
  { label: "Smart home & security", slug: "smart-home" },
  { label: "Drones, cameras & optics", slug: "drones-cameras" },
  { label: "Fitness equipment", slug: "fitness-equipment" },
  { label: "Activewear & sportswear", slug: "activewear" },
  { label: "Outdoor & camping", slug: "outdoor-camping" },
  { label: "Cycling & e-bikes", slug: "cycling-ebike" },
  { label: "EV & personal mobility", slug: "ev-mobility" },
  { label: "Water & snow sports", slug: "water-sports" },
  { label: "Hunting & fishing", slug: "hunting-fishing" },
  { label: "Team sports & racket", slug: "team-sports" },
  { label: "Baby & maternity gear", slug: "baby-gear" },
  { label: "Toys & games", slug: "toys-games" },
  { label: "Pet supplies", slug: "pet-supplies" },
  { label: "Art & craft supplies", slug: "art-craft" },
  { label: "Musical instruments", slug: "music-instruments" },
  { label: "Books & stationery", slug: "books-stationery" },
  { label: "Collectibles & hobby", slug: "collectibles" },
  { label: "Auto parts & accessories", slug: "auto-parts" },
  { label: "Moto & powersports", slug: "moto-powersports" },
  { label: "Tools & hardware", slug: "tools-hardware" },
  { label: "Industrial & MRO supply", slug: "industrial-b2b" },
  { label: "Medical & dental supply", slug: "medical-dental" },
  { label: "Office & professional equipment", slug: "office-professional" },
  { label: "SaaS & app", slug: "saas-app" },
  { label: "Courses & coaching", slug: "online-course" },
  { label: "Digital downloads & templates", slug: "digital-download" },
  { label: "Agency & professional services", slug: "agency-service" },
  { label: "Local & appointment services", slug: "local-service" },
  { label: "Events & ticketing", slug: "events-tickets" },
  { label: "Travel & hospitality", slug: "travel-hospitality" },
  { label: "Membership & community", slug: "membership-community" },
  { label: "Nonprofit & cause", slug: "nonprofit-cause" },
  { label: "Real estate & property", slug: "real-estate" },
  { label: "Finance & insurance", slug: "finance-insurance" },
];

/**
 * The vertical every unrecognised store falls to.
 *
 * It has a block of its own in 30-verticals.md — a restrained register that
 * looks wrong on nothing — so a store the app cannot place still gets a
 * complete order rather than an empty one.
 */
export const GENERAL_VERTICAL = "general";

const BY_LABEL = new Map(VERTICAL_CHIPS.map((c) => [c.label.toLowerCase(), c.slug]));
const SLUGS = new Set([...VERTICAL_CHIPS.map((c) => c.slug), GENERAL_VERTICAL]);

/** Is this a slug the sliced file can answer for? */
export function isKnownVertical(slug: string): boolean {
  return SLUGS.has(slug);
}

/**
 * The slug for whatever is in `brief.whatYouSell`.
 *
 * Exact label match only. A chip click stores the label verbatim, so this is a
 * lookup rather than a guess — and free text deliberately falls through to
 * `null` so the caller can decide whether to run a keyword matcher over it.
 * Silently guessing here is what produced `Team sports → food`.
 */
export function slugForLabel(label: string): string | null {
  return BY_LABEL.get(label.trim().toLowerCase()) ?? null;
}
