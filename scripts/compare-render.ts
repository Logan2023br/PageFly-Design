/* ==========================================================================
   WHAT IS DIFFERENT BETWEEN TWO RENDERINGS OF ONE PAGE.

       npx tsx scripts/compare-render.ts <reference.html> <candidate.html> [widths]
       npx tsx scripts/compare-render.ts public/showcase/hexwood/home.html out.html 1440,768,390

   Both arguments are files on disk or URLs. The first is what the page SHOULD
   look like — the mockup, or PageFly's own render — and the second is what came
   out. Needs a Chrome; `CHROME_PATH` names one if it is somewhere unusual.

   WHAT IT PRINTS, per width:

     · a list of concrete mismatches, each naming both values —
       `H2 "Get spooked": font-size 96px should be 150px` — grouped by band
     · per-band SSIM, as a second opinion and not as a verdict

   WHY IT IS NOT A PASS/FAIL. The first pair this was pointed at was
   `hexwood/home.pagefly` rendered by `preview-pagefly.ts` against `home.html`,
   which is PageFly's own render of that same file: identical input, and per
   band SSIM came out between 0.16 and 0.90, mean 0.51 where the band holds a
   photograph. The two pages look the same to a reader. A pixel gate set
   anywhere near 1.0 would reject every band of a page that is already correct,
   so this reports numbers and lets the caller decide what they mean.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

const asUrl = (arg: string): string =>
  /^https?:|^file:/.test(arg) ? arg : `file://${resolve(arg)}`;

async function main(): Promise<void> {
  const [a, b, widthArg] = process.argv.slice(2);
  if (!a || !b) {
    console.log("usage: compare-render.ts <reference> <candidate> [widths]");
    process.exit(2);
  }
  for (const p of [a, b])
    if (!/^https?:|^file:/.test(p) && !existsSync(p)) {
      console.log(`no such file: ${p}`);
      process.exit(2);
    }

  const widths = (widthArg ?? "1440,768,390").split(",").map((w) => Number(w.trim()));
  const session = await launch();
  if (!session) {
    console.log("no Chrome found — set CHROME_PATH");
    process.exit(2);
  }

  try {
    for (const width of widths) {
      const want = await readPage(session, asUrl(a), width);
      const got = await readPage(session, asUrl(b), width);
      const { bad, unverified } = compare(want, got);
      const scores = await bandScores(
        session,
        width,
        { url: asUrl(a), bands: want.bands },
        { url: asUrl(b), bands: got.bands },
      );

      console.log(`\n── ${width}px ──────────────────────────────────────────`);
      console.log(
        `bands ${want.bands.length} vs ${got.bands.length} · ` +
          `text ${want.text.length} vs ${got.text.length} · ` +
          `images ${want.images.length} vs ${got.images.length} · ` +
          `${unverified} node(s) unverified (drawn by PageFly's own runtime)`,
      );

      const byBand = new Map<number | null, string[]>();
      for (const m of bad) {
        const list = byBand.get(m.band) ?? [];
        list.push(m.say);
        byBand.set(m.band, list);
      }
      for (let i = 0; i < Math.max(want.bands.length, scores.length); i++) {
        const said = byBand.get(i) ?? [];
        const score = scores[i];
        console.log(
          `\n  band ${String(i + 1).padStart(2)}  ${want.bands[i]?.photo ? "photo" : "     "}  ` +
            `SSIM ${score === undefined ? "  —  " : score.toFixed(3)}  ${said.length} mismatch(es)`,
        );
        for (const line of said.slice(0, 8)) console.log(`      · ${line}`);
        if (said.length > 8) console.log(`      · …and ${said.length - 8} more`);
      }
      const loose = byBand.get(null) ?? [];
      if (loose.length) {
        console.log(`\n  outside any band  ${loose.length} mismatch(es)`);
        for (const line of loose.slice(0, 6)) console.log(`      · ${line}`);
      }
      const usable = scores.filter((s) => s > 0);
      console.log(
        `\n  ${bad.length} mismatch(es) in all · SSIM min ${
          usable.length ? Math.min(...usable).toFixed(3) : "—"
        } mean ${usable.length ? (usable.reduce((p, c) => p + c, 0) / usable.length).toFixed(3) : "—"}`,
      );
    }
  } finally {
    await session.close();
  }
}

void main();
