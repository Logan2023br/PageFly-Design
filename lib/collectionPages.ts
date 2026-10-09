import type { CollectionSetRecord, CollectionVisibility } from "./db/types";
import type { ShowcasePage, ShowcaseSet } from "./showcasePages";

/* ==========================================================================
   COLLECTION PAGES — the rules both the admin screen and the public page use.

   Browser-safe on purpose: nothing here reaches the database. The admin editor
   derives a slug and a label from a file name as the operator drops it, and
   the route derives the same ones when it stores it; one copy of that rule is
   the only way the two agree.
   ========================================================================== */

/** Whether anyone may open the set and its files: "visible" and "preview" are
    both public, they differ only in which listing shows them. */
export const isPublic = (set: { visibility: CollectionVisibility }) => set.visibility !== "hidden";

/** The admin's words for each visibility, and what each one means. */
export const VISIBILITY_LABEL: Record<CollectionVisibility, string> = {
  visible: "Visible",
  preview: "Visible preview",
  hidden: "Hidden",
};

/** A url-safe slug: lower case, dashes, nothing else. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* `checkout` is a page of its own: /collection-pages/checkout. A set with that
   URL would be unreachable behind it. */
export const RESERVED_SET_SLUGS = new Set(["checkout", "custom", "referral"]);

/* `all` is the whole-set download: `/api/collection-pages/<set>/all.pagefly`. */
export const RESERVED_PAGE_SLUGS = new Set(["all"]);

/** "product-page" → "Product page": a starting label the operator can edit. */
export function labelFromSlug(slug: string): string {
  const words = slug.replace(/-/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Page";
}

/**
 * What a dropped file is: its page slug and which of the two files it is.
 *
 * PAIRED BY NAME. `home.html` and `home.pagefly` are the same page, which is
 * how `public/showcase/` and PageFly's own export already name them — so a
 * folder dragged in whole lands as one row per page, not two.
 */
export function readFileName(
  name: string,
): { slug: string; kind: "html" | "pagefly" } | null {
  const m = /^(.*)\.(html?|pagefly)$/i.exec(name.trim());
  if (!m) return null;
  const slug = slugify(m[1]);
  if (!slug) return null;
  return { slug, kind: m[2].toLowerCase() === "pagefly" ? "pagefly" : "html" };
}

/** Uploads are one file per request; this is under every host's body limit. */
export const MAX_FILE_BYTES = 4_000_000;

export function formatPrice(cents: number | null): string | null {
  if (cents === null) return null;
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

/** "1 page", "7 pages". */
export const pagesLabel = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;

/** The custom-template request: an order with no set behind it. */
export const CUSTOM_REQUEST = { slug: "custom", name: "Custom template request" } as const;
export const customRequestUrl = "/collection-pages/checkout?request=custom";

/** Where a paid set's Buy button goes. */
export const checkoutUrl = (setSlug: string) =>
  `/collection-pages/checkout?set=${encodeURIComponent(setSlug)}`;

export function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** The public URL of one file. Versioned by the page's last change, so a
    replaced file is never answered from a cache holding the old one. */
export function collectionFileUrl(
  setSlug: string,
  pageSlug: string,
  kind: "html" | "pagefly",
  version?: string,
): string {
  const v = version ? `?v=${Date.parse(version) || version}` : "";
  return `/api/collection-pages/${setSlug}/${pageSlug}.${kind}${v}`;
}

/* ==========================================================================
   THE SET AS THE PUBLIC PAGE DRAWS IT.

   Shaped as a `ShowcaseSet`, so `PageThumb` and `PageViewer` — which already
   sandbox, scale and track these previews correctly — draw it unchanged. Only
   pages with an HTML file are shown: a page with nothing to preview is a blank
   card, and a set being assembled in admin should not show its gaps.
   ========================================================================== */
export type PublicCollectionSet = ShowcaseSet & {
  access: "free" | "paid";
  price: string | null;
  /** the whole set as one import, or null when it is not handed over */
  download: string | null;
  visibility: CollectionVisibility;
  /** people who downloaded it (free) or confirmed orders (paid) */
  count: number;
};

/** "1,234 downloads" / "3 purchases", or null for a set nobody has taken yet. */
export function countLabel(set: PublicCollectionSet): string | null {
  if (set.count <= 0) return null;
  const n = set.count.toLocaleString("en-US");
  if (set.access === "paid") return `${n} ${set.count === 1 ? "purchase" : "purchases"}`;
  return `${n} ${set.count === 1 ? "download" : "downloads"}`;
}

export function toPublicSet(
  set: CollectionSetRecord,
  stats?: { downloads: Record<string, number>; purchases: Record<string, number> },
): PublicCollectionSet {
  const free = set.access === "free";
  const pages: ShowcasePage[] = set.pages
    .filter((p) => p.htmlSize !== null)
    .map((p) => ({
      slug: p.slug,
      label: p.label,
      blurb: p.blurb,
      src: collectionFileUrl(set.slug, p.slug, "html", p.updatedAt),
      file:
        free && p.pageflySize !== null
          ? collectionFileUrl(set.slug, p.slug, "pagefly", p.updatedAt)
          : null,
    }));
  const downloadable = free && pages.some((p) => p.file);
  return {
    /* The slug, not the internal id: it is what analytics keys a set by, and
       for the three built-in sets it is the same key the landing gallery uses. */
    id: set.slug,
    name: set.name,
    blurb: set.blurb,
    pages,
    access: set.access,
    price: formatPrice(set.priceCents),
    download: downloadable
      ? `/api/collection-pages/${set.slug}/all.pagefly?v=${Date.parse(set.updatedAt) || 0}`
      : null,
    visibility: set.visibility,
    count:
      (free ? stats?.downloads[set.slug] : stats?.purchases[set.id]) ?? 0,
  };
}
