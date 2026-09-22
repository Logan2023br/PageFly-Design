import "server-only";

/* ==========================================================================
   WHICH COUNTRY A REQUEST CAME FROM.

   THE IP IS NEVER STORED, AND THAT IS THE WHOLE DESIGN OF THIS FILE. An IP
   address identifies a person; a country code does not. So the address is read
   from the request, turned into two letters, and dropped — nothing downstream
   of here ever sees it, and no column anywhere holds it. `lib/analytics.ts`
   opens with "NO PERSONAL DATA" and this keeps that true rather than quietly
   making it a slogan.

   TWO WAYS TO GET THE ANSWER, AND THE FIRST ONE COSTS NOTHING.

   1. A HEADER, when something in front of the app already knows. Cloudflare
      sends `cf-ipcountry`, Vercel sends `x-vercel-ip-country`, and an nginx
      built with the GeoIP module can be told to send whatever it likes — the
      two common spellings are here. If a header answers, no network call is
      made at all, and that is the configuration to aim for.

   2. A LOOKUP, otherwise. One outbound request per address, cached, with a
      short timeout. Behind a plain nginx with no GeoIP module this is the only
      way, and without it the feature simply does not exist.

   THE CACHE IS WHAT MAKES THIS AFFORDABLE. Every visitor fires a dozen events
   in a session and they all come from one address, so the first one pays for
   the lookup and the rest are free. Capped and aged, because a map that only
   grows is a leak with a slow fuse.

   IT CANNOT FAIL THE REQUEST IT IS IN. Every path returns null rather than
   throwing, and the caller writes null. An event with no country is a row that
   is still counted everywhere except the country breakdown — losing the
   geography of a press is a smaller loss than losing the press.
   ========================================================================== */

/** Turn the lookup off entirely — headers still work. */
const DISABLED = process.env.GEO_LOOKUP === "off";

/**
 * Where to resolve an address that no header named.
 *
 * Overridable so a deployment can point at its own resolver, or at a paid
 * account, without a code change. `{ip}` is replaced; the reply must be JSON
 * with a two-letter code at `countryCode` or `country_code`.
 */
const ENDPOINT =
  process.env.GEO_LOOKUP_URL ?? "http://ip-api.com/json/{ip}?fields=status,countryCode";

/** Long enough for a healthy lookup, short enough to never hold up an insert. */
const TIMEOUT_MS = 800;

/** Entries, and how long one stays good. A visitor's country does not change. */
const CACHE_MAX = 5_000;
const CACHE_MS = 12 * 60 * 60 * 1000;

const cache = new Map<string, { country: string | null; at: number }>();

/**
 * The header a proxy may already have set.
 *
 * `XX` is what Cloudflare sends for an address it cannot place, and `T1` for
 * Tor — both mean "unknown" and are dropped rather than becoming countries of
 * their own on the filter row.
 */
const HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-geo-country",
  "x-country-code",
] as const;

function fromHeader(request: Request): string | null {
  for (const name of HEADERS) {
    const raw = request.headers.get(name);
    if (!raw) continue;
    const code = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1") return code;
  }
  return null;
}

/**
 * The address the request came from, as far as the proxy in front will say.
 *
 * THE FIRST ENTRY OF `x-forwarded-for`, not the last. The header is a trail —
 * client, then each proxy — so the leftmost is the visitor and the rightmost is
 * our own nginx. Reading the wrong end places every visitor in the data centre.
 *
 * It is also client-settable when nothing rewrites it, which is why this value
 * only ever becomes a country code and never reaches storage: the worst a
 * forged header can do here is put a press in the wrong country.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const ip = first || request.headers.get("x-real-ip")?.trim() || null;
  if (!ip) return null;

  /* A private or loopback address has no country and asking costs a round trip
     to be told so. Covers the local dev case, where every request is ::1. */
  if (
    /^(10\.|127\.|192\.168\.|169\.254\.|::1|fc|fd)/i.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "unknown"
  )
    return null;

  /* Bounded before it is interpolated into a URL. */
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

async function lookup(ip: string): Promise<string | null> {
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.country;

  let country: string | null = null;
  try {
    const res = await fetch(ENDPOINT.replace("{ip}", encodeURIComponent(ip)), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      /* Next caches fetches by default; a per-address lookup must not land in
         the data cache, and the local map above is the cache we want. */
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      const raw = body.countryCode ?? body.country_code;
      const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
      if (/^[A-Z]{2}$/.test(code)) country = code;
    }
  } catch {
    /* Timed out, refused, rate-limited, or not JSON. Cached as null all the
       same: a resolver that is down should be asked once a session, not once
       per press. */
  }

  /* Oldest out first. `Map` keeps insertion order, so the first key is the
     oldest written — good enough for a cache whose entries are interchangeable. */
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(ip, { country, at: Date.now() });
  return country;
}

/**
 * The two-letter country for this request, or null.
 *
 * Null is a normal answer: a local request, a proxy that strips the address, a
 * resolver that is down, or a deployment with `GEO_LOOKUP=off`.
 */
export async function countryOf(request: Request): Promise<string | null> {
  const named = fromHeader(request);
  if (named) return named;
  if (DISABLED) return null;

  const ip = clientIp(request);
  if (!ip) return null;
  return lookup(ip);
}
