/* ==========================================================================
   Can the brief refuse itself?

       npx tsx scripts/test-brief.ts

   `briefSchema` is the gate between the form and the generator, and it had no
   test. What that cost: `slices` was bounded at 4 while the slicer that fills it
   produced up to 6, so attaching a tall screenshot made the whole brief invalid.
   `start()` refused it without a word, and the symptom reaching me was "the
   Create button does nothing when I add an image" — three commits of narrowing
   away from a number in a file.

   So this tests the gate from the outside: for every field the FORM can fill,
   does the value the form is capable of producing get through? A limit that
   disagrees with the thing producing the value is the bug class, and it cannot
   be caught by reading either file alone.
   ========================================================================== */

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

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { validateBrief, firstMissing } = await import("../lib/validation");
  const {
    MAX_BRAND_COLORS,
    MAX_IMAGES,
    MAX_PROMPT_CHARS,
    MAX_SELL_CHARS,
    MAX_SLICES,
    STORE_TYPE_IDS,
  } = await import("../lib/briefOptions");
  const { VISUAL_STYLE_IDS } = await import("../lib/styleTokens");
  const { VERTICAL_CHIPS } = await import("../lib/verticals");
  const { PAGE_CATEGORIES, MAX_PER_PAGE } = await import("../lib/pageCatalog");

  const px = "data:image/png;base64,AA";
  const image = (slices: number) => ({
    id: "shot.png-1-1",
    name: "shot.png",
    url: "blob:http://x/1",
    type: "image/png",
    size: 900_000,
    palette: ["#E8C9A0", "#0B0710"],
    dataUrl: px,
    slices: Array.from({ length: slices }, () => px),
    surface: { bg: "#0B0710", ink: "#F5EFE6" },
    layout: { bands: [], density: 0.6, lightness: 0.2, alternating: false },
  });

  const draft = (over: Record<string, unknown> = {}) => ({
    whatYouSell: "Cordless professional lamp",
    verticalSlug: null,
    visualStyle: "editorial",
    storeType: STORE_TYPE_IDS[0],
    prompt: "",
    brandColors: [],
    referenceImages: [],
    pages: { home: 1 },
    ...over,
  });

  const why = (d: unknown) => {
    const r = validateBrief(d as never);
    if (r.success) return null;
    const i = r.error.issues[0];
    return `${i.path.join(".")}: ${i.message}`;
  };

  /* ---- the one that actually happened ----------------------------------- */

  console.log(`a reference image, sliced every way the slicer can slice it (max ${MAX_SLICES})`);
  for (let n = 0; n <= MAX_SLICES; n++) {
    const bad = why(draft({ referenceImages: [image(n)] }));
    check(bad === null, `${n} slice${n === 1 ? "" : "s"} accepted`, bad);
  }

  /* Above the ceiling the slicer can reach, the brief must still be USABLE.
     These are our own derived pieces, not something a merchant typed, and a
     build that loses them falls back to the thumbnail — worse, and still a page.
     Refusing the brief instead is how this bug presented. */
  const overflow = validateBrief(draft({ referenceImages: [image(MAX_SLICES + 4)] }) as never);
  check(overflow.success, "more slices than the slicer can produce is still a valid brief");
  if (overflow.success)
    check(
      overflow.data.referenceImages[0].slices === undefined,
      "and the overflow is dropped rather than kept at the wrong size",
    );

  /* ---- a full house, every optional field filled ------------------------ */

  console.log("\nevery field the form can fill, at its limit");
  const full = draft({
    whatYouSell: "x".repeat(MAX_SELL_CHARS),
    prompt: "y".repeat(MAX_PROMPT_CHARS),
    verticalSlug: VERTICAL_CHIPS[0].slug,
    visualStyle: VISUAL_STYLE_IDS[VISUAL_STYLE_IDS.length - 1],
    storeType: STORE_TYPE_IDS[STORE_TYPE_IDS.length - 1],
    brandColors: Array.from({ length: MAX_BRAND_COLORS }, (_, i) =>
      `#${(0x111111 * (i + 1)).toString(16).padStart(6, "0").slice(0, 6)}`,
    ),
    referenceImages: Array.from({ length: MAX_IMAGES }, () => image(MAX_SLICES)),
    pages: { home: MAX_PER_PAGE },
  });
  check(why(full) === null, "the maximum brief is a valid brief", why(full));

  /* An upload the browser could not decode keeps its thumbnail and loses
     everything derived — the `catch` path in ImageUpload. It must still build. */
  console.log("\nan image the browser could not read");
  const bare = {
    id: "weird.png-1-1",
    name: "weird.png",
    url: "blob:http://x/2",
    type: "image/png",
    size: 4_000,
    palette: [],
  };
  check(why(draft({ referenceImages: [bare] })) === null, "accepted with nothing derived");

  /* ---- the two rules must not disagree about readiness ------------------ */

  console.log("\nthe button and the schema must agree");
  /* `firstMissing` decides whether Create is enabled; `briefSchema` decides
     whether it does anything. A brief the first calls ready and the second
     refuses is a button that silently does nothing — the shape of this whole
     bug, independent of which field caused it. */
  const cases: [string, unknown][] = [
    ["nothing filled in", { ...draft({ whatYouSell: "", visualStyle: null, storeType: null, pages: {} }) }],
    ["a tall reference image", draft({ referenceImages: [image(MAX_SLICES)] })],
    ["six reference images", draft({ referenceImages: Array.from({ length: MAX_IMAGES }, () => image(3)) })],
    ["a vertical chip clicked", draft({ verticalSlug: VERTICAL_CHIPS[10].slug })],
    ["free text, no chip", draft({ verticalSlug: null })],
    ["every page type at once", draft({ pages: Object.fromEntries(
      PAGE_CATEGORIES.flatMap((c) => c.pages.map((p) => [p.id, 0])).slice(0, 44).concat([["home", 1]]),
    ) })],
  ];
  for (const [label, d] of cases) {
    const ready = firstMissing(d as never) === null;
    const valid = validateBrief(d as never).success;
    check(ready === valid, `${label}: button ${ready ? "on" : "off"}, schema ${valid ? "ok" : "no"}`, why(d));
  }

  /* ---- which brief made this page --------------------------------------- */

  /* `loadLibrary` merges every saved run into ONE deck and keeps only the last
     run's brief in `brief`. A panel that reads that field shows run Z's brief on
     a page built by run A — correct-looking and wrong. The second case below is
     that exact bug. */

  console.log("\nwhich brief made this page");

  const { briefForPage } = await import("../lib/briefForPage");

  /* `validateBrief` returns a zod safeParse union, so `.data` only exists on
     the success arm — narrowing here rather than `!` keeps this compiling under
     the repo's strict TS, and turns a broken fixture into a clear failure. */
  const parseOk = (over: Record<string, unknown>) => {
    const r = validateBrief(draft(over) as never);
    if (!r.success) throw new Error("test fixture is not a valid brief");
    return r.data;
  };

  const briefA = parseOk({ whatYouSell: "Run A cookware" });
  const briefZ = parseOk({ whatYouSell: "Run Z candles" });
  const byRun = { "run-a": briefA, "run-z": briefZ };

  check(
    briefForPage({}, briefZ, {}) === briefZ,
    "a normal build: a page with no runId gets the brief in state",
  );

  check(
    briefForPage({ runId: "run-a" }, briefZ, byRun) === briefA,
    "a Library page gets ITS run's brief, not the last run's",
    briefForPage({ runId: "run-a" }, briefZ, byRun)?.whatYouSell,
  );

  check(
    briefForPage({ runId: "run-z" }, briefZ, byRun) === briefZ,
    "and a page from the last run still gets its own",
  );

  check(
    briefForPage({ runId: "run-missing" }, briefZ, byRun) === null,
    "a runId with no brief resolves to null rather than the wrong brief",
    String(briefForPage({ runId: "run-missing" }, briefZ, byRun)?.whatYouSell),
  );

  /* ---- a saved run stays under the ceiling ------------------------------ */

  /* `/api/runs` refuses a payload over MAX_RUN_PAYLOAD_CHARS. Reference
     thumbnails are the only part of a brief that can be large, so they are the
     only part that can push a run over it — and a refused POST loses the deck,
     not the pictures. The encoder drops them instead; this is that promise. */

  console.log("\nwhat a saved run may weigh");

  const { encodeRunPayload, MAX_RUN_PAYLOAD_CHARS } = await import("../lib/runPayload");

  const withImages = (thumbBytes: number) =>
    parseOk({
      referenceImages: Array.from({ length: 6 }, (_, i) => ({
        id: `img-${i}`,
        name: `Screenshot ${i}.png`,
        url: `blob:http://localhost/${i}`,
        dataUrl: `data:image/webp;base64,${"D".repeat(200_000)}`,
        thumbUrl: `data:image/webp;base64,${"T".repeat(thumbBytes)}`,
        type: "image/png",
        size: 1_200_000,
      })),
    });

  /* Realistic: a 256px webp is 8-20KB, so six is well inside the ceiling. */
  const normal = encodeRunPayload(withImages(20_000), {});
  check(
    normal.length <= MAX_RUN_PAYLOAD_CHARS,
    "six normal thumbnails fit",
    `${normal.length} / ${MAX_RUN_PAYLOAD_CHARS}`,
  );
  check(normal.includes("TTTT"), "and the thumbnails are actually kept");
  check(
    !normal.includes("DDDD"),
    "while the 1024px copies are not — they are what would break it",
  );

  /* Absurd, to prove the guard fires rather than the POST failing. */
  const huge = encodeRunPayload(withImages(60_000), {});
  check(
    huge.length <= MAX_RUN_PAYLOAD_CHARS,
    "thumbnails too heavy to fit are dropped, not the run",
    `${huge.length} / ${MAX_RUN_PAYLOAD_CHARS}`,
  );
  check(
    huge.includes("Screenshot 0.png"),
    "the reference is still listed by name after its picture is dropped",
  );

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
