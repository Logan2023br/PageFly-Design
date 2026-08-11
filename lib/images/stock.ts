import "server-only";

/* ==========================================================================
   Real photographs for the mockup.

   The mockups drew their own imagery — seeded SVG shapes in the page's palette.
   It was defensible (free, instant, always on-brand) and it was the single
   biggest reason a finished deck read as a wireframe rather than a store.

   Photographs are searched, not generated. A generated image costs about $0.02
   and several seconds each; at eight images across thirty pages that is $5 and
   minutes of waiting for pictures the merchant replaces with their own product
   shots the moment they import. What the mockup needs from an image is that it
   be real and be of the right subject, and a stock search delivers both for
   nothing.

   Missing key, failed request, no result: the caller gets nothing back for that
   query and the renderer shows its grey plate. Never an error — this sits in
   the path of a page the merchant is waiting on.
   ========================================================================== */

export type StockPhoto = { url: string; credit: string };

/* One process-lifetime cache. Queries repeat heavily both within a deck (every
   page asks for the same hero subject) and across merchants in a vertical, and
   the free tiers here are rate-limited per hour. */
const cache = new Map<string, StockPhoto | null>();

const PEXELS = "https://api.pexels.com/v1/search";
const UNSPLASH = "https://api.unsplash.com/search/photos";

export function stockProvider(): "pexels" | "unsplash" | "none" {
  if (process.env.PEXELS_API_KEY) return "pexels";
  if (process.env.UNSPLASH_ACCESS_KEY) return "unsplash";
  return "none";
}

async function fromPexels(
  query: string,
  landscape: boolean,
  signal: AbortSignal,
): Promise<StockPhoto | null> {
  const url = `${PEXELS}?query=${encodeURIComponent(query)}&per_page=1&orientation=${
    landscape ? "landscape" : "portrait"
  }`;
  const res = await fetch(url, {
    headers: { Authorization: process.env.PEXELS_API_KEY! },
    signal,
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    photos?: { src?: { large2x?: string; large?: string }; photographer?: string }[];
  };
  const hit = body.photos?.[0];
  const src = hit?.src?.large2x ?? hit?.src?.large;
  return src ? { url: src, credit: hit?.photographer ?? "Pexels" } : null;
}

async function fromUnsplash(
  query: string,
  landscape: boolean,
  signal: AbortSignal,
): Promise<StockPhoto | null> {
  const url = `${UNSPLASH}?query=${encodeURIComponent(query)}&per_page=1&orientation=${
    landscape ? "landscape" : "portrait"
  }`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY!}` },
    signal,
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    results?: { urls?: { regular?: string }; user?: { name?: string } }[];
  };
  const hit = body.results?.[0];
  return hit?.urls?.regular
    ? { url: hit.urls.regular, credit: hit.user?.name ?? "Unsplash" }
    : null;
}

async function lookup(
  query: string,
  landscape: boolean,
  signal: AbortSignal,
): Promise<StockPhoto | null> {
  switch (stockProvider()) {
    case "pexels":
      return fromPexels(query, landscape, signal);
    case "unsplash":
      return fromUnsplash(query, landscape, signal);
    default:
      return null;
  }
}

/**
 * Resolve every query a page asked for, concurrently.
 *
 * Deduplicated first: a page that shows the same subject in a hero and a
 * feature row should spend one request and show one photograph, not two
 * near-identical ones from the same search.
 */
export async function resolvePhotos(
  requests: { query: string; ratio: number }[],
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  if (stockProvider() === "none") return {};

  const unique = new Map<string, boolean>();
  for (const r of requests) {
    /* Orientation follows the shape the design asked for; a portrait crop of a
       landscape photograph loses whatever the search actually matched on. */
    if (!unique.has(r.query)) unique.set(r.query, r.ratio <= 1.05);
  }

  const timeout = AbortSignal.timeout(12_000);
  const composite = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;

  const found: Record<string, string> = {};

  await Promise.all(
    [...unique].map(async ([query, landscape]) => {
      if (cache.has(query)) {
        const hit = cache.get(query);
        if (hit) found[query] = hit.url;
        return;
      }
      try {
        const photo = await lookup(query, landscape, composite);
        cache.set(query, photo);
        if (photo) found[query] = photo.url;
      } catch {
        /* Not cached: a timeout is transient, and caching it would keep the
           grey plate for the rest of the process. */
      }
    }),
  );

  return found;
}
