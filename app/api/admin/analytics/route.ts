import { getRepo } from "@/lib/db";
import { EV } from "@/lib/analytics";
import { readAdminSession } from "@/lib/session";
import type { EventCount, EventTotal } from "@/lib/db/types";

/* ==========================================================================
   GET /api/admin/analytics?days=30

   THE SHAPING HAPPENS HERE, not in the browser, and not in the database. The
   repo answers one question — "every name and parameter combination in this
   window, counted" — and it is the same answer whichever driver replies. What
   a funnel step means, which CTA locations exist, how a duration is bucketed:
   those are product questions and they change, so they live in one readable
   place rather than in SQL.

   COUNTED IN PEOPLE. Every step of the funnel is distinct visitors, because
   "how many got this far" is a question about people — counted in clicks a
   later step can exceed an earlier one and read as growth.
   ========================================================================== */

export const dynamic = "force-dynamic";

export type FunnelStep = {
  key: string;
  label: string;
  /** what this step measures, in one line, for the screen to show */
  note: string;
  visitors: number;
  events: number;
  /** `browser` before anybody signs in, `store` after — see `unit` below */
  unit: "browser" | "store";
};

export type Slice = { key: string; label: string; count: number; visitors: number };

export type AnalyticsView = {
  from: string;
  to: string;
  days: number;
  /** nothing has been recorded in this window at all */
  empty: boolean;
  funnel: FunnelStep[];
  cta: Slice[];
  signin: Slice[];
  registerResults: Slice[];
  registerFields: Slice[];
  gallery: Slice[];
  builds: { completed: number; failed: number; cancelled: number; started: number };
  /** completed builds, bucketed by how long they took */
  durations: { label: string; count: number }[];
  /** one block per screen, in the order somebody meets them */
  pages: PageBlock[];
  /** elements that exist on more than one screen — see `SHARED` below */
  shared: SharedBlock[];
  /** the raw grouped rows, for the table view under the charts */
  rows: EventCount[];
};

/** Everything measured on one screen. */
export type PageBlock = {
  key: string;
  title: string;
  /** the address, so nobody has to guess which screen is meant */
  path: string;
  note: string;
  metrics: Metric[];
};

export type Metric = {
  key: string;
  label: string;
  note: string;
  count: number;
  /** distinct browsers, or stores for the screens behind sign-in */
  people: number;
  /** a breakdown, when the event carries a parameter worth splitting on */
  split?: Slice[];
};

/**
 * One element, counted on every screen it appears on, and in total.
 *
 * THE REASON THIS SECTION EXISTS. The install button is on the landing page,
 * inside the collections section on two different screens, under the export
 * controls and in the popup after a download. Per-screen counts answer "which
 * placement works"; the total answers "how many people did the thing at all",
 * and neither can be derived from the other — the same person can press it on
 * two screens, so the total is not a sum of the parts and a reader adding the
 * columns up would get a number that means nothing.
 */
export type SharedBlock = {
  key: string;
  title: string;
  note: string;
  total: number;
  totalPeople: number;
  bySurface: Slice[];
};

export type AnalyticsResponse =
  | { ok: true; view: AnalyticsView }
  | { ok: false; error: string };

function sum(rows: EventCount[], name: string, where?: (p: Record<string, unknown>) => boolean) {
  return rows
    .filter((r) => r.name === name && (!where || where(r.props)))
    .reduce((a, b) => a + b.count, 0);
}

/**
 * Distinct browsers for one event name.
 *
 * FROM THE DATABASE, GROUPED BY NAME ALONE, and it has to be. The first
 * version took the largest of the per-parameter groups, which is a FLOOR and
 * not an answer: somebody who pressed the install button on the landing page
 * and again after an export is one person in two groups, so the largest group
 * said one when two people had pressed it. Summing would have been the ceiling
 * and equally wrong. Only the store can intersect the id sets, so only the
 * store is asked.
 *
 * It was also documented as an upper bound, which was the opposite of what it
 * computed — worth recording, because the number looked plausible either way.
 */
function people(totals: EventTotal[], name: string) {
  return totals.find((t) => t.name === name)?.visitors ?? 0;
}

/**
 * Distinct STORES, for the half of the funnel where a store is the unit.
 *
 * A visitor is a browser: `visitorId` lives in its localStorage, so two
 * accounts signed into one browser are one visitor. Correct for the landing
 * page, where a store does not exist yet — and wrong for everything after
 * sign-in, where "how many stores exported a page" is plainly a question about
 * stores. It reported 1 for somebody testing with two accounts.
 */
function stores(totals: EventTotal[], name: string) {
  return totals.find((t) => t.name === name)?.stores ?? 0;
}

function slices(
  rows: EventCount[],
  name: string,
  key: string,
  labels: Record<string, string>,
): Slice[] {
  const by = new Map<string, Slice>();

  for (const row of rows) {
    if (row.name !== name) continue;
    const raw = row.props[key];

    /* A ROW WITHOUT THIS KEY IS NOT A MEMBER OF THIS BREAKDOWN, and skipping
       it is not tidiness. `error_field` only exists on a refused submission —
       so filing the rows without one under `unknown` put every SUCCESSFUL
       registration into "what stops people registering", where it read as a
       fourth thing blocking them. Found the first time this ran on data that
       had successes in it. */
    if (raw === undefined || raw === null) continue;

    /* A list, for `error_field` — one submission can name three boxes and each
       of them counts as one thing that stopped somebody. */
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      const id = typeof value === "string" && value ? value : "unknown";
      const hit = by.get(id) ?? { key: id, label: labels[id] ?? id, count: 0, visitors: 0 };
      hit.count += row.count;
      hit.visitors = Math.max(hit.visitors, row.visitors);
      by.set(id, hit);
    }
  }

  return [...by.values()].sort((a, b) => b.count - a.count);
}

/** Buckets chosen from the measured range: a page is about fifteen minutes, so
    the interesting question is "under ten, around fifteen, or far over". */
const DURATION_BUCKETS = [
  { label: "< 5m", max: 300 },
  { label: "5–10m", max: 600 },
  { label: "10–20m", max: 1200 },
  { label: "20–40m", max: 2400 },
  { label: "40m+", max: Infinity },
];

export async function GET(request: Request) {
  if (!(await readAdminSession()))
    return Response.json({ ok: false, error: "Not signed in." } satisfies AnalyticsResponse, {
      status: 401,
    });

  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  let rows: EventCount[];
  let totals: EventTotal[];
  try {
    /* Two shapes of the same window: grouped by name and parameters for the
       breakdowns, and by name alone for the distinct counts, which cannot be
       derived from the first. */
    [rows, totals] = await Promise.all([
      getRepo().countEvents(from.toISOString(), to.toISOString()),
      getRepo().countEventTotals(from.toISOString(), to.toISOString()),
    ]);
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message } satisfies AnalyticsResponse,
      { status: 503 },
    );
  }

  /* ==========================================================================
     THE FUNNEL, and why these steps.

     AND THE UNIT CHANGES HALFWAY DOWN, on purpose. The first four steps count
     BROWSERS, because a store does not exist yet — a visitor id is all there
     is. The last four count STORES, because after sign-in that is what the
     question is about: two accounts used from one browser are two stores that
     exported, and were one visitor who did. Each step says which it is.

     Each one is where somebody could stop. The gap between two adjacent steps
     is the only number on this screen that names a decision to make, so the
     steps are chosen to make each gap mean one thing:

       landing → cta        did the page persuade anybody
       cta → sign-in        did they arrive (anything lost here is routing)
       sign-in → submitted  did they try, or read the form and leave
       submitted → brief    did the gate let them through
       brief → started      did the questions put them off
       started → completed  did the build survive
       completed → export   was the result worth taking
     ========================================================================== */
  const funnel: FunnelStep[] = [
    {
      key: "landing",
      label: "Landing",
      note: "Everyone who saw the front page",
      visitors: people(totals, EV.landingViewed),
      events: sum(rows, EV.landingViewed),
      unit: "browser" as const,
    },
    {
      key: "cta",
      label: "Pressed a CTA",
      note: "Every link to /design — split four ways on the landing block below",
      /* EVERY LINK TO /design, HEADER ONES INCLUDED, now that the count comes
         from the database grouped by name. The filtered version was the last
         caller that needed a per-parameter count, and keeping it would have
         meant keeping the max-of-groups floor for exactly the step with the
         most parameter values — the one it was most wrong about.

         The note says so, and the landing block below splits it four ways: the
         two `Design now` buttons are the decision, the header pair belong to
         people who already have an account. */
      visitors: people(totals, EV.ctaClicked),
      events: sum(rows, EV.ctaClicked),
      unit: "browser" as const,
    },
    {
      key: "signin",
      label: "Sign-in seen",
      note: "Reached the form",
      visitors: people(totals, EV.signinViewed),
      events: sum(rows, EV.signinViewed),
      unit: "browser" as const,
    },
    {
      key: "submitted",
      label: "Sign-in tried",
      note: "Typed a domain and pressed Continue",
      visitors: people(totals, EV.signinSubmitted),
      events: sum(rows, EV.signinSubmitted),
      unit: "browser" as const,
    },
    {
      key: "brief",
      label: "Brief seen",
      note: "Through the gate, looking at the questions",
      visitors: stores(totals, EV.briefViewed),
      events: sum(rows, EV.briefViewed),
      unit: "store" as const,
    },
    {
      key: "started",
      label: "Build started",
      note: "Pressed the button",
      visitors: stores(totals, EV.generateStarted),
      events: sum(rows, EV.generateStarted),
      unit: "store" as const,
    },
    {
      key: "completed",
      label: "Build finished",
      note: "Reported by the server, so a closed tab still counts",
      visitors: stores(totals, EV.generateCompleted),
      events: sum(rows, EV.generateCompleted),
      unit: "store" as const,
    },
    {
      key: "exported",
      label: "Exported a page",
      note: "Took the file away",
      visitors: stores(totals, EV.pageExported),
      events: sum(rows, EV.pageExported),
      unit: "store" as const,
    },
  ];

  const durations = DURATION_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const row of rows) {
    if (row.name !== EV.generateCompleted) continue;
    const seconds = Number(row.props.duration_seconds ?? 0);
    const at = DURATION_BUCKETS.findIndex((b) => seconds < b.max);
    durations[at === -1 ? durations.length - 1 : at].count += row.count;
  }

  /* ==========================================================================
     ONE BLOCK PER SCREEN.

     The funnel above crosses screens by nature — that is what a funnel is —
     and answers "where do people stop". These answer a different question:
     given this screen, what happens on it. An event belongs to exactly one
     block, the screen it fires from, so no number is double-counted between
     them.

     `people` is browsers on the public screens and stores behind the gate, for
     the reason `stores()` gives at length.
     ========================================================================== */
  const metric = (
    key: string,
    label: string,
    note: string,
    name: string,
    opts: { unit?: "browser" | "store"; split?: Slice[] } = {},
  ): Metric => ({
    key,
    label,
    note,
    count: sum(rows, name),
    people: opts.unit === "store" ? stores(totals, name) : people(totals, name),
    ...(opts.split && opts.split.length > 0 ? { split: opts.split } : {}),
  });

  const pages: PageBlock[] = [
    {
      key: "landing",
      title: "Landing",
      path: "/",
      note: "The front door. Everything here is a visitor with no account yet.",
      metrics: [
        metric("viewed", "Page viewed", "the denominator of every rate below", EV.landingViewed),
        metric("cta", "CTA pressed", "all four links to /design", EV.ctaClicked, {
          split: slices(rows, EV.ctaClicked, "location", {
            hero: "Hero · Design now",
            closing: "Closing · Design now",
            header_signin: "Header · Sign in",
            header_store: "Header · store name",
          }),
        }),
        metric("gallery", "Gallery opened", "a template in the moving strip", EV.galleryOpened, {
          split: slices(rows, EV.galleryOpened, "page_type", {}),
        }),
      ],
    },
    {
      key: "login",
      title: "Sign in",
      path: "/design/login",
      note: "The gate. The split below is what the ads are actually bringing.",
      metrics: [
        metric("viewed", "Page viewed", "reached the form", EV.signinViewed),
        metric("submitted", "Continue pressed", "counted when the server answers, not on the press", EV.signinSubmitted, {
          split: slices(rows, EV.signinSubmitted, "result", {
            success: "Signed in",
            not_registered: "Not registered",
            invalid_format: "Not a store domain",
            server_error: "Our error",
          }),
        }),
        metric("register_link", "Register link", "went on rather than leaving", EV.registerLinkClicked),
      ],
    },
    {
      key: "register",
      title: "Register",
      path: "/design/register",
      note: "Including the success screen, which has no address of its own.",
      metrics: [
        metric("viewed", "Page viewed", "reached the form", EV.registerViewed),
        metric("submitted", "Register pressed", "both the form's own refusals and the server's", EV.registerSubmitted, {
          split: slices(rows, EV.registerSubmitted, "result", {
            success: "Registered",
            validation_error: "Form refused it",
            server_error: "Our error",
          }),
        }),
        metric("fields", "Fields that blocked it", "every box a refusal named, so one submission can count three", EV.registerSubmitted, {
          split: slices(rows, EV.registerSubmitted, "error_field", {
            domain: "Store domain",
            store_name: "Store name",
            email: "Email",
          }),
        }),
        metric("shopify", "Shopify sign-up", "arrivals who are not merchants yet", EV.shopifySignupClicked),
        metric("done", "Success screen seen", "compare with Registered above", EV.registeredViewed),
        metric("return", "Go to sign in", "carried on from the success screen", EV.signinReturnClicked),
      ],
    },
    {
      key: "brief",
      title: "Brief",
      path: "/design",
      note: "Behind the gate, so these are counted in stores rather than browsers.",
      metrics: [
        metric("viewed", "Page viewed", "through the gate", EV.briefViewed, { unit: "store" }),
        metric("mode", "Mode chosen", "quick or build detail", EV.briefModeSelected, {
          unit: "store",
          split: slices(rows, EV.briefModeSelected, "mode", { quick: "Quick", detail: "Build detail" }),
        }),
        metric("example", "Example opened", "read the sample brief first", EV.briefExampleClicked, { unit: "store" }),
        metric("started", "Build started", "pressed the button", EV.generateStarted, { unit: "store" }),
      ],
    },
    {
      key: "building",
      title: "While it builds",
      path: "/design",
      note: "The outcomes are the server's, so a merchant who closes the tab still counts.",
      metrics: [
        metric("completed", "Finished", "the deck was delivered", EV.generateCompleted, { unit: "store" }),
        metric("failed", "Failed", "the build itself did not finish", EV.generateFailed, { unit: "store" }),
        metric("cancelled", "Cancelled", "went back to the brief", EV.generateCancel, { unit: "store" }),
      ],
    },
    {
      key: "results",
      title: "The finished deck",
      path: "/design",
      note: "What a merchant does with what they got.",
      metrics: [
        metric("exported", "Exported a page", "took the .pagefly file", EV.pageExported, {
          unit: "store",
          split: slices(rows, EV.pageExported, "scope", { one: "One page", all: "Every page" }),
        }),
        metric("png", "PNG downloaded", "took pictures instead", EV.pagePngDownload, { unit: "store" }),
        metric("preview", "Preview opened", "read a page full size", EV.pagePreview, {
          unit: "store",
          split: slices(rows, EV.pagePreview, "page_type", {}),
        }),
        metric("regenerate", "Regenerated a page", "asked for that one again", EV.pageRegenerate, { unit: "store" }),
        metric("edit", "Edited the brief", "went back to change the answers", EV.briefEdit, { unit: "store" }),
      ],
    },
  ];

  const SURFACES: Record<string, string> = {
    landing: "Landing · How it works",
    landing_collections: "Landing · Collections",
    building_collections: "While building · Collections",
    results: "Finished deck",
    export_popup: "Popup after an export",
  };

  const shared: SharedBlock[] = [
    {
      key: "install",
      title: "Install PageFly",
      note: "One button, five placements. The total is not the sum of the columns — the same person can press it on two screens.",
      total: sum(rows, EV.pageflyInstallClicked),
      totalPeople: people(totals, EV.pageflyInstallClicked),
      bySurface: slices(rows, EV.pageflyInstallClicked, "surface", SURFACES),
    },
    {
      key: "collections",
      title: "Free collections exported",
      note: "The section is on two screens: a visitor browsing the landing page, and a merchant waiting for a build.",
      total: sum(rows, EV.collectionExported),
      totalPeople: people(totals, EV.collectionExported),
      bySurface: slices(rows, EV.collectionExported, "surface", SURFACES),
    },
  ];

  const view: AnalyticsView = {
    from: from.toISOString(),
    to: to.toISOString(),
    days,
    empty: rows.length === 0,
    funnel,
    cta: slices(rows, EV.ctaClicked, "location", {
      hero: "Hero",
      closing: "Closing",
      header_signin: "Header · Sign in",
      header_store: "Header · Store name",
    }),
    signin: slices(rows, EV.signinSubmitted, "result", {
      success: "Signed in",
      not_registered: "Not registered",
      invalid_format: "Not a store domain",
      server_error: "Our error",
    }),
    registerResults: slices(rows, EV.registerSubmitted, "result", {
      success: "Registered",
      validation_error: "Form refused it",
      server_error: "Our error",
    }),
    registerFields: slices(rows, EV.registerSubmitted, "error_field", {
      domain: "Store domain",
      store_name: "Store name",
      email: "Email",
    }),
    gallery: slices(rows, EV.galleryOpened, "page_type", {}),
    builds: {
      started: sum(rows, EV.generateStarted),
      completed: sum(rows, EV.generateCompleted),
      failed: sum(rows, EV.generateFailed),
      cancelled: sum(rows, EV.generateCancel),
    },
    durations,
    pages,
    shared,
    rows: [...rows].sort((a, b) => b.count - a.count).slice(0, 200),
  };

  /* NO-STORE, AND IT IS NOT BELT AND BRACES. `force-dynamic` above tells Next
     not to cache the render; it says nothing to the BROWSER, and this response
     went out with no cache headers at all — which leaves the browser free to
     reuse it by heuristic. The symptom would be the worst kind on this screen:
     somebody reloads to see whether a number moved, sees the same figure, and
     concludes nothing happened. */
  return Response.json({ ok: true, view } satisfies AnalyticsResponse, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
