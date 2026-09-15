import { getRepo } from "@/lib/db";
import { EV } from "@/lib/analytics";
import { readAdminSession } from "@/lib/session";
import type { EventCount } from "@/lib/db/types";

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
  /** the raw grouped rows, for the table view under the charts */
  rows: EventCount[];
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
 * Distinct visitors for one event name.
 *
 * AN UPPER BOUND, NOT A SUM, and the difference matters. Rows are grouped by
 * name AND parameters, so one person who pressed the hero CTA and the closing
 * one appears in two rows — adding the visitor counts would count them twice
 * and let a step outrun the step above it. The largest single group is the
 * honest floor the data supports; the true figure needs the raw ids, which
 * this deliberately does not ship to a browser.
 */
function people(rows: EventCount[], name: string, where?: (p: Record<string, unknown>) => boolean) {
  const matching = rows.filter((r) => r.name === name && (!where || where(r.props)));
  if (matching.length === 0) return 0;
  return Math.max(...matching.map((r) => r.visitors));
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
  try {
    rows = await getRepo().countEvents(from.toISOString(), to.toISOString());
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message } satisfies AnalyticsResponse,
      { status: 503 },
    );
  }

  /* ==========================================================================
     THE FUNNEL, and why these steps.

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
      visitors: people(rows, EV.landingViewed),
      events: sum(rows, EV.landingViewed),
    },
    {
      key: "cta",
      label: "Pressed a CTA",
      note: "Design now, hero or closing",
      visitors: people(rows, EV.ctaClicked, (p) => p.location === "hero" || p.location === "closing"),
      events: sum(rows, EV.ctaClicked, (p) => p.location === "hero" || p.location === "closing"),
    },
    {
      key: "signin",
      label: "Sign-in seen",
      note: "Reached the form",
      visitors: people(rows, EV.signinViewed),
      events: sum(rows, EV.signinViewed),
    },
    {
      key: "submitted",
      label: "Sign-in tried",
      note: "Typed a domain and pressed Continue",
      visitors: people(rows, EV.signinSubmitted),
      events: sum(rows, EV.signinSubmitted),
    },
    {
      key: "brief",
      label: "Brief seen",
      note: "Through the gate, looking at the questions",
      visitors: people(rows, EV.briefViewed),
      events: sum(rows, EV.briefViewed),
    },
    {
      key: "started",
      label: "Build started",
      note: "Pressed the button",
      visitors: people(rows, EV.generateStarted),
      events: sum(rows, EV.generateStarted),
    },
    {
      key: "completed",
      label: "Build finished",
      note: "Reported by the server, so a closed tab still counts",
      visitors: people(rows, EV.generateCompleted),
      events: sum(rows, EV.generateCompleted),
    },
    {
      key: "exported",
      label: "Exported a page",
      note: "Took the file away",
      visitors: people(rows, EV.pageExported),
      events: sum(rows, EV.pageExported),
    },
  ];

  const durations = DURATION_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const row of rows) {
    if (row.name !== EV.generateCompleted) continue;
    const seconds = Number(row.props.duration_seconds ?? 0);
    const at = DURATION_BUCKETS.findIndex((b) => seconds < b.max);
    durations[at === -1 ? durations.length - 1 : at].count += row.count;
  }

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
    rows: [...rows].sort((a, b) => b.count - a.count).slice(0, 200),
  };

  return Response.json({ ok: true, view } satisfies AnalyticsResponse);
}
