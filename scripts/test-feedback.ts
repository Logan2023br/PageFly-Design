/* ==========================================================================
   The link you send a merchant, without a browser.

       npx tsx scripts/test-feedback.ts

   /api/customer-feedback is the only endpoint in the app that writes to the
   database with no session behind it, so most of what matters here is what it
   REFUSES: a domain that is not one, a rating outside the scale, and — the one
   that would be a real hole — granting a domain access to /design just because
   somebody typed it into a feedback form.

   Runs against the file-backed driver in a throwaway file, so it neither needs
   Postgres nor touches the local development database.
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

/* A file of its own, emptied first. Pointing this at .pfd-dev-db.json would put
   test reviews in front of whoever runs the app next. */
const DB_FILE = join(tmpdir(), "pfd-test-feedback.json");
rmSync(DB_FILE, { force: true });
process.env.PFD_DB_FILE = DB_FILE;
/* The webhook is not what is under test, and an unset URL is the "keep it and
   mark it unforwarded" path — which is the one production runs most. */
delete process.env.REVIEW_WEBHOOK_URL;

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type Body = { domain?: unknown; stars?: unknown; comment?: unknown };

async function main(): Promise<void> {
  const { POST } = await import("@/app/api/customer-feedback/route");
  const { getRepo } = await import("@/lib/db");
  const repo = getRepo();

  const send = async (body: Body) => {
    const res = await POST(
      new Request("http://localhost/api/customer-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  console.log("\na review arrives with no session at all");

  const first = await send({
    domain: "abc.myshopify.com",
    stars: 5,
    comment: "Saved me a week.",
  });
  check(first.status === 200, "the form is accepted without signing in", `${first.status}`);
  check(first.body.ok === true, "and answers ok");
  check(first.body.alreadyReviewed === false, "as a first review, not a repeat");

  const stored = await repo.getReview("abc.myshopify.com");
  check(stored?.stars === 5, "the stars are in the database", `${stored?.stars}`);
  check(stored?.comment === "Saved me a week.", "and so is what they wrote");
  check(stored?.forwarded === false, "unforwarded, because no webhook is configured");

  console.log("\nthe domain comes off the URL, in whatever shape it was pasted");

  await send({ domain: "HTTPS://WWW.Second-Store.myshopify.com/pages/home", stars: 4 });
  check(
    (await repo.getReview("second-store.myshopify.com"))?.stars === 4,
    "scheme, www, case and path are all stripped",
  );
  check(
    (await repo.getReview("second-store.myshopify.com"))?.comment === null,
    "an omitted comment is stored as nothing, not as an empty string",
  );

  console.log("\nleaving feedback does NOT let that domain sign in");

  /* The `stores` table IS the allowlist — /api/auth/store admits whatever is in
     it. If this endpoint wrote a row, anyone could grant themselves access by
     submitting a rating for their own domain. */
  check(
    (await repo.getStore("abc.myshopify.com")) === null,
    "no store row is created by a public review",
  );

  console.log("\none review per store, and the first one is the one that counts");

  const second = await send({ domain: "abc.myshopify.com", stars: 1, comment: "Changed my mind." });
  check(second.status === 200, "a second submission is not an error to the merchant");
  check(second.body.alreadyReviewed === true, "it is answered as already reviewed");
  const after = await repo.getReview("abc.myshopify.com");
  check(after?.stars === 5, "and the first rating still stands", `${after?.stars}`);
  check(after?.comment === "Saved me a week.", "with the first comment intact");

  console.log("\nwhat it refuses");

  const noDot = await send({ domain: "abc", stars: 5 });
  check(noDot.status === 400, "a domain with no dot in it", `${noDot.status}`);
  check(noDot.body.ok === false, "and says so rather than pretending");
  check((await repo.getReview("abc")) === null, "and nothing is written for it");

  check((await send({ domain: "", stars: 5 })).status === 400, "an empty domain");
  check(
    (await send({ domain: "zero.myshopify.com", stars: 0 })).status === 400,
    "a rating of zero",
  );
  check(
    (await send({ domain: "six.myshopify.com", stars: 6 })).status === 400,
    "a rating above the scale",
  );
  check(
    (await send({ domain: "half.myshopify.com", stars: 2.5 })).status === 400,
    "half a star",
  );
  check(
    (await send({ domain: "none.myshopify.com" })).status === 400,
    "no rating at all",
  );
  check(
    (await repo.getReview("zero.myshopify.com")) === null &&
      (await repo.getReview("six.myshopify.com")) === null,
    "none of the refused ones reached the database",
  );

  const long = await send({
    domain: "long.myshopify.com",
    stars: 3,
    comment: "x".repeat(2001),
  });
  check(long.status === 400, "a comment past the limit", `${long.status}`);

  console.log("\nthe admin table shows a review from a domain it has never heard of");

  /* The listing joins from `stores`, so before this change a review-only domain
     was written and then invisible — which is the same as not recording it. */
  const summaries = await repo.listStoreSummaries();
  const orphan = summaries.find((s) => s.domain === "abc.myshopify.com");
  check(Boolean(orphan), "the domain appears as a row");
  check(orphan?.review?.stars === 5, "carrying its rating", `${orphan?.review?.stars}`);
  check(orphan?.review?.comment === "Saved me a week.", "and its comment");
  check(orphan?.pagesUsed === 0 && orphan?.runCount === 0, "with no pages or builds claimed");
  check(orphan?.blocked === false, "and not marked as blocked, which it is not");

  console.log("\na domain that IS a store is still one row, not two");

  await repo.upsertStores([
    {
      domain: "known.myshopify.com",
      email: "shop@known.example",
      storeName: "Known",
      shopifyPlan: null,
      currentPlan: null,
      daysUsed: null,
      country: null,
      userType: null,
      status: null,
      pageLimit: 30,
      firstSeenAt: null,
      lastSeenAt: null,
      blocked: false,
    },
  ]);
  await send({ domain: "known.myshopify.com", stars: 2, comment: "Fine." });

  const withStore = await repo.listStoreSummaries();
  const rows = withStore.filter((s) => s.domain === "known.myshopify.com");
  check(rows.length === 1, "one row for a store that also has a review", `${rows.length}`);
  check(rows[0]?.storeName === "Known", "keeping the details the sheet gave it");
  check(rows[0]?.review?.stars === 2, "and carrying the review too");
  check(
    new Set(withStore.map((s) => s.domain)).size === withStore.length,
    "no domain is listed twice",
  );

  console.log(
    failures === 0
      ? "\nall good\n"
      : `\n${failures} failure${failures === 1 ? "" : "s"}\n`,
  );
  rmSync(DB_FILE, { force: true });
  process.exit(failures === 0 ? 0 : 1);
}

void main();
