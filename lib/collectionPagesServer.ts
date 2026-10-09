import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { EV } from "./analytics";
import { labelFromSlug } from "./collectionPages";
import { getRepo } from "./db";
import { PREVIEW_SETS } from "./collectionSets";
import type { CollectionFileKind, CollectionSetRecord, CollectionVisibility } from "./db/types";
import { SHOWCASE_SETS, type ShowcaseSet } from "./showcasePages";

/* ==========================================================================
   Collection pages, the server half: what a file must be to be stored, and
   the import of the three sets that ship in the repository.
   ========================================================================== */

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/**
 * Why these bytes are not the file they claim to be, or null when they are.
 *
 * Checked on the way IN, because the failure otherwise surfaces far from its
 * cause: a .pagefly that is not a zip uploads fine and breaks a merchant's
 * import in PageFly, where nothing points back here.
 */
export function rejectFile(kind: CollectionFileKind, bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "The file is empty.";
  if (kind === "html") {
    const head = new TextDecoder().decode(bytes.slice(0, 4096)).toLowerCase();
    return /<(!doctype|html|head|body|div|section)/.test(head)
      ? null
      : "That does not look like an HTML page.";
  }
  try {
    const entries = Object.keys(unzipSync(bytes));
    return entries.some((n) => n.toLowerCase().endsWith(".json"))
      ? null
      : "That .pagefly holds no page — it has no .json entry.";
  } catch {
    return "That .pagefly is not a PageFly export (it is not a zip).";
  }
}

/** Store one file on a set, creating the page when the slug is new. */
export async function storeFile(
  set: CollectionSetRecord,
  slug: string,
  kind: CollectionFileKind,
  bytes: Uint8Array,
): Promise<void> {
  const repo = getRepo();
  let page = set.pages.find((p) => p.slug === slug);
  if (!page) {
    const created = {
      id: newId(),
      slug,
      label: labelFromSlug(slug),
      blurb: "",
      position: Math.max(0, ...set.pages.map((p) => p.position)) + 1,
    };
    await repo.saveCollectionPage(set.id, created);
    page = { ...created, htmlSize: null, pageflySize: null, updatedAt: "" };
    set.pages.push(page);
  }
  await repo.putCollectionFile(set.id, page.id, kind, bytes);
}

/* ==========================================================================
   THE BUILT-IN SETS, COPIED IN.

   Hexwood, Hollis & Rowe and Creature Feature live in `public/showcase/` for
   the landing page. Importing copies them into the table so they are managed
   like any other set — hidden, priced, edited — without touching the landing
   gallery, which keeps reading the repository.

   FROM DISK FIRST, THEN OVER HTTP. On a VPS and in development `public/` is
   right there. On a serverless host it may not be in the function's bundle,
   and the same files are served at the site's own origin.

   THE PREVIEW SETS COME IN THE SAME WAY. The ten in `public/collection-sets/`
   (see `lib/collectionSets.ts`) are imported by the same press, as "Visible
   preview": on /collection-pages-preview, not yet on /collection-pages.

   ONLY WHAT IS MISSING. A set whose slug already exists is left alone, so a
   second press cannot overwrite an edit and a deleted one can be brought back.
   ========================================================================== */
/** A file under `public/`, from disk or else from the site itself. */
async function readBuiltIn(path: string, origin?: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(join(process.cwd(), "public", path)));
  } catch {
    if (!origin) return null;
    try {
      const res = await fetch(new URL(path, origin));
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }
}

/** Every set the repository ships: where its files are, and how it arrives. */
const BUILT_IN: { set: ShowcaseSet; dir: string; visibility: CollectionVisibility }[] = [
  ...SHOWCASE_SETS.map((set) => ({ set, dir: "showcase", visibility: "visible" as const })),
  ...PREVIEW_SETS.map((set) => ({ set, dir: "collection-sets", visibility: "preview" as const })),
];

export async function importBuiltInSets(origin: string): Promise<string[]> {
  const repo = getRepo();
  const sets = await repo.listCollectionSets();
  const existing = new Set(sets.map((s) => s.slug));
  let last = Math.max(0, ...sets.map((s) => s.position));
  const added: string[] = [];

  const read = (path: string) => readBuiltIn(path, origin);

  for (const { set: built, dir, visibility } of BUILT_IN) {
    if (existing.has(built.id)) continue;
    const id = newId();
    await repo.saveCollectionSet({
      id,
      slug: built.id,
      name: built.name,
      blurb: built.blurb,
      visibility,
      access: "free",
      priceCents: null,
      buyUrl: null,
      position: ++last,
    });
    for (const [at, page] of built.pages.entries()) {
      const pageId = newId();
      await repo.saveCollectionPage(id, {
        id: pageId,
        slug: page.slug,
        label: page.label,
        blurb: page.blurb,
        position: at + 1,
      });
      for (const kind of ["html", "pagefly"] as const) {
        const bytes = await read(`${dir}/${built.id}/${page.slug}.${kind}`);
        if (bytes) await repo.putCollectionFile(id, pageId, kind, bytes);
      }
    }
    added.push(built.name);
  }
  return added;
}

/* ==========================================================================
   A BUILT-IN PAGE RE-EXPORTED AFTER ITS SET WAS IMPORTED.

   The import copies files once, so the table keeps the version it copied
   while the repository moves on — the landing gallery shows the new page and
   /collection-pages the old one. Each entry here says "this page was replaced
   in `public/showcase/` at this moment", and a copy in the table older than
   that is overwritten from the repository.

   ONCE PER PROCESS, and only while the table is behind: after the copy, the
   page's `updated_at` is newer than `since` and the entry does nothing. A page
   an admin has replaced by hand since then is newer too, so their upload wins.

   To ship a re-export: write the files into `public/showcase/`, add a line
   with the current time.
   ========================================================================== */
const REEXPORTED: {
  set: string;
  page: string;
  since: string;
  /** the files that changed; both when left out */
  kinds?: CollectionFileKind[];
}[] = [
  { set: "hexwood", page: "product-page", since: "2026-10-06T02:27:00Z" },
  { set: "hexwood", page: "contact", since: "2026-10-06T02:53:00Z", kinds: ["html"] },
  { set: "hexwood", page: "blog-article", since: "2026-10-06T03:13:00Z", kinds: ["html"] },
  { set: "hollis", page: "product-page", since: "2026-10-06T03:27:00Z" },
];

let refreshing: Promise<void> | null = null;

/** Bring re-exported built-in pages into the table. Safe to call on every request. */
export function refreshBuiltInPages(origin?: string): Promise<void> {
  refreshing ??= (async () => {
    const repo = getRepo();
    for (const r of REEXPORTED) {
      const set = await repo.getCollectionSetBySlug(r.set);
      const page = set?.pages.find((p) => p.slug === r.page);
      if (!set || !page || Date.parse(page.updatedAt) >= Date.parse(r.since)) continue;
      for (const kind of r.kinds ?? (["html", "pagefly"] as const)) {
        const bytes = await readBuiltIn(`showcase/${r.set}/${r.page}.${kind}`, origin);
        if (!bytes || rejectFile(kind, bytes)) throw new Error(`${r.set}/${r.page}.${kind} unreadable`);
        await repo.putCollectionFile(set.id, page.id, kind, bytes);
      }
      console.log(`[collection-pages] ${r.set}/${r.page} refreshed from the repository`);
    }
  })().catch((err) => {
    /* Tried again on the next request rather than never. */
    refreshing = null;
    console.warn("[collection-pages] refresh of built-in pages failed:", err);
  });
  return refreshing;
}

/** Built-in sets not yet in the table — what the import button offers. */
export function missingBuiltIns(sets: CollectionSetRecord[]): string[] {
  const have = new Set(sets.map((s) => s.slug));
  return BUILT_IN.filter((b) => !have.has(b.set.id)).map((b) => b.set.name);
}

/* ==========================================================================
   THE NUMBERS ON THE CARDS.

   Downloads are read from the analytics events already recorded — a whole-set
   download or a single page, from this page or the landing gallery — so the
   count carries the history from before this page existed, and it counts
   people rather than presses. Purchases are confirmed orders, because an
   order nobody has checked yet is not a sale.

   HELD FOR A MINUTE. The page is rendered per request and the downloads query
   reads the events table; a number on a card does not need to be fresher than
   that, and the table should not be scanned on every visit.
   ========================================================================== */
type Stats = { downloads: Record<string, number>; purchases: Record<string, number> };
let cached: { at: number; stats: Stats } | null = null;

export async function collectionStats(): Promise<Stats> {
  if (cached && Date.now() - cached.at < 60_000) return cached.stats;
  const repo = getRepo();
  const [downloads, purchases] = await Promise.all([
    repo.collectionDownloads([EV.showcaseSetDownloaded, EV.showcaseFileDownloaded]).catch(() => ({})),
    repo.collectionPurchases().catch(() => ({})),
  ]);
  const stats = { downloads, purchases };
  cached = { at: Date.now(), stats };
  return stats;
}
