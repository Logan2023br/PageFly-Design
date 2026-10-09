import type { ShowcasePage, ShowcaseSet } from "./showcasePages";

/* ==========================================================================
   THE SETS SHIPPED FOR /collection-pages-preview.

   Ten stores, seven pages each, written into `public/collection-sets/<set>/`
   from PageFly's own exports — the same two files per page as
   `public/showcase/`. Unlike the showcase sets they are not on the landing
   page: they reach the table through admin's import, land as "Visible
   preview", and are judged on /collection-pages-preview before any of them is
   switched to Visible.

   The page slugs follow the showcase sets', so every set reads the same in
   analytics: home, product-page, collection-page, about-us, contact,
   blog-article, and a sale named after its own offer.

   NOT EVERY SET IS A SHOP. Northwind, Atlas Studio, Kinetik, Roam Diaries and
   Salt & Smoke are a SaaS, a studio, an agency and two creators, and their
   seven pages are their own: each is listed whole, with the shared pages
   (home, about-us, contact, blog-article) keeping the shared slugs.
   ========================================================================== */

/** The seven pages, in the order a merchant meets them; only the sale differs. */
function pages(sale: { slug: string; label?: string }): ShowcasePage[] {
  return [
    { slug: "home", label: "Home", blurb: "The front page — what the store is, in one scroll." },
    {
      slug: "product-page",
      label: "Product",
      blurb: "One product, with the facts an order needs before it is placed.",
    },
    {
      slug: "collection-page",
      label: "Collection",
      blurb: "A category, laid out so a browser can choose.",
    },
    { slug: "about-us", label: "About", blurb: "Who is behind the shop, and why it exists." },
    { slug: "contact", label: "Contact", blurb: "How to reach a person, and what to expect back." },
    {
      slug: "blog-article",
      label: "Blog article",
      blurb: "A piece worth reading, with the products it mentions beside it.",
    },
    {
      slug: sale.slug,
      label: sale.label ?? "Sale",
      blurb: "A dated offer: countdown, tiers and a code, built to end.",
    },
  ];
}

const HOME: ShowcasePage = {
  slug: "home",
  label: "Home",
  blurb: "The front page — what it is, in one scroll.",
};
const ABOUT: ShowcasePage = { slug: "about-us", label: "About", blurb: "Who is behind it, and why it exists." };
const CONTACT: ShowcasePage = {
  slug: "contact",
  label: "Contact",
  blurb: "How to reach a person, and what to expect back.",
};

export const PREVIEW_SETS: ShowcaseSet[] = [
  {
    id: "aurum",
    name: "Aurum",
    blurb: "A fine-jewellery atelier — near-black and antique gold, Cormorant serif, quiet luxury.",
    pages: pages({ slug: "private-sale", label: "Private sale" }),
  },
  {
    id: "volt",
    name: "VOLT",
    blurb: "A streetwear drop label — black and acid lime, Anton caps, countdowns everywhere.",
    pages: pages({ slug: "archive-sale" }),
  },
  {
    id: "dew",
    name: "Dew",
    blurb: "Clean, vegan skincare — oat cream and sage green, Fraunces serif, soft and calm.",
    pages: pages({ slug: "glow-week-sale" }),
  },
  {
    id: "nova",
    name: "Nova",
    blurb: "Consumer audio and wearables — deep navy, electric blue to violet, Sora, product-launch polish.",
    pages: pages({ slug: "cyber-week-sale" }),
  },
  {
    id: "pip-and-pop",
    name: "Pip & Pop",
    blurb: "Wooden toys for kids — indigo and sunshine yellow, Baloo rounded type, playful.",
    pages: pages({ slug: "summer-toy-sale" }),
  },
  {
    id: "ember-roast",
    name: "Ember Roast",
    blurb: "A specialty coffee roaster — espresso brown and ember orange, Playfair serif, warm.",
    pages: pages({ slug: "clearance-sale" }),
  },
  {
    id: "oaken",
    name: "Oaken",
    blurb: "Scandinavian solid-wood furniture — linen white and oak, Instrument Serif, calm space.",
    pages: pages({ slug: "sample-sale" }),
  },
  {
    id: "forge",
    name: "Forge",
    blurb: "Sports supplements — charcoal and signal red, Bebas Neue caps, hard-edged.",
    pages: pages({ slug: "black-friday-sale" }),
  },
  {
    id: "pawsome",
    name: "Pawsome",
    blurb: "A pet-supplies shop — teal and tangerine on cream, Fredoka rounded type, friendly.",
    pages: pages({ slug: "pet-week-sale" }),
  },
  {
    id: "maison-lune",
    name: "Maison Lune",
    blurb: "Slow fashion for women — blush ivory and dusty rose, Bodoni Moda, editorial.",
    pages: pages({ slug: "archive-sale" }),
  },
  {
    id: "northwind",
    name: "Northwind",
    blurb: "A B2B analytics SaaS — midnight navy and electric indigo, Plus Jakarta Sans, dashboard-crisp.",
    pages: [
      HOME,
      { slug: "platform", label: "Platform", blurb: "What the product does, feature by feature." },
      { slug: "pricing", label: "Pricing", blurb: "The plans side by side, and what each one includes." },
      { slug: "customers", label: "Customers", blurb: "Logos, numbers and the teams who already run on it." },
      ABOUT,
      CONTACT,
      {
        slug: "blog-article",
        label: "Blog article",
        blurb: "A long read that teaches, with the product beside it.",
      },
    ],
  },
  {
    id: "atlas-studio",
    name: "Atlas Studio",
    blurb: "An architecture and interiors practice — stone grey and ink, Syne display, gallery-quiet.",
    pages: [
      HOME,
      { slug: "projects", label: "Projects", blurb: "The built work, filterable by kind." },
      { slug: "project-detail", label: "Project", blurb: "One building, told in pictures and facts." },
      { slug: "services", label: "Services", blurb: "What the studio does, from first sketch to handover." },
      { slug: "studio", label: "Studio", blurb: "The people and the way they work." },
      { slug: "journal-article", label: "Journal", blurb: "An essay from the studio's journal." },
      CONTACT,
    ],
  },
  {
    id: "kinetik",
    name: "Kinetik",
    blurb: "A creative agency — lilac white, hot coral and violet, Unbounded display, loud motion.",
    pages: [
      HOME,
      { slug: "work", label: "Work", blurb: "Selected projects, filterable by discipline." },
      { slug: "case-study", label: "Case study", blurb: "One launch, from brief to results." },
      { slug: "services", label: "Services", blurb: "What the agency does, and how an engagement runs." },
      ABOUT,
      { slug: "insights-article", label: "Insights", blurb: "A point of view, written to be shared." },
      CONTACT,
    ],
  },
  {
    id: "roam-diaries",
    name: "Roam Diaries",
    blurb: "A slow-travel YouTube creator — deep teal and terracotta on sand, Archivo Black, warm.",
    pages: [
      HOME,
      { slug: "videos", label: "Videos", blurb: "Every episode, browsable by destination and series." },
      { slug: "episode", label: "Episode", blurb: "One episode, with the notes and places from it." },
      { slug: "travel-guide", label: "Travel guide", blurb: "An honest guide to one place, to read before going." },
      { slug: "shop", label: "Shop", blurb: "Presets, prints and gear — the creator's own store." },
      { slug: "collab", label: "Collab", blurb: "For brands: the audience, the formats and how to ask." },
      ABOUT,
    ],
  },
  {
    id: "salt-and-smoke",
    name: "Salt & Smoke",
    blurb: "A home-cooking channel — charred black and saffron, DM Serif Display, kitchen heat.",
    pages: [
      HOME,
      { slug: "episodes", label: "Episodes", blurb: "Every recipe video, browsable by craving and time." },
      { slug: "watch", label: "Watch", blurb: "One episode, with the recipe under the video." },
      { slug: "recipe-article", label: "Recipe", blurb: "A written recipe, step by step." },
      { slug: "shop", label: "Shop", blurb: "Cookware, sauces and the cookbook." },
      ABOUT,
      CONTACT,
    ],
  },
  {
    id: "verdant",
    name: "Verdant",
    blurb: "A house-plant shop — sage mist and forest green, Gloock serif, fresh and botanical.",
    pages: pages({ slug: "spring-plant-sale" }),
  },
  {
    id: "optique",
    name: "Optique",
    blurb: "Designer eyewear — violet and sunshine yellow, Bricolage Grotesque, bright and bold.",
    pages: pages({ slug: "summer-sale" }),
  },
  {
    id: "cuvee",
    name: "Cuvee",
    blurb: "A small-producer wine merchant — burgundy and champagne gold, Marcellus, cellar elegance.",
    pages: pages({ slug: "cellar-clearance" }),
  },
  {
    id: "summit-supply",
    name: "Summit Supply",
    blurb: "Outdoor gear — moss green on canvas, Big Shoulders caps, rugged and trail-tested.",
    pages: pages({ slug: "end-of-season-sale" }),
  },
  {
    id: "wick-house",
    name: "Wick House",
    blurb: "Hand-poured candles — smoky brown and amber glow, Young Serif, slow evenings.",
    pages: pages({ slug: "winter-glow-sale" }),
  },
];
