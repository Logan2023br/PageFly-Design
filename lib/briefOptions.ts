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

/**
 * The same field, when it is the ONLY field.
 *
 * In Build Quickly this prompt is the whole brief — what the merchant does not
 * put here, nothing else asks them for. So the placeholder is written as an
 * example of a complete answer rather than an afterthought, and names the three
 * things the form no longer has a card for: the trade, the colours, and what
 * they want the page to actually contain.
 */
export const QUICK_PROMPT_PLACEHOLDER = `Hand-thrown stoneware mugs, small batches, sold to home cooks in their 30s.

Main colours: #2F3B2F and #EFE7D8. Quiet and specific, lots of white space.

On the page I want: a hero with one mug photographed close up, the glazing process in three steps, customer reviews, a size guide, and a newsletter signup at the end.`;

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
/**
 * The most pieces one reference image is cut into for the vision read.
 *
 * HERE, and not in `imageAnalysis.ts`, because two files need it and they were
 * allowed to disagree: the slicer said 6, `briefSchema` said 4, and a screenshot
 * tall enough to need five pieces made the whole brief invalid. The brief was
 * then refused in silence, so the symptom was a Create button that did nothing
 * whenever a reference image was attached — and nothing at all when it was not.
 *
 * `imageAnalysis.ts` cannot own it: it reaches for a canvas, and importing it
 * into the schema would pull DOM code into the server bundle.
 */
export const MAX_SLICES = 6;

export const MAX_SELL_CHARS = 120;

/**
 * How much a merchant may write about their own store.
 *
 * 2,200. It was 1,500, then 3,000, then 2,000, and now this — and the number
 * is not arbitrary any more. `PROMPT_EXAMPLE` below is the structure this field
 * asks merchants to follow, it is 2,169 characters, and a ceiling that refuses
 * the app's own worked example is a ceiling teaching something it will not
 * accept. The example sets the floor for this number.
 *
 * What they write is the only part of the prompt that is about THIS store —
 * everything else is a trade table, a palette and a pattern vocabulary — so the
 * ceiling caps the one input that makes two stores in a trade differ.
 *
 * It goes to all three model stages verbatim and is truncated at none of them.
 * (`designServer.ts` has a constant of the same name; that one caps a stored
 * TRAINING filing and has nothing to do with this.)
 *
 * The cost is small and worth stating: the merchant's words land in the part of
 * the prompt that is NOT cached, so 3,000 characters is roughly 750 uncached
 * input tokens per page rather than 375 — well under a tenth of a cent on a
 * page that costs a few cents to build.
 *
 * NOW EQUAL TO `MAX_PROMPT_CHARS_STORED`, which is the ceiling this may not
 * pass: that one decides what a SAVED run can be read back as, and a form that
 * accepts more than the Library can decode would write briefs that quietly
 * stop opening. Raising this again means raising that one first.
 */
export const MAX_PROMPT_CHARS = 3000;

/**
 * The worked example, shown by the Example button on both prompt fields.
 *
 * A merchant reading "the more specific, the less generic" has been told the
 * principle and not the SHAPE. This is the shape: what you sell, then the look,
 * then the one component every page shares, then a line per page naming the
 * sections wanted on it. Nothing here is invented — it is the brief that
 * produced the best deck in this beta, trimmed to fit.
 *
 * It sets MAX_PROMPT_CHARS rather than being cut to fit it. The first version
 * was six characters over a 2,000 ceiling and two commas solved it; the next
 * was 169 over, which is a paragraph rather than a comma, so the ceiling moved
 * to 3,000. An example that will not go in the box it demonstrates is not an
 * example.
 *
 * THIS ONE IS EXACTLY 3,000 — no headroom at all, which is a state a comment
 * cannot police. `scripts/test-brief-example.ts` asserts it fits, so the day
 * somebody adds a clause the test says so rather than the Example dialog
 * quietly showing a brief that cannot be pasted into the field beside it.
 */
export const PROMPT_EXAMPLE = `7 PageFly pages for HEXWOOD, a US Halloween superstore (2009, Columbus OH, 42 stores): costumes, decor, candy, props, masks, pet costumes, party. Voice playful, confident, concrete. Pages: Home, Product, Collection, About, Contact, Blog, "Fright Night" sale. No header/footer.

PALETTE #0A0A0F void, #12121A panel, #1A1A25 card, #FF6B00 orange, #8B5CF6 violet, #B6FF3B acid. FONTS Creepster headings (uppercase, fallback Impact) + Nunito body. H1 120px (hero 150), H2 64, H3 30; mobile 56/36. Each heading has one <em> word in orange with a 30px glow. Uppercase pill buttons: primary orange with pulsing shadow, hover lift + −1deg; violet/acid/ghost. Motion: drifting violet+orange fog, glowing bobbing moon in heroes, alternating diagonal clip-path bands, card hover lift + glow + zoom, fade-up reveals, drifting bats (JS, live only).

RULES: no empty containers (use pseudo-elements or &nbsp; paragraphs) or PageFly shows "Drop element here"; center every section container (max-width 1240, margin auto — check 2560px); gate scroll states behind a runtime class so the JS-less editor renders flat, complete layouts with no 100vh gaps; lock back-to-top to 48×48 with a centered 22px icon; flex-center the Buy-it-now label; use native elements (ProductBox, ProductMedia3, swatches, StockIndicator, ProductList2 source:auto + Load More, CollectionBox, ArticleBox/List2, Form2, Accordion3, Tabs3, Slideshow, CountDown); responsive 4→2→1. Repeat: ships by Oct 31 if ordered by Oct 27 (29 express), free shipping $60+, size swap till Nov 3, returns till Nov 15, CPSIA tested, chat till 2am ET, pickup 8pm Oct 31.

HOME (16 sections): parallax fog hero + moon "Get <em>spooked</em>."; deadline strip + countdown; category slider (6 aisles); SIGNATURE pinned 4-step planner (Costume→Decor→Candy→Party: pins, steps swap on scroll, dot progress, stacks in editor); trust bar; 8-product grid; diagonal shop-the-porch with 4 pulsing hotspots + count-ups + $371 kit; scare-level tabs; costumes-by-who tiles; deal of the week + countdown; bundle builder (−20%); UGC masonry; reviews slider; shipping cut-offs + FAQ; newsletter; overlays.
PRODUCT: buy box with rating, scare-level chip, stock line, shipping-deadline countdown, glowing swatches, "Add to cauldron", Buy-it-now, perks, spec accordion; pinned how-to-wear; diagonal anatomy hotspots; complete-the-look; reviews; more-in-level slider.
COLLECTION: parallax hero + dynamic title, deadline strip, filter chips + sort, 12-product grid + Load More, category slider, bundle promo, FAQ.
ABOUT: hero, 4 count-up stats, pinned 4-chapter story 2009→2026, diagonal values, team, UGC, careers CTA.
CONTACT: "Costume <em>emergency</em>? We're up.", 4 channel cards, dark form, hours, stores, FAQ.
BLOG: chips, 88px title, 21:9 hero, TL;DR box, author card, comments, sticky sidebar (TOC, products, countdown), related, shop-the-guide.
SALE: jack-o'-lantern hero + countdown + copy-code BOO25, 3 offer tiers, diagonal doorbusters, aisle slider, sale grid, porch-kit`;


/**
 * What a SAVED brief may hold, which is not the same number.
 *
 * The form's ceiling has moved three times. The Library has not: it holds runs
 * built when it was 3,000, and `briefSchema` is what decodes them
 * (`lib/runPayload.ts`). Validating a saved run against today's input limit
 * would make every one of those runs fail to decode — and `decodeRunPayload`
 * fails quietly, so the merchant's pages would simply stop appearing.
 *
 * So the form caps what can be TYPED and this caps what can be READ BACK. It
 * only ever needs to be the highest the form has ever allowed.
 */
export const MAX_PROMPT_CHARS_STORED = 3000;

/* ==========================================================================
   MARKETS — who the page is being sold to.

   Fifty-two, and every one of them changes what a page says: the model is asked
   to build for shoppers there, in their language, carrying what they look for
   before they trust a store.

   Twelve additionally have a block in `skills/_sliced/60-markets.md`. Those
   blocks are ANCHORS rather than a second tier — they pin the handful of things
   where the exact words matter and a near-miss reads as foreign. `detailed` is
   how `marketLines` finds them; it is not shown to the merchant, because a
   merchant reading two groups would read the second as "the ones that do not
   work", and all of them work.

   An earlier cut had this backwards: a dozen "known" markets and forty that got
   their language and a warning not to invent anything. Withholding the question
   did not prevent invention. It prevented knowledge — the model knows more
   about trade in Poland than the person who wrote the blocks does.
   ========================================================================== */

export type Market = {
  id: string;
  label: string;
  /** the language the page is written in */
  language: string;
  /** currency name and how a price is written in it */
  price: string;
  /**
   * True when `60-markets.md` has a block for this id.
   *
   * Read only by `marketLines`, which appends the block as an anchor. Not shown
   * anywhere: it says something about how much has been written down, not about
   * whether choosing this market does anything.
   */
  detailed?: boolean;
};

export const MARKETS: Market[] = [
  /* ---- with an anchor block in 60-markets.md ------------------------------ */
  { id: "us", label: "United States", language: "English (US)", price: "$68.00", detailed: true },
  { id: "uk", label: "United Kingdom", language: "English (UK)", price: "£58.00", detailed: true },
  { id: "in", label: "India", language: "English (India)", price: "₹2,499", detailed: true },
  { id: "cn", label: "China", language: "简体中文", price: "¥498", detailed: true },
  { id: "jp", label: "Japan", language: "日本語", price: "¥5,480", detailed: true },
  { id: "de", label: "Germany", language: "Deutsch", price: "58,00 €", detailed: true },
  { id: "fr", label: "France", language: "Français", price: "58,00 €", detailed: true },
  { id: "vn", label: "Vietnam", language: "Tiếng Việt", price: "1.290.000₫", detailed: true },
  { id: "id", label: "Indonesia", language: "Bahasa Indonesia", price: "Rp249.000", detailed: true },
  { id: "br", label: "Brazil", language: "Português (Brasil)", price: "R$ 349,00", detailed: true },
  { id: "gulf", label: "Gulf (UAE, Saudi Arabia)", language: "English", price: "AED 249", detailed: true },
  { id: "au", label: "Australia", language: "English (AU)", price: "$68.00 AUD", detailed: true },

  /* ---- the model's own knowledge, same instruction ------------------------ */
  { id: "ca", label: "Canada", language: "English (Canada)", price: "$68.00 CAD" },
  { id: "mx", label: "Mexico", language: "Español (México)", price: "$1,249.00 MXN" },
  { id: "ar", label: "Argentina", language: "Español", price: "$34.900" },
  { id: "cl", label: "Chile", language: "Español", price: "$48.900" },
  { id: "co", label: "Colombia", language: "Español", price: "$249.000" },
  { id: "es", label: "Spain", language: "Español", price: "58,00 €" },
  { id: "it", label: "Italy", language: "Italiano", price: "58,00 €" },
  { id: "pt", label: "Portugal", language: "Português", price: "58,00 €" },
  { id: "nl", label: "Netherlands", language: "Nederlands", price: "€ 58,00" },
  { id: "be", label: "Belgium", language: "Nederlands", price: "€ 58,00" },
  { id: "ie", label: "Ireland", language: "English (Ireland)", price: "€58.00" },
  { id: "at", label: "Austria", language: "Deutsch", price: "58,00 €" },
  { id: "ch", label: "Switzerland", language: "Deutsch", price: "CHF 58.00" },
  { id: "se", label: "Sweden", language: "Svenska", price: "649 kr" },
  { id: "no", label: "Norway", language: "Norsk", price: "699 kr" },
  { id: "dk", label: "Denmark", language: "Dansk", price: "449 kr" },
  { id: "fi", label: "Finland", language: "Suomi", price: "58,00 €" },
  { id: "pl", label: "Poland", language: "Polski", price: "249,00 zł" },
  { id: "cz", label: "Czechia", language: "Čeština", price: "1 490 Kč" },
  { id: "ro", label: "Romania", language: "Română", price: "289,00 lei" },
  { id: "gr", label: "Greece", language: "Ελληνικά", price: "58,00 €" },
  { id: "tr", label: "Türkiye", language: "Türkçe", price: "1.899,00 ₺" },
  { id: "ru", label: "Russia", language: "Русский", price: "4 990 ₽" },
  { id: "ua", label: "Ukraine", language: "Українська", price: "2 499 ₴" },
  { id: "il", label: "Israel", language: "עברית", price: "₪249" },
  { id: "eg", label: "Egypt", language: "العربية", price: "٣٬٤٩٩ ج.م" },
  { id: "za", label: "South Africa", language: "English (South Africa)", price: "R1,249" },
  { id: "ng", label: "Nigeria", language: "English (Nigeria)", price: "₦89,000" },
  { id: "ke", label: "Kenya", language: "English (Kenya)", price: "KSh 8,900" },
  { id: "ma", label: "Morocco", language: "Français", price: "699,00 MAD" },
  { id: "kr", label: "South Korea", language: "한국어", price: "89,000원" },
  { id: "tw", label: "Taiwan", language: "繁體中文", price: "NT$1,980" },
  { id: "hk", label: "Hong Kong", language: "繁體中文", price: "HK$498" },
  { id: "sg", label: "Singapore", language: "English (Singapore)", price: "S$89.00" },
  { id: "my", label: "Malaysia", language: "Bahasa Malaysia", price: "RM 289.00" },
  { id: "th", label: "Thailand", language: "ไทย", price: "฿1,890" },
  { id: "ph", label: "Philippines", language: "English (Philippines)", price: "₱3,499" },
  { id: "pk", label: "Pakistan", language: "English (Pakistan)", price: "Rs 16,900" },
  { id: "bd", label: "Bangladesh", language: "বাংলা", price: "৳6,900" },
  { id: "nz", label: "New Zealand", language: "English (NZ)", price: "$98.00 NZD" },
];

export type MarketId = string;

export const MARKET_IDS: readonly string[] = MARKETS.map((m) => m.id);

/** The twelve with an anchor block. Used by the test, not by the picker. */
export const DETAILED_MARKET_IDS: readonly string[] = MARKETS.filter((m) => m.detailed).map(
  (m) => m.id,
);

const MARKET_BY_ID = new Map(MARKETS.map((m) => [m.id, m]));

export function isKnownMarket(id: string): boolean {
  return MARKET_BY_ID.has(id);
}

export function marketById(id: string): Market | null {
  return MARKET_BY_ID.get(id) ?? null;
}
