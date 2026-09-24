/* ==========================================================================
   THE THỐNG KÊ NUMBERS, AND THE ONES THAT ARE WRONG WITHOUT LOOKING WRONG.

       npx tsx scripts/test-stats.ts

   Every figure on that screen is a count, and a count that is computed wrong
   is still a count. Nothing throws. The specific ways:

     A WINDOW THAT DOES NOT WINDOW. Drop the date clause from one of the seven
     queries behind this screen and it returns all-time figures under a button
     that says "7 days". Larger, plausible, and contradicted by nothing else on
     the page.

     A STORE THAT CLAIMED PAGES IT NEVER RECORDED counting as a store that
     built. The proof feed already has this rule for the same reason; the two
     must agree or the front door and the admin screen disagree about who is a
     customer.

     AN UNATTRIBUTED TOKEN FOLDED INTO A MODEL'S ROW. Runs from before
     per-model recording kept a count and no model. Credited to whichever model
     happens to be first, the row is a lie with a dollar sign on it.

   Seeded into the file-store driver; no database and no model.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pfd-stats-"));
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
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function main(): Promise<void> {
  const { getRepo } = await import("../lib/db");
  const repo = getRepo();

  await repo.upsertStores([
    { domain: "a.myshopify.com", country: "VN", lastSeenAt: ago(1), blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
    { domain: "b.myshopify.com", country: "US", lastSeenAt: ago(1), blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
    /* Signed in, never built. */
    { domain: "c.myshopify.com", country: "US", lastSeenAt: ago(1), blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
    /* On the list, never signed in. */
    { domain: "d.myshopify.com", country: null, lastSeenAt: null, blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
  ] as never);

  const run = (id: string, domain: string, when: string, types: string[], tokens: number) =>
    repo.saveRun(
      { id, domain, createdAt: when, payload: "{}", snapshot: null,
        pageCount: types.length, tokens, sell: "x", styleLabel: "y" } as never,
      types.map((t, i) => ({ runId: id, pageId: `${id}-p${i}`, pageType: t, label: t, index: i })),
    );

  /* Inside a seven-day window … */
  await run("r-recent-1", "a.myshopify.com", ago(2), ["home", "product", "product"], 1_000);
  await run("r-recent-2", "b.myshopify.com", ago(3), ["product", "collection"], 2_000);
  /* … and well outside it. */
  await run("r-old", "a.myshopify.com", ago(40), ["home", "home", "faq"], 9_000);

  /* A run that CLAIMED three pages and recorded none — the shape the proof
     feed's fixture once had by accident. */
  await repo.saveRun(
    { id: "r-empty", domain: "c.myshopify.com", createdAt: ago(2), payload: "{}", snapshot: null,
      pageCount: 3, tokens: 500, sell: "x", styleLabel: "y" } as never,
    [],
  );

  head("the window actually windows");
  const week = await repo.stats(7);
  const all = await repo.stats(0);
  ok("seven days counts only the recent pages", week.totalPages === 5, `${week.totalPages}`);
  ok("all time counts every page", all.totalPages === 8, `${all.totalPages}`);
  ok(
    "AND THE TWO ARE DIFFERENT",
    week.totalPages !== all.totalPages,
    "a window that returns the all-time figure is the failure this guards",
  );
  ok("the window is reported back", week.days === 7 && all.days === 0, `${week.days} / ${all.days}`);

  head("page types, which is what the tile opens into");
  const types = Object.fromEntries(week.pageTypes.map((t) => [t.type, t.pages]));
  ok("product is counted across both runs", types.product === 3, JSON.stringify(types));
  ok("home is counted once", types.home === 1);
  ok("the out-of-window faq is absent", !("faq" in types));
  ok(
    "and they are ordered commonest first",
    week.pageTypes[0]?.type === "product",
    week.pageTypes.map((t) => t.type).join(" "),
  );
  ok(
    "the parts add up to the total",
    week.pageTypes.reduce((n, t) => n + t.pages, 0) === week.totalPages,
    "a breakdown that does not sum to the tile above it is worse than none",
  );

  head("who is actually using it");
  ok("three stores signed in", all.activeStores === 3, `${all.activeStores}`);
  ok(
    "ONLY TWO BUILT — a claim with no page rows is not a build",
    all.builtStores === 2,
    `${all.builtStores}; c.myshopify.com claimed 3 pages and recorded none`,
  );
  ok("and the rest are signed in only", all.idleStores === 1, `${all.idleStores}`);
  ok("built and idle add up to signed in", all.builtStores + all.idleStores === all.activeStores);

  head("where they are");
  const geo = Object.fromEntries(all.countries.map((c) => [c.country, c.pages]));
  ok("vietnam has both of a's runs", geo.VN === 6, JSON.stringify(geo));
  ok("the us has b's", geo.US === 2);
  ok("a store that never built is not a country row", !Object.values(geo).includes(0));

  head("and the money");
  await repo.recordModelCall({
    id: "r-recent-1:0", createdAt: ago(2), domain: "a.myshopify.com", stage: "build",
    vendor: "anthropic", model: "claude-opus-5-5",
    input: 1_000_000, output: 100_000, cached: 0, reasoning: 0, costUsd: 4 + 2,
  });
  await repo.recordModelCall({
    id: "x1:0", createdAt: ago(2), domain: null, stage: "export",
    vendor: "deepseek", model: "deepseek-v4-flash",
    input: 273_566, output: 135_679, cached: 151_040, reasoning: 0, costUsd: 0.2005,
  });

  const spend = (await repo.stats(7)).spend;
  ok("both models have a row", spend.rows.length === 2, spend.rows.map((r) => r.model).join(" "));
  ok(
    "dearest first",
    spend.rows[0]?.model === "claude-opus-5-5",
    spend.rows.map((r) => `${r.model} $${r.costUsd}`).join(" · "),
  );
  ok(
    "the export call is in it at all",
    spend.rows.some((r) => r.model === "deepseek-v4-flash"),
    "this is the spend that was previously only console.logged",
  );

  /* `r-recent-2` and `r-empty` have no per-call rows: 2,000 + 500 tokens that
     belong to no model. */
  ok(
    "TOKENS WITH NO MODEL ARE KEPT APART",
    spend.unattributedTokens === 2_500,
    `${spend.unattributedTokens} — folding them into a model's row invents an attribution`,
  );
  ok(
    "and the total refuses to be a dollar figure while any are unattributed",
    spend.totalCostUsd === null,
    "a bill smaller than the real one looks exactly like a bill that is right",
  );
  ok(
    "but the token total still includes them",
    spend.totalTokens === 1_100_000 + 409_245 + 2_500,
    `${spend.totalTokens}`,
  );

  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(bad === 0 ? 0 : 1);
}

void main();
