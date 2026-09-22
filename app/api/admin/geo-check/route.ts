import { readAdminSession } from "@/lib/session";
import { countryOf } from "@/lib/geo";

/* ==========================================================================
   WHY IS EVERY ROW UNPLACED?

       GET /api/admin/geo-check

   THE QUESTION THIS ANSWERS, which otherwise takes a deployment to guess at.
   A country column full of dashes has four possible causes and they need
   completely different fixes:

   1. Nothing in front of the app sets a geo header, and nothing sets
      `x-forwarded-for` either — so there is no address to resolve. The fix is
      one line of nginx config.
   2. The header is there but names the PROXY rather than the visitor, which is
      what reading the wrong end of `x-forwarded-for` looks like — every press
      lands in the data centre's country.
   3. The address is fine and the resolver is unreachable — a firewall with no
      outbound HTTP, or a rate limit.
   4. `GEO_LOOKUP=off`.

   From the outside all four look identical: dashes. This says which, using the
   ADMIN'S OWN REQUEST as the sample — the same headers a visitor's request
   carries, through the same proxy, resolved by the same code path.

   ADMIN ONLY, AND THE ADDRESS IS SHOWN. That is the point — it is the value
   being debugged, and it is the reader's own. Nothing here is stored.
   ========================================================================== */

export const dynamic = "force-dynamic";

/** The headers that decide the answer, so the reply names what it actually saw. */
const RELEVANT = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-geo-country",
  "x-country-code",
  "x-forwarded-for",
  "x-real-ip",
] as const;

export async function GET(request: Request) {
  if (!(await readAdminSession()))
    return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const seen: Record<string, string | null> = {};
  for (const name of RELEVANT) seen[name] = request.headers.get(name);

  const started = Date.now();
  const country = await countryOf(request).catch(() => null);
  const ms = Date.now() - started;

  const header = RELEVANT.slice(0, 4).find((h) => seen[h]);

  /* Said in a sentence, because the caller of this is a person looking at a
     screen of dashes, not a program. */
  const verdict = country
    ? header
      ? `Resolved to ${country} from the "${header}" header. No outbound lookup — this is the configuration to be in.`
      : `Resolved to ${country} by looking up the address. Works, but costs one outbound request per new visitor; setting a geo header in nginx removes that.`
    : process.env.GEO_LOOKUP === "off"
      ? "GEO_LOOKUP=off, so nothing is resolved and every row will be unplaced. Remove the variable, or set a geo header in nginx."
      : !seen["x-forwarded-for"] && !seen["x-real-ip"]
        ? "No geo header AND no forwarded address — the app cannot see who is calling it. nginx needs proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; (and ideally a geo header)."
        : `An address was forwarded but it did not resolve in ${ms}ms. Either it is a private address, or the resolver is unreachable from this box — check outbound HTTP.`;

  return Response.json(
    {
      ok: true,
      country,
      /* The two-letter answer is the product; these are the evidence for it. */
      resolvedFrom: header ?? (country ? "ip lookup" : null),
      tookMs: ms,
      lookupDisabled: process.env.GEO_LOOKUP === "off",
      headers: seen,
      verdict,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
