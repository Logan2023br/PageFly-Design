import { getRepo } from "@/lib/db";
import { EV } from "@/lib/analytics";
import { readAdminSession } from "@/lib/session";
import type { DayCount, EventCount, EventTotal } from "@/lib/db/types";

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
  /** The event behind it, so a tile can ask what is inside itself. Not every
      one of these has a drill-down — `lib/analytics/detail` decides that. */
  event: string;
  /** what this step measures, in one line, for the screen to show */
  note: string;
  /** the element that fires it — see `Metric.where` */
  where: string;
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
  /** Every day in the window with something in it, oldest first — the strip the
      reader picks from. Always the whole window, never the picked day. */
  daily: DayCount[];
  /** The day being shown, or null when this is the whole window. */
  day: string | null;
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
  /** The event behind it — see `FunnelStep.event`. */
  event: string;
  /**
   * The element that fires it, and where that element is.
   *
   * SHOWN ON HOVER, and it is not documentation — it is the answer to the
   * question somebody asks every time a number surprises them: what exactly
   * did they press. A metric named "CTA pressed" could be four things on this
   * product, and a reader who has to go and read the source to find out will
   * instead guess.
   *
   * Written as a sentence naming the control and the screen, because "the
   * button" is not an answer on a page with three of them.
   */
  where: string;
  count: number;
  /** distinct browsers, or stores for the screens behind sign-in */
  people: number;
  /** a breakdown, when the event carries a parameter worth splitting on */
  split?: Slice[];
  /**
   * WHAT THE SPLIT IS A SPLIT OF, because the two kinds want different shapes.
   *
   * `control` means the values are different BUTTONS — the two `Design now`
   * on the landing page, the two ways to take a whole collection, the ⬇ on a
   * card versus `Export all`. Those each get their own tile, because "which of
   * these did people press" is the question and a single summed figure cannot
   * answer it. The summed tile stays alongside them, labelled, for the times
   * the total is what is wanted.
   *
   * `outcome` means the values are results or kinds of thing — success versus
   * not_registered, which page type, which field was wrong. One control fired
   * all of them, so a tile each would claim five buttons where there is one.
   * Those stay a list of bars under the tile.
   */
  splitKind?: "control" | "outcome";
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
  /** what fires it — see `Metric.where` */
  where: string;
  total: number;
  totalPeople: number;
  bySurface: Slice[];
  /** when more than one control fires it on the same screen */
  byControl?: Slice[];
};

export type AnalyticsResponse =
  | {
      ok: true;
      view: AnalyticsView;
      /**
       * The window of the same length ending where `view` begins.
       *
       * Absent unless `?compare=1` — the reader who never presses Compare
       * should not pay for two more queries on a screen that polls.
       */
      previous?: AnalyticsView;
    }
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

/* ==========================================================================
   THE OUTCOMES OF A SIGN-IN, NAMED ONCE.

   There were two copies of this map — the block at the top of the screen and
   the tile in the per-screen section — and adding `needs_email` and
   `no_such_store` to one of them left the other rendering the raw event keys
   on screen. Which is exactly what two copies of a lookup table do.
   ========================================================================== */
const SIGNIN_RESULTS: Record<string, string> = {
  success: "Signed in",
  /* The door verifies an unknown domain against Shopify now, so an attempt can
     end two ways it never could before: the store is real and the form is
     asking for an email, or Shopify has no such shop. Both used to land in
     `not_registered`, which is why that number is not comparable across the
     change. */
  needs_email: "Asked for an email",
  no_such_store: "No such store",
  not_registered: "Not registered",
  invalid_format: "Not a store domain",
  server_error: "Our error",
};

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
  const compare = url.searchParams.get("compare") === "1";

  /* ==========================================================================
     THE READER'S OWN MIDNIGHT.

     Events are stored in UTC and read from Vietnam, seven hours ahead. A "day"
     cut at UTC midnight puts a merchant's whole morning on the day before, so
     the browser sends `new Date().getTimezoneOffset()` — negated, so +7 is 420
     — and every day boundary here is drawn with it.

     Clamped to the real range of offsets. It arrives on a query string, and it
     is arithmetic on a timestamp.
     ========================================================================== */
  const tz = Math.max(
    -840,
    Math.min(840, Number(url.searchParams.get("tz") ?? 0) || 0),
  );

  /* ==========================================================================
     ONE DAY, OR A WINDOW ENDING NOW.

     `day=YYYY-MM-DD` narrows everything on the screen to that one day, cut at
     the reader's midnight. Without it the window is the last N days, which is
     what the 7/30/90 buttons ask for and what this screen has always done.

     A DAY IS NOT A SHORTER WINDOW. "The last 1 day" ends at this instant and
     reaches back twenty-four hours across two calendar days; a day picked off
     a chart has to be the day on the chart, or the number under the bar will
     not be the number in the tile.
     ========================================================================== */
  const dayParam = url.searchParams.get("day");
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : null;

  const to = day
    ? /* Midnight at the START of the next day, in the reader's offset, which is
         the exclusive end every query here already expects. */
      new Date(Date.parse(`${day}T00:00:00.000Z`) - tz * 60_000 + 24 * 60 * 60 * 1000)
    : new Date();
  const span = day ? 24 * 60 * 60 * 1000 : days * 24 * 60 * 60 * 1000;
  const from = new Date(to.getTime() - span);
  /* THE WINDOW BEFORE, THE SAME LENGTH, ENDING WHERE THIS ONE BEGINS. Seven
     days compares against the seven before them, thirty against the thirty
     before, and a single day against the day before it. Anything else — the
     same dates a month back, a fixed baseline — answers a question nobody asked
     while looking at a 7/30/90 switch. */
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - span);

  /* THE STRIP IS ALWAYS THE WINDOW, NEVER THE PICKED DAY. Drawn from the last N
     days whichever day is selected, so the chart a day was chosen from does not
     collapse to that one day the moment it is chosen — leaving nowhere to press
     to get back or to move along. */
  const stripTo = new Date();
  const stripFrom = new Date(stripTo.getTime() - days * 24 * 60 * 60 * 1000);

  let rows: EventCount[];
  let totals: EventTotal[];
  let daily: DayCount[] = [];
  let prevRows: EventCount[] = [];
  let prevTotals: EventTotal[] = [];
  try {
    /* Two shapes of the same window: grouped by name and parameters for the
       breakdowns, and by name alone for the distinct counts, which cannot be
       derived from the first. */
    [rows, totals, daily] = await Promise.all([
      getRepo().countEvents(from.toISOString(), to.toISOString()),
      getRepo().countEventTotals(from.toISOString(), to.toISOString()),
      /* Over the STRIP's range, not the window's — see `stripFrom`. */
      getRepo().countEventsByDay(stripFrom.toISOString(), stripTo.toISOString(), tz),
    ]);
    /* Only when asked. Two more queries on every load would be paid by every
       reader who never presses Compare, and this screen already polls. */
    if (compare)
      [prevRows, prevTotals] = await Promise.all([
        getRepo().countEvents(prevFrom.toISOString(), prevTo.toISOString()),
        getRepo().countEventTotals(prevFrom.toISOString(), prevTo.toISOString()),
      ]);
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message } satisfies AnalyticsResponse,
      { status: 503 },
    );
  }

  const view = buildView(rows, totals, from, to, days, daily, day);
  /* No strip and no day on the comparison: it is the window before this one,
     and the reader is comparing totals rather than picking a day out of it. */
  const previous = compare ? buildView(prevRows, prevTotals, prevFrom, prevTo, days) : undefined;

  /* NO-STORE, AND IT IS NOT BELT AND BRACES. `force-dynamic` above tells Next
     not to cache the render; it says nothing to the BROWSER, and this response
     went out with no cache headers at all — which leaves the browser free to
     reuse it by heuristic. The symptom would be the worst kind on this screen:
     somebody reloads to see whether a number moved, sees the same figure, and
     concludes nothing happened. */
  return Response.json({ ok: true, view, previous } satisfies AnalyticsResponse, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}




/**
 * One window's figures, assembled.
 *
 * LIFTED OUT OF THE HANDLER so it can be called twice. Comparing a window
 * against the one before it is the same work on a different pair of dates,
 * and a second copy of three hundred lines is a second copy that drifts —
 * the funnel would gain a step on one side and not the other, and the
 * comparison would report a change nobody made.
 */
function buildView(
  rows: EventCount[],
  totals: EventTotal[],
  from: Date,
  to: Date,
  days: number,
  /* Both belong to the CURRENT view only. The comparison window is built by a
     second call to this function, and a strip of days drawn from last month
     beside tiles from this one would be a chart of the wrong thing. */
  daily: DayCount[] = [],
  day: string | null = null,
): AnalyticsView {
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
      where: "The landing page loading at /\ndesign_landing_viewed",
      note: "Everyone who saw the front page",
      visitors: people(totals, EV.landingViewed),
      events: sum(rows, EV.landingViewed),
      event: EV.landingViewed,
      unit: "browser" as const,
    },
    {
      key: "cta",
      label: "Pressed a CTA",
      where: "Any of the four links to /design: the two purple “Design now” buttons (hero and closing), plus “Sign in” and the store name in the header\ndesign_cta_clicked",
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
      event: EV.ctaClicked,
      unit: "browser" as const,
    },
    {
      key: "signin",
      label: "Sign-in seen",
      where: "The sign-in form loading at /design/login\ndesign_signin_viewed",
      note: "Reached the form",
      visitors: people(totals, EV.signinViewed),
      events: sum(rows, EV.signinViewed),
      event: EV.signinViewed,
      unit: "browser" as const,
    },
    {
      key: "submitted",
      label: "Sign-in tried",
      where: "“Continue” on the sign-in form — recorded when the server answers, not on the press\ndesign_signin_submitted",
      note: "Typed a domain and pressed Continue",
      visitors: people(totals, EV.signinSubmitted),
      events: sum(rows, EV.signinSubmitted),
      event: EV.signinSubmitted,
      unit: "browser" as const,
    },
    {
      key: "brief",
      label: "Brief seen",
      where: "The brief screen loading at /design, after the gate\ndesign_brief_viewed",
      note: "Through the gate, looking at the questions",
      visitors: stores(totals, EV.briefViewed),
      events: sum(rows, EV.briefViewed),
      event: EV.briefViewed,
      unit: "store" as const,
    },
    {
      key: "started",
      label: "Build started",
      where: "The build button on the brief screen\ndesign_generate_started",
      note: "Pressed the button",
      visitors: stores(totals, EV.generateStarted),
      events: sum(rows, EV.generateStarted),
      event: EV.generateStarted,
      unit: "store" as const,
    },
    {
      key: "completed",
      label: "Build finished",
      where: "The server, when a build finishes — not the browser, so a closed tab still counts\ndesign_generate_completed",
      note: "Reported by the server, so a closed tab still counts",
      visitors: stores(totals, EV.generateCompleted),
      events: sum(rows, EV.generateCompleted),
      event: EV.generateCompleted,
      unit: "store" as const,
    },
    {
      key: "exported",
      label: "Exported a page",
      where: "Either Export control on the finished deck: the ⬇ on one card, or “Export all” on the toolbar\ndesign_page_exported",
      note: "Took the file away",
      visitors: stores(totals, EV.pageExported),
      events: sum(rows, EV.pageExported),
      event: EV.pageExported,
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
    where: string,
    opts: {
      unit?: "browser" | "store";
      split?: Slice[];
      splitKind?: "control" | "outcome";
    } = {},
  ): Metric => ({
    key,
    label,
    note,
    event: name,
    where: `${where}\n${name}`,
    count: sum(rows, name),
    people: opts.unit === "store" ? stores(totals, name) : people(totals, name),
    ...(opts.split && opts.split.length > 0
      ? { split: opts.split, splitKind: opts.splitKind ?? "outcome" }
      : {}),
  });

  const pages: PageBlock[] = [
    {
      key: "landing",
      title: "Landing",
      path: "/",
      note: "The front door. Everything here is a visitor with no account yet.",
      metrics: [
        metric("viewed", "Page viewed", "the denominator of every rate below", EV.landingViewed, "The page loading at /"),
        metric("cta", "CTA pressed", "all four links to /design", EV.ctaClicked, "Any of the four links to /design — the two purple “Design now” buttons, and “Sign in” / the store name in the header", {
          split: slices(rows, EV.ctaClicked, "location", {
            hero: "Hero · Design now",
            closing: "Closing · Design now",
            header_signin: "Header · Sign in",
            header_store: "Header · store name",
          }),
          splitKind: "control",
        }),
        metric("gallery", "Gallery opened", "a template in the moving strip", EV.galleryOpened, "A card in the moving strip of templates, near the bottom of the landing page", {
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
        metric("viewed", "Page viewed", "reached the form", EV.signinViewed, "The form loading at /design/login"),
        metric("submitted", "Continue pressed", "counted when the server answers, not on the press", EV.signinSubmitted, "“Continue” — recorded when the server answers, so it carries the outcome", {
          split: slices(rows, EV.signinSubmitted, "result", SIGNIN_RESULTS),
        }),
        metric("register_link", "Register link", "went on rather than leaving", EV.registerLinkClicked, "The underlined word “register” in the line under the form"),
        /* ==================================================================
           LOGIN NO REGISTER — the point of the change, counted.

           A store that reached the product without ever seeing the register
           form: domain typed, verified against Shopify, email given, in. Read
           against `Register pressed` on the block below, it is the whole
           before-and-after — the second screen used to cost twenty-seven of
           every thirty-one merchants who met it.

           `unit: "store"` because one merchant creating one account is one
           store, whatever browser they did it in. Server-fired, so the domain
           is on the event and the tile opens into the list of them. */
        metric("no_register", "Login No Register", "signed in without the register form", EV.loginNoRegister, "The sign-in form, when an unknown domain checked out against Shopify and an email was given", { unit: "store" }),
      ],
    },
    {
      key: "register",
      title: "Register",
      path: "/design/register",
      note: "Including the success screen, which has no address of its own.",
      metrics: [
        metric("viewed", "Page viewed", "reached the form", EV.registerViewed, "The form loading at /design/register"),
        metric("submitted", "Register pressed", "both the form's own refusals and the server's", EV.registerSubmitted, "“Register” — fired twice over: once when the form refuses it without calling the server, once when the server answers", {
          split: slices(rows, EV.registerSubmitted, "result", {
            success: "Registered",
            validation_error: "Form refused it",
            server_error: "Our error",
          }),
        }),
        metric("fields", "Fields that blocked it", "every box a refusal named, so one submission can count three", EV.registerSubmitted, "The same “Register” press, listing every box that was wrong — one submission can name three", {
          split: slices(rows, EV.registerSubmitted, "error_field", {
            domain: "Store domain",
            store_name: "Store name",
            email: "Email",
          }),
        }),
        metric("shopify", "Shopify sign-up", "arrivals who are not merchants yet", EV.shopifySignupClicked, "“Create a Shopify account”, the link under the Store domain box"),
        metric("done", "Success screen seen", "compare with Registered above", EV.registeredViewed, "The success screen appearing — it has no address of its own, so this fires on the state change"),
        metric("return", "Go to sign in", "carried on from the success screen", EV.signinReturnClicked, "“Go to sign in” on the success screen"),
      ],
    },
    {
      key: "brief",
      title: "Brief",
      path: "/design",
      note: "Behind the gate, so these are counted in stores rather than browsers.",
      metrics: [
        metric("viewed", "Page viewed", "through the gate", EV.briefViewed, "The brief screen at /design, once past the gate", { unit: "store" }),
        metric("mode", "Mode chosen", "quick or build detail", EV.briefModeSelected, "The Quick / Build detail pills at the top of the brief", {
          unit: "store",
          split: slices(rows, EV.briefModeSelected, "mode", { quick: "Quick", detail: "Build detail" }),
        }),
        metric("example", "Example opened", "read the sample brief first", EV.briefExampleClicked, "The small “Example” pill beside the description box", { unit: "store" }),
        metric("started", "Build started", "pressed the button", EV.generateStarted, "The build button at the bottom of the brief", { unit: "store" }),
      ],
    },
    {
      key: "building",
      title: "While it builds",
      path: "/design",
      note: "The outcomes are the server's, so a merchant who closes the tab still counts.",
      metrics: [
        metric("completed", "Finished", "the deck was delivered", EV.generateCompleted, "The server, when the build finishes — a merchant who closes the tab still counts", { unit: "store" }),
        metric("failed", "Failed", "the build itself did not finish", EV.generateFailed, "The server, when no page could be designed or the run threw", { unit: "store" }),
        metric("cancelled", "Cancelled", "went back to the brief", EV.generateCancel, "“Cancel and go back to the brief” on the build screen", { unit: "store" }),
      ],
    },
    {
      key: "results",
      title: "The finished deck",
      path: "/design",
      note: "What a merchant does with what they got.",
      metrics: [
        metric("exported", "Exported a page", "took the .pagefly file", EV.pageExported, "Either Export control — the ⬇ on one card, or “Export all” on the toolbar", {
          unit: "store",
          split: slices(rows, EV.pageExported, "scope", {
            one: "⬇ on a card",
            all: "“Export all” on the toolbar",
          }),
          splitKind: "control",
        }),
        metric("png", "PNG downloaded", "took pictures instead", EV.pagePngDownload, "The “PNG” button on the toolbar above the deck", { unit: "store" }),
        metric("preview", "Preview opened", "read a page full size", EV.pagePreview, "The mockup image on a card, opening the full preview", {
          unit: "store",
          split: slices(rows, EV.pagePreview, "page_type", {}),
        }),
        metric("regenerate", "Regenerated a page", "asked for that one again", EV.pageRegenerate, "The regenerate control on a card", { unit: "store" }),
        metric("edit", "Edited the brief", "went back to change the answers", EV.briefEdit, "“Edit brief” on the toolbar above the deck", { unit: "store" }),
      ],
    },
  ];

  const SURFACES: Record<string, string> = {
    landing: "Landing · How it works",
    landing_collections: "Landing · Collections",
    building_collections: "While building · Collections",
    results: "Finished deck",
    export_popup: "Popup after an export",
    topbar_landing: "Top bar · Landing",
    topbar_login: "Top bar · Sign in",
    topbar_register: "Top bar · Register",
    topbar_design: "Top bar · Design",
    topbar_library: "Top bar · Library",
    topbar_feedback: "Top bar · Feedback",
  };

  const shared: SharedBlock[] = [
    {
      key: "install",
      title: "Install PageFly",
      where:
        "The purple “Install PageFly” button and the quieter “Need the app to open these?” link — five placements in all\ndesign_pagefly_install_clicked",
      note: "One button, five placements. The total is not the sum of the columns — the same person can press it on two screens.",
      total: sum(rows, EV.pageflyInstallClicked),
      totalPeople: people(totals, EV.pageflyInstallClicked),
      bySurface: slices(rows, EV.pageflyInstallClicked, "surface", SURFACES),
    },
    {
      key: "collections",
      title: "Free collections exported",
      where:
        "Any of the three download controls in the Collections section: Export on a set card, “Export all” inside a set, or Export on one page\ndesign_collection_exported",
      note: "The section is on two screens: a visitor browsing the landing page, and a merchant waiting for a build.",
      total: sum(rows, EV.collectionExported),
      totalPeople: people(totals, EV.collectionExported),
      bySurface: slices(rows, EV.collectionExported, "surface", SURFACES),
      /* Three different buttons hand over a collection and two of them hand
         over the same bytes, so without this the question "does anybody open a
         set before taking it" has no number behind it. */
      byControl: slices(rows, EV.collectionExported, "scope", {
        set_card: "Export on the set card",
        set_detail: "“Export all” inside the set",
        page: "Export on one page",
      }),
    },
  ];

  const view: AnalyticsView = {
    from: from.toISOString(),
    to: to.toISOString(),
    days,
    daily,
    day,
    empty: rows.length === 0,
    funnel,
    cta: slices(rows, EV.ctaClicked, "location", {
      hero: "Hero",
      closing: "Closing",
      header_signin: "Header · Sign in",
      header_store: "Header · Store name",
    }),
    signin: slices(rows, EV.signinSubmitted, "result", SIGNIN_RESULTS),
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

  return view;
}