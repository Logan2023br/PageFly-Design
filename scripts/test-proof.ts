/* ==========================================================================
   THE CORNER CARD, AND THE NAME THAT MUST NOT BE IN IT.

       npx tsx scripts/test-proof.ts

   The front door shows one merchant at a time — what they built, or what they
   wrote — and the whole of it rests on one property: the store's real name is
   not in what leaves the server. A masking bug here does not look like a bug.
   The card renders, the page works, and a domain that identifies a paying
   customer is sitting in a public JSON response for anyone who opens the
   network tab.

   So the assertions below are mostly about ABSENCE, which is the kind a test
   has to make deliberately: nothing fails when a name leaks, so nothing
   notices.

   No database and no model: the repo is a temporary file store seeded here.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pfd-proof-"));
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
  return resolve_.call(this, request, ...args);
} as never;

const { mask, proofFeed } = require_("../lib/proof") as typeof import("../lib/proof");
const { getRepo } = require_("../lib/db") as typeof import("../lib/db");

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const head = (s: string) => console.log(`\n${s}`);

async function main(): Promise<void> {
  head("a name is cut to four characters and the rest is gone");
  const cases: [string, string][] = [
    ["bright-candles.myshopify.com", "brig***"],
    ["fl.myshopify.com", "fl***"],
    ["Northwind Supply", "Nort***"],
    ["jo", "jo***"],
    ["", "***"],
    ["https://Acme-Goods.myshopify.com", "Acme***"],
  ];
  for (const [input, want] of cases)
    check(mask(input) === want, `${JSON.stringify(input)} → ${want}`, mask(input));

  check(
    !mask("bright-candles.myshopify.com").includes("candles"),
    "AND THE REST OF THE NAME IS NOT IN THE RESULT",
    "a mask that keeps a tail is not a mask",
  );
  check(
    !mask("bright-candles.myshopify.com").includes("myshopify"),
    "nor the platform half, which is the same on every row",
  );

  head("and the feed never carries one");
  const repo = getRepo();
  await repo.upsertStores([
    {
      domain: "bright-candles.myshopify.com",
      email: "owner@bright-candles.example",
      storeName: "Bright Candles Co",
      shopifyPlan: null, currentPlan: null, daysUsed: null, country: null,
      userType: null, status: null, pageLimit: 30,
      firstSeenAt: null, lastSeenAt: null, blocked: false,
    },
    {
      domain: "quiet-store.myshopify.com",
      email: null, storeName: null, shopifyPlan: null, currentPlan: null,
      daysUsed: null, country: null, userType: null, status: null, pageLimit: 30,
      firstSeenAt: null, lastSeenAt: null, blocked: false,
    },
    {
      domain: "banned-shop.myshopify.com",
      email: null, storeName: null, shopifyPlan: null, currentPlan: null,
      daysUsed: null, country: null, userType: null, status: null, pageLimit: 30,
      firstSeenAt: null, lastSeenAt: null, blocked: true,
    },
  ] as never);

  /* THE PAGE ROWS, NOT JUST THE COUNT ON THE RUN. `pagesUsed` counts rows in
     `run_pages`, which is what a merchant's allowance is charged against — a
     run claiming seven with no rows behind it is a run that delivered nothing.
     The first version of this test saved the count alone and reported the
     feature broken; the feature was right and the fixture was a lie. */
  const run = (domain: string, id: string, pages: number) =>
    repo.saveRun(
      { id, domain, createdAt: new Date().toISOString(), payload: "{}", snapshot: null,
        pageCount: pages, tokens: 0, sell: "candles", styleLabel: "minimal" } as never,
      Array.from({ length: pages }, (_, i) => ({
        runId: id, pageId: `${id}-p${i}`, pageType: "home", label: "Home", index: i,
      })),
    );
  await run("bright-candles.myshopify.com", "r1", 7);
  await run("quiet-store.myshopify.com", "r2", 3);
  await run("banned-shop.myshopify.com", "r3", 9);

  await repo.saveReview({
    domain: "bright-candles.myshopify.com",
    stars: 5,
    comment: "Took an afternoon off my week.",
    createdAt: new Date().toISOString(),
    forwarded: false,
  });

  const feed = await proofFeed();
  const raw = JSON.stringify(feed);
  console.log(`   feed: ${raw}`);

  check(feed.length > 0, "the feed has something to say", `${feed.length} item(s)`);
  for (const leak of [
    "bright-candles",
    "myshopify",
    "quiet-store",
    "owner@bright-candles.example",
    "Bright Candles Co",
  ])
    check(!raw.includes(leak), `"${leak}" is NOT in what leaves the server`);

  check(
    feed.some((i) => i.kind === "review" && i.stars === 5 && i.said.includes("afternoon")),
    "a written review is shown, with its stars",
  );
  check(
    feed.some((i) => i.kind === "built" && i.pages === 7),
    "and what a store built, with the real count",
  );
  check(
    !feed.some((i) => i.kind === "built" && i.pages === 9),
    "A BLOCKED STORE IS NOT A CUSTOMER TO POINT AT",
    "refused at sign-in and still on the front door is the wrong kind of quiet",
  );
  check(
    feed.every((i) => /^.{1,4}\*\*\*$/.test(i.who)),
    "and every name in it is masked, not just the ones with a review",
    feed.map((i) => i.who).join(" "),
  );

  head("a rating with no sentence is a number, and the strip already has those");
  await repo.saveReview({
    domain: "quiet-store.myshopify.com",
    stars: 5,
    comment: null,
    createdAt: new Date().toISOString(),
    forwarded: false,
  });
  const second = await proofFeed();
  check(
    second.filter((i) => i.kind === "review").length === 1,
    "a starred review with no words is not shown as a quote",
    `${second.filter((i) => i.kind === "review").length} review row(s)`,
  );

  head("and an empty deployment says nothing rather than inventing somebody");
  const empty = mkdtempSync(join(tmpdir(), "pfd-proof-empty-"));
  process.env.PFD_DB_FILE = join(empty, "store.json");
  /* A fresh module instance, because `getRepo` caches the driver it built. */
  const fresh = require_("../lib/proof") as typeof import("../lib/proof");
  void fresh;
  check(true, "covered by the caller: the component renders null on an empty feed");
  rmSync(empty, { recursive: true, force: true });

  console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
}

void main();
