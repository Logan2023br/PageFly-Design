import type { MockupTokens } from "../styleTokens";
import type { CategoryId } from "../pageCatalog";
import type { Vertical } from "./content";
import type { RefHints } from "../refLayout";

export type { MockupTokens };

/** The four widths the preview can render. Blocks re-lay out at each one. */
export const DEVICES = [
  { id: "desktop", label: "Desktop", width: 1440, height: 900 },
  { id: "laptop", label: "Laptop", width: 1280, height: 800 },
  { id: "tablet", label: "Tablet", width: 834, height: 1112 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
] as const;

export type DeviceId = (typeof DEVICES)[number]["id"];
export type DeviceWidth = (typeof DEVICES)[number]["width"];

/* ==========================================================================
   Block content shapes.
   Every block renders from data only — no block reaches for the brief itself,
   so the same block can appear on many page types with different copy.
   ========================================================================== */

export type MockProduct = {
  name: string;
  price: string;
  compareAt?: string;
  badge?: string;
  /** height / width, drives the image placeholder aspect */
  ratio: number;
  seed: string;
};

export type BlockContent = {
  nav: {
    brand: string;
    links: string[];
    cartCount: number;
    ctaLabel?: string;
    announcement?: string;
  };
  hero: {
    eyebrow?: string;
    headline: string;
    /** index of the word to gradient-highlight, -1 for none */
    highlight: number;
    sub: string;
    primaryCta: string;
    secondaryCta?: string;
    layout: "centered" | "split" | "fullBleed";
    seed: string;
    stat?: { value: string; label: string };
  };
  logoStrip: { label?: string; names: string[] };
  collectionHeader: {
    title: string;
    description: string;
    filters: string[];
    resultCount: string;
    sortLabel: string;
  };
  productGrid: {
    title?: string;
    subtitle?: string;
    products: MockProduct[];
    columns: number;
  };
  productDetail: {
    name: string;
    price: string;
    compareAt?: string;
    rating: number;
    reviewCount: string;
    variantLabel: string;
    variants: string[];
    sizeLabel?: string;
    sizes?: string[];
    bullets: string[];
    galleryCount: number;
    cta: string;
    seed: string;
  };
  featureRow: {
    title?: string;
    sub?: string;
    items: { title: string; body: string }[];
    columns: number;
  };
  imageSplit: {
    eyebrow?: string;
    headline: string;
    body: string;
    cta?: string;
    side: "left" | "right";
    seed: string;
  };
  testimonials: {
    title: string;
    items: { quote: string; author: string; role: string; rating: number }[];
  };
  statsRow: { items: { value: string; label: string }[] };
  promoBanner: {
    headline: string;
    sub?: string;
    cta: string;
    tone: "accent" | "ink";
  };
  countdown: { headline: string; sub?: string; units: string[] };
  faqAccordion: {
    title: string;
    items: { q: string; a: string }[];
    openIndex: number;
  };
  blogList: {
    title: string;
    featured: { title: string; excerpt: string; date: string; tag: string };
    posts: { title: string; excerpt: string; date: string; tag: string }[];
  };
  blogArticle: {
    tag: string;
    title: string;
    author: string;
    date: string;
    readTime: string;
    paragraphs: string[];
    pullQuote: string;
    seed: string;
  };
  cartSummary: {
    title: string;
    items: { name: string; variant: string; price: string; qty: number }[];
    rows: { label: string; value: string }[];
    total: { label: string; value: string };
    cta: string;
    note: string;
  };
  leadForm: {
    eyebrow?: string;
    headline: string;
    body: string;
    fields: { label: string; wide?: boolean }[];
    cta: string;
    note?: string;
    layout: "split" | "centered";
    seed: string;
  };
  dataTable: {
    title: string;
    note?: string;
    columns: string[];
    rows: string[][];
    /** renders check/cross glyphs for "yes"/"no" cells */
    booleanCells: boolean;
    highlightColumn: number;
  };
  pricingTiers: {
    title: string;
    sub?: string;
    tiers: {
      name: string;
      price: string;
      period: string;
      features: string[];
      featured: boolean;
      cta: string;
    }[];
  };
  quizStep: {
    step: number;
    total: number;
    question: string;
    options: { label: string; hint?: string }[];
    selected: number;
  };
  accountPanel: {
    mode: "auth" | "dashboard";
    title: string;
    sub?: string;
    tabs: string[];
    fields?: { label: string }[];
    cta?: string;
    orders?: { id: string; date: string; status: string; total: string }[];
  };
  orderTracker: {
    orderId: string;
    eta: string;
    steps: { label: string; detail: string; done: boolean }[];
    items: { name: string; qty: number; seed: string }[];
  };
  contactPanel: {
    headline: string;
    body: string;
    methods: { label: string; value: string }[];
    fields: { label: string; wide?: boolean }[];
    cta: string;
    hasMap: boolean;
  };
  mediaWall: {
    title: string;
    sub?: string;
    handle?: string;
    tiles: { caption?: string; ratio: number; seed: string; wide?: boolean }[];
    shoppable: boolean;
  };
  richText: {
    eyebrow?: string;
    title: string;
    lead: string;
    sections: { heading: string; body: string }[];
  };
  listPanel: {
    title: string;
    sub?: string;
    rows: {
      primary: string;
      secondary: string;
      meta?: string;
      action?: string;
    }[];
  };
  emptyState: {
    code?: string;
    headline: string;
    body: string;
    cta: string;
    secondaryCta?: string;
    searchable: boolean;
  };
  searchResults: {
    query: string;
    resultCount: string;
    suggestions: string[];
    products: MockProduct[];
  };
  giftCardPicker: {
    headline: string;
    body: string;
    amounts: string[];
    selected: number;
    fields: { label: string; wide?: boolean }[];
    cta: string;
    seed: string;
  };
  bundleBuilder: {
    title: string;
    sub: string;
    items: MockProduct[];
    savingLabel: string;
    totalLabel: string;
    totalValue: string;
    cta: string;
  };
  upsellOffer: {
    eyebrow: string;
    headline: string;
    body: string;
    product: MockProduct;
    timerLabel: string;
    cta: string;
    decline: string;
  };
  thankYouPanel: {
    headline: string;
    body: string;
    orderId: string;
    steps: { label: string; detail: string }[];
    cta: string;
  };
  passwordGate: {
    brand: string;
    headline: string;
    body: string;
    cta: string;
    note: string;
  };
  footer: {
    brand: string;
    blurb: string;
    columns: { title: string; links: string[] }[];
    note: string;
    newsletterLabel?: string;
  };
};

export type BlockKind = keyof BlockContent;

/** One block in a page, ready to render at any device width. */
export type MockupBlock = {
  [K in BlockKind]: {
    id: string;
    kind: K;
    content: BlockContent[K];
    /** alternating band background, mirrors the reference site's rhythm */
    band?: "base" | "alt" | "accent";
  };
}[BlockKind];

/* ==========================================================================
   A finished mockup.
   ========================================================================== */

export type PageMockup = {
  id: string;
  pageType: string;
  label: string;
  category: CategoryId;
  categoryLabel: string;
  /** 1-based index among the pages in this run */
  index: number;
  /** which copy of a repeated page this is, e.g. "Product 2 of 3" */
  copyIndex?: number;
  copyTotal?: number;
  tokens: MockupTokens;
  /** detected product category — chooses the silhouette drawn in mock imagery */
  vertical: Vertical;
  /**
   * What was taken from the merchant's reference screenshots. Recorded on the
   * page so the decision is inspectable rather than invisible — the imagery
   * itself is always drawn, never lifted from the upload.
   */
  refHints: RefHints;
  blocks: MockupBlock[];
  /**
   * Set when a model laid this page out itself.
   *
   * When present it REPLACES `blocks` for both the preview and the export —
   * the tree is a complete page, not an overlay on one. `blocks` is kept
   * alongside it rather than discarded because it is the fallback the page
   * reverts to if the design is ever rejected, and because a deck saved before
   * this existed still has to reopen.
   *
   * Deliberately optional and deliberately last: every reader that predates it
   * keeps working on `blocks` untouched.
   */
  design?: DesignOverlay | null;
  /** bumped by Regenerate to produce a different reproducible variant */
  variant: number;
  seed: string;
  /**
   * The saved run this page was rebuilt from, when it came from the Library.
   *
   * Absent on a normal build, where the deck has one brief and `brief` in the
   * store is it. Present, it names which of several briefs made this page —
   * see `briefForPage`.
   *
   * Optional and last, so a deck snapshotted before this existed still reopens.
   */
  runId?: string;
};

/** Kept structural (not importing lib/design) so this module stays free of
    anything that pulls in zod or React. */
export type DesignOverlay = {
  tree: unknown;
  /** image query → resolved photo URL */
  images: Record<string, string>;
  /** query → background-video URL, at most one per page. Absent on a page
      built before backgrounds existed, which is why it is optional. */
  videos?: Record<string, string>;
  /** photographers whose work is on this page, and where to link them. The
      stock library's API terms require the credit wherever the photo shows. */
  credits?: { name: string; link: string }[];
};

export type GenerateFailure = {
  pageId: string;
  label: string;
  reason: string;
};

export type GenerateResult = {
  pages: PageMockup[];
  failures: GenerateFailure[];
};
