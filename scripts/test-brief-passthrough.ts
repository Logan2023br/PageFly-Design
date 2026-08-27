/* ==========================================================================
   Does every answer the form collects actually reach the build?

       npx tsx scripts/test-brief-passthrough.ts

   Two front doors now fill one brief. Build Detail asks nine questions, Build
   Quickly asks three and has a model answer three more — and the whole design
   rests on the claim that the brief leaving either one is indistinguishable
   downstream. Nothing was checking that claim.

   The failure it guards against is silent by construction. A field added to the
   form and never wired to the generator does not throw: the merchant fills it
   in, the build succeeds, and the page ignores it. Nobody finds out from an
   error — they find out from a page that does not look like what they asked
   for, months later, if ever.

   So this tests the claim in three ways, weakest last:

     1. BEHAVIOURAL — change one field, and the deterministic page changes.
        This is proof: it does not care how the value travels, only that it
        arrives somewhere that matters.

     2. CONTRACT — a fully-filled brief survives the JSON hop to `/api/build`
        and the `briefSchema` parse at the other end, field for field.

     3. STATIC — every key of `Brief` is read by name somewhere in the build
        path. Weakest of the three, and the only one that catches a field whose
        effect this script cannot yet observe.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

/* `mock.ts` pulls in modules that import `server-only`, which throws outside a
   Next server. Same shim as `scripts/test-brief.ts`. */
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

import { readFileSync } from "node:fs";

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { validateBrief, briefSchema } = await import("../lib/validation");
  const { buildPage } = await import("../lib/generate/mock");
  const { encodeRunPayload, decodeRunPayload } = await import("../lib/runPayload");
  const { verticalOf } = await import("../lib/design/plan");
  const { marketLines } = await import("../lib/design/marketLines");

  const px = "data:image/png;base64,AA";

  /* Every field non-default and distinguishable, so a change to any one of them
     is visible in the output rather than lost against a default. */
  const FULL = {
    whatYouSell: "hand-thrown stoneware mugs",
    verticalSlug: null,
    visualStyle: "editorial",
    storeType: "b2b",
    market: "vn",
    prompt: "Quiet and specific. Colours #2F3B2F and #EFE7D8. Reviews and a size guide.",
    brandColors: ["#2F3B2F", "#EFE7D8"],
    referenceImages: [
      {
        id: "shot.png-1-1",
        name: "shot.png",
        url: "blob:http://x/1",
        type: "image/png",
        size: 900_000,
        palette: ["#E8C9A0", "#0B0710"],
        dataUrl: px,
        thumbUrl: px,
        surface: { bg: "#0B0710", ink: "#F5EFE6" },
        layout: { bands: [], density: "tight", lightness: 0.2, alternating: true, columns: 2 },
      },
    ],
    pages: { home: 1, product: 2 },
  };

  const parsed = validateBrief(FULL as never);
  if (!parsed.success) {
    console.log("  ✗ the fully-filled brief does not even validate");
    console.log(JSON.stringify(parsed.error.issues, null, 2));
    process.exitCode = 1;
    return;
  }
  const brief = parsed.data;

  const page = (over: Record<string, unknown> = {}) =>
    buildPage({
      brief: { ...brief, ...over } as never,
      pageType: "home",
      pageId: "home",
      index: 1,
      copyIndex: 1,
      copyTotal: 1,
      variant: 0,
    });

  const base = page();
  /* The whole page, as one comparable string. Comparing whole pages rather than
     named properties is deliberate: a field that lands in a heading, a colour, a
     section count or an image query all count as arriving, and naming the place
     in advance would only test the places this script thought of. */
  const shape = (p: unknown) => JSON.stringify(p);
  const baseShape = shape(base);

  console.log("\n1. BEHAVIOURAL — change one answer, the page changes");

  const MOVES: { field: string; to: unknown; why: string }[] = [
    { field: "whatYouSell", to: "titanium travel razors", why: "headings and product names" },
    { field: "visualStyle", to: "neubrutalist", why: "palette, type and radius" },
    { field: "storeType", to: "single-product", why: "navigation and calls to action" },
    { field: "prompt", to: "Loud, saturated, huge type. Colour #FF0000.", why: "read for signals" },
    { field: "brandColors", to: ["#FF0000"], why: "feeds styleToTokens" },
    { field: "referenceImages", to: [], why: "reference colour and layout hints" },
  ];

  for (const move of MOVES) {
    check(
      shape(page({ [move.field]: move.to })) !== baseShape,
      `${move.field} reaches the page`,
      move.why,
    );
  }

  /* `market` and `verticalSlug` land at the MODEL stage, not on the
     deterministic page, so `buildPage` is the wrong place to look for them.
     Their consumers are pure functions and can be asked directly — which is a
     stronger check than the page comparison above, not a weaker one. */

  check(
    marketLines(brief.market).length > 0 && marketLines(null).length === 0,
    "market reaches the prompt",
    `${marketLines(brief.market).length} lines for ${brief.market}, none for null`,
  );
  check(
    marketLines("vn").join() !== marketLines("us").join(),
    "and two markets are not the same lines",
  );
  check(
    verticalOf({ whatYouSell: "anything at all", verticalSlug: "skincare" } as never) !==
      verticalOf({ whatYouSell: "anything at all", verticalSlug: null } as never),
    "verticalSlug reaches the resolver",
    "a clicked chip resolves differently from the same words typed",
  );

  /* And the negative control. Without one, every check above would pass on a
     `buildPage` that simply returned something different each call. */
  check(
    shape(page()) === baseShape,
    "and the same brief twice gives the same page",
    "so the checks above measure the field, not the noise",
  );

  console.log("\n2. CONTRACT — the brief survives the hop to /api/build");

  /* What `startJob` does to it, and what the route does at the other end. */
  const overWire = briefSchema.safeParse(JSON.parse(JSON.stringify(brief)));
  check(overWire.success, "a fully-filled brief parses on the server");

  if (overWire.success) {
    for (const key of Object.keys(brief) as (keyof typeof brief)[]) {
      check(
        JSON.stringify(overWire.data[key]) === JSON.stringify(brief[key]),
        `${key} arrives unchanged`,
      );
    }
  }

  /* The Library's path, which is a second serialisation with its own rules —
     `dataUrl` is dropped there on purpose, so the reference is compared by the
     fields that are meant to survive. */
  const decoded = decodeRunPayload(encodeRunPayload(brief, {}));
  check(decoded.ok, "and survives being saved and reopened");
  if (decoded.ok) {
    for (const key of ["whatYouSell", "visualStyle", "storeType", "market", "prompt", "brandColors", "pages"] as const) {
      check(
        JSON.stringify(decoded.payload.brief[key]) === JSON.stringify(brief[key]),
        `${key} survives the Library round trip`,
      );
    }
    check(
      decoded.payload.brief.referenceImages.length === brief.referenceImages.length,
      "and the references are still listed",
    );
  }

  console.log("\n3. STATIC — every field of the brief is read by name");

  /* Read once. A field nothing reads is a field the form collects for nothing,
     and that is exactly the state a new question arrives in. */
  const sources = [
    "lib/build/runner.ts",
    "lib/generate/mock.ts",
    "lib/generate/content.ts",
    "lib/ai/refVision.ts",
    "lib/ai/designServer.ts",
    "lib/design/plan.ts",
    "lib/runPayload.ts",
  ];
  const haystack = sources
    .map((f) => {
      try {
        return readFileSync(f, "utf8");
      } catch {
        check(false, `${f} is missing — this list needs updating`);
        return "";
      }
    })
    .join("\n");

  for (const key of Object.keys(brief)) {
    check(
      haystack.includes(`brief.${key}`) || haystack.includes(`"${key}"`),
      `${key} is read somewhere in the build path`,
    );
  }

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
