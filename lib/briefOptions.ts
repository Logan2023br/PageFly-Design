import type { IconName } from "./icons";
import { VERTICAL_CHIPS } from "./verticals";
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
/**
 * The Step 1 chips.
 *
 * Derived from `VERTICAL_CHIPS` rather than listed again: the labels and the
 * slugs must not be able to drift apart, and a chip whose slug has no block in
 * `30-verticals.md` is a page built from nothing.
 */
export const SELL_EXAMPLES = VERTICAL_CHIPS;

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
 * 50 MB, because a full-page screenshot is genuinely that large.
 *
 * Raised for one specific reason: the vision pass cuts a tall reference into
 * slices at up to 1568px wide, and a slice can only be as sharp as the file it
 * came from. A 1500x8000 PNG of a real homepage is 6-12 MB and a retina capture
 * several times that, so the old 5 MB was rejecting exactly the uploads this
 * feature was built to read.
 *
 * Nothing this large is stored or sent anywhere: the browser downscales to a
 * thumbnail and a handful of JPEG slices before the brief leaves the page, so
 * the request body is unaffected by what was picked.
 *
 * Bytes are not the real ceiling — see MAX_SOURCE_PIXELS in lib/imageAnalysis.ts.
 * A browser canvas gives up well before a file this size does, and it does it
 * silently.
 */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

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
  "Only images work here — PNG, JPG, WebP, AVIF or GIF, up to 50 MB each.";

/* One slot per role — see BRAND_COLOR_ROLES. */
export const MAX_BRAND_COLORS = BRAND_COLOR_ROLES.length;
export const MAX_SELL_CHARS = 120;
export const MAX_PROMPT_CHARS = 1500;
