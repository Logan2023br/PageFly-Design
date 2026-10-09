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
];
