/* ==========================================================================
   THE FIVE PAGES UNDER THE HERO.

   A LIST IN THE REPOSITORY, not a query. The rail used to take whatever the
   demo store's showcase run happened to hold, and that is the wrong source for
   this particular claim: the line under it says "designed as one matching set",
   and what arrived was four home pages and a collection — the same job five
   times, which argues the opposite. A curated five is the claim being made.

   The same reasoning `lib/collections/index.ts` gives for its sets, and the
   same reasoning `lib/showcase.ts` gives for compiling in a demo store: a value
   that lives only in a database has now been empty on production twice.

   TWO ARTEFACTS PER PAGE, AND BOTH ARE REAL.

     <slug>.html      PageFly's own preview render of that page
     <slug>.pagefly   that page, importable into a store

   The HTML is what a visitor sees when they open one — not a screenshot and not
   this app's reconstruction of the page, but the file PageFly itself produced,
   running its own stylesheet and its own scripts. The .pagefly beside it is the
   thing that HTML is a picture of, so "can I really have this" is answered by
   handing it over rather than by a sentence.

   Both are written by `scripts/make-showcase-pages.ts` from a real export —
   see the note there on why that is a script and not a copy command.
   ========================================================================== */

export type ShowcasePage = {
  /** url-safe, and the file name of both artefacts */
  slug: string;
  /** what the chip on the card says */
  label: string;
  /** one line, for the caption when the page is open */
  blurb: string;
};

/* Ordered as a merchant meets them, not alphabetically: Home first because it
   is the cover, then the two pages that sell, then the two that reassure. */
export const SHOWCASE_PAGES: ShowcasePage[] = [
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
];

/** Where the rendered preview lives, under `public/`. */
export function htmlFor(page: ShowcasePage): string {
  return `/showcase/hexwood/${page.slug}.html`;
}

/** Where the importable file lives, under `public/`. */
export function pageflyFor(page: ShowcasePage): string {
  return `/showcase/hexwood/${page.slug}.pagefly`;
}
