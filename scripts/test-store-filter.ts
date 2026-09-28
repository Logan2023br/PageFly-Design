/* ==========================================================================
   THREE BUTTONS THAT MUST PARTITION THE LIST.

       npx tsx scripts/test-store-filter.ts

   The Users table gained three filters — built, signed in only, never signed
   in — and the whole value of three is that every store is in EXACTLY ONE.
   Two ways that fails, and neither looks broken:

     THEY OVERLAP. Read `signedin` as "has signed in" rather than "has signed
     in and built nothing" and it silently contains every built store too. The
     button works, the table fills, and the number beside it is the wrong
     answer to the question the label asks.

     THEY LEAVE A GAP. A store that falls through all three is invisible from
     every button, and the only way to notice is to add the three totals up by
     hand and compare against the unfiltered one — which nobody does.

   So the assertions are about the SET, not about one query: the three counts
   must sum to the total, and no store may appear under two buttons.

   THE FILTER MUST ALSO SURVIVE A SEARCH. They narrow different things and are
   sent together; an `or` where an `and` belongs turns a filtered search into
   the whole table, which reads as a filter that simply did not apply.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pfd-filter-"));
process.env.PFD_DB_FILE = join(dir, "store.json");
process.env.SESSION_SECRET = "filter-test-secret-value-long-enough";

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
  const { randomUUID } = await import("node:crypto");
  const repo = getRepo();

  /* ==========================================================================
     NINE STORES ACROSS THE THREE STATES, in uneven numbers on purpose.

     Equal counts would let "it filtered correctly" and "it returned a third of
     the list" produce the same answer. 4 built · 3 signed in · 2 never.
     ========================================================================== */
  const store = (domain: string, lastSeenAt: string | null) => ({
    domain,
    email: `${domain.split(".")[0]}@example.com`,
    storeName: domain,
    country: "US",
    shopifyPlan: null, currentPlan: null, daysUsed: null,
    userType: null, status: null, pageLimit: 30,
    firstSeenAt: null,
    lastSeenAt,
    blocked: false,
  });

  const SEEN = "2026-09-01T00:00:00.000Z";
  const BUILT = ["b1", "b2", "b3", "b4"];
  const SIGNED = ["s1", "s2", "s3"];
  const NEVER = ["n1", "n2"];

  await repo.upsertStores([
    ...BUILT.map((d) => store(`${d}.myshopify.com`, SEEN)),
    ...SIGNED.map((d) => store(`${d}.myshopify.com`, SEEN)),
    /* Never signed in — the column the third button reads. */
    ...NEVER.map((d) => store(`${d}.myshopify.com`, null)),
  ] as never);

  /* Pages only for the first four. A run with pages is what "built" means. */
  for (const d of BUILT) {
    const runId = randomUUID();
    await repo.saveRun(
      {
        id: runId,
        domain: `${d}.myshopify.com`,
        createdAt: SEEN,
        payload: "x",
        pageCount: 2,
        tokens: 10,
        snapshot: null,
        sell: "x",
        styleLabel: "y",
      } as never,
      [
        { runId, pageId: `${d}-p1`, pageType: "home", label: "Home", idx: 0 },
        { runId, pageId: `${d}-p2`, pageType: "about", label: "About", idx: 1 },
      ] as never,
    );
  }

  const page = (filter: string | null, search?: string) =>
    repo.listStoreSummariesPage({
      limit: 100,
      offset: 0,
      ...(filter ? { filter: filter as never } : {}),
      ...(search ? { search } : {}),
    });

  const all = await page(null);
  head("the unfiltered list");
  ok("all nine stores are there", all.total === 9, String(all.total));

  /* ---- each button ------------------------------------------------------- */
  head("Store đã build — pages greater than zero");
  const built = await page("built");
  ok("four", built.total === 4, String(built.total));
  ok(
    "and every one of them has pages",
    built.rows.every((r) => r.pagesUsed > 0),
    built.rows.map((r) => `${r.domain}:${r.pagesUsed}`).join(" "),
  );

  head("Store chỉ đăng nhập — signed in, built nothing");
  const signed = await page("signedin");
  ok("three", signed.total === 3, String(signed.total));
  ok(
    "every one has signed in",
    signed.rows.every((r) => r.lastSeenAt !== null),
    signed.rows.map((r) => r.domain).join(" "),
  );
  /* THE READING THAT LOOKS RIGHT AND IS NOT. "Has signed in" alone would put
     all four built stores in here as well. */
  ok(
    "AND NONE OF THEM BUILT ANYTHING",
    signed.rows.every((r) => r.pagesUsed === 0),
    signed.rows.map((r) => `${r.domain}:${r.pagesUsed}`).join(" "),
  );

  head("Store không sử dụng — never signed in");
  const idle = await page("idle");
  ok("two", idle.total === 2, String(idle.total));
  ok(
    "every one has never signed in",
    idle.rows.every((r) => r.lastSeenAt === null),
    idle.rows.map((r) => `${r.domain}:${r.lastSeenAt}`).join(" "),
  );

  /* ---- the set, which is the point --------------------------------------- */
  head("the three are a partition of the list");
  ok(
    "THEY SUM TO THE WHOLE LIST",
    built.total + signed.total + idle.total === all.total,
    `${built.total} + ${signed.total} + ${idle.total} vs ${all.total} — a gap hides stores from every button`,
  );

  const seen = [...built.rows, ...signed.rows, ...idle.rows].map((r) => r.domain);
  ok(
    "AND NO STORE IS UNDER TWO BUTTONS",
    new Set(seen).size === seen.length,
    `${seen.length} rows, ${new Set(seen).size} distinct`,
  );

  /* ---- with a search ------------------------------------------------------ */
  head("a filter and a search narrow together");
  /* `b1` is built; searching it under `built` must find it and under the other
     two must find nothing. An `or` instead of an `and` returns the whole
     state's rows and reads as a filter that did not apply. */
  ok("built + its own domain finds it", (await page("built", "b1.")).total === 1);
  ok(
    "signed-in + a built domain finds NOTHING",
    (await page("signedin", "b1.")).total === 0,
    String((await page("signedin", "b1.")).total),
  );
  ok(
    "never-signed-in + a built domain finds NOTHING",
    (await page("idle", "b1.")).total === 0,
  );

  /* ---- the number on each button ---------------------------------------- */
  head("each button's count");
  const want = { built: built.total, signedin: signed.total, idle: idle.total };
  ok(
    "matches the table that button shows",
    JSON.stringify(all.byState) === JSON.stringify(want),
    `${JSON.stringify(all.byState)} vs ${JSON.stringify(want)}`,
  );
  /* Pressing one must not zero the other two — the counts are how an
     operator decides which to press next. */
  ok(
    "and does not change when a filter is on",
    JSON.stringify(built.byState) === JSON.stringify(want) &&
      JSON.stringify(idle.byState) === JSON.stringify(want),
    JSON.stringify(built.byState),
  );
  const found = await page("idle", "b1.");
  ok(
    "but DOES follow the search",
    found.byState.built === 1 && found.byState.signedin === 0 && found.byState.idle === 0,
    JSON.stringify(found.byState),
  );

  head("an unknown filter value");
  /* It arrives on a query string; a stale bookmark should show the table. */
  ok(
    "narrows nothing rather than erroring",
    (await page("whatever")).total === 9,
    String((await page("whatever")).total),
  );

  rmSync(dir, { recursive: true, force: true });
  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
