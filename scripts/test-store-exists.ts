/* ==========================================================================
   Does this store exist?

       npx tsx scripts/test-store-exists.ts          # stubbed, offline, always runs
       LIVE=1 npx tsx scripts/test-store-exists.ts   # also asks Shopify for real

   TWO HALVES, AND THE SPLIT IS THE POINT. The stubbed half owns every decision
   this module makes — which status a 404 is, which a 429 is, what happens when
   the answer is 200 but is not a shop record — and it runs with no network, so
   it is the half that guards the logic.

   The live half asks Shopify about four real domains. It is opt-in because a
   test that fails when a shop owner turns their store off is a test that cries
   wolf, and because it spends somebody else's rate limit. Run it when the
   endpoint's behaviour itself is in question.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

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

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const SHOP = {
  id: 108208587084,
  name: "My Store",
  country: "GB",
  published_products_count: 0,
};

async function main(): Promise<void> {
  const { storeExists } = await import("../lib/storeExists");

  const real = globalThis.fetch;
  /** The last URL asked for, so a test can assert WHERE the request went. */
  let asked = "";
  const stub = (answer: () => Promise<Response> | Response) => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      asked = String(input);
      return answer();
    }) as typeof fetch;
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  console.log("\nthe answer Shopify gives");

  stub(() => json(200, SHOP));
  let r = await storeExists("ff1ewp-0e.myshopify.com");
  check(r.status === "yes", "a shop record is yes", r.status);
  check(r.name === "My Store", "and carries the shop's own name", r.name);
  check(r.products === 0, "and what it has published", String(r.products));
  check(
    asked === "https://ff1ewp-0e.myshopify.com/meta.json",
    "asked meta.json, not the storefront",
    asked,
  );

  /* THE CASE THE WHOLE MODULE EXISTS FOR. A brand-new store has a password on
     it, so `/products.json` answers 401 and `GET /` answers 302 — neither says
     the store is real. `meta.json` does, and a merchant behind a password is
     still a merchant. */
  stub(() => json(404, { errors: "Not Found" }));
  r = await storeExists("cabbea-60.myshopify.com");
  check(r.status === "no", "404 is no", r.status);

  console.log("\nand the answers that are not about the store");

  /* Reproducible against the real endpoint by asking twice quickly. A merchant
     refused because Shopify was busy is the one outcome worth designing out. */
  stub(() => new Response("", { status: 429 }));
  r = await storeExists("busy.myshopify.com");
  check(r.status === "unknown", "429 is unknown, never no", `${r.status} (${r.reason})`);

  stub(() => new Response("", { status: 503 }));
  r = await storeExists("down.myshopify.com");
  check(r.status === "unknown", "and so is a 5xx", `${r.status} (${r.reason})`);

  stub(() => {
    throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
  });
  r = await storeExists("slow.myshopify.com");
  check(r.status === "unknown", "a timeout is unknown", `${r.status} (${r.reason})`);

  /* BUT A DOMAIN THAT DOES NOT RESOLVE IS A `no`. Now that any domain shape is
     accepted, somebody can type a custom domain nobody has registered — and
     `*.myshopify.com` being a wildcard, that can only happen off it. Node
     reports NXDOMAIN as a TypeError with `cause.code === "ENOTFOUND"`, which is
     Shopify-independent and definite. Letting it through as `unknown` would
     write a row for a domain that does not exist. */
  stub(() => {
    throw Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }),
    });
  });
  r = await storeExists("khongtontai-abc-999-zzz.com");
  check(r.status === "no", "a domain that does not resolve is no", `${r.status} (${r.reason})`);

  /* A temporary DNS failure is not the same answer. */
  stub(() => {
    throw Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo EAI_AGAIN"), { code: "EAI_AGAIN" }),
    });
  });
  r = await storeExists("blip.myshopify.com");
  check(r.status === "unknown", "but a temporary DNS failure is unknown", `${r.status} (${r.reason})`);

  console.log("\nand a domain that answers but is not a shop");

  /* `zenitex.com` is the real case: 200 with an HTML page, because something is
     serving the domain and returns its own page for every path. It is a `no` and
     not an `unknown` — `unknown` is let through, and this must not be. */
  stub(() => new Response("<!doctype html><html>parked</html>", { status: 200, headers: { "content-type": "text/html" } }));
  r = await storeExists("zenitex.com");
  check(r.status === "no", "200 with a page instead of a record is no", `${r.status} (${r.reason})`);

  stub(() => json(200, { hello: "world" }));
  r = await storeExists("odd.com");
  check(r.status === "no", "and so is 200 JSON with no shop id", `${r.status} (${r.reason})`);

  console.log("\nany domain shape, so long as the store is real");

  stub(() => json(200, { ...SHOP, name: "Zenitex" }));
  r = await storeExists("adbv.com");
  check(r.status === "yes", "a custom domain is accepted", `${r.status} "${r.name}"`);
  check(asked === "https://adbv.com/meta.json", "and asked at that domain", asked);

  console.log("\nwhatever the merchant actually typed");

  stub(() => json(200, SHOP));
  r = await storeExists("  HTTPS://FF1EWP-0E.myshopify.com/collections/all?x=1  ");
  check(r.status === "yes", "scheme, case, path and query are all stripped", r.status);
  check(
    asked === "https://ff1ewp-0e.myshopify.com/meta.json",
    "and the request goes to the store itself",
    asked,
  );

  /* The value reaches a URL, so the guard is not decoration. */
  for (const bad of ["", "   ", "@evil.com", "a b.myshopify.com"]) {
    r = await storeExists(bad);
    check(r.status === "no", `refused without a request: "${bad}"`, r.status);
  }

  globalThis.fetch = real;

  if (process.env.LIVE === "1") {
    console.log("\nagainst Shopify, for real");
    /* ASSERTED AS THE DECISION, NOT THE STATUS, and the difference is what
       keeps this half honest. A real store that answers `unknown` — Shopify
       rate-limited us, which happened on the second run of this very list — is
       the module working: `unknown` fails open and the merchant gets in. Asking
       for a literal `yes` made the test fail while the behaviour was correct. */
    const live: [string, "admits" | "refuses"][] = [
      ["ff1ewp-0e.myshopify.com", "admits"],
      ["cabbea-60.myshopify.com", "refuses"],
      /* Locked behind a password, and still a real merchant. */
      ["allbirds.myshopify.com", "admits"],
      ["notastore99887766.myshopify.com", "refuses"],
      /* Custom domains, which this form now accepts. */
      ["gymshark.com", "admits"],
      ["zenitex.com", "refuses"],
      ["khongtontai-abc-999-zzz.com", "refuses"],
    ];
    for (const [domain, want] of live) {
      const got = await storeExists(domain);
      const decision = got.status === "no" ? "refuses" : "admits";
      check(
        decision === want,
        `${domain} → ${want}`,
        `${got.status}${got.name ? ` "${got.name}"` : ""}${got.reason ? ` (${got.reason})` : ""}`,
      );
    }
  } else {
    console.log("\n(skipping the live checks — set LIVE=1 to ask Shopify)");
  }

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
