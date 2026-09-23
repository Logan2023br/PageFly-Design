/* ==========================================================================
   THE PAGE SETS ON THE FRONT DOOR.

   A LIST IN THE REPOSITORY, not a query. The rail used to take whatever the
   demo store's showcase run happened to hold, and that is the wrong source for
   the claim being made under it: "designed as one matching set". What arrived
   was four home pages and a collection — the same job five times, which argues
   the opposite. A curated set is the claim itself.

   The same reasoning `lib/collections/index.ts` gives for its sets, and the
   same reasoning `lib/showcase.ts` gives for compiling in a demo store: a value
   that lives only in a database has now been empty on production twice.

   TWO ARTEFACTS PER PAGE, AND BOTH ARE REAL.

     public/showcase/<set>/<slug>.html      PageFly's own preview render
     public/showcase/<set>/<slug>.pagefly   that page, importable into a store

   The HTML is what a visitor sees when they open one — not a screenshot and not
   this app's reconstruction, but the file PageFly itself produced, running its
   own stylesheet and its own scripts. The .pagefly beside it is the thing that
   HTML is a picture of, so "can I really have this" is answered by handing it
   over rather than by a sentence.

   Both are written by `scripts/make-showcase-pages.ts` from real exports.

   TWO SETS, AND THAT IS THE ARGUMENT THE GALLERY MAKES. One set proves the
   pages of a store match each other. Two prove the thing a merchant actually
   doubts — that the match is THEIRS and not a house style. Hexwood is
   near-black and loud; Hollis & Rowe is ivory and quiet; nothing about them is
   shared except the pipeline that produced them, which is the point.

   THE RAIL SHOWS ONE. It sits under a headline, is glanced at, and is about
   completeness — seven jobs, one voice. Two sets there would be fourteen cards
   at 80px, which proves neither thing.
   ========================================================================== */

export type ShowcasePage = {
  /** url-safe; the file name, and the `page_type` every event carries */
  slug: string;
  /** what the chip on the card says */
  label: string;
  /** one line, shown under the card and in the viewer's toolbar */
  blurb: string;
};

export type ShowcaseSet = {
  /** the directory under `public/showcase/`, and the analytics key */
  id: string;
  /** the store, as a reader should see it */
  name: string;
  /** one line naming the look, so the two sets read as a contrast */
  blurb: string;
  pages: ShowcasePage[];
};

/* Ordered as a merchant meets them: the cover first, then the two pages that
   sell, then the two that reassure, then the two asked for last. */
export const SHOWCASE_SETS: ShowcaseSet[] = [
  {
    id: "hexwood",
    name: "Hexwood",
    blurb: "A Halloween superstore — near-black, one hot accent, heavy motion.",
    pages: [
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
      {
        slug: "contact",
        label: "Contact",
        blurb: "How to reach a person, and what to expect back.",
      },
      {
        slug: "blog-article",
        label: "Blog article",
        blurb: "A piece worth reading, with the products it mentions beside it.",
      },
      {
        slug: "fright-night-sale",
        label: "Sale",
        blurb: "A dated offer: countdown, tiers and a code, built to end.",
      },
    ],
  },
  {
    id: "hollis",
    name: "Hollis & Rowe",
    blurb: "A luxury department store — ivory and champagne gold, serif, restraint.",
    pages: [
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
      {
        slug: "contact",
        label: "Contact",
        blurb: "How to reach a person, and what to expect back.",
      },
      {
        slug: "blog-article",
        label: "Blog article",
        blurb: "A piece worth reading, with the products it mentions beside it.",
      },
      {
        slug: "private-sale",
        label: "Private sale",
        blurb: "A dated offer: countdown, tiers and a code, built to end.",
      },
    ],
  },
];

/**
 * The set the strip under the hero shows.
 *
 * Named rather than written as `[0]` at the call site: which set greets a
 * visitor first is a decision, and a decision expressed as an array index is
 * one nobody can find later.
 */
export const HERO_SET = SHOWCASE_SETS[0];

/* ==========================================================================
   FIVE OF THE SEVEN, IN THE STRIP UNDER THE HERO.

   The rail is glanced at, and its job is to show that a STORE arrived — the
   pages a shop cannot open without. Seven cards is seven, which past a point
   reads as a list rather than a set, and the two it drops are the two a visitor
   is least likely to be checking for in the first three seconds.

   They are not lost: the gallery below shows every page of both sets, which is
   where somebody who wants the blog or the sale page goes looking.

   NAMED RATHER THAN SLICED. `pages.slice(0, 5)` gives the same five today and
   silently gives different ones the moment anybody reorders the set for an
   unrelated reason — and the change would show up as a different hero, with
   nothing in the diff that mentions the hero.
   ========================================================================== */
const RAIL_SLUGS = ["home", "product-page", "collection-page", "about-us", "contact"];

export const HERO_RAIL_PAGES: ShowcasePage[] = RAIL_SLUGS.flatMap(
  (slug) => HERO_SET.pages.find((p) => p.slug === slug) ?? [],
);

/** Where the rendered preview lives, under `public/`. */
export function htmlFor(set: ShowcaseSet, page: ShowcasePage): string {
  return `/showcase/${set.id}/${page.slug}.html`;
}

/** Where the importable file lives, under `public/`. */
export function pageflyFor(set: ShowcaseSet, page: ShowcasePage): string {
  return `/showcase/${set.id}/${page.slug}.pagefly`;
}
