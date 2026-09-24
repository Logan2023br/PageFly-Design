/* ==========================================================================
   TWENTY-FIVE ROWS FROM THE DATABASE, NOT FIFTEEN HUNDRED FROM IT AND
   TWENTY-FIVE ONTO THE SCREEN.

       npx tsx scripts/test-store-paging.ts

   Paging in the browser made the table cheap to DRAW and changed nothing about
   what was sent: every store, every render. This asks the database for a page.

   The move has one failure that is far worse than the slowness it fixes:

     SEARCH AND SORT MUST HAPPEN BEFORE THE SLICE. Filter twenty-five rows in
     the browser and an operator typing a domain that is on page nine is told
     it does not exist. That is not a slow screen, it is a lying one — and
     nothing about it looks broken.

   The rest are the ordinary ones: a total that counts the matches rather than
   the page, an offset past the end that must come back empty instead of
   wrapping, and two drivers that have to agree because only one of them can be
   run here.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pfd-stores-"));
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

async function main(): Promise<void> {
  const { getRepo } = await import("../lib/db");
  const repo = getRepo();

  /* Sixty stores, and exactly one of them findable by a word that appears
     nowhere else — deliberately at the far end of the list. */
  await repo.upsertStores(
    Array.from({ length: 60 }, (_, i) => ({
      domain: `s${String(i).padStart(3, "0")}.myshopify.com`,
      email: i === 59 ? "needle@example.com" : `a${i}@example.com`,
      storeName: i === 59 ? "Needle Store" : `Shop ${i}`,
      country: i === 59 ? "VN" : "US",
      shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30,
      /* REVERSED ON PURPOSE. The default order is "most recent", so giving the
         last domain the newest date makes recent-order the OPPOSITE of
         domain-order — without that the two coincide and "sort before the
         slice" cannot be told from "sort after it". */
      firstSeenAt: null,
      lastSeenAt: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
      blocked: false,
    })) as never,
  );

  head("one page, and the size asked for");
  const p1 = await repo.listStoreSummariesPage({ limit: 25, offset: 0 });
  ok("25 rows come back", p1.rows.length === 25, String(p1.rows.length));
  ok("AND THE TOTAL IS ALL SIXTY", p1.total === 60, `${p1.total} — the pager needs the whole count`);

  const p3 = await repo.listStoreSummariesPage({ limit: 25, offset: 50 });
  ok("the last page is the remainder", p3.rows.length === 10, String(p3.rows.length));
  ok("and still reports sixty", p3.total === 60);

  head("THE DEFAULT ORDER IS NOT THE DOMAIN ORDER");
  ok(
    "most recent puts the last domain first",
    p1.rows[0]?.domain === "s059.myshopify.com",
    `${p1.rows[0]?.domain} — if this were s000 the sort assertions below prove nothing`,
  );

  head("no page repeats another");
  const p2 = await repo.listStoreSummariesPage({ limit: 25, offset: 25 });
  const seen = new Set([...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.domain));
  ok("sixty distinct stores across three pages", seen.size === 60, String(seen.size));

  head("an offset past the end is empty, not wrapped");
  const past = await repo.listStoreSummariesPage({ limit: 25, offset: 500 });
  ok("no rows", past.rows.length === 0, String(past.rows.length));
  ok("total unchanged", past.total === 60);

  head("SEARCH RUNS BEFORE THE SLICE, NOT AFTER IT");
  /* The needle sorts last by domain, so a browser filtering page one would
     never see it. */
  const hit = await repo.listStoreSummariesPage({ limit: 25, offset: 0, search: "needle" });
  ok(
    "a store on the last page is found from the first",
    hit.rows.length === 1 && hit.rows[0].domain === "s059.myshopify.com",
    `${hit.rows.length} row(s) — filtering the page instead of the table tells an operator it does not exist`,
  );
  ok("and the total is the match count", hit.total === 1, String(hit.total));

  for (const [what, term] of [
    ["email", "needle@example.com"],
    ["store name", "Needle Store"],
    ["country", "VN"],
    ["domain", "s059"],
  ] as const) {
    const r = await repo.listStoreSummariesPage({ limit: 25, offset: 0, search: term });
    ok(`found by ${what}`, r.total === 1, `${r.total}`);
  }

  const none = await repo.listStoreSummariesPage({ limit: 25, offset: 0, search: "zzzz" });
  ok("a term that matches nothing is zero, not everything", none.total === 0, String(none.total));

  head("SORT RUNS BEFORE THE SLICE TOO");
  const byDomain1 = await repo.listStoreSummariesPage({ limit: 10, offset: 0, sort: "domain" });
  const byDomain2 = await repo.listStoreSummariesPage({ limit: 10, offset: 10, sort: "domain" });
  ok("page one starts at the first domain", byDomain1.rows[0]?.domain === "s000.myshopify.com",
     byDomain1.rows[0]?.domain);
  ok(
    "and page two continues where it ended",
    byDomain2.rows[0]?.domain === "s010.myshopify.com",
    `${byDomain2.rows[0]?.domain} — a sort applied after the slice reorders one page at a time`,
  );

  head("and the counts the header needs are their own question");
  const counts = await repo.countStores();
  ok("sixty on the list", counts.total === 60, String(counts.total));
  ok("all sixty have signed in", counts.active === 60, String(counts.active));

  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(bad === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error("threw:", e);
  process.exit(1);
});
