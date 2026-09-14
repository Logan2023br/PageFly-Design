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
};

export const COLLECTIONS: CollectionMeta[] = [
  {
    slug: "glowry",
    name: "Glowry",
    blurb: "Beauty and skincare — plum, gold and a serif, across seven pages.",
    file: "/collections/glowry.pagefly",
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
