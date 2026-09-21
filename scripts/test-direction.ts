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

  console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
  if (bad > 0) process.exitCode = 1;
}

void main();
