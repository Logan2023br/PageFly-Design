import "server-only";

import { toPublicSet, type PublicCollectionSet } from "./collectionPages";
import { collectionStats, refreshBuiltInPages } from "./collectionPagesServer";
import { getRepo } from "./db";
import type { CollectionSetRecord } from "./db/types";
import { langOf, type LangCode } from "./collectionMarkets";

/* ==========================================================================
   Which language each set is written in — read from its first page's
   `<html lang="…">`, the one place every set already says it.

   Read once per set and version: the answer is kept in memory under the
   set's slug and `updatedAt`, so a list is a database read only the first
   time after a deploy or after the set changes.
   ========================================================================== */

const cache = new Map<string, LangCode>();

async function languageOf(set: CollectionSetRecord): Promise<LangCode> {
  const page = [...set.pages].sort((a, b) => a.position - b.position).find((p) => p.htmlSize !== null);
  if (!page) return "en";
  const key = `${set.slug}:${set.updatedAt}:${page.updatedAt}`;
  const known = cache.get(key);
  if (known) return known;
  let code: LangCode = "en";
  try {
    const bytes = await getRepo().getCollectionFile(set.id, page.id, "html");
    if (bytes) {
      const head = new TextDecoder().decode(bytes.slice(0, 4096));
      code = langOf(/<html[^>]*\blang\s*=\s*["']?([A-Za-z_-]+)/i.exec(head)?.[1]);
    }
  } catch {
    /* unreadable: English, and asked again next time */
    return "en";
  }
  cache.set(key, code);
  return code;
}

/** slug → language, for the given sets */
export async function setLanguages(sets: CollectionSetRecord[]): Promise<Record<string, LangCode>> {
  const pairs = await Promise.all(sets.map(async (s) => [s.slug, await languageOf(s)] as const));
  return Object.fromEntries(pairs);
}

/**
 * Every visible set with something to preview, as the public list draws it,
 * each with its language — /collection-pages, /collection-pages/ja and the
 * sitemap all read this one list.
 */
export async function visiblePublicSets(): Promise<PublicCollectionSet[]> {
  await refreshBuiltInPages();
  const [sets, stats] = await Promise.all([getRepo().listCollectionSets().catch(() => []), collectionStats()]);
  const visible = sets.filter((s) => s.visibility === "visible");
  const langs = await setLanguages(visible);
  return (
    visible
      .map((s) => ({ ...toPublicSet(s, stats), lang: langs[s.slug] }))
      /* A visible set with nothing to preview would be a card that opens onto
         an empty page. */
      .filter((s) => s.pages.length > 0)
  );
}
