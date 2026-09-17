/* ==========================================================================
   The door that opens for a store it has never seen.

       npx tsx scripts/test-login-no-register.ts

   The gate used to refuse an unknown domain and point at a register form on
   another screen: thirty-one merchants turned away in a month, four finished.
   It now asks Shopify whether the store is real, asks the merchant for an
   email, and lets them in.

   Every decision in that sentence is a way to get it wrong, and this file is
   the list of them. What must still be refused is as much the subject as what
   is now admitted — a door that opens for everything is not a door.

   Shopify is stubbed. This tests OUR rules; `test-store-exists.ts` tests the
   reading of Shopify's answer, and has a live half for the endpoint itself.

   WHAT THIS FILE CANNOT SEE is the session cookie. `setStoreSession` calls
   Next's `cookies()`, which needs a request scope that does not exist when a
   route handler is called straight from a script — so the last step of a
   successful sign-in always fails here with "called outside a request scope".
   Every assertion below is therefore written against what the route DID rather
   than the status it ended on: the row it wrote, the row it refused to write,
   and the event it recorded. `admitted` is the helper that draws that line.
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

const DB_FILE = join(tmpdir(), "pfd-test-login-no-register.json");
rmSync(DB_FILE, { force: true });
process.env.PFD_DB_FILE = DB_FILE;
process.env.SESSION_SECRET = "login-no-register-secret-long-enough-value";
/* Otherwise the compiled-in list admits its own stores and "this domain is
   new" stops being true for the cases below. */
delete process.env.BETA_STORES;

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const SHOP = { id: 1, name: "Zenitex", country: "GB", published_products_count: 4 };

async function main(): Promise<void> {
  const { POST } = await import("@/app/api/auth/store/route");
  const { getRepo } = await import("@/lib/db");
  const { NO_REGISTER_USER_TYPE } = await import("@/lib/db/types");
  const repo = getRepo();

  /** What Shopify will say to the next `/meta.json` asked of it. */
  let shopify: () => Response = () =>
    new Response(JSON.stringify(SHOP), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = (async () => shopify()) as typeof fetch;

  /* The route got as far as creating the account. Not `ok`, because the cookie
     step beyond it cannot run in this harness — see the header. A refusal and a
     request for an email are both distinguishable from this, which is what the
     assertions actually need. */
  const admitted = (r: { body: Record<string, unknown> }) =>
    r.body.needsEmail !== true &&
    (r.body.ok === true || r.body.error === "Could not start a session.");

  const post = async (body: unknown) => {
    const res = await POST(
      new Request("http://localhost/api/auth/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  /* ---------------------------------------------------------------- */
  console.log("\na domain nobody has heard of, and a store that is real");

  let r = await post({ domain: "zenitex-store.myshopify.com" });
  check(r.status === 200, "answered 200, not a refusal", String(r.status));
  check(r.body.needsEmail === true, "and asks for an email", JSON.stringify(r.body));
  check(
    (await repo.getStore("zenitex-store.myshopify.com")) === null,
    "no row is written until the email arrives",
  );

  /* The email is the last thing wanted, so a bad one must not create anything
     and must not read as a refusal of the store. */
  r = await post({ domain: "zenitex-store.myshopify.com", email: "not-an-email" });
  check(r.body.needsEmail === true, "a malformed email asks again", JSON.stringify(r.body));
  check(
    (await repo.getStore("zenitex-store.myshopify.com")) === null,
    "and still writes nothing",
  );

  r = await post({ domain: "zenitex-store.myshopify.com", email: "owner@zenitex.com" });
  check(admitted(r), "a real email creates the account", JSON.stringify(r.body));

  const row = await repo.getStore("zenitex-store.myshopify.com");
  check(Boolean(row), "and the row exists");
  check(row?.email === "owner@zenitex.com", "with the email they gave", row?.email ?? "-");
  check(row?.storeName === "zenitex-store", "the name off the domain", row?.storeName ?? "-");
  check(row?.pageLimit === 3, "three free pages", String(row?.pageLimit));
  check(
    row?.userType === NO_REGISTER_USER_TYPE,
    "and marked Marketing/No Register",
    row?.userType ?? "-",
  );
  check(row?.blocked === false, "not blocked");

  /* ---------------------------------------------------------------- */
  console.log("\nthe domain as typed is the key");

  /* Whatever Shopify calls it, the address the merchant uses is the address
     they get — asked for explicitly, and the alternative would have them sign
     in at one name and find a row under another. */
  r = await post({ domain: "adbv.com", email: "hi@adbv.com" });
  check(admitted(r), "a custom domain is accepted", JSON.stringify(r.body));
  const custom = await repo.getStore("adbv.com");
  check(Boolean(custom), "and the row is keyed on what they typed");
  check(custom?.storeName === "adbv", "name is the first label", custom?.storeName ?? "-");

  /* Case and scheme are the merchant's business, not the table's. */
  r = await post({ domain: "  HTTPS://Mixed-Case.myshopify.com/  ", email: "a@b.com" });
  check(admitted(r), "scheme and case are normalised", JSON.stringify(r.body));
  check(
    Boolean(await repo.getStore("mixed-case.myshopify.com")),
    "and the row is the normalised form",
  );

  /* ---------------------------------------------------------------- */
  console.log("\nand what is still refused");

  shopify = () => new Response(JSON.stringify({ errors: "Not Found" }), { status: 404 });
  r = await post({ domain: "cabbea-60.myshopify.com", email: "a@b.com" });
  check(r.status === 404, "a store Shopify does not know is refused", String(r.status));
  check(!r.body.ok && !r.body.needsEmail, "with an error, not an email box");
  check((await repo.getStore("cabbea-60.myshopify.com")) === null, "and writes no row");

  /* The one refusal that must outrank everything, including a real store: an
     operator removing a domain has to stay removed. */
  await repo.upsertStores([
    {
      domain: "barred.myshopify.com",
      email: null,
      storeName: null,
      shopifyPlan: null,
      currentPlan: null,
      daysUsed: null,
      country: null,
      userType: null,
      status: null,
      pageLimit: 3,
      firstSeenAt: null,
      lastSeenAt: null,
      blocked: true,
    },
  ]);
  shopify = () =>
    new Response(JSON.stringify(SHOP), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  r = await post({ domain: "barred.myshopify.com" });
  check(r.body.needsEmail !== true, "a blocked store is never offered an email box", JSON.stringify(r.body));
  check(r.status === 403, "it is refused outright", String(r.status));

  r = await post({ domain: "barred.myshopify.com", email: "a@b.com" });
  check(!r.body.ok, "and refused again with an email", JSON.stringify(r.body));

  /* THE ROW MUST NOT BE TOUCHED. `findAllowedStore` answers null for a blocked
     store and for a store nobody knows, so a route that reads only that answer
     walks a blocked domain straight into the create path — which rewrites the
     operator's row with an email, three pages and a new type. The block holds
     either way, but the record of what it used to be does not. */
  const barred = await repo.getStore("barred.myshopify.com");
  check(barred?.blocked === true, "the block holds", String(barred?.blocked));
  check(barred?.email === null, "and nothing was written over it", `email=${barred?.email}`);
  check(
    barred?.userType === null && barred?.pageLimit === 3,
    "not its type, not its allowance",
    `type=${barred?.userType} limit=${barred?.pageLimit}`,
  );

  r = await post({ domain: "nodot" });
  check(r.status === 400, "something that is not a domain is still 400", String(r.status));

  /* ---------------------------------------------------------------- */
  console.log("\nwhen Shopify cannot be asked");

  /* Rate limits are reproducible against the real endpoint. A merchant refused
     because Shopify was busy is the failure this whole change exists to stop,
     so `unknown` is admitted and the reason is recorded rather than the door
     being shut. */
  shopify = () => new Response("", { status: 429 });
  r = await post({ domain: "ratelimited.myshopify.com" });
  check(r.body.needsEmail === true, "a 429 still opens the door", JSON.stringify(r.body));

  r = await post({ domain: "ratelimited.myshopify.com", email: "a@b.com" });
  check(admitted(r), "and the account is created", JSON.stringify(r.body));

  /* ---------------------------------------------------------------- */
  console.log("\nan existing store is untouched by any of this");

  await repo.upsertStores([
    {
      domain: "beta.myshopify.com",
      email: "beta@example.com",
      storeName: "Beta Store",
      shopifyPlan: null,
      currentPlan: null,
      daysUsed: null,
      country: null,
      userType: "Beta",
      status: "Đang sử dụng",
      pageLimit: 30,
      firstSeenAt: null,
      lastSeenAt: null,
      blocked: false,
    },
  ]);

  /* No email asked for, no Shopify call, nothing rewritten — the whole change
     has to be invisible to a merchant who was already on the list. */
  shopify = () => {
    throw new Error("Shopify must not be asked about a store already on the list");
  };
  r = await post({ domain: "beta.myshopify.com" });
  check(admitted(r), "signs in on the first press, with no email asked for", JSON.stringify(r.body));

  const beta = await repo.getStore("beta.myshopify.com");
  check(beta?.pageLimit === 30, "its allowance is not reset to three", String(beta?.pageLimit));
  check(beta?.userType === "Beta", "and its type is not rewritten", beta?.userType ?? "-");

  /* ---------------------------------------------------------------- */
  console.log("\nand the count the admin screen reads");

  const events = await repo.countEvents(
    "2000-01-01T00:00:00.000Z",
    "2100-01-01T00:00:00.000Z",
  );
  const noReg = events.filter((e) => e.name === "design_login_no_register");
  const total = noReg.reduce((a, b) => a + b.count, 0);
  check(total === 4, "one event per account created this way", String(total));
  check(
    noReg.every((e) => e.stores > 0),
    "each carrying its store, so the tile can open",
    noReg.map((e) => `${e.stores}`).join(","),
  );

  rmSync(DB_FILE, { force: true });
  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
