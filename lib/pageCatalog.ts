import type { IconName } from "./icons";

/* ==========================================================================
   The page catalog: everything a merchant can ask for.
   `repeatable` pages get a quantity stepper; the rest are a plain checkbox.
   ========================================================================== */

export const MAX_PER_PAGE = 10;
export const MAX_TOTAL_PAGES = 30;

export type CategoryId =
  | "core"
  | "trust"
  | "content"
  | "conversion"
  | "account"
  | "landing";

export type PageDef = {
  id: string;
  label: string;
  blurb: string;
  icon: IconName;
  /** Pages that plausibly repeat in a real store get a 0-10 stepper. */
  repeatable?: true;
};

export type CategoryDef = {
  id: CategoryId;
  label: string;
  /** Short tag shown on result cards. */
  tag: string;
  blurb: string;
  defaultOpen: boolean;
  pages: PageDef[];
};

export const PAGE_CATEGORIES: CategoryDef[] = [
  {
    id: "core",
    label: "Core store pages",
    tag: "Core",
    blurb: "The pages every store needs before launch.",
    defaultOpen: true,
    pages: [
      {
        id: "home",
        label: "Home",
        blurb: "Your storefront — the first thing shoppers see.",
        icon: "House",
      },
      {
        id: "collection",
        label: "Collection / category",
        blurb: "A filterable grid of products in one category.",
        icon: "LayoutGrid",
        repeatable: true,
      },
      {
        id: "product",
        label: "Product",
        blurb: "Gallery, price, variants and add-to-cart.",
        icon: "Package",
        repeatable: true,
      },
      {
        id: "cart",
        label: "Cart",
        blurb: "Line items, totals and the path to checkout.",
        icon: "ShoppingCart",
      },
      {
        id: "search",
        label: "Search results",
        blurb: "What shoppers land on after typing a query.",
        icon: "Search",
      },
      {
        id: "404",
        label: "404",
        blurb: "A dead end that still sells something.",
        icon: "TriangleAlert",
      },
      {
        id: "password",
        label: "Password",
        blurb: "The gate on a store that isn't public yet.",
        icon: "Lock",
      },
      {
        id: "coming-soon",
        label: "Coming soon",
        blurb: "Collect emails before you open the doors.",
        icon: "Clock",
      },
    ],
  },
  {
    id: "trust",
    label: "Trust & info",
    tag: "Trust",
    blurb: "The pages shoppers check before they buy.",
    defaultOpen: false,
    pages: [
      {
        id: "about",
        label: "About us",
        blurb: "Who you are and why the brand exists.",
        icon: "Info",
      },
      {
        id: "contact",
        label: "Contact",
        blurb: "A form, the details, and a map if you need one.",
        icon: "Mail",
      },
      {
        id: "faq",
        label: "FAQ",
        blurb: "Grouped answers to the questions that block a sale.",
        icon: "CircleQuestionMark",
      },
      {
        id: "reviews",
        label: "Reviews / testimonials",
        blurb: "Ratings, quotes and customer photos.",
        icon: "Star",
      },
      {
        id: "size-guide",
        label: "Size guide",
        blurb: "Measurement tables that cut returns.",
        icon: "Ruler",
      },
      {
        id: "shipping",
        label: "Shipping & returns",
        blurb: "Rates, timings and how a return works.",
        icon: "Truck",
      },
      {
        id: "store-locator",
        label: "Store locator",
        blurb: "Where to find you in person.",
        icon: "MapPin",
      },
      {
        id: "careers",
        label: "Careers",
        blurb: "Open roles and what it's like to work there.",
        icon: "Briefcase",
      },
      {
        id: "press",
        label: "Press",
        blurb: "Coverage, assets and a media contact.",
        icon: "Newspaper",
      },
      {
        id: "sustainability",
        label: "Sustainability",
        blurb: "Materials, sourcing and the numbers behind them.",
        icon: "Leaf",
      },
      {
        id: "legal",
        label: "Legal / policies",
        blurb: "Terms, privacy and the fine print.",
        icon: "Scale",
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    tag: "Content",
    blurb: "Editorial pages that bring in traffic.",
    defaultOpen: false,
    pages: [
      {
        id: "blog-list",
        label: "Blog listing",
        blurb: "An index of posts with a featured lead.",
        icon: "FileText",
      },
      {
        id: "blog-article",
        label: "Blog article",
        blurb: "A single post, built to be read.",
        icon: "ScrollText",
        repeatable: true,
      },
      {
        id: "lookbook",
        label: "Lookbook",
        blurb: "Editorial imagery with shoppable hotspots.",
        icon: "Images",
      },
      {
        id: "ugc",
        label: "UGC / Instagram feed",
        blurb: "Customer photos pulled into a shoppable wall.",
        icon: "Camera",
      },
    ],
  },
  {
    id: "conversion",
    label: "Conversion",
    tag: "Conversion",
    blurb: "Pages built to move revenue, not just inform.",
    defaultOpen: false,
    pages: [
      {
        id: "sale",
        label: "Sale / promotion",
        blurb: "A discounted range with urgency built in.",
        icon: "Percent",
      },
      {
        id: "bundle",
        label: "Bundle",
        blurb: "Buy-together sets with the saving shown.",
        icon: "Boxes",
      },
      {
        id: "gift-card",
        label: "Gift card",
        blurb: "Pick a value, write a note, send it.",
        icon: "Gift",
      },
      {
        id: "comparison",
        label: "Product comparison",
        blurb: "Side-by-side specs to settle a decision.",
        icon: "GitCompare",
      },
      {
        id: "quiz",
        label: "Quiz / product finder",
        blurb: "A few questions that end in a recommendation.",
        icon: "ListChecks",
      },
      {
        id: "upsell",
        label: "Upsell offer",
        blurb: "One more thing, offered at the right moment.",
        icon: "TrendingUp",
      },
      {
        id: "thank-you",
        label: "Thank-you / post-purchase",
        blurb: "Confirmation, next steps and a reason to return.",
        icon: "PartyPopper",
      },
      {
        id: "membership",
        label: "Membership / subscription",
        blurb: "Tiers, benefits and what recurring billing gets you.",
        icon: "Repeat",
      },
      {
        id: "wholesale",
        label: "Wholesale inquiry",
        blurb: "A form for buyers who order by the pallet.",
        icon: "Building2",
      },
      {
        id: "affiliate",
        label: "Affiliate",
        blurb: "Commission terms and how to sign up.",
        icon: "Handshake",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    tag: "Account",
    blurb: "Everything behind a customer login.",
    defaultOpen: false,
    pages: [
      {
        id: "login",
        label: "Login / register",
        blurb: "Sign in, sign up, reset a password.",
        icon: "LogIn",
      },
      {
        id: "dashboard",
        label: "Account dashboard",
        blurb: "Orders, addresses and saved details.",
        icon: "LayoutDashboard",
      },
      {
        id: "order-tracking",
        label: "Order tracking",
        blurb: "Where the parcel is, in plain language.",
        icon: "PackageSearch",
      },
    ],
  },
  {
    id: "landing",
    label: "Landing pages",
    tag: "Landing page",
    blurb: "Campaign pages. Ask for as many as you're running.",
    defaultOpen: false,
    pages: [
      {
        id: "lp-launch",
        label: "Product launch",
        blurb: "One product, one story, one call to action.",
        icon: "Rocket",
        repeatable: true,
      },
      {
        id: "lp-lead-gen",
        label: "Lead generation",
        blurb: "Trade something useful for an email address.",
        icon: "Magnet",
        repeatable: true,
      },
      {
        id: "lp-bfcm",
        label: "BFCM / Black Friday",
        blurb: "Countdown, doorbusters, tiered discounts.",
        icon: "Tag",
        repeatable: true,
      },
      {
        id: "lp-event",
        label: "Event / webinar",
        blurb: "Date, speakers and a registration form.",
        icon: "CalendarDays",
        repeatable: true,
      },
      {
        id: "lp-app",
        label: "App download",
        blurb: "Screenshots, store badges, the pitch.",
        icon: "Smartphone",
        repeatable: true,
      },
      {
        id: "lp-discount",
        label: "Discount / free shipping",
        blurb: "One offer, stated plainly, claimed fast.",
        icon: "Percent",
        repeatable: true,
      },
      {
        id: "lp-influencer",
        label: "Influencer collab",
        blurb: "A creator's picks with their own voice.",
        icon: "Sparkles",
        repeatable: true,
      },
      {
        id: "lp-advertorial",
        label: "Advertorial",
        blurb: "Long-form copy that reads like an article.",
        icon: "Newspaper",
        repeatable: true,
      },
      {
        id: "lp-waitlist",
        label: "Waitlist",
        blurb: "Capture demand for something not out yet.",
        icon: "ClipboardList",
        repeatable: true,
      },
    ],
  },
];

/* ---- lookups ------------------------------------------------------------ */

export const PAGE_BY_ID: Record<string, PageDef & { category: CategoryId }> =
  Object.fromEntries(
    PAGE_CATEGORIES.flatMap((cat) =>
      cat.pages.map((p) => [p.id, { ...p, category: cat.id }] as const),
    ),
  );

export const CATEGORY_BY_ID: Record<CategoryId, CategoryDef> =
  Object.fromEntries(PAGE_CATEGORIES.map((c) => [c.id, c])) as Record<
    CategoryId,
    CategoryDef
  >;

export const ALL_PAGE_IDS: string[] = Object.keys(PAGE_BY_ID);

export function isRepeatable(pageId: string): boolean {
  return Boolean(PAGE_BY_ID[pageId]?.repeatable);
}

/** Total pages requested across the whole selection. */
export function totalSelected(selection: Record<string, number>): number {
  return Object.values(selection).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);
}

/** Room left before the 30-page ceiling. */
export function remainingCapacity(selection: Record<string, number>): number {
  return Math.max(0, MAX_TOTAL_PAGES - totalSelected(selection));
}

/**
 * Human summary for the sticky bar, e.g.
 * "Home, Product, 3 landing pages" — capped so it never wraps.
 */
export function describeSelection(selection: Record<string, number>): string {
  const entries = Object.entries(selection).filter(([, n]) => n > 0);
  if (entries.length === 0) return "No pages selected yet";

  const landingCount = entries
    .filter(([id]) => PAGE_BY_ID[id]?.category === "landing")
    .reduce((sum, [, n]) => sum + n, 0);

  const named = entries
    .filter(([id]) => PAGE_BY_ID[id]?.category !== "landing")
    .map(([id, n]) => {
      const label = PAGE_BY_ID[id]?.label ?? id;
      return n > 1 ? `${n} ${label}` : label;
    });

  const parts = [...named.slice(0, 3)];
  const hiddenNamed = named.length - parts.length;

  if (landingCount > 0) {
    parts.push(
      `${landingCount} landing page${landingCount === 1 ? "" : "s"}`,
    );
  }
  if (hiddenNamed > 0) parts.push(`+${hiddenNamed} more`);

  return parts.join(", ");
}
