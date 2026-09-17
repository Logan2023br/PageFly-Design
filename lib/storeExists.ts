import "server-only";

import { normalizeDomain } from "./storeForm";

/* ==========================================================================
   Does this store exist?

   One question, one answer. Not "can we read their products", not "are they on
   the beta list" — only whether Shopify has ever heard of the domain somebody
   typed.

   ANY DOMAIN SHAPE IS ACCEPTED — `mystore.myshopify.com` and `mystore.com`
   alike. The question is whether Shopify knows the store, not whether the
   merchant typed the address we would have preferred.

   `/meta.json` IS THE ENDPOINT, and the alternatives were each tried and are
   each worse:

     /products.json   401 on any store with a password on it, which is most new
                      stores and every store that sells on a custom domain. It
                      answers "can I read the catalogue", a different question,
                      and answering it instead would refuse real merchants.
     GET /            302 to /password for a locked store, 301 to the custom
                      domain for a live one, 200 otherwise — three shapes to
                      tell apart, and a redirect chain to follow for each.
     DNS              `*.myshopify.com` is a wildcard, so a store that does
                      not exist there resolves perfectly well and DNS says
                      nothing. It is still consulted for the one case it CAN
                      answer — a custom domain nobody has registered — see
                      ENOTFOUND below.

   `/meta.json` returns 200 with the shop's own record whether or not a password
   is set, and 404 when there is no shop. Measured against real stores: a locked
   brand-new store answers 200, a locked Allbirds answers 200, a domain nobody
   has registered answers 404, and a site that is not Shopify at all answers 404.
   It is also the fastest of the three — roughly half a second.

   FAILING OPEN IS DELIBERATE. Shopify rate-limits this endpoint (a 429 is
   reproducible by asking twice quickly), and a timeout or an outage is our
   problem rather than the merchant's. Every one of those answers `unknown`, and
   the caller is expected to let an `unknown` through: turning a merchant away
   because Shopify was busy is the one failure mode worth designing against.
   ========================================================================== */

/**
 * `yes` and `no` are Shopify's answer. `unknown` is ours — a rate limit, a
 * timeout, a network failure, or anything else that is not an answer about the
 * store. Three values rather than a boolean because a caller that cannot tell
 * "no such store" from "we could not ask" will eventually show one as the other.
 */
export type StoreExists = {
  status: "yes" | "no" | "unknown";
  /** The shop's own name, when it answered. `My Store` is Shopify's default —
      a brand-new store that has not been named yet, not a missing value. */
  name?: string;
  /** Two-letter country, for a page that should not price in the wrong money. */
  country?: string;
  /** What Shopify says is published. Zero is the normal state of a new store,
      and it is worth knowing BEFORE asking the catalogue for anything. */
  products?: number;
  /** Why, when the status is `unknown` — for a log, never for the merchant. */
  reason?: string;
};

/** Long enough for a slow answer, short enough that nobody watches a spinner.
    Measured: 300–1300ms for a real store, so this is several times the worst
    honest case and anything beyond it is a fault rather than a slow store. */
const TIMEOUT_MS = 6000;

/**
 * Ask Shopify whether a store exists.
 *
 * The domain is normalised here rather than trusted from the caller — this runs
 * on whatever a merchant typed, and `HTTPS://MyStore.myshopify.com/` is the
 * same store as `mystore.myshopify.com`.
 */
export async function storeExists(raw: string): Promise<StoreExists> {
  const domain = normalizeDomain(raw);
  if (!domain) return { status: "no", reason: "empty" };

  /* A path or a query would make this a request to somewhere else entirely, and
     `normalizeDomain` already cut both — this is the belt to that braces, because
     the value reaches a URL. */
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(domain))
    return { status: "no", reason: "not a hostname" };

  let res: Response;
  try {
    res = await fetch(`https://${domain}/meta.json`, {
      headers: {
        /* Named, because an unidentified agent is what rate limiters block
           first and what a shop owner reading their logs cannot place. */
        "user-agent": "PageFlyDesign/1.0 (+https://pagefly.io)",
        accept: "application/json",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    /* NXDOMAIN IS AN ANSWER; EVERYTHING ELSE HERE IS NOT.

       Node reports a domain that does not resolve as a TypeError carrying
       `cause.code === "ENOTFOUND"`. That is definite and does not depend on
       Shopify being reachable, so it is a `no` — and it is the only way to
       catch a custom domain nobody has registered, since `*.myshopify.com`
       resolves for every name whether the store exists or not.

       `EAI_AGAIN` is the temporary DNS failure and stays `unknown`, as does a
       timeout and any other connection fault: those are our problem, and the
       caller lets an `unknown` through. */
    const code = (err as { cause?: { code?: unknown } })?.cause?.code;
    if (code === "ENOTFOUND") return { status: "no", reason: "does not resolve" };
    return {
      status: "unknown",
      reason: err instanceof Error ? (typeof code === "string" ? code : err.name) : "fetch failed",
    };
  }

  if (res.status === 404) return { status: "no" };

  if (!res.ok)
    /* 429 lives here, and so does every 5xx. Shopify being busy is not a
       merchant without a store. */
    return { status: "unknown", reason: `http ${res.status}` };

  /* A 200 THAT IS NOT A SHOP RECORD IS A `no`, NOT AN `unknown`, and the
     difference matters because `unknown` is let through.

     The server answered; it simply is not a Shopify shop. `zenitex.com` is the
     case that settled it — 200 with an HTML page, because something is serving
     that domain and it returns its own page for every path. Treating that as
     `unknown` would admit any parked domain on the internet. `unknown` is for
     the times WE could not ask: a rate limit, a timeout, an outage. */
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: "no", reason: "not a shopify store" };
  }

  if (!body || typeof body !== "object" || !("id" in body))
    return { status: "no", reason: "not a shopify store" };

  const shop = body as Record<string, unknown>;
  return {
    status: "yes",
    ...(typeof shop.name === "string" ? { name: shop.name.trim() } : {}),
    ...(typeof shop.country === "string" ? { country: shop.country } : {}),
    ...(typeof shop.published_products_count === "number"
      ? { products: shop.published_products_count }
      : {}),
  };
}
