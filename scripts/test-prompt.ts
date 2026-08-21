/* ==========================================================================
   Does a filed reading reach the prompt when the merchant uploaded a reference?

       npx tsx scripts/test-prompt.ts

   It used to not, by design: the training block was skipped outright whenever
   `refSections` had anything in it. The reasoning was that two descriptions of
   one thing make a model reconcile instead of build — sound, and about a case
   this was not. A page screenshot says WHICH sections and in WHAT ORDER; a filed
   reading says how ONE element is built. Dropping the second lost detail and
   gained nothing, and it lost it for the merchant who had bothered to upload.

   So the behaviour is now "always", plus a line ranking the two sources, and
   that line appears only when there IS a second source. Both of those are
   invisible to the type checker — a spread of an empty array typechecks
   perfectly — which is what this script is for.

   The provider is stubbed. No key, no network, no bill.
   ========================================================================== */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const hit = resolve_.call(this, request, ...args);
  /* Matched on where it resolved TO, not on what was written. "./provider" is a
     relative path several modules could own, and swapping the wrong one would
     look like this test passing. */
  return /lib[/\\]ai[/\\]provider\.ts$/.test(hit) ? require_.resolve("./provider-stub.cjs") : hit;
} as never;

const dir = mkdtempSync(join(tmpdir(), "pfd-prompt-"));
const store = join(dir, "store.json");
process.env.PFD_DB_FILE = store;
process.env.USE_PLAN = "true";
/* The vision path is a different provider and is not stubbed. Nothing here
   should reach it, and an absent key makes sure of that. */
delete process.env.ANTHROPIC_API_KEY;

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const RANKING = "the reference wins on the section, the filing wins inside the element";
const FILING = "gallery left, buy box right";

/* The prompt is written as fixed-width lines, so a sentence in it is not a
   substring of it — the first version of this test looked for the ranking and
   "failed" on a line break. Compare on the text with its line breaks flattened. */
const flat = (s: string) => s.replace(/\s+/g, " ");

async function main(): Promise<void> {
  const { createMemoryRepo } = await import("../lib/db/memoryRepo");
  const seed = createMemoryRepo(store);
  const now = new Date().toISOString();
  await seed.saveTrainingSection({
    id: "ProductBox-all",
    element: "ProductBox",
    vertical: null,
    note: null,
    analysis: "STRUCTURE: gallery left, buy box right, thumbnails under the main image.",
    analysedAt: now,
    enabled: true,
    images: [{ src: "data:image/png;base64,AA", note: null }],
    createdAt: now,
    updatedAt: now,
  });

  const { designPageTree } = await import("../lib/ai/designServer");
  const asked = globalThis as unknown as { __PFD_ASKED: { user: string }[] };

  const base = {
    sell: "wireless headphones",
    prompt: "",
    storeType: "single-product",
    style: "editorial",
    styleLabel: "Editorial",
    styleBlurb: "Type-led, generous space",
    density: "normal",
    reference: null,
    refStyle: null,
    verticalSlug: "audio",
    storeDomain: "test.myshopify.com",
    deckSize: 1,
    pageLabel: "Product",
    pageType: "product",
    tokens: {
      bg: "#FFFFFF",
      ink: "#111111",
      accent: "#FF6A1F",
      band: "#F5F5F3",
      border: "#E4E4E1",
      fontHeading: "Inter",
      fontBody: "Inter",
      radius: 8,
    },
  };

  console.log("no reference uploaded");
  await designPageTree({ ...base, refSections: null } as never);
  const plain = asked.__PFD_ASKED.at(-1)?.user ?? "";
  check(flat(plain).includes(FILING), "the filing is in the prompt");
  check(!flat(plain).includes(RANKING), "and no ranking line, because there is nothing to rank");

  console.log("\na reference uploaded — the case that used to drop the filing");
  await designPageTree({
    ...base,
    refSections: ["hero with a product shot", "product detail", "reviews", "footer cta"],
  } as never);
  const withRef = asked.__PFD_ASKED.at(-1)?.user ?? "";
  check(flat(withRef).includes(FILING), "the filing is STILL in the prompt");
  check(flat(withRef).includes(RANKING), "and the ranking line is there too");
  check(
    withRef.includes("product detail"),
    "the merchant's own section list is there as well — both sources, not one",
  );

  /* The two must not arrive as one undifferentiated wall of advice. The ranking
     is only useful if it comes before the filings it ranks. */
  const at = (needle: string) => flat(withRef).indexOf(needle);
  check(
    at(RANKING) >= 0 && at(RANKING) < at(FILING),
    "the ranking is stated before the filings it applies to",
    `ranking at ${at(RANKING)}, filing at ${at(FILING)}`,
  );

  rmSync(dir, { recursive: true, force: true });

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
