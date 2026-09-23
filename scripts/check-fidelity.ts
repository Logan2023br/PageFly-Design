/* ==========================================================================
   HOW MUCH OF A PAGE SURVIVES THE ROUND TRIP, PER BAND.

       npx tsx scripts/check-fidelity.ts            the seven showcase pages
       npx tsx scripts/check-fidelity.ts home       one of them

   WHAT IT COMPARES. For each showcase page there are two artefacts in the
   repository: `<slug>.pagefly`, and `<slug>.html`, which is PAGEFLY'S OWN
   RENDER of that same file. So this renders the .pagefly through
   `scripts/preview-pagefly.ts` and diffs it against PageFly's render of the
   identical input. Nothing about the design is in question; the only variable
   is the renderer.

   WHICH IS THE POINT. This number is the NOISE FLOOR of any fidelity check
   built on `preview-pagefly.ts` — the disagreement you get for free, before a
   transcription has even been attempted. A gate set tighter than this floor
   rejects pages that are already correct, and every measurement below was taken
   to find out where the floor is:

     · per-band SSIM ranges 0.13 to 0.90, mean 0.58. Ten of fifty-four bands
       reach 0.97. A pixel gate near 1.0 is therefore not available, and the two
       pages are the same page to a reader — the heroes differ in how far a
       background photo is cropped.

     · the DOM diff, once the widgets PageFly draws with its own runtime are
       excluded, falls from about 800 differences across the seven pages to
       about 95. That is a floor a real check can live above.

   SO THIS IS NOT A PASS/FAIL, and it must not become one until the floor is
   lower than the thing being measured. It is the instrument's calibration, run
   the same way each time, so that a change to the exporter or to the preview
   renderer can be seen to move it.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

const { launch } = require_("../lib/fidelity/chrome") as typeof import("../lib/fidelity/chrome");
const { readPage, compare, bandScores } = require_(
  "../lib/fidelity/compare",
) as typeof import("../lib/fidelity/compare");
const { SHOWCASE_SETS } = require_(
  "../lib/showcasePages",
) as typeof import("../lib/showcasePages");

const SET = SHOWCASE_SETS[0];
const WIDTHS = [1440, 768, 390];

async function main(): Promise<void> {
  const only = process.argv[2];
  const pages = SET.pages.filter((p) => !only || p.slug === only);
  if (pages.length === 0) {
    console.log(`no such page — try one of: ${SET.pages.map((p) => p.slug).join(", ")}`);
    process.exit(2);
  }

  const session = await launch();
  if (!session) {
    console.log("no Chrome found — set CHROME_PATH");
    process.exit(2);
  }
  const dir = mkdtempSync(join(tmpdir(), "pfd-fidelity-"));

  console.log(
    `page                 bands  mismatches  unverified  SSIM min   what differs\n` +
      `(the three widths added together; unverified = inside a widget PageFly draws itself)\n`,
  );

  const rows: string[] = [];
  try {
    for (const page of pages) {
      const source = resolve(`public/showcase/${SET.id}/${page.slug}.pagefly`);
      const reference = resolve(`public/showcase/${SET.id}/${page.slug}.html`);
      if (!existsSync(source) || !existsSync(reference)) {
        console.log(`${page.slug}: missing artefact, skipped`);
        continue;
      }
      const rendered = join(dir, `${page.slug}.html`);
      execFileSync("npx", ["tsx", "scripts/preview-pagefly.ts", source, rendered], {
        stdio: "ignore",
      });

      let worst = 1;
      let mismatches = 0;
      let unverified = 0;
      let bands = 0;
      const kinds = new Map<string, number>();

      for (const width of WIDTHS) {
        const want = await readPage(session, `file://${reference}`, width);
        const got = await readPage(session, `file://${rendered}`, width);
        const report = compare(want, got);
        mismatches += report.bad.length;
        unverified += report.unverified;
        bands = Math.max(bands, want.bands.length);
        for (const m of report.bad) kinds.set(m.kind, (kinds.get(m.kind) ?? 0) + 1);

        const scores = (
          await bandScores(
            session,
            width,
            { url: `file://${reference}`, bands: want.bands },
            { url: `file://${rendered}`, bands: got.bands },
          )
        ).filter((s) => s > 0);
        if (scores.length) worst = Math.min(worst, Math.min(...scores));
      }

      const top = [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 3);
      rows.push(
        `${page.slug.padEnd(20)} ${String(bands).padStart(5)} ${String(mismatches).padStart(11)} ` +
          `${String(unverified).padStart(11)} ${worst.toFixed(3).padStart(9)}   ` +
          top.map(([k, n]) => `${k} ${n}`).join(", "),
      );
      console.log(rows[rows.length - 1]);
    }
  } finally {
    await session.close();
  }

}

void main();
