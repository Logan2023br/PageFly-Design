/* ==========================================================================
   RUN THE REAL EXPORT ON ONE MOCKUP, LOCALLY.

       MOCKUP=path/to/page.html OUT=~/Downloads npx tsx scripts/build-pagefly.ts

   THIS SPENDS MONEY. One DeepSeek call per band plus one for the page script.
   It exists so a change to the export can be checked against a real page
   without deploying it — the live app runs whatever is on main, which is not
   what is being tested here.

   Prints what reached the model and what came back, because the failures this
   path has are quiet ones: a band that dropped, a script that was refused, a
   font that was never loaded.
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
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

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main(): Promise<void> {
  const file = process.env.MOCKUP;
  if (!file) return console.error("MOCKUP=path/to/page.html is required");
  const out = process.env.OUT ?? ".";
  const html = readFileSync(file, "utf8");

  const { pageScripts, splitSections, bandMarkup } = await import("../lib/pagefly/fromHtmlSkill");
  const bands = splitSections(html).map(bandMarkup);
  const js = pageScripts(html);
  console.log(
    `\n${file.split("/").pop()}  ${(html.length / 1024).toFixed(0)} KB\n` +
      `  ${bands.length} bands · ${js.length} script(s), ` +
      `${js.reduce((n, s) => n + s.length, 0).toLocaleString()} bytes to the model\n`,
  );

  /* The palette the route reads off the document; the same defaults it uses. */
  const pick = (re: RegExp, fallback: string) => re.exec(html)?.[1]?.trim() ?? fallback;
  const tokens = {
    bg: pick(/--bg:\s*([^;]+);/i, "#FFFFFF"),
    ink: pick(/--text:\s*([^;]+);/i, "#111111"),
    fontBody: pick(/--sans:\s*([^;]+);/i, "Inter"),
    accent: pick(/--gold:\s*([^;]+);/i, undefined as unknown as string),
  };
  console.log("  tokens:", JSON.stringify(tokens), "\n");

  const started = Date.now();
  const { pageflyFromHtmlLive } = await import("../lib/pagefly/htmlToTree");
  const built = await pageflyFromHtmlLive(html, "home", tokens);

  const name = `${out.replace(/\/$/, "")}/${built.filename}`;
  writeFileSync(name, Buffer.from(await built.blob.arrayBuffer()));

  const u = built.usage;
  console.log(
    `\n  ${built.built} of ${built.sections} bands in ${Math.round((Date.now() - started) / 1000)}s\n` +
      `  input ${u.input.toLocaleString()} (cached ${u.cached.toLocaleString()}) · output ${u.output.toLocaleString()}\n`,
  );
  for (const f of built.failures) console.log(`  ! band ${f.index + 1}: ${f.reason}`);
  console.log(`\n  → ${name}\n`);
}

void main().catch((e) => {
  console.error("\nfailed:", (e as Error).message);
  process.exit(1);
});
