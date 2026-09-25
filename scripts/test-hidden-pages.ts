/* ==========================================================================
   A PAGE AN OPERATOR HID, AND THE THREE THINGS THAT HAS TO MEAN.

       npx tsx scripts/test-hidden-pages.ts

   Hiding is one switch with three consequences, and they are held in different
   places — so it is entirely possible to get one and miss the others, and each
   miss looks like a different bug:

     THE MERCHANT MUST NOT SEE IT. Hidden but still listed is the operator's
     decision quietly not taken.

     IT MUST NOT COST THEM A SLOT. `pagesUsed` is what `canBuild` is measured
     against, so a hidden page that still counts is a merchant told they are
     out of room over a page nobody can show them — a bill for nothing.

     AND IT MUST COME BACK. Hiding is a toggle, not a delete; the row stays and
     the operator can put it back.

   The admin still sees it, because an operator cannot unhide what has
   disappeared from their own screen.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pfd-hidden-"));
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

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

const DOMAIN = "shop.myshopify.com";

async function main(): Promise<void> {
  const { getRepo } = await import("../lib/db");
  const repo = getRepo();

  await repo.upsertStores([
    {
      domain: DOMAIN, email: null, storeName: "Shop", shopifyPlan: null,
      currentPlan: null, daysUsed: null, country: null, userType: null,
      status: null, pageLimit: 3, firstSeenAt: null, lastSeenAt: null, blocked: false,
    },
  ] as never);

  await repo.saveRun(
    {
      id: "r1", domain: DOMAIN, createdAt: new Date().toISOString(), payload: "{}",
      snapshot: null, pageCount: 3, tokens: 0, sell: "x", styleLabel: "y",
    } as never,
    ["home", "product", "about"].map((t, i) => ({
      runId: "r1", pageId: `p-${t}`, pageType: t, label: t, index: i,
    })),
  );

  head("before anything is hidden");
  ok("three pages count", (await repo.pagesUsed(DOMAIN)) === 3, String(await repo.pagesUsed(DOMAIN)));
  const before = await repo.listRuns(DOMAIN);
  ok("and all three are listed", before[0].pages.length === 3, String(before[0].pages.length));
  ok(
    "none is hidden yet",
    before[0].pages.every((p) => p.hidden === false),
    JSON.stringify(before[0].pages.map((p) => p.hidden)),
  );

  head("hide one");
  await repo.setPageHidden("r1", "p-product", true);

  ok(
    "IT NO LONGER COSTS A SLOT",
    (await repo.pagesUsed(DOMAIN)) === 2,
    `${await repo.pagesUsed(DOMAIN)} — a hidden page that still counts bills a merchant for nothing`,
  );

  const after = await repo.listRuns(DOMAIN);
  ok(
    "the row is still there for the operator",
    after[0].pages.length === 3,
    "hiding is a toggle, not a delete — nobody can unhide what is gone",
  );
  const flags = Object.fromEntries(after[0].pages.map((p) => [p.pageId, p.hidden]));
  ok("and it is marked", flags["p-product"] === true, JSON.stringify(flags));
  ok("the others are not", flags["p-home"] === false && flags["p-about"] === false);

  head("and the allowance is measured from exactly that number");
  /* `currentAccount` needs a session, so the link is checked at the source:
     whatever decides `canBuild` must be the count that already excludes hidden
     pages. A second, separate count is how the two would drift. */
  const account = (await import("node:fs")).readFileSync("lib/account.ts", "utf8");
  ok(
    "canBuild is derived from pagesUsed",
    /canBuild:\s*pagesUsed\s*</.test(account),
    /canBuild:[^\n]*/.exec(account)?.[0] ?? "not found",
  );
  ok(
    "and pagesUsed comes from the repo",
    /repo\.pagesUsed\(/.test(account),
    "a second count of its own would drift from the one hiding changes",
  );

  head("hide the rest and the store is empty, not over quota");
  await repo.setPageHidden("r1", "p-home", true);
  await repo.setPageHidden("r1", "p-about", true);
  ok("nothing counts", (await repo.pagesUsed(DOMAIN)) === 0, String(await repo.pagesUsed(DOMAIN)));
  ok(
    "and all three rows survive",
    (await repo.listRuns(DOMAIN))[0].pages.length === 3,
  );

  head("AND IT COMES BACK");
  await repo.setPageHidden("r1", "p-product", false);
  ok("the slot returns", (await repo.pagesUsed(DOMAIN)) === 1, String(await repo.pagesUsed(DOMAIN)));
  const back = await repo.listRuns(DOMAIN);
  ok(
    "and the flag is off",
    back[0].pages.find((p) => p.pageId === "p-product")?.hidden === false,
  );

  head("a page nobody has is not an error");
  await repo.setPageHidden("r1", "does-not-exist", true);
  ok("nothing changed", (await repo.pagesUsed(DOMAIN)) === 1, String(await repo.pagesUsed(DOMAIN)));

  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(bad === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error("threw:", e);
  process.exit(1);
});
