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
import { HERO_SET, SHOWCASE_SETS, htmlFor, pageflyFor } from "../lib/showcasePages";
import { combinePagefly, readPageflyPage, readPageflySet } from "../lib/collections/pagefly";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

const ROOT = join(import.meta.dirname, "..");
const DIR = join(ROOT, "public", "showcase");

/** The path the browser asks for, turned into the path on disk. */
const onDisk = (url: string) => join(ROOT, "public", url.replace(/^\//, ""));

console.log("\nthe sets");

check(SHOWCASE_SETS.length >= 2, "there is more than one set", String(SHOWCASE_SETS.length));
check(
  new Set(SHOWCASE_SETS.map((s) => s.id)).size === SHOWCASE_SETS.length,
  "no two share an id — the id is the directory and the analytics key",
);
check(
  SHOWCASE_SETS.some((s) => s.id === HERO_SET.id),
  "the set the hero rail shows is one of them",
  HERO_SET.id,
);

for (const set of SHOWCASE_SETS) {
  console.log(`\n  ${set.name} (${set.id})`);

  check(set.pages.length >= 7, "    seven pages or more", String(set.pages.length));
  check(
    new Set(set.pages.map((p) => p.slug)).size === set.pages.length,
    "    no two pages share a slug",
  );
  check(
    set.pages.every((p) => /^[a-z0-9-]+$/.test(p.slug)),
    "    every slug is url-safe",
    set.pages.map((p) => p.slug).join(" "),
  );
  check(
    set.pages.every((p) => p.label.length > 0 && p.blurb.length > 0),
    "    every page says what it is and what it is for",
  );
  check(set.name.length > 0 && set.blurb.length > 0, "    the set names itself and its look");

  for (const page of set.pages) {
    const html = onDisk(htmlFor(set, page));
    const pagefly = onDisk(pageflyFor(set, page));

    const hasHtml = existsSync(html);
    const hasFile = existsSync(pagefly);
    check(hasHtml, `    ${page.slug}.html`, hasHtml ? `${Math.round(statSync(html).size / 1024)}KB` : "missing");
    check(hasFile, `    ${page.slug}.pagefly`, hasFile ? "" : "missing");
    if (!hasHtml || !hasFile) continue;

    /* THE LAZY ATTRIBUTE IS THE WHOLE REASON THE EXPORT IS A SCRIPT. Without it
       a row of thumbnails pulls every full-size image in every page before the
       headline is read — see `make-showcase-pages.ts`. A file copied in by hand
       would pass every other check here and quietly cost megabytes. */
    const text = readFileSync(html, "utf8");
    const imgs = (text.match(/<img\b/gi) ?? []).length;
    const lazy = (text.match(/loading="lazy"/gi) ?? []).length;
    check(imgs === 0 || lazy >= imgs, `      every image is lazy`, `${lazy}/${imgs}`);

    /* The offer beside the picture has to be a file PageFly will take. */
    try {
      const read = readPageflyPage(readFileSync(pagefly));
      check(read.items.length > 0, `      the .pagefly imports`, `${read.items.length} items`);
    } catch (err) {
      check(false, `      the .pagefly imports`, (err as Error).message);
    }
  }
}

console.log("\nand nothing on disk is unaccounted for");

if (!existsSync(DIR)) {
  check(false, "the showcase directory exists", DIR);
} else {
  /* BOTH DIRECTIONS ARE SILENT, which is why both are checked. A slug with no
     files renders as a white rectangle with a caption — no error, just a page
     that looks like it failed to design. Files with no slug ship in every
     deployment for nothing. */
  const dirs = readdirSync(DIR).filter((d) => !d.startsWith("."));
  const known = new Set(SHOWCASE_SETS.map((s) => s.id));
  check(
    dirs.every((d) => known.has(d)),
    "no directory the manifest does not name",
    dirs.filter((d) => !known.has(d)).join(" "),
  );

  for (const set of SHOWCASE_SETS) {
    const dir = join(DIR, set.id);
    if (!existsSync(dir)) {
      check(false, `${set.id}/ exists`);
      continue;
    }
    const named = new Set(set.pages.flatMap((p) => [`${p.slug}.html`, `${p.slug}.pagefly`]));
    const orphans = readdirSync(dir).filter((f) => !f.startsWith(".") && !named.has(f));
    check(
      orphans.length === 0,
      `no stray file in ${set.id}/`,
      orphans.length ? orphans.join(" ") : "",
    );
  }
}

console.log("\nExport all hands over one importable archive");

/* ==========================================================================
   THE BUTTON BESIDE EACH SET'S NAME FETCHES ITS SEVEN FILES AND COMBINES THEM.
   A merchant does not want seven downloads and seven imports, so the seven
   single-page files go back into the shape PageFly's own multi-page export
   has — `combinePagefly` does it, read off a real export rather than invented.

   ASSERTED BY ROUND-TRIPPING. A zip that is merely produced is not the claim;
   the claim is that PageFly will read it, and the nearest thing to that here is
   this app's own reader, which the importer is modelled on. Seven in, seven
   back out, with the labels intact — a combine that silently kept one entry
   would otherwise pass every check that only counts bytes.
   ========================================================================== */
for (const set of SHOWCASE_SETS) {
  const paths = set.pages.map((p) => onDisk(pageflyFor(set, p)));
  if (!paths.every((f) => existsSync(f))) {
    check(false, `${set.id}: every page has a file to combine`);
    continue;
  }

  const one = combinePagefly(paths.map((f) => new Uint8Array(readFileSync(f))));
  let back: ReturnType<typeof readPageflySet> = [];
  try {
    back = readPageflySet(one);
  } catch (err) {
    check(false, `${set.id}: the combined archive reads back`, (err as Error).message);
    continue;
  }

  check(
    back.length === set.pages.length,
    `${set.id}: ${set.pages.length} in, ${back.length} back out`,
    `${Math.round(one.length / 1024)}KB`,
  );
  check(
    back.every((p) => p.items.length > 0),
    `${set.id}: every page in it still has content`,
  );
  check(
    new Set(back.map((p) => p.label)).size === back.length,
    `${set.id}: no two entries collapsed onto one name`,
    back.map((p) => p.label).join(" · "),
  );
}

console.log("\nevery pair of sets is a genuinely different store");

/* ==========================================================================
   TWO SETS THAT LOOK ALIKE ARE ONE SET WITH EXTRA SCROLLING. The whole reason
   there is more than one is to show that the LOOK came from the brief, and a
   pair that shares a palette says the opposite of that out loud.

   EVERY PAIR, not the first two. With three sets a check on `[0]` and `[1]`
   leaves a third that could be a near-copy of either and pass — and the check
   would still read as though it had been verified.
   ========================================================================== */
{
  const palette = (set: (typeof SHOWCASE_SETS)[number]) => {
    const home = readFileSync(onDisk(htmlFor(set, set.pages[0])), "utf8");
    return new Set((home.match(/#[0-9a-f]{6}\b/gi) ?? []).map((h) => h.toLowerCase()));
  };
  const palettes = new Map(SHOWCASE_SETS.map((s) => [s.id, palette(s)]));

  for (let i = 0; i < SHOWCASE_SETS.length; i++) {
    for (let j = i + 1; j < SHOWCASE_SETS.length; j++) {
      const a = SHOWCASE_SETS[i];
      const b = SHOWCASE_SETS[j];
      const pa = palettes.get(a.id)!;
      const pb = palettes.get(b.id)!;
      const shared = [...pa].filter((h) => pb.has(h)).length;
      const overlap = shared / Math.max(1, Math.min(pa.size, pb.size));
      check(
        overlap < 0.5,
        `${a.id} vs ${b.id}: under half their home-page colours are shared`,
        `${Math.round(overlap * 100)}%`,
      );
    }
  }
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
  const slugs = new Set(SHOWCASE_SETS.flatMap((s) => s.pages.map((p) => p.slug)));
  for (const slug of slugs) {
    check(
      new RegExp(`^\\s*"?${slug}"?:\\s*"`, "m").test(body),
      `"${slug}" is labelled for the chart`,
    );
  }
}

console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
