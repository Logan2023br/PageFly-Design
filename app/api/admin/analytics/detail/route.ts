import { readAdminSession } from "@/lib/session";
import { getRepo } from "@/lib/db";
import { DETAIL_OF, type DetailRow, type DetailResponse } from "@/lib/analytics/detail";
import type { EventHit, GeoFilter } from "@/lib/db/types";

/**
 * How many individual presses come back with a tile.
 *
 * Enough that a busy day reads as a day rather than as a sample, and few enough
 * that opening a tile is not a megabyte. The tile itself carries the true total,
 * so this number never has to be right — only recent.
 */
const FEED = 300;

/* ==========================================================================
   What is behind one tile.

       GET /api/admin/analytics/detail?event=design_page_exported&days=30

   THE TILES ANSWER "HOW MANY" AND STOP THERE, and the next question is always
   the same one: which stores, which pages, how many times each. That answer is
   several hundred rows on a busy event, which is why it is a second request
   made when somebody opens a tile rather than more weight on the screen's
   first paint — most tiles are never opened.

   WHICH EVENTS ARE ALLOWED IS A LIST, NOT A PARAMETER. `lib/analytics/detail`
   names them and names the parameter each one breaks down by. An arbitrary
   event name here would be a query builder driven by a query string, and the
   `props->>` key would be attacker-chosen; a lookup in a table this route does
   not own is neither.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await readAdminSession()))
    return Response.json({ ok: false, error: "Not signed in." } satisfies DetailResponse, {
      status: 401,
    });

  const url = new URL(request.url);
  const event = url.searchParams.get("event") ?? "";
  const spec = DETAIL_OF[event];

  if (!spec)
    return Response.json(
      { ok: false, error: "No detail is kept for that tile." } satisfies DetailResponse,
      { status: 404 },
    );

  /* THE SAME WINDOW ARITHMETIC AS THE SUMMARY, and it has to stay the same: a
     tile reading 12 that opens onto 30 rows is a screen nobody can trust. The
     day and the offset are carried through for exactly that reason — a day
     picked on the strip narrows the tile, so it must narrow what is inside it.
     ====================================================================== */
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30) || 30));
  const tz = Math.max(
    -840,
    Math.min(840, Number(url.searchParams.get("tz") ?? 0) || 0),
  );
  const dayParam = url.searchParams.get("day");
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : null;

  const to = day
    ? new Date(Date.parse(`${day}T00:00:00.000Z`) - tz * 60_000 + 24 * 60 * 60 * 1000)
    : new Date();
  const span = day ? 24 * 60 * 60 * 1000 : days * 24 * 60 * 60 * 1000;
  const from = new Date(to.getTime() - span);

  /* ONE SLICE OF THE PARAMETER, when the tile is one slice of it.

     The Install PageFly tiles are a single event fired from five placements,
     drawn as a tile each; a tile that opened into all five presses would not
     be the list it is a summary of. The KEY is still the one this route looked
     up in a table it does not own — only the VALUE arrives here, bounded and
     bound into the statement, and ignored outright for an event that has no
     parameter to slice. */
  /* THE SAME FILTER THE TILE WAS COUNTED UNDER. A tile reading 12 while the
     screen is narrowed to Vietnam that opens onto every country's presses is a
     panel that contradicts the number it came from. Parsed the same way as in
     the summary route — see the note there. */
  const codes = (raw: string | null): string[] =>
    (raw ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .map((c) => (c === "UNKNOWN" ? "unknown" : c))
      .filter((c) => c === "unknown" || /^[A-Z]{2}$/.test(c))
      .slice(0, 20);

  const only = codes(url.searchParams.get("country"));
  const except = codes(url.searchParams.get("exclude"));
  const geo: GeoFilter =
    only.length > 0 || except.length > 0
      ? { ...(only.length > 0 ? { only } : {}), ...(except.length > 0 ? { except } : {}) }
      : null;

  const partParam = url.searchParams.get("part");
  const part =
    spec.propKey && partParam && partParam.length > 0 && partParam.length <= 120
      ? partParam
      : null;

  let rows: DetailRow[];
  let hits: EventHit[];
  try {
    /* TWO READS, ONE WINDOW. The fold and the feed answer different questions —
       "which stores, how often" and "who, when" — and neither can be derived
       from the other: folding destroys the order, and the feed is capped so its
       counts are not the totals. Issued together so they cannot disagree about
       the range they cover. */
    [rows, hits] = await Promise.all([
      getRepo().eventsByStore(
        event,
        from.toISOString(),
        to.toISOString(),
        spec.propKey,
        spec.groupProp ?? null,
        part,
        geo,
      ),
      getRepo().recentEvents(
        event,
        from.toISOString(),
        to.toISOString(),
        spec.propKey,
        part,
        FEED,
        geo,
      ),
    ]);
  } catch {
    /* Same posture as the summary: a database that is not there is not an
       error the operator can act on from this screen. */
    return Response.json(
      { ok: false, error: "The database is not reachable." } satisfies DetailResponse,
      { status: 503 },
    );
  }

  return Response.json({
    ok: true,
    event,
    unit: spec.unit,
    partLabel: spec.partLabel,
    rows,
    hits,
  } satisfies DetailResponse);
}
