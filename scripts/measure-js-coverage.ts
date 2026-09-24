/* ==========================================================================
   HOW MUCH OF A MOCKUP'S JAVASCRIPT REACHES THE MODEL.

       npx tsx scripts/measure-js-coverage.ts <mockup.html> [...]

   Reads only. No model call, no cost.

   "Is the script carried in full?" is a question with a number behind it, and
   the number had never been taken. This counts every inline `<script>` in a
   document against what `pageScripts` hands to the one call that rewrites a
   page's behaviour — and checks that a band arrives with no script of its own,
   because a copy in both places registers every listener twice.
   ========================================================================== */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";

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

function where(html: string, at: number): string {
  const headEnd = html.search(/<\/head>/i);
  const mainOpen = html.search(/<main\b/i);
  const mainClose = html.search(/<\/main>/i);
  if (headEnd >= 0 && at < headEnd) return "head";
  if (mainOpen >= 0 && mainClose >= 0 && at > mainOpen && at < mainClose) return "inside main";
  return "body";
}

async function main(): Promise<void> {
  const { pageScripts, splitSections, bandMarkup } = await import("../lib/pagefly/fromHtmlSkill");
  const files = process.argv.slice(2);
  if (files.length === 0) return console.log("give me one or more mockup .html files");

  let all = 0;
  let carried = 0;
  let dupes = 0;

  for (const f of files) {
    const html = readFileSync(f, "utf8");
    const every: { at: number; js: string }[] = [];
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\ssrc\s*=/i.test(m[1])) continue;
      const js = m[2].trim();
      if (js) every.push({ at: m.index ?? 0, js });
    }
    if (every.length === 0) continue;

    const got = pageScripts(html);
    const bytes = every.reduce((n, s) => n + s.js.length, 0);
    const gotBytes = got.reduce((n, s) => n + s.length, 0);
    all += bytes;
    carried += gotBytes;

    const leftInBands = splitSections(html)
      .map(bandMarkup)
      .filter((b) => /<script/i.test(b)).length;
    dupes += leftInBands;

    console.log(`\n${f.split("/").pop()}`);
    console.log(`  ${every.length} inline script(s), ${bytes.toLocaleString()} bytes`);
    for (const s of every)
      console.log(
        `    ${got.some((g) => g.includes(s.js.slice(0, 60))) ? "✓" : "✗"} ` +
          `${where(html, s.at).padEnd(11)} ${String(s.js.length).padStart(6)} bytes  ` +
          `${s.js.slice(0, 50).replace(/\s+/g, " ")}…`,
      );
    console.log(`  bands still holding a script: ${leftInBands}`);
  }

  if (all > 0)
    console.log(
      `\n  TOTAL  ${carried.toLocaleString()} of ${all.toLocaleString()} bytes reach the model ` +
        `(${Math.round((carried / all) * 100)}%) · ${dupes} band(s) would run twice`,
    );
}

void main();
