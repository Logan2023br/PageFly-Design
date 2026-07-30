import type { IconName } from "./icons";

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

/* Example chips for "what do you sell" (§4.1) ----------------------------- */

export const SELL_EXAMPLES = [
  "handmade ceramic mugs",
  "running shoes",
  "skincare for men",
  "single-origin coffee beans",
  "linen bedding",
  "vintage denim",
];

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
    id: "palette",
    label: "Colors",
    icon: "Palette",
    snippet: "Colors: deep green, warm cream, a little brass.",
  },
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
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
  "Only images work here — PNG, JPG, WebP, AVIF or GIF, up to 5 MB each.";

export const MAX_BRAND_COLORS = 5;
export const MAX_SELL_CHARS = 120;
export const MAX_PROMPT_CHARS = 1500;
