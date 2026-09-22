/* ==========================================================================
   WHAT THE PAGE IS FOR, WRITTEN DOWN BEFORE IT IS DRAWN.

       npx tsx scripts/test-direction.ts

   Opus answers with a list of nodes and their numbers, and a list of nodes is
   a WHAT with no WHY in it. The model that builds the page is then given the
   furniture and not the argument: it can place every element correctly and
   still produce a page nobody would look at twice, which is the exact failure
   `THE_STANDARD` was written to stand against and cannot reach on its own —
   it speaks to the model deciding, not to the one building.

   So the answer opens with a `direction`: what a page of this type has to do,
   the two or three moves that make this one worth remembering, what moves and
   where, and what it deliberately leaves out. It is prose on purpose — the
   numbers are already in the nodes, and this is the part numbers cannot carry.

   Two properties, and the second is the one that would rot in silence:

     it survives the parse, clamped and trimmed
     it REACHES STAGE 3 — a direction that stops at the order is a paragraph
       written for nobody
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
};

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

const ORDER = {
  vertical: "x",
  archetype: "C" as const,
  patternIds: [],
  motionIds: [],
  sections: [
    { name: "opening", role: "hero", pattern: "opening", signature: false, dark: false, padding: "statement", mayHaveBg: true, spec: null },
  ],
};

async function main(): Promise<void> {
  const { vetDirection } = await import("../lib/design/specCheck");
  const { __orderLinesForTest } = await import("../lib/ai/designServer");

  console.log("\nwhat survives the parse");

  const written =
    "A product page has one job: make the material believable before the price " +
    "is read. The wash test carries this one — it is the only proof the store " +
    "has that a photograph cannot fake. Motion only where it means something.";
  check(vetDirection(written) === written, "a direction written as prose is kept whole");
  check(vetDirection("   ") === null, "whitespace is nothing", String(vetDirection("   ")));
  check(vetDirection(undefined) === null, "and so is a model that ignored the field");
  check(vetDirection(42) === null, "a number is not a direction", String(vetDirection(42)));
  const long = vetDirection("x".repeat(3000)) ?? "";
  check(long.length <= 1200, "a runaway answer is cut, not carried", String(long.length));

  console.log("\nand what reaches the model that builds the page");

  const without = __orderLinesForTest(ORDER as never, "#fff", "#111").join("\n");
  const withIt = __orderLinesForTest(
    { ...ORDER, direction: written } as never,
    "#fff",
    "#111",
  ).join("\n");

  check(
    withIt.includes("make the material believable"),
    "the direction is in the prompt stage 3 is given",
    withIt.includes("make the material believable") ? "" : "(absent)",
  );
  check(
    withIt.indexOf("make the material believable") < withIt.indexOf("opening"),
    "and stands before the bands, because it is why they are there",
  );
  /* THE OLD PATH MUST NOT MOVE. A page whose spec carried no direction has to
     produce the block it produced before this existed — the same property
     `__orderLinesForTest` was exported for in the first place. */
  check(
    !without.includes("THE DIRECTION"),
    "an order without one says nothing about it at all",
    without.slice(0, 60),
  );

  /* ======================================================================
     AND WHEN THE DESIGNING MODEL NEVER ANSWERED.

     A real build: `free design · product → no design — the call failed:
     Anthropic returned 400 · You have reached your specified API usage
     limits`. Stage 2 was gone, and the build did not stop — it handed stage 3
     the brief and nothing else. Input fell from 8,441 tokens to 1,492, which
     is the whole design stage measured by its absence.

     What came back was a good-looking HOME page, for a build that asked for a
     product page. Nothing was wrong with the model: the brief described a
     whole store and leaned hardest on a homepage, `Design this page: Product`
     was one line against two hundred, and the only other thing said about the
     page type was how many sections it should have.

     So when no direction arrives — the stage failed, or the model skipped the
     field — stage 3 is told what a page of this type is FOR. It is the part
     `direction` would have carried, written once per type instead.
     ====================================================================== */
  console.log("\nwhen the designing model never answered");

  const { pageTypeBrief } = await import("../lib/design/sectionPlan");

  const product = pageTypeBrief("product");
  check(/product/i.test(product), "a product page is told it is a product page", product.slice(0, 60));
  check(
    /price|believab|buy/i.test(product),
    "and what it has to do before the price is read",
    product.slice(0, 90),
  );
  const home = pageTypeBrief("home");
  check(home !== product, "a home page is told something else entirely");
  check(
    /store|deeper|kind of/i.test(home),
    "about saying what kind of store this is",
    home.slice(0, 90),
  );
  check(pageTypeBrief("collection").length > 0, "and a collection page has its own");
  check(pageTypeBrief("nonsense-type") === "", "a type nobody wrote gets nothing invented for it");

  /* It is a STAND-IN, so it must not be sent alongside the thing it stands in
     for — two answers to the same question, one of them written for this page
     and one written for every page of its kind. */
  const withDirection = __orderLinesForTest(
    { ...ORDER, direction: written } as never,
    "#fff",
    "#111",
  ).join("\n");
  check(
    !withDirection.includes(pageTypeBrief("product").slice(0, 40)),
    "and it is not sent when a real direction was written",
  );

  console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
  if (bad > 0) process.exitCode = 1;
}

void main();
