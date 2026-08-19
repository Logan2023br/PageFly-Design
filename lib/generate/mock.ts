import type { StoreTypeId } from "../briefOptions";
import { CATEGORY_BY_ID, PAGE_BY_ID } from "../pageCatalog";
import { styleToTokens, type VisualStyleId } from "../styleTokens";
import type { Brief } from "../validation";
import { mergeReferenceColour } from "../palette";
import {
  fitRecipeToSections,
  layoutToHints,
  type LayoutFingerprint,
  type RefHints,
} from "../refLayout";
import {
  NAV_LINKS_BY_STORE,
  PRIMARY_CTA_BY_STORE,
  VARIANT_NAMES,
  type PromptSignals,
  type Vertical,
  benefitsFor,
  bigNumber,
  dateLabel,
  detectVertical,
  faqsFor,
  makeBrandName,
  makePricer,
  makeProductNamer,
  parseSubject,
  readPromptSignals,
  reviewsFor,
  titleCase,
} from "./content";
import { assignBands, recipeFor } from "./recipes";
import { makeRng, pageSeed, type Rng } from "./seed";
import type {
  BlockContent,
  BlockKind,
  MockProduct,
  MockupBlock,
  PageMockup,
} from "./types";

/* ==========================================================================
   The mock generator.

   MOCK_MODE is the flag the real generator flips. Everything below produces a
   PageMockup from the brief + a seeded RNG — no network, no randomness that
   survives a reload.
   ========================================================================== */

export const MOCK_MODE = true;

type Ctx = {
  pageType: string;
  pageLabel: string;
  copyIndex: number;
  copyTotal: number;
  /** bumped by Regenerate; feeds the copy-rotation seeds so the headline and
      hero layout actually change, not just the product names */
  variant: number;
  subject: ReturnType<typeof parseSubject>;
  brand: string;
  vertical: Vertical;
  storeType: StoreTypeId;
  signals: PromptSignals;
  /** structural read of the merchant's reference screenshots */
  refHints: RefHints;
  rng: Rng;
  price: ReturnType<typeof makePricer>;
  productName: () => string;
  seed: string;
};

/* ---- shared atoms ------------------------------------------------------- */

function products(ctx: Ctx, n: number): MockProduct[] {
  return Array.from({ length: n }, (_, i) => {
    const { price, compareAt } = ctx.price.pair();
    return {
      name: ctx.productName(),
      price,
      compareAt,
      badge: ctx.rng.bool(0.22)
        ? ctx.rng.pick(["New", "Low stock", "Best seller", "Restocked"])
        : undefined,
      ratio: ctx.rng.pick([1, 1.25, 1.25, 1.4]),
      seed: `${ctx.seed}-prod-${i}`,
    };
  });
}

function headlineFor(ctx: Ctx): { headline: string; highlight: number } {
  const { subject, rng, pageType } = ctx;
  const heads = subject.heads;
  const mod = subject.modifier;

  const bank: string[] = (() => {
    switch (pageType) {
      case "lp-bfcm":
        return [
          `Black Friday. Everything ${heads}, up to 40% off.`,
          `Four days. Our lowest ${heads} prices of the year.`,
          `The ${subject.head} sale we only run once a year.`,
          `Cyber Monday: 40% off, while the sizes last.`,
          `One weekend. Every ${subject.head} reduced.`,
        ];
      case "lp-discount":
        return [
          `Take 20% off your first ${subject.head}.`,
          `Free shipping on every ${subject.head}, this week only.`,
          `£15 off when you spend £75 on ${heads}.`,
          `Two ${heads} for the price of one and a half.`,
        ];
      case "lp-waitlist":
        return [
          `The next batch of ${heads} opens soon.`,
          `Join the list for the ${subject.head} restock.`,
          `${titleCase(heads)} sold out in nine hours. Get in line.`,
          `Be told first when the ${subject.head} is back.`,
        ];
      case "lp-event":
        return [
          `A live walkthrough of how we make our ${heads}.`,
          `One hour, no slides, all ${heads}.`,
          `Join us in the workshop, on camera, in real time.`,
          `Ask our makers anything about ${heads}.`,
        ];
      case "lp-app":
        return [
          `Your ${heads}, in your pocket.`,
          `Track, reorder and restock ${heads} from one app.`,
          `Everything about your ${subject.head}, on one screen.`,
          `Reorder in two taps.`,
        ];
      case "lp-lead-gen":
        return [
          `The buyer's guide to ${heads}.`,
          `Everything we learned making ${heads}, in one PDF.`,
          `How to pick a ${subject.head} that lasts.`,
          `The eleven questions to ask before buying ${heads}.`,
        ];
      case "lp-influencer":
        return [
          `The ${heads} we actually use.`,
          `Hand-picked ${heads}, chosen not sponsored.`,
          `A short list, from someone who owns all of them.`,
          `Six ${heads}, ranked honestly.`,
        ];
      case "lp-launch":
        return [
          `Introducing the ${subject.head} we spent two years on.`,
          `The ${subject.head}, redesigned from the handle out.`,
          `New: ${heads} that survive a dishwasher and a decade.`,
          `Meet the ${subject.head}.`,
        ];
      case "lp-advertorial":
        return [
          `I replaced every ${subject.head} in my house. Here's what I learned.`,
          `Why cheap ${heads} cost more over five years.`,
          `The ${subject.head} test: eleven brands, one year.`,
        ];
      case "coming-soon":
        return [`${titleCase(mod || subject.head)} ${heads}, opening soon.`];
      case "about":
        return [`We make ${mod ? mod + " " : ""}${heads}. That's the whole business.`];
      case "sustainability":
        return [`What our ${heads} are made of, and where it comes from.`];
      case "reviews":
        return [`What people say after living with our ${heads}.`];
      case "lookbook":
        return [`The ${heads}, in context.`];
      case "ugc":
        return [`Your ${heads}, your photos.`];
      case "careers":
        return [`Help us make better ${heads}.`];
      case "press":
        return [`Press and coverage.`];
      case "store-locator":
        return [`Find our ${heads} near you.`];
      case "membership":
        return [`${titleCase(heads)}, delivered on your schedule.`];
      case "comparison":
        return [`Which ${subject.head} is right for you?`];
      case "bundle":
        return [`Buy the ${heads} together, pay less.`];
      default:
        return [
          `${titleCase(mod || "Everyday")} ${heads}, made properly.`,
          `The ${subject.head} you'll keep for a decade.`,
          `${titleCase(heads)} worth the shelf space.`,
          `Fewer ${heads}. Better ones.`,
        ];
    }
  })();

  /* Rotate through the bank by copy index rather than drawing at random.
     Three BFCM landing pages in one brief must not land on the same headline,
     and a per-page RNG can't guarantee that — so the starting offset is seeded
     on the page TYPE (shared by every copy) and copyIndex does the separating. */
  const bankRng = makeRng(
    `headline::${pageType}::${subject.head}::v${ctx.variant}`,
  );
  const offset = bankRng.int(0, bank.length - 1);
  const headline = bank[(offset + ctx.copyIndex - 1) % bank.length];

  // Highlight exactly one word — never more (brand rule).
  const words = headline.split(" ");
  const candidates = words
    .map((w, i) => [w, i] as const)
    .filter(([w]) => w.replace(/[^\p{L}]/gu, "").length > 4);
  const highlight =
    candidates.length > 0 ? rng.pick(candidates)[1] : -1;

  return { headline, highlight };
}

function subFor(ctx: Ctx): string {
  const { subject, signals, rng } = ctx;
  if (signals.audience) {
    return `Made for ${signals.audience.replace(/\.$/, "")}. Free returns for thirty days.`;
  }
  return rng.pick([
    `Small batches of ${subject.heads}, shipped within two days. Free returns for thirty days.`,
    `We make ${subject.heads} in one workshop and sell them direct. No middle mark-up.`,
    `${titleCase(subject.heads)} built from parts we can replace, in colours that don't date.`,
  ]);
}

/* ==========================================================================
   Per-kind content builders.
   ========================================================================== */

const BUILDERS: {
  [K in BlockKind]: (ctx: Ctx, blockIndex: number) => BlockContent[K];
} = {
  nav: (ctx) => ({
    brand: ctx.brand,
    links: NAV_LINKS_BY_STORE[ctx.storeType],
    cartCount: ctx.rng.int(0, 3),
    ctaLabel:
      ctx.pageType.startsWith("lp-") || ctx.pageType === "coming-soon"
        ? PRIMARY_CTA_BY_STORE[ctx.storeType]
        : undefined,
    announcement: ctx.signals.hasUrgency
      ? "Ends Sunday — 20% off with code THANKS"
      : ctx.rng.bool(0.4)
        ? "Free shipping over $60"
        : undefined,
  }),

  hero: (ctx) => {
    const { headline, highlight } = headlineFor(ctx);

    /* A reference screenshot wins here: its first band tells us whether the
       page opens on a full-bleed image, a split, or centred copy — which is the
       single most recognisable structural decision on any page. Without a
       reference, rotate so repeated landing pages don't share a hero. */
    const layouts = ctx.pageType.startsWith("lp-")
      ? (["split", "centered"] as const)
      : (["split", "centered", "fullBleed"] as const);
    const layoutRng = makeRng(
      `layout::${ctx.pageType}::${ctx.subject.head}::v${ctx.variant}`,
    );
    const layout =
      ctx.refHints.heroLayout ??
      layouts[
        (layoutRng.int(0, layouts.length - 1) + ctx.copyIndex - 1) %
          layouts.length
      ];
    return {
      eyebrow:
        ctx.pageType.startsWith("lp-") || ctx.rng.bool(0.5)
          ? ctx.rng.pick([
              titleCase(ctx.subject.heads),
              "New this season",
              "Direct from the workshop",
              ctx.pageLabel,
            ])
          : undefined,
      headline,
      highlight,
      sub: subFor(ctx),
      primaryCta: PRIMARY_CTA_BY_STORE[ctx.storeType],
      secondaryCta: ctx.rng.bool(0.6) ? "How it's made" : undefined,
      layout,
      seed: `${ctx.seed}-hero`,
      stat: ctx.rng.bool(0.45)
        ? {
            value: `+${ctx.rng.int(12, 44)}.${ctx.rng.int(1, 9)}%`,
            label: "conversion after redesign",
          }
        : undefined,
    };
  },

  logoStrip: (ctx) => ({
    label: ctx.rng.pick([
      "Stocked by",
      "As seen in",
      "Trusted by",
      "Featured in",
    ]),
    names: ctx.rng.pickMany(
      [
        "MONOCLE",
        "KINFOLK",
        "WIRED",
        "DEZEEN",
        "VOGUE",
        "GQ",
        "THE TIMES",
        "APARTAMENTO",
        "CEREAL",
      ],
      5,
    ),
  }),

  collectionHeader: (ctx) => ({
    title: titleCase(ctx.subject.heads),
    description: `Every ${ctx.subject.head} we make, in one place. Filter by size, colour or price.`,
    filters: ["Size", "Colour", "Price", "Availability", "Material"],
    resultCount: `${ctx.rng.int(18, 96)} products`,
    sortLabel: "Sort: Featured",
  }),

  productGrid: (ctx, i) => ({
    title:
      i === 0
        ? undefined
        : ctx.rng.pick([
            `More ${ctx.subject.heads}`,
            "Pairs well with",
            "Best sellers",
            "New in",
          ]),
    subtitle: ctx.rng.bool(0.4)
      ? `Restocked weekly. Most ship the same day.`
      : undefined,
    products: products(ctx, ctx.rng.pick([6, 8, 8])),
    // Column count read off the reference's grid bands, when there is one.
    columns: ctx.refHints.gridColumns ?? 4,
  }),

  productDetail: (ctx) => {
    const { price, compareAt } = ctx.price.pair();
    const useSizes =
      ctx.vertical === "apparel" ||
      ctx.vertical === "footwear" ||
      ctx.vertical === "kids";
    return {
      name: ctx.productName(),
      price,
      compareAt,
      rating: ctx.rng.bool(0.7) ? 5 : 4,
      reviewCount: `${ctx.rng.int(24, 890)} reviews`,
      variantLabel: "Colour",
      variants: ctx.rng.pickMany(VARIANT_NAMES, 4),
      sizeLabel: useSizes ? "Size" : undefined,
      sizes: useSizes ? ["XS", "S", "M", "L", "XL"] : undefined,
      bullets: benefitsFor(ctx.vertical, ctx.rng, 4).map(
        (b) => `${b.title} — ${b.body}`,
      ),
      galleryCount: 4,
      cta: "Add to cart",
      seed: `${ctx.seed}-pdp`,
    };
  },

  featureRow: (ctx) => ({
    title: ctx.rng.pick([
      `Why our ${ctx.subject.heads} cost what they cost`,
      "What you get",
      "The short version",
      `Three things about this ${ctx.subject.head}`,
    ]),
    sub: ctx.signals.tone
      ? undefined
      : `No claims we can't back up on the product page.`,
    items: benefitsFor(
      ctx.vertical,
      ctx.rng,
      ctx.refHints.gridColumns ?? ctx.rng.pick([3, 3, 4]),
    ),
    columns: ctx.refHints.gridColumns ?? 3,
  }),

  imageSplit: (ctx) => ({
    eyebrow: ctx.rng.pick(["How it's made", "Inside the workshop", "The process"]),
    headline: ctx.signals.hasSustainability
      ? `Where the material comes from`
      : `Made in one workshop, by eleven people`,
    body: `Every ${ctx.subject.head} is finished by hand and checked twice before it's boxed. When something fails, we know exactly whose bench it left.`,
    cta: ctx.rng.bool(0.7) ? "Read the full process" : undefined,
    side: ctx.rng.pick(["left", "right"] as const),
    seed: `${ctx.seed}-split`,
  }),

  testimonials: (ctx) => ({
    title: ctx.rng.pick([
      `${bigNumber(ctx.rng, 1200, 9800)} reviews, ${ctx.rng.int(88, 97)}% at five stars`,
      "What customers say",
      "Reviews, unedited",
    ]),
    items: reviewsFor(ctx.subject, ctx.rng, 3),
  }),

  statsRow: (ctx) => ({
    items: [
      { value: `${bigNumber(ctx.rng, 8000, 240000)}`, label: "orders shipped" },
      { value: `${ctx.rng.int(88, 98)}%`, label: "would buy again" },
      { value: `${ctx.rng.int(2, 6)} days`, label: "average delivery" },
      { value: `${ctx.rng.int(11, 34)}`, label: "countries served" },
    ],
  }),

  promoBanner: (ctx) => ({
    headline: ctx.signals.hasUrgency
      ? `Ends Sunday — 20% off every ${ctx.subject.head}`
      : ctx.rng.pick([
          `Free shipping over $60`,
          `Buy two ${ctx.subject.heads}, get 15% off`,
          `Join the list, get first pick of restocks`,
        ]),
    sub: ctx.rng.bool(0.6)
      ? "One code per customer. Applies at checkout."
      : undefined,
    cta: ctx.rng.pick(["Shop the offer", "Claim it", "Get the code"]),
    tone: ctx.rng.pick(["accent", "ink"] as const),
  }),

  countdown: (ctx) => ({
    headline: ctx.rng.pick([
      "Offer ends in",
      "Sale closes in",
      "Doors close in",
    ]),
    sub: `After that, prices go back to normal. No extensions.`,
    units: ["Days", "Hours", "Minutes", "Seconds"],
  }),

  faqAccordion: (ctx) => ({
    title: "Questions people ask before buying",
    items: faqsFor(ctx.subject, ctx.vertical, ctx.rng, 5),
    openIndex: 0,
  }),

  blogList: (ctx) => {
    const topics = [
      `How to choose a ${ctx.subject.head}`,
      `Five ${ctx.subject.heads} we'd buy again`,
      `What "handmade" actually means`,
      `A workshop visit, in photographs`,
      `The material we stopped using`,
      `Care instructions, expanded`,
    ];
    const picked = ctx.rng.pickMany(topics, 5);
    const mk = (title: string) => ({
      title,
      excerpt: `A short read on the decisions behind our ${ctx.subject.heads} — what we tried, what we kept.`,
      date: dateLabel(ctx.rng),
      tag: ctx.rng.pick(["Guides", "Workshop", "Materials", "Care"]),
    });
    return {
      title: "Journal",
      featured: mk(picked[0]),
      posts: picked.slice(1).map(mk),
    };
  },

  blogArticle: (ctx) => ({
    tag: ctx.pageType === "lp-advertorial" ? "Sponsored" : "Workshop",
    title:
      ctx.pageType === "lp-advertorial"
        ? `I bought ${ctx.subject.heads} for a year. Here's what changed.`
        : `Why our ${ctx.subject.heads} take four weeks to make`,
    author: ctx.rng.pick(["Mai Tran", "Jordan Reid", "Priya Shah", "Tom Hale"]),
    date: `${dateLabel(ctx.rng)}, 2026`,
    readTime: `${ctx.rng.int(4, 11)} min read`,
    paragraphs: [
      `We get asked about the lead time more than anything else. The short answer is that a ${ctx.subject.head} passes through six pairs of hands, and four of those steps can't be rushed without showing up in the finished piece.`,
      `The first is the one nobody thinks about. Material arrives, and it sits. Not for effect — it genuinely needs to settle before it can be worked, and skipping that is the single most common cause of a piece failing inspection later.`,
      `From there it's cutting, forming, finishing and checking. We rejected 4.2% of everything we made last quarter. That number is on the wall in the workshop, and it goes up whenever we try to move faster.`,
      `If you want the fast version of this product, it exists and it's cheaper. We've bought it, taken it apart, and written up what we found.`,
    ],
    pullQuote: `We rejected 4.2% of everything we made last quarter. That number is on the wall.`,
    seed: `${ctx.seed}-article`,
  }),

  cartSummary: (ctx) => {
    const items = products(ctx, ctx.rng.int(2, 3)).map((p) => ({
      name: p.name,
      variant: ctx.rng.pick(VARIANT_NAMES),
      price: p.price,
      qty: ctx.rng.int(1, 2),
    }));
    const subtotal = items.reduce(
      (sum, it) => sum + Number(it.price.slice(1)) * it.qty,
      0,
    );
    return {
      title: "Your cart",
      items,
      rows: [
        { label: "Subtotal", value: `$${subtotal}` },
        { label: "Shipping", value: subtotal > 60 ? "Free" : "$6" },
        { label: "Tax", value: `$${Math.round(subtotal * 0.08)}` },
      ],
      total: {
        label: "Total",
        value: `$${subtotal + (subtotal > 60 ? 0 : 6) + Math.round(subtotal * 0.08)}`,
      },
      cta: "Checkout",
      note: "Shipping and taxes calculated at checkout. Free returns for thirty days.",
    };
  },

  leadForm: (ctx) => {
    const isWaitlist = ctx.pageType === "lp-waitlist";
    const isWholesale = ctx.pageType === "wholesale";
    const isComingSoon = ctx.pageType === "coming-soon";
    return {
      eyebrow: isWholesale ? "Trade enquiries" : undefined,
      headline: isWaitlist
        ? `Get told when ${ctx.subject.heads} are back`
        : isWholesale
          ? "Request a wholesale price list"
          : isComingSoon
            ? "Be first through the door"
            : `Get the ${ctx.subject.head} buyer's guide`,
      body: isWholesale
        ? "Minimum order is 12 units. We reply to trade enquiries within one working day."
        : "One email when it happens. No weekly newsletter unless you ask for one.",
      fields: isWholesale
        ? [
            { label: "Company name", wide: true },
            { label: "Contact name" },
            { label: "Email" },
            { label: "Country" },
            { label: "Expected volume" },
            { label: "Anything else", wide: true },
          ]
        : [{ label: "Email address", wide: true }],
      cta: isWaitlist
        ? "Join the waitlist"
        : isWholesale
          ? "Send enquiry"
          : "Send it to me",
      note: "We don't share your address. Unsubscribe in one click.",
      layout: isWholesale ? "split" : ctx.rng.pick(["split", "centered"] as const),
      seed: `${ctx.seed}-lead`,
    };
  },

  dataTable: (ctx) => {
    if (ctx.pageType === "size-guide") {
      return {
        title: "Measurements",
        note: "Measured flat, in centimetres. If you're between sizes, take the larger one.",
        columns: ["Size", "Chest", "Length", "Sleeve", "Shoulder"],
        rows: [
          ["XS", "48", "66", "61", "42"],
          ["S", "51", "68", "62", "44"],
          ["M", "54", "70", "64", "46"],
          ["L", "57", "72", "65", "48"],
          ["XL", "60", "74", "66", "50"],
        ],
        booleanCells: false,
        highlightColumn: -1,
      };
    }
    if (ctx.pageType === "shipping") {
      return {
        title: "Shipping rates and times",
        note: "Duties are calculated at checkout. Nothing to pay on arrival.",
        columns: ["Destination", "Standard", "Express", "Cost"],
        rows: [
          ["Domestic", "2-4 days", "Next day", "Free over $60"],
          ["Europe", "4-7 days", "2-3 days", "$12"],
          ["North America", "5-9 days", "3-4 days", "$18"],
          ["Asia-Pacific", "6-10 days", "3-5 days", "$16"],
          ["Rest of world", "8-14 days", "—", "$24"],
        ],
        booleanCells: false,
        highlightColumn: -1,
      };
    }
    if (ctx.pageType === "wholesale") {
      return {
        title: "Trade pricing",
        note: "Prices exclude tax. Minimum order 12 units per style.",
        columns: ["Tier", "Units", "Discount", "Lead time"],
        rows: [
          ["Starter", "12-49", "35%", "3 weeks"],
          ["Stockist", "50-199", "42%", "4 weeks"],
          ["Partner", "200+", "50%", "6 weeks"],
        ],
        booleanCells: false,
        highlightColumn: 1,
      };
    }
    // comparison
    const names = [ctx.productName(), ctx.productName(), ctx.productName()];
    return {
      title: `Compare our ${ctx.subject.heads}`,
      note: "Same warranty and returns policy across the range.",
      columns: ["", ...names],
      rows: [
        ["Price", ctx.price.one(), ctx.price.one(), ctx.price.one()],
        ["Best for", "Everyday", "Heavy use", "Gifting"],
        ["Material", "Standard", "Reinforced", "Premium"],
        ["Replaceable parts", "yes", "yes", "yes"],
        ["Gift packaging", "no", "no", "yes"],
        ["Warranty", "2 years", "5 years", "5 years"],
      ],
      booleanCells: true,
      highlightColumn: 2,
    };
  },

  pricingTiers: (ctx) => {
    const isAffiliate = ctx.pageType === "affiliate";
    return {
      title: isAffiliate ? "Commission tiers" : "Choose a plan",
      sub: isAffiliate
        ? "Paid monthly, thirty days after the order clears returns."
        : `Skip, pause or cancel any time. No minimum term.`,
      tiers: [
        {
          name: isAffiliate ? "Creator" : "Monthly",
          price: isAffiliate ? "10%" : ctx.price.one(),
          period: isAffiliate ? "per order" : "per month",
          features: [
            isAffiliate ? "Unique discount code" : `One ${ctx.subject.head} a month`,
            "Cancel any time",
            "Standard shipping",
          ],
          featured: false,
          cta: isAffiliate ? "Apply" : "Start monthly",
        },
        {
          name: isAffiliate ? "Partner" : "Every two months",
          price: isAffiliate ? "15%" : ctx.price.one(),
          period: isAffiliate ? "per order" : "per delivery",
          features: [
            isAffiliate ? "Dedicated landing page" : "Two-monthly delivery",
            "Skip or pause",
            "Free shipping",
            "First pick of restocks",
          ],
          featured: true,
          cta: isAffiliate ? "Apply" : "Most popular",
        },
        {
          name: isAffiliate ? "Ambassador" : "Annual",
          price: isAffiliate ? "20%" : ctx.price.one(),
          period: isAffiliate ? "per order" : "per year",
          features: [
            isAffiliate ? "Custom collaboration" : "Twelve deliveries",
            "Two months free",
            "Free shipping",
            "Early access",
          ],
          featured: false,
          cta: isAffiliate ? "Talk to us" : "Save 16%",
        },
      ],
    };
  },

  quizStep: (ctx) => ({
    step: 2,
    total: 5,
    question: `What will you use your ${ctx.subject.head} for most?`,
    options: [
      { label: "Every single day", hint: "Durability first" },
      { label: "Weekends and trips", hint: "Weight matters" },
      { label: "Special occasions", hint: "Finish matters" },
      { label: "It's a gift", hint: "We'll wrap it" },
    ],
    selected: 1,
  }),

  accountPanel: (ctx) => {
    if (ctx.pageType === "login") {
      return {
        mode: "auth" as const,
        title: "Sign in",
        sub: "Order history, saved addresses and faster checkout.",
        tabs: ["Sign in", "Create account"],
        fields: [{ label: "Email" }, { label: "Password" }],
        cta: "Sign in",
      };
    }
    return {
      mode: "dashboard" as const,
      title: `Hello, ${ctx.rng.pick(["Mai", "Jordan", "Priya", "Tom"])}`,
      sub: "Everything you've ordered, and where it is.",
      tabs: ["Orders", "Addresses", "Details", "Returns"],
      orders: Array.from({ length: 4 }, () => ({
        id: `#${ctx.rng.int(10000, 99999)}`,
        date: `${dateLabel(ctx.rng)}, 2026`,
        status: ctx.rng.pick(["Delivered", "In transit", "Packing", "Returned"]),
        total: ctx.price.one(),
      })),
    };
  },

  orderTracker: (ctx) => ({
    orderId: `#${ctx.rng.int(10000, 99999)}`,
    eta: `Arriving ${dateLabel(ctx.rng)}`,
    steps: [
      { label: "Order placed", detail: "Confirmation emailed", done: true },
      { label: "Packed", detail: "Checked and boxed", done: true },
      { label: "In transit", detail: "With the carrier", done: true },
      { label: "Out for delivery", detail: "Before 6pm", done: false },
      { label: "Delivered", detail: "Signature not required", done: false },
    ],
    items: products(ctx, 2).map((p) => ({
      name: p.name,
      qty: 1,
      seed: p.seed,
    })),
  }),

  contactPanel: (ctx) => ({
    headline: ctx.pageType === "store-locator" ? "Visit us" : "Talk to a person",
    body: "We answer every message ourselves, usually within a few hours during the week.",
    methods: [
      { label: "Email", value: `hello@${ctx.brand.toLowerCase().replace(/[^a-z]/g, "")}.com` },
      { label: "Phone", value: "+84 28 3822 9100" },
      { label: "Hours", value: "Mon-Fri, 9am-6pm ICT" },
    ],
    fields: [
      { label: "Your name" },
      { label: "Email" },
      { label: "Order number (if you have one)", wide: true },
      { label: "How can we help?", wide: true },
    ],
    cta: "Send message",
    hasMap: ctx.pageType === "store-locator" || ctx.rng.bool(0.5),
  }),

  mediaWall: (ctx) => {
    const isUgc = ctx.pageType === "ugc";
    const isPress = ctx.pageType === "press";
    const count = isPress ? 6 : 9;
    return {
      title: isUgc
        ? "From our customers"
        : isPress
          ? "Coverage"
          : `The ${ctx.subject.heads} in use`,
      sub: isUgc
        ? "Tag us and you might end up here. We ask first."
        : undefined,
      handle: isUgc ? `@${ctx.brand.toLowerCase().replace(/[^a-z]/g, "")}` : undefined,
      tiles: Array.from({ length: count }, (_, i) => ({
        caption: isPress ? ctx.rng.pick(["MONOCLE", "DEZEEN", "CEREAL"]) : undefined,
        ratio: ctx.rng.pick([1, 1, 1.25, 0.8]),
        seed: `${ctx.seed}-tile-${i}`,
        wide: i === 0 && !isUgc,
      })),
      shoppable: !isPress,
    };
  },

  richText: (ctx) => {
    const pageType = ctx.pageType;
    if (pageType === "legal") {
      return {
        eyebrow: "Last updated May 2026",
        title: "Terms and policies",
        lead: "Plain-language summaries first, the full legal text under each heading.",
        sections: [
          {
            heading: "Returns",
            body: "Thirty days from delivery, in any condition. We pay return postage on a first order. Refunds land within five working days of the parcel reaching us.",
          },
          {
            heading: "Privacy",
            body: "We store your name, address and order history. We do not sell it, and we do not run third-party advertising trackers on this site.",
          },
          {
            heading: "Warranty",
            body: "Two years against manufacturing faults from the delivery date. Wear from normal use is not a fault, but we will quote a repair.",
          },
        ],
      };
    }
    if (pageType === "size-guide") {
      return {
        title: "Size guide",
        lead: `Our ${ctx.subject.heads} are graded across five sizes, measured flat. If you're between two, size up — the fabric does not grow.`,
        sections: [
          {
            heading: "How to measure",
            body: "Lay a piece you already own flat, close it, and measure across the chest one inch below the armhole. Compare that number to the table below rather than to a body measurement.",
          },
        ],
      };
    }
    if (pageType === "shipping") {
      return {
        title: "Shipping and returns",
        lead: "Everything ships from one warehouse. Rates and timings are below, with no surprises at the door.",
        sections: [
          {
            heading: "Returns",
            body: "Thirty days, worn or unworn. Start a return from your account page and we email a label within the hour.",
          },
        ],
      };
    }
    if (pageType === "faq") {
      return {
        title: "Help",
        lead: `The questions we get asked most about our ${ctx.subject.heads}, answered properly. If yours isn't here, the contact form is at the bottom.`,
        sections: [],
      };
    }
    if (pageType === "careers") {
      return {
        eyebrow: "Careers",
        title: "Working here",
        lead: `We're eleven people making ${ctx.subject.heads} in one building. Everyone does some part of the physical work, including the founders.`,
        sections: [
          {
            heading: "How we hire",
            body: "A conversation, a paid half-day on the actual work, then a decision within a week. No take-home tests you don't get paid for.",
          },
        ],
      };
    }
    if (pageType === "sustainability") {
      return {
        eyebrow: "Materials",
        title: "What this is made of",
        lead: `We publish the full material breakdown of every ${ctx.subject.head}, including the parts that aren't recycled yet.`,
        sections: [
          {
            heading: "What we've changed",
            body: "Plastic out of packaging in 2024. Air freight cut to 4% of shipments. Both were cost-neutral, which is why they stuck.",
          },
          {
            heading: "What we haven't",
            body: "The hardware is still virgin metal. We haven't found a recycled supply that passes the same load test, and we'd rather say that than round it up.",
          },
        ],
      };
    }
    return {
      eyebrow: "About",
      title: `We make ${ctx.subject.heads}`,
      lead: `${ctx.brand} started in 2019 with one product and a workshop above a bakery. We now make ${ctx.rng.int(6, 24)} things and sell them direct.`,
      sections: [
        {
          heading: "Why direct",
          body: "Selling through shops meant doubling the price to keep both businesses alive. Going direct let us keep the same margin at a lower price, and talk to the people who actually use the thing.",
        },
        {
          heading: "What we won't do",
          body: "No fake countdown timers, no invented original prices, no reviews we wrote ourselves. The full policy is on the terms page.",
        },
      ],
    };
  },

  listPanel: (ctx) => {
    if (ctx.pageType === "store-locator") {
      return {
        title: "Stockists",
        sub: "Places you can hold one before buying.",
        rows: [
          { primary: "District 1 flagship", secondary: "24 Ly Tu Trong, Ho Chi Minh City", meta: "Open until 8pm", action: "Directions" },
          { primary: "Hanoi studio", secondary: "9 Nha Tho, Hoan Kiem", meta: "Open until 6pm", action: "Directions" },
          { primary: "Da Nang workshop", secondary: "112 Bach Dang", meta: "By appointment", action: "Book" },
          { primary: "Singapore stockist", secondary: "Tiong Bahru, 78 Yong Siak St", meta: "Open until 7pm", action: "Directions" },
        ],
      };
    }
    if (ctx.pageType === "careers") {
      return {
        title: "Open roles",
        sub: "Salary bands are published in every listing.",
        rows: [
          { primary: "Production assistant", secondary: "Da Nang · Full time", meta: "$1,400-1,800", action: "Apply" },
          { primary: "Customer support", secondary: "Remote (ICT ±3) · Full time", meta: "$1,200-1,600", action: "Apply" },
          { primary: "Photographer", secondary: "Ho Chi Minh City · Contract", meta: "Day rate", action: "Apply" },
        ],
      };
    }
    if (ctx.pageType === "press") {
      return {
        title: "Press enquiries and assets",
        rows: [
          { primary: "Brand assets", secondary: "Logos, wordmark, colour values", meta: "ZIP, 18 MB", action: "Download" },
          { primary: "Product photography", secondary: "Full range, print resolution", meta: "ZIP, 240 MB", action: "Download" },
          { primary: "Press contact", secondary: "press@brand.com", meta: "Replies in 1 day", action: "Email" },
        ],
      };
    }
    if (ctx.pageType === "lp-event") {
      return {
        title: "Who's speaking",
        rows: [
          { primary: "Mai Tran", secondary: "Founder", meta: "20 min", action: undefined },
          { primary: "Jordan Reid", secondary: "Head of production", meta: "15 min", action: undefined },
          { primary: "Open questions", secondary: "Live, unscripted", meta: "25 min", action: undefined },
        ],
      };
    }
    return {
      title: "Recent orders",
      rows: Array.from({ length: 4 }, () => ({
        primary: ctx.productName(),
        secondary: `Ordered ${dateLabel(ctx.rng)}, 2026`,
        meta: ctx.price.one(),
        action: "Track",
      })),
    };
  },

  emptyState: (ctx) => ({
    code: ctx.pageType === "404" ? "404" : undefined,
    headline:
      ctx.pageType === "404"
        ? "That page has moved or never existed"
        : `No ${ctx.subject.heads} matched that`,
    body:
      ctx.pageType === "404"
        ? "The link might be old. Search below, or start from the whole collection."
        : "Try a shorter search, or browse the full range.",
    cta: `Browse all ${ctx.subject.heads}`,
    secondaryCta: "Contact us",
    searchable: true,
  }),

  searchResults: (ctx) => ({
    query: ctx.subject.head,
    resultCount: `${ctx.rng.int(4, 48)} results for "${ctx.subject.head}"`,
    suggestions: [
      `${ctx.subject.head} set`,
      `small ${ctx.subject.head}`,
      `${ctx.subject.head} gift`,
      "new in",
    ],
    products: products(ctx, 6),
  }),

  giftCardPicker: (ctx) => ({
    headline: "Gift card",
    body: "Delivered by email the moment you buy, or scheduled for a date you choose. No expiry.",
    amounts: ["$25", "$50", "$100", "$150", "$250"],
    selected: 1,
    fields: [
      { label: "Recipient name" },
      { label: "Recipient email" },
      { label: "Delivery date" },
      { label: "Your name" },
      { label: "Message (optional)", wide: true },
    ],
    cta: "Add gift card to cart",
    seed: `${ctx.seed}-gift`,
  }),

  bundleBuilder: (ctx) => {
    const items = products(ctx, 3);
    const total = items.reduce((s, p) => s + Number(p.price.slice(1)), 0);
    return {
      title: "Build your set",
      sub: `Pick three ${ctx.subject.heads} and the discount applies automatically.`,
      items,
      savingLabel: `Save $${Math.round(total * 0.15)}`,
      totalLabel: "Bundle price",
      totalValue: `$${Math.round(total * 0.85)}`,
      cta: "Add set to cart",
    };
  },

  upsellOffer: (ctx) => {
    const p = products(ctx, 1)[0];
    return {
      eyebrow: "One-time offer",
      headline: `Add a second ${ctx.subject.head} for 30% less`,
      body: "It ships in the same box, so there's no extra postage. This price isn't available after you leave this page.",
      product: p,
      timerLabel: "Offer expires in 09:58",
      cta: "Yes, add it to my order",
      decline: "No thanks, continue",
    };
  },

  thankYouPanel: (ctx) => ({
    headline: "Thanks — your order is in",
    body: `A confirmation is on its way to your inbox. Your ${ctx.subject.head} is packed by hand, so give us a day before it moves.`,
    orderId: `#${ctx.rng.int(10000, 99999)}`,
    steps: [
      { label: "Check your email", detail: "Confirmation and receipt" },
      { label: "We pack it", detail: "Usually within one working day" },
      { label: "Track it", detail: "Link arrives when it ships" },
    ],
    cta: "Track this order",
  }),

  passwordGate: (ctx) => ({
    brand: ctx.brand,
    headline: "Opening soon",
    body: `We're putting the finishing touches to our ${ctx.subject.head} range. Enter the password if you have one.`,
    cta: "Enter",
    note: "Or leave your email and we'll tell you when the doors open.",
  }),

  footer: (ctx) => ({
    brand: ctx.brand,
    blurb: `${titleCase(ctx.subject.heads)} made in small batches and sold direct.`,
    columns: [
      { title: "Shop", links: ["All products", "New in", "Best sellers", "Gift cards"] },
      { title: "Help", links: ["Shipping", "Returns", "Size guide", "Contact"] },
      { title: "Company", links: ["About", "Journal", "Careers", "Press"] },
    ],
    note: `© 2026 ${ctx.brand}. All prices in USD.`,
    newsletterLabel: "One email a month, at most",
  }),
};

/* ==========================================================================
   Page assembly.
   ========================================================================== */

/* Supporting sections. These can be trimmed to match a reference's section
   count; everything else is the reason the page type exists. */
const DROPPABLE_BLOCKS: readonly BlockKind[] = [
  "logoStrip",
  "statsRow",
  "testimonials",
  "promoBanner",
  "faqAccordion",
  "imageSplit",
  "featureRow",
  "mediaWall",
  "countdown",
];

export function buildPage(args: {
  brief: Brief;
  pageType: string;
  pageId: string;
  index: number;
  copyIndex: number;
  copyTotal: number;
  variant: number;
}): PageMockup {
  const { brief, pageType, pageId, index, copyIndex, copyTotal, variant } = args;

  const def = PAGE_BY_ID[pageType];
  const category = def?.category ?? "core";
  const seed = pageSeed(pageId, variant);
  const rng = makeRng(seed);

  const subject = parseSubject(brief.whatYouSell);
  const vertical = detectVertical(
    `${brief.whatYouSell} ${brief.prompt}`.toLowerCase(),
  );
  const signals = readPromptSignals(brief.prompt);

  /* ==========================================================================
     COLOUR PRECEDENCE — the reference wins when there is one.

     It used to be the other way round, and the reasoning was sound as far as it
     went: an explicit choice should outrank something inferred from a photo. So
     the order was swatches, then typed hex codes, then the reference — and the
     reference reached only the accent, the band tint and the border, because
     `bg` and `ink` are not in `palette` at all.

     What that produced: a merchant uploads a page on near-black, picks "Minimal
     & clean" because it was the closest card to click, and gets a white page
     with an accent borrowed from their reference. Every strong signal they gave
     was outranked by a card they picked from a grid of fifteen.

     A reference screenshot is the most specific thing a merchant can hand over.
     Where one exists it is now the whole answer for colour:

       1. the reference's own background, ink and palette
       2. swatches the merchant added deliberately
       3. hex codes they typed into the prompt
       4. the visual style card — which now sets colour only when NO reference
          was uploaded

     THE COST OF THIS, stated because it is real: the reference is usually
     another shop, so its colours are another brand's colours, and a merchant who
     typed their own brand hex into Step 2 will see it lose to a screenshot. That
     is the instruction — see the precedence question in the commit message — and
     it is why the style card keeps everything that is not a colour: the faces,
     the radius, the type scale, the border weight are still the merchant's pick.
     ========================================================================== */
  const refColour = mergeReferenceColour(brief.referenceImages, 4);
  const refPalette = refColour.palette;
  const refSurface = refColour.surface;
  const hasReference = refPalette.length > 0 || refSurface !== null;

  /* Resolved PER ROLE, not by concatenating two lists.

     `BRAND_COLOR_ROLES` makes the position meaningful — 1 is the accent, 2 tints
     the alternating band, 3 owns the borders. Concatenating scrambles that: put
     three extracted colours in front of the merchant's and their Accent swatch
     lands in position four, which has no role at all, so a colour they chose
     deliberately would silently do nothing. Aligned by index, the reference wins
     each role it has an answer for and the merchant fills the rest. */
  const own = [...brief.brandColors, ...signals.hexes];
  const brandColors = (
    hasReference
      ? Array.from(
          { length: Math.max(refPalette.length, own.length) },
          (_, i) => refPalette[i] ?? own[i],
        ).filter(Boolean)
      : [...own, ...refPalette]
  ).slice(0, 5);

  /* The structural read of the references. Product imagery is NOT taken from
     the uploads — a reference is a picture of a layout the merchant likes, so
     what it contributes is shape, not pixels. */
  const refHints = layoutToHints(
    brief.referenceImages.map(
      (i) => (i as { layout?: LayoutFingerprint }).layout,
    ),
  );
  const tokens = styleToTokens(brief.visualStyle as VisualStyleId, brandColors, refSurface);

  // Brand name is stable across every page in a run, so the deck reads as one
  // store rather than 30 unrelated ones.
  const brandRng = makeRng(`brand::${brief.whatYouSell}::${brief.visualStyle}`);
  const brand = makeBrandName(vertical, brandRng);

  /* Spacing pressure is structural, so the reference overrides the style's own
     default. The style still owns palette, type and shape. */
  if (refHints.density) tokens.density = refHints.density;

  const ctx: Ctx = {
    pageType,
    pageLabel: def?.label ?? pageType,
    copyIndex,
    copyTotal,
    variant,
    subject,
    brand,
    vertical,
    storeType: brief.storeType,
    signals,
    refHints,
    rng,
    price: makePricer(vertical, brief.storeType, rng),
    productName: makeProductNamer(subject, vertical, rng),
    seed,
  };

  /* Section count follows the reference — but only supporting blocks may be
     dropped, and only when the gap is decisive. */
  const kinds = fitRecipeToSections(
    recipeFor(pageType),
    refHints.sectionCount,
    DROPPABLE_BLOCKS,
  );
  const bands = assignBands(kinds, refHints.alternating);

  const blocks = kinds.map((kind, i) => {
    const build = BUILDERS[kind] as (
      c: Ctx,
      i: number,
    ) => BlockContent[typeof kind];
    return {
      id: `${pageId}-${kind}-${i}`,
      kind,
      content: build(ctx, i),
      band: bands[i],
    } as MockupBlock;
  });

  return {
    id: pageId,
    pageType,
    label: def?.label ?? pageType,
    category,
    categoryLabel: CATEGORY_BY_ID[category]?.tag ?? "Page",
    index,
    copyIndex: copyTotal > 1 ? copyIndex : undefined,
    copyTotal: copyTotal > 1 ? copyTotal : undefined,
    tokens,
    vertical,
    refHints,
    blocks,
    variant,
    seed,
  };
}

/** Expands the brief's `pages` selection into one entry per requested mockup. */
export function expandSelection(
  pages: Record<string, number>,
): { pageType: string; pageId: string; copyIndex: number; copyTotal: number }[] {
  const out: {
    pageType: string;
    pageId: string;
    copyIndex: number;
    copyTotal: number;
  }[] = [];

  for (const [pageType, count] of Object.entries(pages)) {
    if (!count || count < 1) continue;
    for (let i = 0; i < count; i++) {
      out.push({
        pageType,
        pageId: count > 1 ? `${pageType}-${i + 1}` : pageType,
        copyIndex: i + 1,
        copyTotal: count,
      });
    }
  }

  // Keep catalog order so the deck reads Home -> Collection -> Product -> ...
  const order = Object.keys(PAGE_BY_ID);
  out.sort(
    (a, b) =>
      order.indexOf(a.pageType) - order.indexOf(b.pageType) ||
      a.copyIndex - b.copyIndex,
  );
  return out;
}
