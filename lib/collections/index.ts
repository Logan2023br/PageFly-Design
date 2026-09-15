/* ==========================================================================
   The free collections, and where they live.

   A LIST IN THE REPOSITORY rather than rows in a database, and the reason is
   the same one `lib/showcase.ts` gives for compiling in its demo store: a
   value that lives only in an environment has now been empty on production
   twice. These are a handful of curated sets that change when somebody decides
   they should, which is exactly what a file in git is for — the set is
   reviewed, it is in the history, and it deploys with the code that draws it.

   The day an operator needs to add one without a deploy, that is an uploader
   in admin and a table behind it. It is not this.

   THE .pagefly IS THE ARTEFACT. Each set is ONE file holding all of its pages
   as separate entries — that is how PageFly's own multi-page export works, and
   it is what a merchant gets when they press Export here. The same bytes are
   served to draw the preview and to hand over on download, so what they see
   and what they get cannot drift apart.
   ========================================================================== */

export type CollectionMeta = {
  /** url-safe, and the key everything else is looked up by */
  slug: string;
  name: string;
  /** one line under the name — what a merchant is choosing between */
  blurb: string;
  /** served from public/, so the browser fetches it directly */
  file: string;
  /**
   * Real screenshots exist for this set, under `public/collections/<slug>/`.
   *
   * WHEN THEY DO, THEY WIN. `lib/collections/pagefly.ts` can draw the file
   * itself and that is what a set without shots falls back to — but a
   * screenshot is PageFly's own render, with its base stylesheet and a real
   * store behind the product elements, and this app's renderer has neither. A
   * picture taken of the truth beats a good reconstruction of it.
   *
   * Four per page, named for the device ids in `lib/generate/types`:
   *
   *     <page>-desktop.webp   <page>-laptop.webp
   *     <page>-tablet.webp    <page>-mobile.webp
   *     <page>-card.webp      the small one, for a grid
   */
  shots?: boolean;
};

export const COLLECTIONS: CollectionMeta[] = [
  {
    slug: "glowry",
    name: "Glowry",
    blurb: "Beauty and skincare — plum, gold and a serif, across seven pages.",
    file: "/collections/glowry.pagefly",
    shots: true,
  },
];

export function collectionBySlug(slug: string): CollectionMeta | null {
  return COLLECTIONS.find((c) => c.slug === slug) ?? null;
}

/**
 * Page labels carry the set's name — `GLOWRY Home`, `GLOWRY Product Page`.
 *
 * True of this export and likely of the next, because a merchant names their
 * pages after their store. Repeating it on every row of a list that is already
 * headed by the set name is seven columns of the same word, so a prefix shared
 * by every page is dropped — and only when EVERY page has it, since a prefix
 * two pages happen to share is a coincidence rather than a label.
 */
export function shortenLabels(labels: string[]): string[] {
  if (labels.length < 2) return labels;

  const words = labels.map((l) => l.split(/\s+/));
  let shared = 0;
  for (;;) {
    const word = words[0][shared];
    if (!word) break;
    /* Stopping one short of the whole label: a page whose entire name is the
       prefix would otherwise come out blank. */
    if (!words.every((w) => w.length > shared + 1 && w[shared] === word)) break;
    shared++;
  }

  return shared === 0 ? labels : words.map((w) => w.slice(shared).join(" "));
}

/**
 * A page's file name, from the label the export gave it.
 *
 * `GLOWRY Black Friday` under the set `Glowry` becomes `black-friday`, which is
 * what the screenshots are named. Derived rather than listed because a manifest
 * of seven names per set is seven chances to mistype one, and the failure would
 * be a silently missing picture rather than an error.
 */
export function pageSlug(label: string, setName: string): string {
  const prefix = new RegExp(`^\\s*${setName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s+`, "i");
  return label
    .replace(prefix, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The screenshot for one page at one device, or null when the set has none. */
export function shotFor(
  collection: CollectionMeta,
  label: string,
  device: "desktop" | "laptop" | "tablet" | "mobile" | "card",
): string | null {
  if (!collection.shots) return null;
  const slug = pageSlug(label, collection.name);
  if (!slug) return null;
  return `/collections/${collection.slug}/${slug}-${device}.webp`;
}
