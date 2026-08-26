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

  /* Every market gets the same instruction. The first cut of this file gave a
     dozen of them the real brief and told the rest not to invent anything,
     which did not prevent invention — it prevented knowledge, and left forty
     pages addressed to nobody while looking addressed to someone. */
  const india = marketLines("in").join("\n");
  const portugal = marketLines("pt").join("\n");

  for (const [name, body] of [["India", india], ["Portugal", portugal]] as const) {
    check(body.includes("Build the page for shoppers THERE"), `${name} is asked to build for it`);
    check(body.includes("how people pay"), `${name} is asked about payment`);
    check(body.includes("returns window"), `${name} is asked about returns`);
    check(body.includes("say less"), `${name} is told to stop where it is unsure`);
  }

  check(portugal.includes("Português"), "an unanchored market carries its language");
  check(portugal.includes("58,00"), "and its number format");
  check(portugal.includes("Portugal"), "and names itself, three times over");
  check(
    !portugal.includes("UPI") && !portugal.includes("Alipay"),
    "carrying no other market's specifics with it",
  );

  check(india.includes("UPI"), "an anchored one adds the exact wording on top");
  check(india.includes("it was checked"), "and says which side wins if they disagree");
  check(india.length > portugal.length, "the anchored brief is the longer one");

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
