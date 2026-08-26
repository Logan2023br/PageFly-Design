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
  const { MARKETS, MARKET_IDS, DETAILED_MARKET_IDS, isKnownMarket, marketById } = await import(
    "@/lib/briefOptions"
  );
  const { sliceIds } = await import("@/lib/ai/skills");
  const { marketLines } = await import("@/lib/design/marketLines");

  console.log("\ntwo tiers, and the line between them holds");

  /* Both directions, and only for the tier that claims detail. A market flagged
     `detailed` with no block promises the merchant something it cannot deliver;
     a block nobody can reach is knowledge written and thrown away. Both fail
     silently, which is why both are asserted. */
  const inFile = new Set(sliceIds("markets"));
  for (const id of DETAILED_MARKET_IDS)
    check(inFile.has(id), `${id} claims detail and has a block`);
  for (const id of inFile)
    check(
      DETAILED_MARKET_IDS.includes(id),
      `the block "${id}" belongs to a market that claims it`,
    );
  check(DETAILED_MARKET_IDS.length === 12, "twelve are written up", String(DETAILED_MARKET_IDS.length));
  check(MARKETS.length > 40, "and the list is long enough to find yourself in", String(MARKETS.length));

  const ids = MARKET_IDS;
  check(new Set(ids).size === ids.length, "no id appears twice");
  check(
    MARKETS.every((m) => m.label && m.language && m.price),
    "every market names its language and how a price is written",
  );

  console.log("\nwhat a market tells the model");

  const india = marketLines("in").join("\n");
  check(india.includes("UPI"), "a written market carries its payment methods");
  check(india.includes("India"), "and names itself");

  const portugal = marketLines("pt").join("\n");
  check(portugal.includes("Português"), "an unwritten one carries its language");
  check(portugal.includes("58,00"), "and its number format");
  check(
    portugal.includes("do not invent"),
    "and says plainly that nothing else about it is known",
  );
  check(
    !portugal.includes("UPI") && !portugal.includes("Alipay"),
    "carrying no other market's customs with it",
  );
  check(portugal.length < india.length, "the honest brief is the shorter one");

  check(marketLines(null).length === 0, "no market says nothing at all");
  check(marketLines("latvia").length === 0, "an unknown id says nothing at all");

  console.log("\nvalidation");

  check(isKnownMarket("in"), "a written market is known");
  check(isKnownMarket("pt"), "so is a language-only one");
  check(!isKnownMarket("xx"), "an unlisted one is not");
  check(!isKnownMarket(""), "and neither is nothing");
  check(marketById("pt")?.detailed !== true, "and a language-only market does not claim detail");

  console.log(`\n${failures === 0 ? "PASS" : `${failures} FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
