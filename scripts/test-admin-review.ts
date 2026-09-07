/* ==========================================================================
   An operator editing a rating, without breaking the merchant's guarantee.

       npx tsx scripts/test-admin-review.ts

   `saveReview` refuses to overwrite stars or comment on purpose — one review
   per store, for ever, enforced by the primary key rather than by hiding the
   form. That rule is about the MERCHANT, not about the operator: feedback
   arrives by mail and by chat too, and a rating typed into the wrong store has
   no way back out.

   So the operator gets a separate door, `adminSetReview`, and the whole point
   of these tests is that opening it does not open the other one. The merchant
   path must still refuse, on the same row, after the operator has used theirs.
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

const DB_FILE = join(tmpdir(), "pfd-test-admin-review.json");
rmSync(DB_FILE, { force: true });
process.env.PFD_DB_FILE = DB_FILE;
process.env.SYNC_SECRET = "review-test-secret";

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const DOMAIN = "edit-me.myshopify.com";

function store(domain: string) {
  return {
    domain,
    email: "shop@example.com",
    storeName: "Edit Me",
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
  };
}

async function main(): Promise<void> {
  const { getRepo } = await import("@/lib/db");
  const repo = getRepo();

  await repo.upsertStores([store(DOMAIN)]);
  await repo.saveRun(
    {
      id: "run1",
      domain: DOMAIN,
      createdAt: "2026-09-01T02:00:00.000Z",
      payload: "{}",
      snapshot: null,
      pageCount: 1,
      tokens: 5,
      sell: "",
      styleLabel: "",
    },
    [{ runId: "run1", pageId: "p1", pageType: "home", label: "Home", index: 0 }],
  );

  console.log("\nwriting a rating that was never submitted through the app");

  await repo.adminSetReview(DOMAIN, { stars: 4, comment: "Said so on a call." });
  const made = await repo.getReview(DOMAIN);
  check(made?.stars === 4, "the stars are stored", `${made?.stars}`);
  check(made?.comment === "Said so on a call.", "and the comment");
  check(Boolean(made?.createdAt), "with a timestamp", made?.createdAt ?? "");

  console.log("\ncorrecting it");

  const firstStamp = made?.createdAt;
  await repo.adminSetReview(DOMAIN, { stars: 2, comment: "Re-read the thread." });
  const fixed = await repo.getReview(DOMAIN);
  check(fixed?.stars === 2, "the new rating replaces the old one", `${fixed?.stars}`);
  check(fixed?.comment === "Re-read the thread.", "and so does the comment");
  /* The date the feedback was given has not changed just because a typo was
     fixed — it is when the merchant said it, not when we wrote it down. */
  check(fixed?.createdAt === firstStamp, "the original date is kept");

  console.log("\nan empty comment is stored as nothing, not as an empty string");

  await repo.adminSetReview(DOMAIN, { stars: 3, comment: "" });
  check((await repo.getReview(DOMAIN))?.comment === null, "blank means no comment");

  console.log("\nTHE MERCHANT'S DOOR IS STILL SHUT");

  /* The whole reason this is a separate method. If `saveReview` started
     overwriting, a second submission from a second tab could quietly replace a
     rating — the failure the primary key exists to prevent. */
  await repo.saveReview({
    domain: DOMAIN,
    stars: 5,
    comment: "Trying to change my mind.",
    createdAt: new Date().toISOString(),
    forwarded: false,
  });
  const afterMerchant = await repo.getReview(DOMAIN);
  check(afterMerchant?.stars === 3, "saveReview still cannot change the rating", `${afterMerchant?.stars}`);
  check(
    afterMerchant?.comment === null,
    "nor the comment",
    String(afterMerchant?.comment),
  );

  console.log("\nclearing it removes the row, it does not zero it");

  await repo.adminSetReview(DOMAIN, null);
  check((await repo.getReview(DOMAIN)) === null, "the review is gone");

  /* Which is what makes the store askable again. A row of zero stars would sit
     in the stats as a one-star rating nobody gave, and would keep the store out
     of the list the morning mail is built from. */
  const { GET } = await import("@/app/api/admin/pending-reviews/route");
  const res = await GET(
    new Request("https://x.io/api/admin/pending-reviews", {
      headers: { "x-sync-secret": "review-test-secret" },
    }),
  );
  const body = (await res.json()) as { stores: { domain: string }[] };
  check(
    body.stores.some((s) => s.domain === DOMAIN),
    "and the store is back on the list to be asked",
  );

  console.log("\nclearing a store that never had one is not an error");

  await repo.adminSetReview("never-reviewed.myshopify.com", null);
  check(true, "it simply does nothing");

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  rmSync(DB_FILE, { force: true });
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
