/* ==========================================================================
   Does a filing reach the trade it was filed for?

       npx tsx scripts/test-training.ts

   One filing per element served every store on the platform: a headphone shop,
   a moisturiser and a sofa were handed the same reading of a `ProductBox`. That
   is the "every store looks the same" disease the resolver exists to treat,
   arriving through the one door left open.

   The lookup is now element AND trade, with a shared filing behind it, and this
   asserts the preference order — the one thing about the change that cannot be
   read off the types. Run against a temporary store file so it neither reads nor
   writes the real one.
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
  return resolve_.call(this, request, ...args);
};

let failures = 0;
/* `detail` takes null as well as undefined, because most of what gets passed
   here is a nullable database column and a test that will not compile is a test
   that does not run. */
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "pfd-training-"));
  const { createMemoryRepo } = await import("../lib/db/memoryRepo");
  const repo = createMemoryRepo(join(dir, "store.json"));

  const now = new Date().toISOString();
  const filing = (element: string, vertical: string | null, analysis: string) => ({
    id: `${element}-${vertical ?? "all"}`,
    element,
    vertical,
    note: null,
    analysis,
    analysedAt: now,
    enabled: true,
    images: [{ src: "data:image/png;base64,AA", note: null }],
    createdAt: now,
    updatedAt: now,
  });

  await repo.saveTrainingSection(filing("ProductBox", null, "the shared reading"));
  await repo.saveTrainingSection(filing("ProductBox", "audio", "the audio reading"));
  await repo.saveTrainingSection(filing("Accordion3", null, "the shared accordion"));

  console.log("looking up ProductBox");

  const audio = await repo.getTrainingSectionByElementAndVertical("ProductBox", "audio");
  check(audio?.analysis === "the audio reading", "audio gets the audio filing", audio?.analysis ?? null);

  /* The trade with no filing of its own falls back — which is the whole reason
     null is allowed. A reading about how a thumbnail strip sits is worth having
     once, for everybody. */
  const skincare = await repo.getTrainingSectionByElementAndVertical("ProductBox", "skincare");
  check(
    skincare?.analysis === "the shared reading",
    "a trade with no filing falls back to the shared one",
    skincare?.analysis ?? null,
  );

  /* And a page with no trade at all — free text in Step 1 — still gets the
     shared filing rather than nothing. */
  const none = await repo.getTrainingSectionByElementAndVertical("ProductBox", null);
  check(none?.analysis === "the shared reading", "no trade named still finds the shared one");

  console.log("\nand what should NOT be found");

  const missing = await repo.getTrainingSectionByElementAndVertical("Slideshow", "audio");
  check(missing === null, "an element with no filing at all returns null");

  /* Case is not a second filing. The Postgres unique index is on
     lower(element), so the two drivers have to agree about that. */
  const cased = await repo.getTrainingSectionByElementAndVertical("productbox", "audio");
  check(cased?.analysis === "the audio reading", "the element name is matched case-insensitively");

  console.log("\nthe listing");
  const list = await repo.listTrainingSections();
  check(list.length === 3, "three filings", `${list.length}`);
  check(
    list.map((i) => `${i.element}/${i.vertical ?? "all"}`).join(" · ") ===
      "Accordion3/all · ProductBox/audio · ProductBox/all",
    "element first, then trade, shared last within an element",
    list.map((i) => `${i.element}/${i.vertical ?? "all"}`).join(" · "),
  );

  /* A row written before the column existed reads as the shared filing, which is
     what it was: one entry serving the whole platform. */
  const legacy = await repo.getTrainingSection("Accordion3-all");
  check(legacy?.vertical === null, "a filing with no trade reads as null, not undefined");

  rmSync(dir, { recursive: true, force: true });

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
