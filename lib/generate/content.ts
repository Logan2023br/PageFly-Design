import type { Rng } from "./seed";
import type { StoreTypeId } from "../briefOptions";

/* ==========================================================================
   Copy engine.

   Every string in a mockup is derived from the brief — what the merchant sells,
   their store type, and keywords lifted out of their free-form prompt. There is
   no lorem ipsum anywhere in this file, by design: a mockup that says
   "Lorem ipsum dolor" tells the merchant nothing about whether the layout works
   for their product.
   ========================================================================== */

export type Vertical =
  | "apparel"
  | "footwear"
  | "beauty"
  | "food"
  | "home"
  | "jewelry"
  | "tech"
  | "pets"
  | "fitness"
  | "kids"
  | "digital"
  | "general";

const VERTICAL_KEYWORDS: Record<Vertical, string[]> = {
  apparel: [
    "shirt",
    "tee",
    "dress",
    "denim",
    "jean",
    "clothing",
    "apparel",
    "jacket",
    "knit",
    "linen",
    "coat",
    "hoodie",
    "sweater",
    "swim",
    "underwear",
    "sock",
    "hat",
    "scarf",
    "streetwear",
  ],
  footwear: ["shoe", "sneaker", "boot", "sandal", "trainer", "heel", "loafer"],
  beauty: [
    "skincare",
    "skin",
    "serum",
    "cream",
    "makeup",
    "cosmetic",
    "perfume",
    "fragrance",
    "shampoo",
    "hair",
    "soap",
    "balm",
    "lotion",
    "beauty",
    "nail",
  ],
  food: [
    "coffee",
    "tea",
    "chocolate",
    "snack",
    "food",
    "bean",
    "sauce",
    "spice",
    "honey",
    "wine",
    "beer",
    "kombucha",
    "granola",
    "bake",
    "oil",
    "jam",
    "cheese",
  ],
  home: [
    "mug",
    "ceramic",
    "candle",
    "bedding",
    "linen",
    "furniture",
    "kitchen",
    "home",
    "decor",
    "plant",
    "vase",
    "rug",
    "towel",
    "cookware",
    "stoneware",
    "pottery",
  ],
  jewelry: [
    "jewelry",
    "jewellery",
    "ring",
    "necklace",
    "earring",
    "bracelet",
    "watch",
    "gold",
    "silver",
    "gem",
  ],
  tech: [
    "gadget",
    "electronic",
    "headphone",
    "speaker",
    "camera",
    "phone",
    "charger",
    "keyboard",
    "drone",
    "tech",
    "laptop",
    "audio",
  ],
  pets: ["pet", "dog", "cat", "puppy", "kitten", "leash", "collar", "treat"],
  fitness: [
    "fitness",
    "gym",
    "yoga",
    "supplement",
    "protein",
    "workout",
    "running",
    "cycling",
    "sport",
    "athletic",
  ],
  kids: ["kid", "baby", "child", "toy", "toddler", "nursery", "infant"],
  digital: [
    "course",
    "ebook",
    "template",
    "preset",
    "software",
    "app",
    "download",
    "membership",
    "digital",
    "print",
    "font",
  ],
  general: [],
};

export function detectVertical(text: string): Vertical {
  const t = text.toLowerCase();
  let best: Vertical = "general";
  let bestScore = 0;
  for (const [vertical, words] of Object.entries(VERTICAL_KEYWORDS) as [
    Vertical,
    string[],
  ][]) {
    const score = words.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = vertical;
    }
  }
  return best;
}

/* ---- small word utilities ---------------------------------------------- */

const STOP_WORDS = new Set([
  "for",
  "and",
  "the",
  "with",
  "a",
  "an",
  "of",
  "in",
  "to",
  "my",
  "our",
]);

export function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function singular(word: string): string {
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/ies$/i.test(word)) return word.replace(/ies$/i, "y");
  if (/(ches|shes|xes|zes|ses)$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

export function plural(word: string): string {
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + "es";
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  if (/s$/i.test(word)) return word;
  return word + "s";
}

/** "handmade ceramic mugs" -> { head: "mug", heads: "mugs", modifier: "handmade ceramic" } */
export function parseSubject(whatYouSell: string) {
  const cleaned = whatYouSell
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ").filter(Boolean);
  const contentWords = words.filter((w) => !STOP_WORDS.has(w));
  const rawHead = contentWords[contentWords.length - 1] ?? "product";
  const head = singular(rawHead);
  const modifierWords = contentWords.slice(0, -1).slice(-2);

  return {
    raw: whatYouSell.trim(),
    cleaned,
    head,
    heads: plural(head),
    modifier: modifierWords.join(" "),
    modifierWords,
    words: contentWords,
  };
}

/* ---- brand name --------------------------------------------------------- */

const BRAND_FIRST: Record<Vertical, string[]> = {
  apparel: ["Thread", "Warp", "Selvage", "Halden", "Norrland", "Cloth"],
  footwear: ["Stride", "Cadence", "Last", "Milepost", "Sole"],
  beauty: ["Dew", "Balm", "Aster", "Lumen", "Ritual", "Kaolin"],
  food: ["Ember", "Harvest", "Roast", "Cellar", "Grain", "Orchard"],
  home: ["Kiln", "Terra", "Loom", "Hearth", "Clay", "Alder"],
  jewelry: ["Facet", "Aurum", "Lapis", "Filament", "Solstice"],
  tech: ["Vector", "Nimbus", "Circuit", "Halo", "Northpin"],
  pets: ["Fetch", "Paddock", "Barkley", "Meadow"],
  fitness: ["Tempo", "Vantage", "Iron", "Summit", "Pace"],
  kids: ["Bramble", "Willow", "Tumble", "Nest"],
  digital: ["Overleaf", "Cadence", "Blueprint", "Signal"],
  general: ["North", "Field", "Harbor", "Atlas", "Verve", "Sable"],
};

const BRAND_SECOND = [
  "& Co",
  "Studio",
  "Supply",
  "Goods",
  "Atelier",
  "Works",
  "Collective",
  "Made",
  "House",
  "Standard",
];

export function makeBrandName(vertical: Vertical, rng: Rng): string {
  const first = rng.pick(BRAND_FIRST[vertical] ?? BRAND_FIRST.general);
  const second = rng.pick(BRAND_SECOND);
  return `${first} ${second}`;
}

/* ---- prompt signals ----------------------------------------------------- */

export type PromptSignals = {
  hexes: string[];
  audience: string | null;
  tone: string | null;
  requestedSections: string[];
  keywords: string[];
  hasUrgency: boolean;
  hasSustainability: boolean;
  hasGifting: boolean;
  hasSubscription: boolean;
};

const SECTION_HINTS: [string, string][] = [
  ["faq", "faq"],
  ["size guide", "sizeGuide"],
  ["customer photo", "ugc"],
  ["review", "reviews"],
  ["testimonial", "reviews"],
  ["how it's made", "process"],
  ["how its made", "process"],
  ["process", "process"],
  ["care instruction", "care"],
  ["comparison", "comparison"],
  ["countdown", "countdown"],
  ["press", "press"],
  ["newsletter", "newsletter"],
  ["video", "video"],
];

export function readPromptSignals(prompt: string): PromptSignals {
  const t = prompt.toLowerCase();
  const hexes = Array.from(prompt.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi))
    .map((m) => m[0])
    .slice(0, 5);

  const grab = (labels: string[]) => {
    for (const label of labels) {
      const re = new RegExp(`${label}\\s*[:\\-—]\\s*([^\\n.]{4,160})`, "i");
      const m = re.exec(prompt);
      if (m) return m[1].trim();
    }
    return null;
  };

  const requestedSections = SECTION_HINTS.filter(([needle]) =>
    t.includes(needle),
  ).map(([, key]) => key);

  const keywords = Array.from(
    new Set(
      t
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4 && !STOP_WORDS.has(w)),
    ),
  ).slice(0, 24);

  return {
    hexes,
    audience: grab(["audience", "target audience", "customers", "for"]),
    tone: grab(["tone", "tone of voice", "voice"]),
    requestedSections: Array.from(new Set(requestedSections)),
    keywords,
    hasUrgency: /urgen|countdown|limited|sale|deadline|last chance/.test(t),
    hasSustainability: /sustainab|recycl|organic|carbon|ethical|compost/.test(t),
    hasGifting: /gift|present|wrapping/.test(t),
    hasSubscription: /subscri|recurring|monthly|refill/.test(t),
  };
}

/* ---- price ranges ------------------------------------------------------- */

const PRICE_BANDS: Record<Vertical, [number, number]> = {
  apparel: [38, 165],
  footwear: [75, 240],
  beauty: [18, 78],
  food: [12, 46],
  home: [24, 180],
  jewelry: [65, 480],
  tech: [49, 340],
  pets: [14, 62],
  fitness: [22, 130],
  kids: [16, 70],
  digital: [19, 199],
  general: [25, 120],
};

export function makePricer(vertical: Vertical, storeType: StoreTypeId, rng: Rng) {
  let [lo, hi] = PRICE_BANDS[vertical];
  if (storeType === "b2b") {
    lo = Math.round(lo * 0.6);
    hi = Math.round(hi * 0.7);
  }
  if (storeType === "dropshipping" || storeType === "pod") {
    lo = Math.round(lo * 0.7);
    hi = Math.round(hi * 0.8);
  }

  const fmt = (n: number) => `$${n}`;

  return {
    one(): string {
      const n = rng.int(lo, hi);
      // land on retail-looking endings
      const ends = [0, 5, 9];
      const base = Math.floor(n / 10) * 10 + rng.pick(ends);
      return fmt(Math.max(lo, base));
    },
    pair(): { price: string; compareAt?: string } {
      const price = this.one();
      if (!rng.bool(0.35)) return { price };
      const n = Number(price.slice(1));
      return { price, compareAt: fmt(Math.round(n * rng.int(115, 145)) / 100) };
    },
  };
}

/* ---- product naming ----------------------------------------------------- */

const MATERIAL: Record<Vertical, string[]> = {
  apparel: ["Organic cotton", "Merino", "Linen", "Selvedge denim", "Cashmere"],
  footwear: ["Suede", "Full-grain", "Knit", "Canvas", "Nubuck"],
  beauty: ["Niacinamide", "Squalane", "Ceramide", "Rosehip", "Zinc"],
  food: ["Single-origin", "Cold-pressed", "Small-batch", "Stone-ground"],
  home: ["Stoneware", "Ash-glazed", "Solid oak", "Waffle cotton", "Terracotta"],
  jewelry: ["14k gold", "Sterling silver", "Freshwater pearl", "Lab diamond"],
  tech: ["Aluminium", "Titanium", "Matte black", "Carbon"],
  pets: ["Waxed canvas", "Rope", "Freeze-dried", "Merino"],
  fitness: ["Cork", "Recycled", "Cast iron", "Bamboo"],
  kids: ["Muslin", "Beech wood", "Organic cotton", "Silicone"],
  digital: ["Starter", "Pro", "Complete", "Lifetime"],
  general: ["Everyday", "Classic", "Essential", "Original"],
};

const VARIANT_NAME = [
  "Sand",
  "Charcoal",
  "Bone",
  "Olive",
  "Rust",
  "Slate",
  "Ivory",
  "Clay",
  "Indigo",
  "Moss",
];

const EDITION = [
  "No. 01",
  "No. 02",
  "Everyday",
  "Weekend",
  "Studio",
  "Original",
  "Mini",
  "Large",
  "Set of 2",
  "Set of 4",
];

export function makeProductNamer(
  subject: ReturnType<typeof parseSubject>,
  vertical: Vertical,
  rng: Rng,
) {
  const head = titleCase(subject.head);
  return () => {
    const shape = rng.int(0, 3);
    if (shape === 0) return `${rng.pick(MATERIAL[vertical])} ${head}`;
    if (shape === 1) return `${rng.pick(VARIANT_NAME)} ${head}`;
    if (shape === 2) return `${head} — ${rng.pick(EDITION)}`;
    return `The ${head}`;
  };
}

export const VARIANT_NAMES = VARIANT_NAME;

/* ---- benefit / feature copy -------------------------------------------- */

const BENEFITS: Record<Vertical, [string, string][]> = {
  apparel: [
    ["Cut for real bodies", "Graded across nine sizes, not scaled from one."],
    ["Washed before it ships", "So it fits the same on day one and day fifty."],
    ["Repairs, not landfill", "Send it back for a mend at any point."],
  ],
  footwear: [
    ["Resoleable", "The outsole comes off and goes back on. Twice.."],
    ["Broken in already", "No two-week blister period."],
    ["Weighed, not guessed", "284 g per shoe in a size 9."],
  ],
  beauty: [
    ["One active, done properly", "10% at pH 5.5, where it actually works."],
    ["Full ingredient list", "On the box, in plain names, no asterisks."],
    ["Patch-tested", "On 112 people across four skin types."],
  ],
  food: [
    ["Roasted to order", "Bagged the morning it ships."],
    ["Named farms", "You can look up every lot we buy."],
    ["Ships in 48 hours", "Because freshness is the product."],
  ],
  home: [
    ["Thrown by hand", "Small batches, so no two are identical."],
    ["Dishwasher safe", "Tested to 200 cycles at 65°C."],
    ["Replaceable parts", "Lids, handles and seals sold separately."],
  ],
  jewelry: [
    ["Solid, not plated", "Recycled 14k throughout, including the clasp."],
    ["Resized free", "Once, within the first year."],
    ["Traceable stones", "Origin listed on every product page."],
  ],
  tech: [
    ["Repairable", "Schematics and spare parts published."],
    ["No account required", "Works fully offline, out of the box."],
    ["Five-year support", "Firmware updates, in writing."],
  ],
  pets: [
    ["Chew-tested", "By eleven dogs, for six months."],
    ["Machine washable", "Cold wash, hang dry, keeps its shape."],
    ["Vet-reviewed", "Formulated with a practising nutritionist."],
  ],
  fitness: [
    ["Built for daily use", "Rated to 10,000 cycles."],
    ["No proprietary lock-in", "Standard fittings throughout."],
    ["Grippy when wet", "Tested with sweat, not water."],
  ],
  kids: [
    ["Safety tested", "EN 71 and CPSIA certified."],
    ["Grows with them", "Adjustable across three years of sizes."],
    ["Nothing to swallow", "No parts under 32 mm."],
  ],
  digital: [
    ["Yours to keep", "Download the files, no expiry."],
    ["Updated free", "Every revision, for life."],
    ["Works everywhere", "Figma, Sketch and plain CSS included."],
  ],
  general: [
    ["Made to last", "Built from parts we can replace."],
    ["Honest pricing", "The same price all year."],
    ["Free returns", "Thirty days, no questions."],
  ],
};

export function benefitsFor(vertical: Vertical, rng: Rng, n: number) {
  const pool = BENEFITS[vertical] ?? BENEFITS.general;
  const extra = BENEFITS.general;
  const picked = rng.pickMany([...pool, ...extra], n);
  return picked.map(([title, body]) => ({ title, body }));
}

/* ---- testimonial copy --------------------------------------------------- */

const REVIEW_NAMES = [
  "Mai T.",
  "Jordan R.",
  "Priya S.",
  "Tom H.",
  "Lena K.",
  "Diego A.",
  "Aisha B.",
  "Chris N.",
  "Yuki M.",
  "Sam O.",
];

const REVIEW_ROLES = [
  "Verified buyer",
  "Bought twice",
  "Customer since 2023",
  "Verified buyer",
  "Subscriber",
];

export function reviewsFor(
  subject: ReturnType<typeof parseSubject>,
  rng: Rng,
  n: number,
) {
  const head = subject.head;
  const templates = [
    `Third ${head} I've bought here. The first two are still going.`,
    `Arrived in two days and looked exactly like the photos.`,
    `I was ready to be disappointed at this price. I wasn't.`,
    `Bought one, my sister ordered two the same week.`,
    `Packaging was flat-pack card, no plastic. Small thing, noticed it.`,
    `Asked a question at 9pm and got a real answer by morning.`,
    `The ${head} is heavier than I expected, in a good way.`,
    `Returned my first order for a different size — took four minutes.`,
  ];
  return rng.pickMany(templates, n).map((quote, i) => ({
    quote,
    author: REVIEW_NAMES[(rng.int(0, 9) + i) % REVIEW_NAMES.length],
    role: rng.pick(REVIEW_ROLES),
    rating: rng.bool(0.78) ? 5 : 4,
  }));
}

/* ---- FAQ copy ----------------------------------------------------------- */

export function faqsFor(
  subject: ReturnType<typeof parseSubject>,
  vertical: Vertical,
  rng: Rng,
  n: number,
) {
  const head = subject.head;
  const pool: { q: string; a: string }[] = [
    {
      q: "How long does delivery take?",
      a: "Two to four working days domestically, five to nine internationally. Tracking goes out the moment it leaves us.",
    },
    {
      q: "What's your returns policy?",
      a: `Thirty days from delivery, worn or unworn. We pay return postage on your first order.`,
    },
    {
      q: `How do I care for my ${head}?`,
      a: "Care instructions ship in the box and live on the product page. Short version: cold wash, no tumble dryer.",
    },
    {
      q: "Do you ship internationally?",
      a: "To 34 countries. Duties are calculated at checkout so there's nothing to pay on arrival.",
    },
    {
      q: "Is there a warranty?",
      a: "Two years against manufacturing faults. If something fails outside that, we'll quote a repair first.",
    },
    {
      q: "Can I change my order after buying?",
      a: "Yes, until it's packed — usually a few hours. Reply to your confirmation email and we'll catch it.",
    },
    {
      q: "Do you restock sold-out sizes?",
      a: "Most within six weeks. Add your email to a size and you'll hear the hour it lands.",
    },
    {
      q: "Where is it made?",
      a: vertical === "digital"
        ? "Built in-house by a team of four. No outsourced templates."
        : "In two workshops we visit twice a year. Both are named on the About page.",
    },
  ];
  return rng.pickMany(pool, n);
}

/* ---- misc atoms --------------------------------------------------------- */

export function bigNumber(rng: Rng, min: number, max: number): string {
  const n = rng.int(min, max);
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function dateLabel(rng: Rng): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${rng.pick(months)} ${rng.int(1, 28)}`;
}

export const NAV_LINKS_BY_STORE: Record<StoreTypeId, string[]> = {
  d2c: ["Shop", "Collections", "About", "Journal"],
  "single-product": ["The product", "How it works", "Reviews", "FAQ"],
  dropshipping: ["Shop all", "Best sellers", "New in", "Support"],
  creator: ["Shop", "Work", "About", "Contact"],
  corporate: ["Products", "Solutions", "Company", "Support"],
  b2b: ["Catalogue", "Pricing", "Become a stockist", "Contact"],
  agency: ["Services", "Work", "Studio", "Contact"],
  local: ["Shop", "Visit us", "Menu", "Contact"],
  pod: ["Shop", "Designs", "Custom", "Sizing"],
  subscription: ["How it works", "Plans", "What's inside", "FAQ"],
  digital: ["Courses", "Resources", "Pricing", "Login"],
  nonprofit: ["Our work", "Donate", "Volunteer", "Impact"],
};

export const PRIMARY_CTA_BY_STORE: Record<StoreTypeId, string> = {
  d2c: "Shop the collection",
  "single-product": "Buy one",
  dropshipping: "Shop now",
  creator: "See the shop",
  corporate: "Explore products",
  b2b: "Request a price list",
  agency: "Start a project",
  local: "Visit the shop",
  pod: "Start designing",
  subscription: "Choose a plan",
  digital: "Get instant access",
  nonprofit: "Donate",
};
