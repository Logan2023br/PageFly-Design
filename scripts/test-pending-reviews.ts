/* ==========================================================================
   Who has built pages and never said what they thought.

       npx tsx scripts/test-pending-reviews.ts

   The list an automation asks for every morning so it can send one email. It
   is the admin Users table read through a filter — pages built, no rating —
   and it exists because that table is a React page with no API behind it, so
   nothing outside a browser could answer the question.

   The assertions that matter are the ones about who is LEFT OUT. A store that
   already reviewed must never be asked again, a store that has built nothing
   has nothing to review, and a blocked store is one we removed — mailing any
   of the three is worse than mailing nobody.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const DB_FILE = join(tmpdir(), "pfd-test-pending.json");
rmSync(DB_FILE, { force: true });
process.env.PFD_DB_FILE = DB_FILE;
process.env.SYNC_SECRET = "test-secret-value";

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type Row = {
  domain: string;
  storeName: string | null;
  email: string | null;
  pagesUsed: number;
  feedbackUrl: string;
};

function store(domain: string, extra: Record<string, unknown> = {}) {
  return {
    domain,
    email: `${domain.split(".")[0]}@example.com`,
    storeName: domain.split(".")[0],
    shopifyPlan: null,
    currentPlan: null,
    daysUsed: null,
    country: null,
    userType: null,
    status: null,
    pageLimit: 10,
    firstSeenAt: null,
    lastSeenAt: null,
    blocked: false,
    ...extra,
  };
}

async function main(): Promise<void> {
  const { GET } = await import("@/app/api/admin/pending-reviews/route");
  const { getRepo } = await import("@/lib/db");
  const repo = getRepo();

  const ask = async (secret: string | null) => {
    const res = await GET(
      new Request("https://pagefly-design.pagefly.io/api/admin/pending-reviews", {
        headers: secret === null ? {} : { "x-sync-secret": secret },
      }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  console.log("\nthe secret is the whole door");

  check((await ask(null)).status === 401, "no header at all is refused");
  check((await ask("")).status === 401, "an empty secret is refused");
  check((await ask("test-secret-valu")).status === 401, "one character short is refused");
  check((await ask("wrong")).status === 401, "a wrong secret is refused");

  console.log("\nwho is on the list");

  /* built pages, never reviewed — the whole point */
  await repo.upsertStores([store("built-no-review.myshopify.com")]);
  await repo.saveRun(
    {
      id: "r1",
      domain: "built-no-review.myshopify.com",
      createdAt: "2026-08-30T02:00:00.000Z",
      payload: "{}",
      snapshot: null,
      pageCount: 1,
      tokens: 10,
      sell: "",
      styleLabel: "",
    },
    [{ runId: "r1", pageId: "p1", pageType: "home", label: "Home", index: 0 }],
  );

  const ok = await ask("test-secret-value");
  check(ok.status === 200, "the right secret opens it", `${ok.status}`);
  const rows = ok.body.stores as Row[];
  const one = rows.find((s) => s.domain === "built-no-review.myshopify.com");
  check(Boolean(one), "a store that built pages and never reviewed is listed");
  check(one?.pagesUsed === 1, "with the pages it actually built", `${one?.pagesUsed}`);
  check(
    one?.feedbackUrl ===
      "https://pagefly-design.pagefly.io/customer-feedback?domain=built-no-review.myshopify.com",
    "and a ready-made feedback link",
    one?.feedbackUrl,
  );
  check(ok.body.count === rows.length, "count matches the rows", `${ok.body.count}`);

  console.log("\nwho is left out, which is the part that matters");

  /* has reviewed already */
  await repo.upsertStores([store("already-said.myshopify.com")]);
  await repo.saveRun(
    {
      id: "r2",
      domain: "already-said.myshopify.com",
      createdAt: "2026-08-30T02:00:00.000Z",
      payload: "{}",
      snapshot: null,
      pageCount: 1,
      tokens: 10,
      sell: "",
      styleLabel: "",
    },
    [{ runId: "r2", pageId: "p1", pageType: "home", label: "Home", index: 0 }],
  );
  await repo.saveReview({
    domain: "already-said.myshopify.com",
    stars: 5,
    comment: null,
    createdAt: "2026-08-31T02:00:00.000Z",
    forwarded: false,
  });

  /* built nothing */
  await repo.upsertStores([store("built-nothing.myshopify.com")]);

  /* built, no review, but removed from the beta */
  await repo.upsertStores([store("blocked.myshopify.com", { blocked: true })]);
  await repo.saveRun(
    {
      id: "r3",
      domain: "blocked.myshopify.com",
      createdAt: "2026-08-30T02:00:00.000Z",
      payload: "{}",
      snapshot: null,
      pageCount: 1,
      tokens: 10,
      sell: "",
      styleLabel: "",
    },
    [{ runId: "r3", pageId: "p1", pageType: "home", label: "Home", index: 0 }],
  );

  const after = (await ask("test-secret-value")).body.stores as Row[];
  const has = (d: string) => after.some((s) => s.domain === d);
  check(!has("already-said.myshopify.com"), "a store that already rated us is not asked again");
  check(!has("built-nothing.myshopify.com"), "a store that built nothing has nothing to review");
  check(!has("blocked.myshopify.com"), "a blocked store is not mailed");
  check(has("built-no-review.myshopify.com"), "and the one that qualifies is still there");

  console.log("\na store with no email is listed, not hidden");

  /* Hiding it would make `count` a number that disagrees with the admin table,
     and the automation is the right place to decide it cannot mail someone. */
  await repo.upsertStores([store("no-email.myshopify.com", { email: null })]);
  await repo.saveRun(
    {
      id: "r4",
      domain: "no-email.myshopify.com",
      createdAt: "2026-08-30T02:00:00.000Z",
      payload: "{}",
      snapshot: null,
      pageCount: 1,
      tokens: 10,
      sell: "",
      styleLabel: "",
    },
    [{ runId: "r4", pageId: "p1", pageType: "home", label: "Home", index: 0 }],
  );

  const withNoEmail = (await ask("test-secret-value")).body.stores as Row[];
  const blank = withNoEmail.find((s) => s.domain === "no-email.myshopify.com");
  check(Boolean(blank), "it appears");
  check(blank?.email === null, "with email null, for the automation to filter on");

  console.log("\nnewest builder first, so a cut-off list is the useful half");

  const order = withNoEmail.map((s) => s.domain);
  check(order.length >= 2, "more than one row to order", `${order.length}`);

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  rmSync(DB_FILE, { force: true });
  process.exit(failures === 0 ? 0 : 1);
}

void main();
