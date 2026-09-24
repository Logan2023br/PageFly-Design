import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";

/* ==========================================================================
   GET /api/admin/stats?days=30

   The Thống kê screen used to render on the server from one `stats()` call.
   It has a date range now, and a range that reloads the page throws away the
   scroll position and every open breakdown each time somebody compares seven
   days against thirty — which is the only thing anybody does with a range.
   `/design/admin/analytics` reached the same conclusion and says so; this is
   the same trade, not a new one.

   ADMIN ONLY, and the check is the first thing here. Everything this returns —
   what the product cost to run, which countries the merchants are in, how many
   signed in and never built — is operator-facing, and the route is one
   forgotten line away from being public.
   ========================================================================== */

export const dynamic = "force-dynamic";

/** Matching the picker. 0 means every row ever recorded. */
const ALLOWED = new Set([1, 7, 30, 90, 0]);

export async function GET(req: Request): Promise<Response> {
  if (!(await readAdminSession())) {
    return Response.json({ error: "not signed in" }, { status: 401 });
  }

  const p = new URL(req.url).searchParams;

  /* CLAMPED TO A LIST, not merely parsed. The window is interpolated into an
     SQL interval — `Number()` already makes an injection impossible, but a
     caller asking for 100000 days would ask the database for a sequential scan
     of everything on an endpoint that needs no such range. */
  const asked = Number(p.get("days") ?? 30);
  const days = ALLOWED.has(asked) ? asked : 30;

  /* Shape-checked here as well as in the driver. The day reaches SQL as a bound
     parameter either way, so this is about refusing nonsense early rather than
     about safety. */
  const rawDay = p.get("day");
  const day = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : null;

  /* THE SAME PARAMETER NAMES THE ANALYTICS ROUTE USES — `country` for the ones
     to keep, `exclude` for the ones to drop — because the two screens ask the
     same question and a reader comparing their URLs should not have to learn
     two spellings.

     Each entry is a two-letter code or the literal `unknown`, the bucket
     holding every store with no country on file. Anything else is dropped
     rather than passed through as a filter that would silently match nothing. */
  const list = (name: string) =>
    (p.get(name) ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => /^[A-Za-z]{2}$/.test(c) || c === "unknown")
      .map((c) => (c.length === 2 ? c.toUpperCase() : c));

  return Response.json(
    await getRepo().stats({ days, day, only: list("country"), except: list("exclude") }),
  );
}
