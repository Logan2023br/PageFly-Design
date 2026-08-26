/* ==========================================================================
   Markets, without a model.

   The assertion that matters most here is a NEGATIVE one — a brief with no
   market must produce the byte-identical prompt it produced before markets
   existed. A feature that quietly moves every prompt is a feature that
   invalidates every measurement taken before it. That one lives in the plan's
   Task 4 because it needs the prompts; everything here is the file and the
   list agreeing with each other.

       npx tsx scripts/test-market.ts

   No network. No API key.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

/* See scripts/server-only.cjs — Node cannot resolve the real package outside a
   Next build, and every module in the pipeline imports it. */
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
  const { MARKET_IDS, MARKETS, isKnownMarket } = await import("@/lib/briefOptions");
  const { sliceSkill, sliceIds } = await import("@/lib/ai/skills");

  console.log("\nthe list and the file agree");

  /* Both directions. An id with no block offers the merchant a market that
     teaches the model nothing; a block with no id is knowledge nobody can
     reach. Either one is silent, which is why both are asserted. */
  const inFile = new Set(sliceIds("markets"));
  for (const id of MARKET_IDS)
    check(inFile.has(id), `${id} has a block`, inFile.has(id) ? null : "missing from 60-markets.md");
  for (const id of inFile)
    check(
      isKnownMarket(id),
      `the block "${id}" is a listed market`,
      isKnownMarket(id) ? null : "block exists but no id offers it",
    );
  check(MARKETS.length === MARKET_IDS.length, "every id has a label");

  console.log("\nslicing");

  const india = sliceSkill("markets", ["in"]);
  check(india.length > 0, "a real market slices to something");
  check(india.includes("UPI"), "India's block names UPI");
  check(!india.includes("Alipay"), "and carries no other market with it");

  check(sliceSkill("markets", ["latvia"]).trim() === "", "an unknown id slices to nothing");
  check(sliceSkill("markets", []).trim() === "", "no ids slices to nothing");

  console.log("\nthe blocks stay commercial");

  /* A market that described colour or type would be overriding a control the
     merchant actively pressed, and would be exactly the caricature this feature
     was designed to avoid. */
  const banned = ["font-size", "typeface", "saturated", "colour palette", "color palette"];
  for (const id of MARKET_IDS) {
    const body = sliceSkill("markets", [id]).toLowerCase();
    const hit = banned.find((w) => body.includes(w));
    check(!hit, `${id} describes no visual style`, hit ?? null);
  }

  console.log("\nvalidation");

  check(isKnownMarket("in"), "a listed market is known");
  check(!isKnownMarket("xx"), "an unlisted one is not");
  check(!isKnownMarket(""), "and neither is nothing");

  console.log(`\n${failures === 0 ? "PASS" : `${failures} FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
