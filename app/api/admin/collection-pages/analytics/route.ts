import { EV } from "@/lib/analytics";
import {
  buildCollectionView,
  collectionHits,
  type CpHit,
  type CpView,
} from "@/lib/collectionAnalytics";
import { getRepo } from "@/lib/db";
import { guard } from "../shared";

/* ==========================================================================
   GET /api/admin/collection-pages/analytics?days=30&day=2026-09-28&tz=420

   Everything Admin → Collection pages → Analytics draws, in one answer. The
   rows are read once for the window and folded by `buildCollectionView`; the
   events it reads, named here so the coverage test can see this screen draws
   them:

     EV.cpListViewed  EV.cpSetViewed  EV.cpSectionSeen  EV.cpPageOpened
     EV.cpBuyClicked  EV.cpCheckoutViewed  EV.cpCheckoutFailed
     EV.cpPromoClicked  EV.cpGateOpened  EV.cpLeadSubmitted  EV.cpLeadFailed
     EV.showcasePageViewed  EV.showcaseFrameChanged
     EV.showcaseFileDownloaded  EV.showcaseSetDownloaded
       (the last four only where they say from: "collection_pages")

   `days=0` is all time. `tz` is the reader's minutes east of UTC, so a day on
   the strip is the reader's day — the same convention as the main screen.
   ========================================================================== */

export const dynamic = "force-dynamic";

/** Enough for this screen by orders of magnitude; hitting it is reported. */
const MAX_EVENTS = 200_000;

export type CollectionAnalyticsResponse =
  | { ok: true; view: CpView }
  | { ok: false; error: string };

/** `?hits=<metric>` — what one element of the screen opens into. */
export type CollectionHitsResponse =
  | { ok: true; hits: CpHit[]; total: number }
  | { ok: false; error: string };

const MAX_HITS = 300;

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  const url = new URL(request.url);
  const days = [0, 7, 30, 90].includes(Number(url.searchParams.get("days")))
    ? Number(url.searchParams.get("days"))
    : 30;
  const tz = Math.max(-720, Math.min(840, Number(url.searchParams.get("tz") ?? 0) || 0));
  const dayRaw = url.searchParams.get("day");
  const day = dayRaw && /^\d{4}-\d{2}-\d{2}$/.test(dayRaw) ? dayRaw : null;

  const to = new Date();
  /* The window starts at the reader's midnight `days - 1` days ago, so the
     first bar on the strip is a whole day rather than whatever part of it
     falls inside "now minus 30 × 24h". */
  let from: Date;
  if (days === 0) from = new Date(0);
  else {
    const local = new Date(to.getTime() + tz * 60_000);
    local.setUTCHours(0, 0, 0, 0);
    local.setUTCDate(local.getUTCDate() - (days - 1));
    from = new Date(local.getTime() - tz * 60_000);
  }

  try {
    const repo = getRepo();
    const [events, orders, sets, leads] = await Promise.all([
      repo.collectionPageEvents(from.toISOString(), to.toISOString(), MAX_EVENTS),
      repo.listCollectionOrders(),
      repo.listCollectionSets(),
      repo.listCollectionLeads(20_000),
    ]);

    const metric = url.searchParams.get("hits");
    if (metric) {
      const result = collectionHits({
        metric,
        key: url.searchParams.get("key"),
        set: url.searchParams.get("set"),
        events,
        orders,
        leads,
        sets,
        day,
        from: from.toISOString(),
        to: to.toISOString(),
        tz,
        limit: MAX_HITS,
      });
      if (!result) {
        return Response.json(
          { ok: false, error: "That figure does not open." } satisfies CollectionHitsResponse,
          { status: 400 },
        );
      }
      return Response.json({ ok: true, ...result } satisfies CollectionHitsResponse);
    }

    const view = buildCollectionView({
      events,
      orders,
      leads,
      sets,
      days,
      day,
      from: from.toISOString(),
      to: to.toISOString(),
      tz,
      truncated: events.length >= MAX_EVENTS,
    });
    return Response.json({ ok: true, view } satisfies CollectionAnalyticsResponse);
  } catch (err) {
    console.error("[collection-pages analytics]", err);
    return Response.json(
      { ok: false, error: "The figures could not be read — try again." } satisfies CollectionAnalyticsResponse,
      { status: 500 },
    );
  }
}

/* Referenced, not called: keeps the list above honest if a name is renamed. */
void [
  EV.cpListViewed,
  EV.cpSetViewed,
  EV.cpSectionSeen,
  EV.cpPageOpened,
  EV.cpBuyClicked,
  EV.cpCheckoutViewed,
  EV.cpCheckoutFailed,
  EV.cpPromoClicked,
  EV.cpGateOpened,
  EV.cpLeadSubmitted,
  EV.cpLeadFailed,
];
