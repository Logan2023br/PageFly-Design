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
export type SplitResult = { pages: SplitPage[]; unmatched: string[]; auto: { entry: string; slug: string }[] };

export type SplitOptions = {
  /** the admin's choice for an entry the names did not match: entry → page slug */
  assign?: Record<string, string>;
  /** the pages the set still lacks a .pagefly for: one left and one entry unmatched → that is it */
  open?: string[];
};

/** "3 - Solvane – Home Page.json" → "solvane home page" */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.(json|pagefly|zip)$/, "")
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The entry's name without the leading "<n> - " of an export. */
const bare = (entry: string) => norm(entry.split("/").pop()!.replace(/^\s*\d+\s*-\s*/, ""));

/** Where `words` first runs in a row inside `name`, scanning from the end; -1 when not at all. */
function lastRun(name: string[], words: string[]): number {
  for (let i = name.length - words.length; i >= 0; i--) if (words.every((w, k) => name[i + k] === w)) return i;
  return -1;
}

/**
 * Which page an entry is: its full title first ("Solvane - Home"), then the
 * page's label or slug found anywhere in the name as whole words — PageFly's
 * own export names carry more around it ("1 - 1 _ 1 _ HOSAKI Home _ 2026_11_",
 * "HOSAKI About us _ 2026" for the "about-us" page). The longest label wins,
 * so "Blog Article" is never taken for "Article"; between equals, the one
 * nearer the end (a set called "Home & Co" still has its Product page).
 */
export function matchEntry(entry: string, pages: LoganPage[]): LoganPage | null {
  const name = bare(entry);
  const byTitle = pages.find((p) => norm(p.title) === name);
  if (byTitle) return byTitle;
  const words = name.split(" ").filter(Boolean);
  let best: { page: LoganPage; len: number; at: number } | null = null;
  for (const page of pages) {
    for (const key of [page.label, page.slug]) {
      const k = norm(key).split(" ").filter(Boolean);
      if (k.length === 0) continue;
      const at = lastRun(words, k);
      if (at < 0) continue;
      if (!best || k.length > best.len || (k.length === best.len && at > best.at)) best = { page, len: k.length, at };
    }
  }
  if (best) return best.page;
  return truncated(words, pages);
}

/**
 * PageFly cuts a long page name in its export ("Shahbaz and Sons Collectio",
 * "… White Fri", "… Blog arti"): the name then ENDS part-way through the
 * label. Matched when the name's last words are the label's first words, the
 * very last one cut short (at least 3 letters of it, and 5 letters in all).
 * The most of the label wins.
 */
function truncated(words: string[], pages: LoganPage[]): LoganPage | null {
  let best: { page: LoganPage; chars: number } | null = null;
  const last = words[words.length - 1] ?? "";
  if (last.length < 2) return null;
  for (const page of pages) {
    for (const key of [page.label, page.slug]) {
      const k = norm(key).split(" ").filter(Boolean);
      for (let j = Math.min(k.length, words.length); j >= 1; j--) {
        const head = words.slice(words.length - j, -1);
        if (!head.every((w, i) => w === k[i])) continue;
        const cut = k[j - 1];
        if (!cut.startsWith(last) || last === cut) continue;
        const chars = head.join("").length + last.length;
        if (last.length < 3 || chars < 5) continue;
        if (!best || chars > best.chars) best = { page, chars };
        break;
      }
    }
  }
  return best?.page ?? null;
}

/**
 * The export's pages, each as its own .pagefly. Entries that are not a
 * page's JSON (assets, folders) are left out; a JSON that matches no page is
 * reported in `unmatched`. When two entries match one page, the last wins.
 * A file holding one JSON whose name matches nothing is matched by the
 * file's own name (`fileName`, e.g. "Home.pagefly") — a page saved from
 * elsewhere keeps whatever name its JSON had.
 * Throws when the bytes are not a zip.
 */
export function splitExport(bytes: Uint8Array, pages: LoganPage[], fileName?: string, opts: SplitOptions = {}): SplitResult {
  const files = unzipSync(bytes);
  const jsons = Object.keys(files).filter((e) => e.toLowerCase().endsWith(".json") && !e.endsWith("/"));
  const found = new Map<string, SplitPage>();
  const unmatched: string[] = [];
  const auto: SplitResult["auto"] = [];
  const put = (entry: string, slug: string) => {
    const name = entry.split("/").pop()!;
    found.set(slug, { slug, entry: name, bytes: zipSync({ [name]: files[entry] }, { level: 6 }) });
  };
  for (const entry of jsons) {
    /* the admin's choice first: it is what they saw and picked */
    const chosen = opts.assign?.[entry] ?? opts.assign?.[entry.split("/").pop()!];
    const page = (chosen && pages.find((p) => p.slug === chosen)) || matchEntry(entry, pages) || (fileName && jsons.length === 1 ? matchEntry(fileName, pages) : null);
    if (page) put(entry, page.slug);
    else unmatched.push(entry);
  }
  /* one page still missing, one entry nobody could name: it can only be that page */
  const left = (opts.open ?? []).filter((slug) => !found.has(slug) && pages.some((p) => p.slug === slug));
  if (unmatched.length === 1 && left.length === 1) {
    put(unmatched[0], left[0]);
    auto.push({ entry: unmatched[0].split("/").pop()!, slug: left[0] });
    unmatched.length = 0;
  }
  return { pages: [...found.values()], unmatched, auto };
}
