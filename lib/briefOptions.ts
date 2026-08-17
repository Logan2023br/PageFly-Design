import type { IconName } from "./icons";
import { BRAND_COLOR_ROLES } from "./styleTokens";

/* Store types (§4.3) ------------------------------------------------------ */

export type StoreTypeId =
  | "d2c"
  | "single-product"
  | "dropshipping"
  | "creator"
  | "corporate"
  | "b2b"
  | "agency"
  | "local"
  | "pod"
  | "subscription"
  | "digital"
  | "nonprofit";

export const STORE_TYPE_IDS = [
  "d2c",
  "single-product",
  "dropshipping",
  "creator",
  "corporate",
  "b2b",
  "agency",
  "local",
  "pod",
  "subscription",
  "digital",
  "nonprofit",
] as const satisfies readonly StoreTypeId[];

export const STORE_TYPES: { id: StoreTypeId; label: string }[] = [
  { id: "d2c", label: "Ecommerce brand (D2C)" },
  { id: "single-product", label: "Single-product store" },
  { id: "dropshipping", label: "Dropshipping" },
  { id: "creator", label: "Personal / creator" },
  { id: "corporate", label: "Company / corporate" },
  { id: "b2b", label: "B2B / wholesale" },
  { id: "agency", label: "Agency / services" },
  { id: "local", label: "Local business" },
  { id: "pod", label: "Print-on-demand" },
  { id: "subscription", label: "Subscription box" },
  { id: "digital", label: "Digital products / courses" },
  { id: "nonprofit", label: "Nonprofit" },
];

/* Industry chips for "what do you sell" (§4.1) --------------------------- */

/**
 * The industries a store can be, in the order they are offered.
 *
 * Grouped by trade rather than alphabetised — someone selling skincare scans
 * for it among the other beauty lines, not between Meal kits and Smart home.
 * The order is the grouping, so the first screenful reads as a shape rather
 * than a list.
 *
 * Clicking one writes it into the field, which stays free text: a merchant
 * whose trade is not on this list types their own, and always could.
 */
export const SELL_EXAMPLES = [
  "Fashion & apparel",
  "Footwear",
  "Jewelry & watches",
  "Bags & accessories",
  "Eyewear",
  "Kids & baby clothing",
  "Skincare",
  "Makeup & cosmetics",
  "Hair care & styling",
  "Fragrance",
  "Supplements & nutrition",
  "Personal care devices",
  "Intimate & sexual wellness",
  "Coffee & tea",
  "Specialty & gourmet food",
  "Snacks & confectionery",
  "Bakery & desserts",
  "Wine, beer & spirits",
  "Meal kits & prepared food",
  "Health & functional food",
  "Furniture",
  "Home decor & art",
  "Bedding & textiles",
  "Kitchen & tableware",
  "Lighting",
  "Garden & outdoor living",
  "Home improvement & storage",
  "Cleaning & household",
  "Consumer electronics",
  "Audio & headphones",
  "Phone & tech accessories",
  "Computers & gaming gear",
  "Smart home & security",
  "Drones, cameras & optics",
  "Fitness equipment",
  "Activewear & sportswear",
  "Outdoor & camping",
  "Cycling & e-bikes",
  "EV & personal mobility",
  "Water & snow sports",
  "Hunting & fishing",
  "Team sports & racket",
  "Baby & maternity gear",
  "Toys & games",
  "Pet supplies",
  "Art & craft supplies",
  "Musical instruments",
  "Books & stationery",
  "Collectibles & hobby",
  "Auto parts & accessories",
  "Moto & powersports",
  "Tools & hardware",
  "Industrial & MRO supply",
  "Medical & dental supply",
  "Office & professional equipment",
  "SaaS & app",
  "Courses & coaching",
  "Digital downloads & templates",
  "Agency & professional services",
  "Local & appointment services",
  "Events & ticketing",
  "Travel & hospitality",
  "Membership & community",
  "Nonprofit & cause",
  "Real estate & property",
  "Finance & insurance",
];

/** How many are shown before the list asks to be opened. Thirty is about two
    rows on a laptop and the point where a chip field stops reading as a set of
    suggestions and starts reading as a wall. */
export const SELL_EXAMPLES_VISIBLE = 30;

/* Snippet chips that append to the textarea (§4.4) ------------------------ */

/* Snippets are inserted into the textarea, so they stay to one short line
   each — a long snippet makes the field look heavy the moment it's used. */
export const PROMPT_SNIPPETS: {
  id: string;
  label: string;
  icon: IconName;
  snippet: string;
}[] = [
  {
    id: "audience",
    label: "Audience",
    icon: "Star",
    snippet: "Audience: 28-45, furnishing a first home.",
  },
  {
    id: "tone",
    label: "Tone",
    icon: "Type",
    snippet: "Tone: calm and factual. No hype words.",
  },
  {
    id: "sections",
    label: "Sections",
    icon: "Layers",
    snippet: "Sections: hero, how it's made, customer photos, FAQ.",
  },
];

export const PROMPT_PLACEHOLDER =
  "Hand-thrown stoneware mugs, small batches. Audience: home cooks in their 30s. Tone: quiet and specific. Colors: #2F3B2F, #EFE7D8.";

/* Upload constraints (§4.5) ---------------------------------------------- */

export const MAX_IMAGES = 6;
/**
 * 20 MB, because a full-page screenshot is genuinely that large.
 *
 * Raised for one specific reason: the vision pass now cuts a tall reference into
 * slices at up to 1568px wide, and a slice can only be as sharp as the file it
 * came from. A 1500x8000 PNG of a real homepage is 6-12 MB, so 5 MB was
 * rejecting exactly the uploads this feature was built to read.
 *
 * Nothing this large is stored or sent anywhere: the browser downscales to a
 * thumbnail and a handful of JPEG slices before the brief leaves the page, so
 * the request body is unaffected by what was picked.
 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export const ACCEPTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
] as const;

export const UPLOAD_REJECT_MESSAGE =
  "Only images work here — PNG, JPG, WebP, AVIF or GIF, up to 20 MB each.";

/* One slot per role — see BRAND_COLOR_ROLES. */
export const MAX_BRAND_COLORS = BRAND_COLOR_ROLES.length;
export const MAX_SELL_CHARS = 120;
export const MAX_PROMPT_CHARS = 1500;
