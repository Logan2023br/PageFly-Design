import { readAdminSession } from "@/lib/session";
import { getRepo } from "@/lib/db";
import { DETAIL_OF, type DetailRow, type DetailResponse } from "@/lib/analytics/detail";

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

  /* The same clamp the summary uses, so a drill-down cannot be showing a
     window the tile above it was never counted over. */
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  let rows: DetailRow[];
  try {
    rows = await getRepo().eventsByStore(
      event,
      from.toISOString(),
      to.toISOString(),
      spec.propKey,
      spec.groupProp ?? null,
    );
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
  } satisfies DetailResponse);
}
