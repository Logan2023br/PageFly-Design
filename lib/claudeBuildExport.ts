import { unzipSync, zipSync } from "fflate";
import type { LoganPage } from "./claudeBuildShared";

/* ==========================================================================
   Claude Build — the admin's export, split into one .pagefly per page.

   The routine builds each page in the Logan store and names it
   "<Set> - <Label>". Someone exports them from the PageFly editor — one page
   at a time (a zip with one JSON) or "All Pages" (a zip with one JSON per
   page, "<n> - <Set> - <Label>.json") — and drops the file on the panel.
   Each JSON is matched to its page by that name and re-zipped on its own,
   exactly as a single-page export is: the .pagefly a merchant imports.

   Pure (no database), so it is tested on its own: scripts/test-claude-build-export.ts
   ========================================================================== */

export type SplitPage = { slug: string; entry: string; bytes: Uint8Array };
export type SplitResult = { pages: SplitPage[]; unmatched: string[] };

/** "3 - Solvane – Home Page.json" → "solvane home page" */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.json$/, "")
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The entry's name without the leading "<n> - " of an export. */
const bare = (entry: string) => norm(entry.split("/").pop()!.replace(/^\s*\d+\s*-\s*/, ""));

/**
 * Which page an entry is: its full title first ("Solvane - Home"), then a
 * name ending in the page's label (" … Home"), then the label alone. The
 * longest label wins, so "Product Page" is never taken for "Page".
 */
export function matchEntry(entry: string, pages: LoganPage[]): LoganPage | null {
  const name = bare(entry);
  const byTitle = pages.find((p) => norm(p.title) === name);
  if (byTitle) return byTitle;
  const byLabel = [...pages]
    .sort((a, b) => norm(b.label).length - norm(a.label).length)
    .find((p) => {
      const l = norm(p.label);
      return l && (name === l || name.endsWith(` ${l}`));
    });
  return byLabel ?? null;
}

/**
 * The export's pages, each as its own .pagefly. Entries that are not a
 * page's JSON (assets, folders) are left out; a JSON that matches no page is
 * reported in `unmatched`. When two entries match one page, the last wins.
 * Throws when the bytes are not a zip.
 */
export function splitExport(bytes: Uint8Array, pages: LoganPage[]): SplitResult {
  const files = unzipSync(bytes);
  const found = new Map<string, SplitPage>();
  const unmatched: string[] = [];
  for (const [entry, data] of Object.entries(files)) {
    if (!entry.toLowerCase().endsWith(".json") || entry.endsWith("/")) continue;
    const page = matchEntry(entry, pages);
    if (!page) {
      unmatched.push(entry);
      continue;
    }
    const name = entry.split("/").pop()!;
    found.set(page.slug, { slug: page.slug, entry: name, bytes: zipSync({ [name]: data }, { level: 6 }) });
  }
  return { pages: [...found.values()], unmatched };
}
