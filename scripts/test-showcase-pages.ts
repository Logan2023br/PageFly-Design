/* ==========================================================================
   THE MANIFEST AND THE FILES ON DISK NAME THE SAME PAGES.

       npx tsx scripts/test-showcase-pages.ts

   `lib/showcasePages.ts` is a list of slugs and `public/showcase/pages/` is a
   directory of files named after them. Nothing connects the two but a
   convention, and the way that breaks is silent in both directions:

   · A SLUG WITH NO FILES is a card whose iframe 404s. It renders as a white
     rectangle with a caption under it — no error, no console message, just a
     page in the gallery that looks like it failed to design rather than like a
     file that is missing.

   · FILES WITH NO SLUG are dead weight nothing serves, shipped in every
     deployment. The export script removes the directory before writing, so
     these only appear when somebody adds files by hand.

   AND THE .pagefly HAS TO BE IMPORTABLE. It is offered for download beside a
   render of itself, so the one thing that must never be true is that the
   picture works and the file does not. Read through the app's own reader,
   which is what PageFly's importer is modelled on.
   ========================================================================== */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SHOWCASE_PAGES, htmlFor, pageflyFor } from "../lib/showcasePages";
import { readPageflyPage } from "../lib/collections/pagefly";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

const ROOT = join(import.meta.dirname, "..");
const DIR = join(ROOT, "public", "showcase", "pages");

/** The path the browser asks for, turned into the path on disk. */
const onDisk = (url: string) => join(ROOT, "public", url.replace(/^\//, ""));

console.log("\nthe set is the whole set");

check(SHOWCASE_PAGES.length >= 7, "seven pages or more", String(SHOWCASE_PAGES.length));
check(
  new Set(SHOWCASE_PAGES.map((p) => p.slug)).size === SHOWCASE_PAGES.length,
  "no two share a slug — the slug is the file name and the analytics key",
);
check(
  SHOWCASE_PAGES.every((p) => /^[a-z0-9-]+$/.test(p.slug)),
  "every slug is url-safe",
  SHOWCASE_PAGES.map((p) => p.slug).join(" "),
);
check(
  SHOWCASE_PAGES.every((p) => p.label.length > 0 && p.blurb.length > 0),
  "every page says what it is and what it is for",
);

console.log("\nevery page named has both artefacts");

for (const page of SHOWCASE_PAGES) {
  const html = onDisk(htmlFor(page));
  const pagefly = onDisk(pageflyFor(page));

  check(existsSync(html), `${page.slug}.html exists`, existsSync(html) ? `${Math.round(statSync(html).size / 1024)}KB` : "");
  check(existsSync(pagefly), `${page.slug}.pagefly exists`);

  if (!existsSync(html) || !existsSync(pagefly)) continue;

  /* THE LAZY ATTRIBUTE IS THE WHOLE REASON THE EXPORT IS A SCRIPT. Without it
     a row of thumbnails pulls every full-size image in every page before the
     headline is read — see `make-showcase-pages.ts`. A file copied in by hand
     would pass every other check here and quietly cost megabytes. */
  const text = readFileSync(html, "utf8");
  const imgs = (text.match(/<img\b/gi) ?? []).length;
  const lazy = (text.match(/loading="lazy"/gi) ?? []).length;
  check(
    imgs === 0 || lazy >= imgs,
    `  every image in ${page.slug}.html is lazy`,
    `${lazy}/${imgs}`,
  );

  /* The offer beside the picture has to be a file PageFly will take. */
  try {
    const read = readPageflyPage(readFileSync(pagefly));
    check(read.items.length > 0, `  ${page.slug}.pagefly imports`, `${read.items.length} items`);
  } catch (err) {
    check(false, `  ${page.slug}.pagefly imports`, (err as Error).message);
  }
}

console.log("\nand nothing on disk is unaccounted for");

if (!existsSync(DIR)) {
  check(false, "the directory exists", DIR);
} else {
  const named = new Set(SHOWCASE_PAGES.flatMap((p) => [`${p.slug}.html`, `${p.slug}.pagefly`]));
  const orphans = readdirSync(DIR).filter((f) => !f.startsWith(".") && !named.has(f));
  check(
    orphans.length === 0,
    "no file the manifest does not name",
    orphans.length ? orphans.join(" ") : "",
  );
}

console.log("\nthe analytics screen can name every page");

/* ==========================================================================
   THE SLUG IS THE ANALYTICS KEY. `design_gallery_opened`, the frame switch and
   the file download all carry it as `page_type`, and the tile splits on it — so
   a slug with no label renders as the slug. Adding a page is two files and this
   is the second one; `test-analytics-coverage.ts` makes the same check for the
   CTA locations, for the same reason.
   ========================================================================== */
{
  const route = readFileSync(join(ROOT, "app/api/admin/analytics/route.ts"), "utf8");
  const at = route.indexOf("const SHOWCASE_SLUGS");
  const body = at === -1 ? "" : route.slice(at, route.indexOf("\n};", at));

  check(at !== -1, "SHOWCASE_SLUGS exists in the analytics route");
  for (const page of SHOWCASE_PAGES) {
    check(
      new RegExp(`^\\s*"?${page.slug}"?:\\s*"`, "m").test(body),
      `"${page.slug}" is labelled for the chart`,
    );
  }
}

console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
