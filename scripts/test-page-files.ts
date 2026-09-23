/* ==========================================================================
   THE FILE IS BUILT ONCE AND KEPT.

       npx tsx scripts/test-page-files.ts

   WHAT THIS GUARDS, and it is a cost rather than a crash. Converting one mockup
   to a .pagefly is a model call per band — about two minutes and twenty cents.
   Until this change the result lived in a variable at module scope in the
   merchant's browser tab, and `ResultsScreen` started a conversion for EVERY
   page of the deck on mount. That variable dies with the tab, so every reload
   converted the whole deck again, for a file most merchants download once and
   many never download at all. Nothing failed. Nothing warned. It was simply the
   largest line on the bill.

   None of what replaced it can announce a fault either: a page converted twice
   produces the same file, and a stored file that is never read produces no
   error. So every check below is about WHETHER THE MODEL WAS CALLED, and each
   was run against a deliberately broken version of the thing it guards before
   it was committed.

   No money is spent: the provider is the stub.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pfd-files-"));
process.env.PFD_DB_FILE = join(dir, "store.json");

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  const hit = resolve_.call(this, request, ...args);
  return /lib[/\\]ai[/\\]provider\.ts$/.test(hit) ? require_.resolve("./provider-stub.cjs") : hit;
} as never;

const { getRepo } = require_("../lib/db") as typeof import("../lib/db");
const { prebuildFiles, fileKeyFor } = require_(
  "../lib/pagefly/prebuild",
) as typeof import("../lib/pagefly/prebuild");
const { keyForHtml } = require_("../lib/pagefly/prepared") as typeof import("../lib/pagefly/prepared");

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const head = (s: string) => console.log(`\n${s}`);

const MOCKUP = `<!doctype html><html><head><style>.hero{padding:40px}</style></head><body>
<main><section class="hero"><h1>Hi</h1></section><section class="two"><p>Two</p></section></main>
</body></html>`;

const TOKENS = {
  bg: "#FFFFFF",
  ink: "#111111",
  fontBody: "Inter",
  accent: "#8A1C1C",
  surfaceAlt: "#F1EFE9",
  border: "rgba(0,0,0,.2)",
  radius: 0,
};

function page(id: string, label: string, html: string | null) {
  return {
    id,
    label,
    pageType: "home",
    index: 1,
    tokens: TOKENS,
    ...(html === null ? {} : { design: { tree: {}, html, images: {} } }),
  } as never;
}

const asked = () =>
  (globalThis as { __PFD_ASKED?: unknown[] }).__PFD_ASKED ?? [];

(globalThis as { __PFD_REPLY?: unknown }).__PFD_REPLY = JSON.stringify({
  section: { type: "section", role: "hero", children: [{ type: "heading", level: 1, text: "Hi" }] },
});

async function main(): Promise<void> {
  const repo = getRepo();

  /* ── the key ─────────────────────────────────────────────────────────── */
  head("what a file is filed under");
  check(fileKeyFor(page("p1", "Home", null)) === null, "a page with no mockup has no key");
  check(
    fileKeyFor(page("p1", "Home", MOCKUP)) === keyForHtml("p1", MOCKUP),
    "a page with one is filed under its document",
  );
  check(
    fileKeyFor(page("p1", "Home", MOCKUP)) !== fileKeyFor(page("p1", "Home", `${MOCKUP}<!--x-->`)),
    "REBUILDING THE SAME PAGE CHANGES THE KEY",
    "or a rebuilt page would serve the old file for ever",
  );

  /* ── the store ───────────────────────────────────────────────────────── */
  head("bytes survive the store");
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 255, 128, 7]);
  await repo.savePageFile({
    domain: "a.myshopify.com",
    key: "k1",
    bytes,
    filename: "Home.pagefly",
    createdAt: new Date().toISOString(),
  });
  const back = await repo.getPageFile("a.myshopify.com", "k1");
  check(back !== null, "a saved file comes back");
  check(
    back !== null && [...back.bytes].join(",") === [...bytes].join(","),
    "byte for byte",
    back ? [...back.bytes].join(",") : "",
  );
  check(back?.filename === "Home.pagefly", "with its name");
  check(
    (await repo.getPageFile("b.myshopify.com", "k1")) === null,
    "AND ANOTHER STORE CANNOT READ IT",
  );

  await repo.savePageFile({
    domain: "a.myshopify.com",
    key: "k1",
    bytes: new Uint8Array([1, 2, 3]),
    filename: "Home.pagefly",
    createdAt: new Date().toISOString(),
  });
  const again = await repo.getPageFile("a.myshopify.com", "k1");
  check(again?.bytes.length === 3, "saving the same key overwrites rather than duplicates");

  const present = await repo.pageFilesPresent("a.myshopify.com", ["k1", "k2", "k3"]);
  check(
    present.length === 1 && present[0] === "k1",
    "only the keys that are really there come back",
    present.join(","),
  );
  check(
    (await repo.pageFilesPresent("a.myshopify.com", [])).length === 0,
    "and asking about nothing asks the database nothing",
  );
  /* THE SAME RULE ON THE OTHER SIDE, and this was missing until the guard was
     deliberately broken to see whether anything would notice. `getPageFile`
     checks the domain; if `pageFilesPresent` did not, one store's key would
     tell another store's deck "already built" and the download would then 404
     on a file it was promised. Two methods, one rule, and both are asserted. */
  check(
    (await repo.pageFilesPresent("b.myshopify.com", ["k1"])).length === 0,
    "AND ANOTHER STORE IS NOT TOLD IT IS ALREADY BUILT",
  );

  /* ── the prebuild ────────────────────────────────────────────────────── */
  head("the deck is converted once, and only once");
  const deck = [page("h", "Home", MOCKUP), page("p", "Product", MOCKUP.replace("Hi", "Buy"))];

  asked().length = 0;
  await prebuildFiles("shop.myshopify.com", deck);
  const firstRound = asked().length;
  check(firstRound > 0, "the first run converts", `${firstRound} model call(s)`);

  const stored = await Promise.all(
    deck.map((p) => repo.getPageFile("shop.myshopify.com", fileKeyFor(p)!)),
  );
  check(stored.every((f) => f !== null), "both pages have a file");
  check(
    stored.every((f) => f !== null && f.bytes.length > 100),
    "and the files are real archives",
    stored.map((f) => f?.bytes.length ?? 0).join(", "),
  );
  check(
    stored[0]?.filename === "Home.pagefly" && stored[1]?.filename === "Product.pagefly",
    "named after the page",
    stored.map((f) => f?.filename).join(", "),
  );

  /* THE CHECK THIS FILE EXISTS FOR. */
  asked().length = 0;
  await prebuildFiles("shop.myshopify.com", deck);
  check(
    asked().length === 0,
    "A SECOND RUN OVER THE SAME DECK CALLS THE MODEL ZERO TIMES",
    `${asked().length} call(s)`,
  );

  /* A page added to a deck that is already converted costs only itself. */
  asked().length = 0;
  const grown = [...deck, page("c", "Contact", MOCKUP.replace("Hi", "Say hello"))];
  await prebuildFiles("shop.myshopify.com", grown);
  const third = await repo.getPageFile("shop.myshopify.com", fileKeyFor(grown[2])!);
  check(third !== null, "a page added later is converted");
  check(
    asked().length > 0 && asked().length < firstRound + 1,
    "and the two already done are not converted again",
    `${asked().length} call(s) for one page`,
  );

  /* ── failure ─────────────────────────────────────────────────────────── */
  head("a conversion that fails costs nothing else");
  (globalThis as { __PFD_REPLY?: unknown }).__PFD_REPLY = "not json at all";
  let threw = false;
  try {
    await prebuildFiles("shop.myshopify.com", [page("bad", "Broken", MOCKUP.replace("Hi", "Nope"))]);
  } catch {
    threw = true;
  }
  check(!threw, "it does not throw — the build is already finished and must not be undone");
  check(
    (await repo.getPageFile("shop.myshopify.com", fileKeyFor(page("bad", "Broken", MOCKUP.replace("Hi", "Nope")))!)) === null,
    "and stores nothing, so the export click will try again",
  );

  console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
}

void main();
