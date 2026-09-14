/* ==========================================================================
   The fourth door.

       npx tsx scripts/test-register.ts

   Three doors existed before this one and each writes its own rule on itself
   rather than leaving it to be inferred: `/api/auth/store` is the beta gate
   and must stay refusable, `/api/auth/provision` opens a link WE signed and
   may create the store first, `/api/auth/admin` is the operator's. This is the
   fourth — a merchant fills in a form and a row appears.

   WHAT IT MUST NOT DO is the interesting half, and it is what this file is
   mostly about:

   - it must not sign anybody in. Registering is not signing in; the merchant
     goes back to the login form afterwards and uses it.
   - it must not touch a row that already exists. A second registration for a
     domain an operator has already raised the page limit on would quietly put
     it back to three.
   - it must not re-admit a blocked store. `blocked` is how a store compiled
     into the built-in list gets access taken away; a self-service form that
     ignores it hands that access straight back.
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

const DB_FILE = join(tmpdir(), "pfd-test-register.json");
rmSync(DB_FILE, { force: true });
process.env.PFD_DB_FILE = DB_FILE;
process.env.SESSION_SECRET = "register-test-secret-value-long-enough";
/* The built-in list would otherwise admit its own test stores here and turn
   "this domain is new" into "this domain is already known". */
delete process.env.BETA_STORES;

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type Body = { domain?: unknown; name?: unknown; email?: unknown };

async function main(): Promise<void> {
  const { POST } = await import("@/app/api/auth/register/route");
  const { getRepo } = await import("@/lib/db");
  const repo = getRepo();

  const send = async (body: Body) => {
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return {
      status: res.status,
      cookie: res.headers.get("set-cookie"),
      body: (await res.json()) as Record<string, unknown>,
    };
  };

  console.log("\na merchant registers");

  const first = await send({
    domain: "Https://New-Shop.myshopify.com/",
    name: "New Shop",
    email: "owner@newshop.test",
  });
  check(first.status === 200, "the form is accepted", `${first.status}`);
  check(first.body.ok === true, "and answers ok");

  /* Normalised on the way in, exactly as the sign-in route does it — a merchant
     pasting the address bar gets the same row as one typing the bare domain,
     and two rows for one store is the failure. */
  const row = await repo.getStore("new-shop.myshopify.com");
  check(Boolean(row), "a row exists under the normalised domain");
  check(row?.storeName === "New Shop", "with the name", row?.storeName ?? "(null)");
  check(row?.email === "owner@newshop.test", "and the email", row?.email ?? "(null)");
  check(
    row?.userType === "Marketing/Register",
    "and a type saying where it came from",
    row?.userType ?? "(null)",
  );
  check(row?.pageLimit === 3, "three free pages", String(row?.pageLimit));
  check(row?.blocked === false, "and it is not blocked");

  /* REGISTERING IS NOT SIGNING IN. The merchant goes back to the login form and
     uses it; a route that quietly set a cookie would make the beta gate
     bypassable by anyone who can type a domain into a form. */
  console.log("\nbut is not signed in by it");
  check(
    !(first.cookie ?? "").includes("pfd_store"),
    "no session cookie comes back",
    first.cookie ?? "(none)",
  );
  check(
    row?.lastSeenAt === null,
    "and the store has never been seen — registering is not a visit",
    String(row?.lastSeenAt),
  );

  console.log("\nregistering twice does not reset the first one");

  /* An operator raises this by hand when a merchant is real. The second
     registration must not put it back. */
  await repo.upsertStores([{ ...row!, pageLimit: 30, storeName: "New Shop Ltd" }]);

  const again = await send({
    domain: "new-shop.myshopify.com",
    name: "Whatever",
    email: "someone@else.test",
  });
  check(again.status === 409, "the second is refused as a duplicate", `${again.status}`);
  check(
    typeof again.body.error === "string" && /already/i.test(String(again.body.error)),
    "and says so",
    String(again.body.error),
  );

  const kept = await repo.getStore("new-shop.myshopify.com");
  check(kept?.pageLimit === 30, "the raised page limit survives", String(kept?.pageLimit));
  check(kept?.storeName === "New Shop Ltd", "and so does the edited name", kept?.storeName ?? "");
  check(kept?.email === "owner@newshop.test", "and the original email", kept?.email ?? "");

  console.log("\na blocked store cannot register its way back in");

  await repo.upsertStores([
    {
      domain: "gone.myshopify.com",
      email: null,
      storeName: null,
      shopifyPlan: null,
      currentPlan: null,
      daysUsed: null,
      country: null,
      userType: null,
      status: null,
      pageLimit: 0,
      firstSeenAt: null,
      lastSeenAt: null,
      blocked: true,
    },
  ]);

  const blocked = await send({
    domain: "gone.myshopify.com",
    name: "Gone",
    email: "gone@example.test",
  });
  check(blocked.status === 403, "refused", `${blocked.status}`);
  const stillBlocked = await repo.getStore("gone.myshopify.com");
  check(stillBlocked?.blocked === true, "and the tombstone is still there");
  check(stillBlocked?.pageLimit === 0, "with no allowance handed out");

  console.log("\nwhat the form will not accept");

  const bad = [
    [{ domain: "", name: "A", email: "a@b.test" }, "an empty domain"],
    [{ domain: "notadomain", name: "A", email: "a@b.test" }, "a domain with no dot"],
    [{ domain: "x.myshopify.com", name: "A", email: "not-an-email" }, "an email with no @"],
    [{ domain: "x.myshopify.com", name: "A", email: "" }, "no email at all"],
    [{ domain: "x.myshopify.com", name: "", email: "a@b.test" }, "no name"],
  ] as const;

  for (const [body, label] of bad) {
    const res = await send(body as Body);
    check(res.status === 400, label, `${res.status}`);
  }

  console.log("\nthe admin count");

  await send({ domain: "two.myshopify.com", name: "Two", email: "two@example.test" });
  await send({ domain: "three.myshopify.com", name: "Three", email: "three@example.test" });

  const stats = await repo.stats();
  /* Counts the ones that came through THIS door, not every store. `gone` was
     refused and the two hand-made rows above carry no type. */
  check(
    stats.registeredStores === 3,
    "counts only stores that registered themselves",
    String(stats.registeredStores),
  );

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
