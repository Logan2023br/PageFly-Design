import "server-only";

import { getRepo } from "../db";
import type { PhotoRecord } from "../db/types";

/* ==========================================================================
   Real photographs for the mockup.

   The mockups drew their own imagery — seeded SVG shapes in the page's
   palette. It was defensible (free, instant, always on-brand) and it was the
   single biggest reason a finished deck read as a wireframe rather than a
   store.

   Photographs are searched, not generated. A generated image costs about $0.02
   and several seconds each; at eight images across thirty pages that is $5 and
   minutes of waiting for pictures the merchant replaces with their own product
   shots the moment they import. What the mockup needs from an image is that it
   be real and be of the right subject, and a stock search delivers both for
   nothing.

   TWO THINGS THE FREE TIER DEMANDS BACK.

   Rate. 200 searches an hour, 20,000 a month. A single thirty-page build asks
   for about 210, so the very first merchant to use their whole allowance would
   run the app out of quota. Results are therefore cached in the DATABASE and
   keyed by the phrase alone — two merchants selling ceramics ask for the same
   subjects, and one lookup should serve both, across deploys.

   Credit. The API guidelines require a prominent link to Pexels and the
   photographer named where possible, so the photographer and the photo's page
   are carried alongside the URL rather than thrown away. Everything that
   renders an image is expected to render its credit.

   Missing key, failed request, no result: the caller gets nothing for that
   query and the renderer shows its grey plate. Never an error — this sits in
   the path of a page the merchant is waiting on.
   ========================================================================== */

export type StockPhoto = { url: string; credit: string; link: string };

/** Per-process, in front of the database: a deck asks for the same subject on
    several pages within seconds of itself. */
const hot = new Map<string, StockPhoto | null>();

const PEXELS = "https://api.pexels.com/v1/search";
const UNSPLASH = "https://api.unsplash.com/search/photos";

export function stockProvider(): "pexels" | "unsplash" | "none" {
  if (process.env.PEXELS_API_KEY) return "pexels";
  if (process.env.UNSPLASH_ACCESS_KEY) return "unsplash";
  return "none";
}

/** The cache key. Case and edge whitespace are not a different search. */
function keyOf(query: string): string {
  return query.trim().toLowerCase();
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
    photos?: {
      src?: { large2x?: string; large?: string };
      photographer?: string;
      url?: string;
    }[];
  };
  const hit = body.photos?.[0];
  const src = hit?.src?.large2x ?? hit?.src?.large;
  return src
    ? {
        url: src,
        credit: hit?.photographer ?? "",
        link: hit?.url ?? "https://www.pexels.com",
      }
    : null;
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
    results?: {
      urls?: { regular?: string };
      links?: { html?: string };
      user?: { name?: string };
    }[];
  };
  const hit = body.results?.[0];
  return hit?.urls?.regular
    ? {
        url: hit.urls.regular,
        credit: hit.user?.name ?? "",
        link: hit.links?.html ?? "https://unsplash.com",
      }
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
 * Resolve every query a page asked for.
 *
 * Three tiers, cheapest first: this process, then the database, then the API.
 * Only what survives all three costs a request against the hourly limit.
 *
 * Deduplicated before any of that: a page showing the same subject in a hero
 * and a feature row should spend one request and show one photograph, not two
 * near-identical ones from the same search.
 */
export async function resolvePhotos(
  requests: { query: string; ratio: number }[],
  signal?: AbortSignal,
): Promise<Record<string, StockPhoto>> {
  if (stockProvider() === "none") return {};

  /* Original spelling per key, because the caller looks results up by the
     string the model wrote, not by the normalised one. */
  const wanted = new Map<string, { original: string; landscape: boolean }>();
  for (const r of requests) {
    const key = keyOf(r.query);
    if (!key || wanted.has(key)) continue;
    /* Orientation follows the shape the design asked for; a portrait crop of a
       landscape photograph loses whatever the search actually matched on. */
    wanted.set(key, { original: r.query, landscape: r.ratio <= 1.05 });
  }
  if (wanted.size === 0) return {};

  const found: Record<string, StockPhoto> = {};
  const missing: string[] = [];

  for (const [key, { original }] of wanted) {
    if (hot.has(key)) {
      const photo = hot.get(key);
      if (photo) found[original] = photo;
      continue;
    }
    missing.push(key);
  }

  /* ---- tier two: the database ------------------------------------------ */

  if (missing.length > 0) {
    try {
      const rows = await getRepo().getPhotos(missing);
      for (const row of rows) {
        const photo = { url: row.url, credit: row.credit, link: row.link };
        hot.set(row.query, photo);
        const want = wanted.get(row.query);
        if (want) found[want.original] = photo;
      }
      const hit = new Set(rows.map((r) => r.query));
      missing.splice(0, missing.length, ...missing.filter((q) => !hit.has(q)));
    } catch {
      /* No database, or it is down. The API is still there, and a mockup
         without photographs is a worse answer than a slower one. */
    }
  }

  if (missing.length === 0) return found;

  /* ---- tier three: the API --------------------------------------------- */

  const timeout = AbortSignal.timeout(12_000);
  const composite = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const fresh: PhotoRecord[] = [];
  const now = new Date().toISOString();

  await Promise.all(
    missing.map(async (key) => {
      const want = wanted.get(key)!;
      try {
        const photo = await lookup(want.original, want.landscape, composite);
        hot.set(key, photo);
        if (photo) {
          found[want.original] = photo;
          fresh.push({ query: key, ...photo, fetchedAt: now });
        }
      } catch {
        /* Not cached at any tier: a timeout is transient, and remembering it
           would keep the grey plate for the rest of the process. */
      }
    }),
  );

  if (fresh.length > 0) {
    try {
      await getRepo().savePhotos(fresh);
    } catch {
      /* The lookup already succeeded; failing to remember it costs a repeat
         later, not this page. */
    }
  }

  return found;
}

/** Just the URLs, for callers that render an image and nothing else. */
export function urlsOf(photos: Record<string, StockPhoto>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(photos).map(([query, photo]) => [query, photo.url]),
  );
}
