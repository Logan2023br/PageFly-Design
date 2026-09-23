import { getRepo } from "@/lib/db";
import { EV } from "@/lib/analytics";
import { readAdminSession } from "@/lib/session";
import type {
  CountryCount,
  DayCount,
  EventCount,
  EventTotal,
  GeoFilter,
} from "@/lib/db/types";

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
  /**
   * The event these tiles count — see `Metric.event`.
   *
   * Without it the tiles here were the only ones on the screen that could not
   * be opened, and nothing said why: the drill-down is keyed on an event name
   * and this block simply never carried one.
   */
  event: string;
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
      /**
       * Every country in the strip's range, busiest first — the chips.
       *
       * ON THE ENVELOPE, NOT IN `view`. It is deliberately NOT narrowed by the
       * filter the view was built with, so it cannot live beside numbers that
       * are: a reader who picked Vietnam must still see the other chips, or
       * there is no way back to them.
       */
      countries: CountryCount[];
      /** what the numbers in `view` were narrowed by, echoed back */
      geo: { only: string[]; except: string[] };
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

/* ==========================================================================
   EVERY LINK TO /design, NAMED ONCE.

   There were two copies of this — the block at the top of the screen and the
   tile in the per-screen section — and the rebuilt landing page added three
   links to neither of them. The screen then drew a tile labelled `header`, the
   raw key, beside properly named ones.

   That is the second time two copies of a lookup table on this screen have
   drifted; the note on `SIGNIN_RESULTS` above records the first. One table, and
   both readers import it.

   `header_signin` and `header_store` are NOT "Design now" buttons — they are
   the way somebody who already has an account gets back in. Kept in the same
   table because they are still links to /design and the total has to include
   them, but named so nobody reads them as CTA conversions.
   ========================================================================== */
const CTA_LOCATIONS: Record<string, string> = {
  hero: "Hero · Design my pages",
  closing: "Closing · Design my pages",
  header: "Header · Design now",
  showcase: "Gallery · Design pages for my store",
  showcase_pill: "Gallery · “Your store” pill",
  header_signin: "Header · Sign in",
  header_store: "Header · store name",
};

/* The nine bands of the landing page, in the order somebody scrolls past them.
   Numbered in the label because the list is read as a funnel and a reader
   should not have to know the page's layout to see which way is down. */
const LANDING_SECTIONS_LABELS: Record<string, string> = {
  hero: "1 · Hero",
  proof: "2 · Proof strip",
  showcase: "3 · Gallery",
  get: "4 · What you get",
  comparison: "5 · Comparison",
  how: "6 · How it works",
  live: "7 · Going live",
  faq: "8 · FAQ",
  final_cta: "9 · Closing ask",
};

/* The masthead anchors, the same four inside the mobile menu, and the one
   under the hero. Four of these keys are also section names above, and they
   mean different things: `faq` here is somebody PRESSING the FAQ link, `faq`
   there is somebody scrolling far enough to see it. Two tables, on purpose. */
const LANDING_NAV_LABELS: Record<string, string> = {
  examples: "Example pages",
  get: "What you get",
  how: "How it works",
  faq: "FAQ",
  examples_hero: "Hero · See pages it built",
};

/* The pills above the gallery. Derived from the categories actually in the
   showcase deck, so which of these appear depends on what has been built —
   every one the catalogue knows is named so none can render as a raw key. */
const SHOWCASE_FILTERS: Record<string, string> = {
  all: "Both stores",
  hexwood: "Hexwood (dark)",
  hollis: "Hollis & Rowe (light)",
};

const HOW_STEPS: Record<string, string> = {
  "01": "01 · Answer four questions",
  "02": "02 · Get your pages back",
  "03": "03 · Preview, then export",
  "04": "04 · Import and go live",
};

/* The two places a real page opens full size. Different visitors: the rail is
   pressed by somebody who has read nothing yet, the grid by somebody who
   scrolled to it. */
const GALLERY_FROM: Record<string, string> = {
  hero: "Rail under the hero",
  showcase: "Gallery grid",
};

/* The five fixed pages under the hero — see `lib/showcasePages.ts`. Written out
   rather than derived from that list: the labels here name a PAGE TYPE for
   somebody reading a chart, and the ones there are chips on a card. */
/* The three widths a sample page can be re-read at. */
const SHOWCASE_FRAMES: Record<string, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

/* The worked briefs the Example pills open — see `PROMPT_EXAMPLES`. Written out
   rather than imported from there so this file names them the way a chart
   reader needs; the ids are what has to match, and the test asserts it. */
const PROMPT_EXAMPLE_LABELS: Record<string, string> = {
  hexwood: "Example 1 · Halloween",
  hollis: "Example 2 · luxury",
};

/* The two sample stores. Ids rather than names, because the id is what rides on
   the event — a renamed store must not orphan the rows already recorded. */
const SHOWCASE_SETS_LABELS: Record<string, string> = {
  hexwood: "Hexwood (dark)",
  hollis: "Hollis & Rowe (light)",
};

/* Every page slug across both sets — see `lib/showcasePages.ts`. Written out
   rather than derived from that list: these labels name a PAGE TYPE for
   somebody reading a chart, and the ones there are chips on a card.

   The two sets SHARE most slugs — both have a Home — which is what makes this
   read as "which page type do people open", the question the tile is for.
   Which STORE is a second split on the same event, not a doubled list. */
const SHOWCASE_SLUGS: Record<string, string> = {
  home: "Home",
  "product-page": "Product",
  "collection-page": "Collection",
  "about-us": "About",
  contact: "Contact",
  "blog-article": "Blog article",
  "private-sale": "Private sale",
  "fright-night-sale": "Sale",
};

/* WHERE THE INSTALL BUTTON WAS PRESSED. One button, many placements — see
   `SharedBlock` and the note on `Surface` in `lib/analytics.ts`.

   Module level rather than inside the handler, so `test-analytics-coverage.ts`
   can read it by name and check that every placement a call site passes is
   named here. Inside the function it had no name to ask for, and the first
   version of that test silently checked nothing. */
const SURFACES: Record<string, string> = {
  /* `landing` and `landing_collections` NO LONGER FIRE. The install button
     left "How it works" when the page was rebuilt, and the collections section
     is only on the build screen now. The labels stay because the rows already
     recorded under them do, and a historical row whose placement renders as a
     raw key is a chart with a hole in it. */
  landing: "Landing · How it works",
  landing_collections: "Landing · Collections",
  building_collections: "While building · Collections",
  results: "Finished deck",
  export_popup: "Popup after an export",
  landing_live: "Landing · Going live",
  topbar_landing: "Top bar · Landing",
  topbar_login: "Top bar · Sign in",
  topbar_register: "Top bar · Register",
  topbar_design: "Top bar · Design",
  topbar_library: "Top bar · Library",
  topbar_feedback: "Top bar · Feedback",
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

  /* ==========================================================================
     THE COUNTRY FILTER, OFF THE QUERY STRING.

         ?country=VN,SG      only those
         ?exclude=VN         everything but

     BOTH ARE LISTS and `unknown` is a member of either — the rows the resolver
     could not place. `lib/db/types.ts` carries the long note on why excluding a
     country must KEEP the unplaced rows and why picking one must drop them.

     Bounded before it reaches a query: two-letter codes or the word `unknown`,
     at most twenty of them. The value is bound as a parameter either way, so
     this is a sanity limit rather than the thing keeping SQL safe.
     ========================================================================== */
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

  let rows: EventCount[];
  let totals: EventTotal[];
  let daily: DayCount[] = [];
  let prevRows: EventCount[] = [];
  let prevTotals: EventTotal[] = [];
  let countries: CountryCount[] = [];
  try {
    /* Two shapes of the same window: grouped by name and parameters for the
       breakdowns, and by name alone for the distinct counts, which cannot be
       derived from the first. */
    [rows, totals, daily, countries] = await Promise.all([
      getRepo().countEvents(from.toISOString(), to.toISOString(), geo),
      getRepo().countEventTotals(from.toISOString(), to.toISOString(), geo),
      /* Over the STRIP's range, not the window's — see `stripFrom`. */
      getRepo().countEventsByDay(stripFrom.toISOString(), stripTo.toISOString(), tz, geo),
      /* UNFILTERED, on purpose: this is the list the filter is picked from, so
         narrowing it to the current pick would leave one chip and no way back
         to the others. Over the strip's range so the chips cover the same span
         the day picker does. */
      getRepo().countriesSeen(stripFrom.toISOString(), stripTo.toISOString()),
    ]);
    /* Only when asked. Two more queries on every load would be paid by every
       reader who never presses Compare, and this screen already polls. */
    if (compare)
      [prevRows, prevTotals] = await Promise.all([
        getRepo().countEvents(prevFrom.toISOString(), prevTo.toISOString(), geo),
        getRepo().countEventTotals(prevFrom.toISOString(), prevTo.toISOString(), geo),
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
  return Response.json(
    { ok: true, view, previous, countries, geo: { only, except } } satisfies AnalyticsResponse,
    {
      headers: { "cache-control": "no-store, max-age=0" },
    },
  );
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
        /* ==================================================================
           EVERY LINK TO /design, AND THERE ARE SEVEN OF THEM NOW.

           This listed four, which was right for the page that existed when it
           was written. The rebuilt front door added a `Design now` to the
           masthead, a `Design pages for my store` under the gallery and a
           dashed `Your store` pill in the row of filters above it — and an
           unnamed `location` renders as its raw key, so the screen showed a
           tile labelled `header` sitting beside properly named ones. A tile
           whose label is a variable name is a tile nobody trusts.

           `splitKind: "control"` because these are seven different BUTTONS:
           which one people press is the question, and one summed figure cannot
           answer it. The summed tile stays alongside for when the total is
           what is wanted.
           ================================================================== */
        metric("cta", "CTA pressed", "every link to /design, summed", EV.ctaClicked, "Any link that leaves for /design — seven of them, listed one tile each below", {
          split: slices(rows, EV.ctaClicked, "location", CTA_LOCATIONS),
          splitKind: "control",
        }),
        /* ==================================================================
           HOW FAR DOWN THE PAGE PEOPLE GET.

           Nine bands, each reporting once per visit when a third of it has been
           on screen — see `useSeen`. Read top to bottom it is the only thing on
           this screen that says WHERE the front door loses people, which for a
           page of nine sections is the question that decides which ones to cut.

           `outcome`, not `control`: nobody pressed a band. Nine tiles would
           claim nine buttons where there are none, and the useful reading is
           the shape of the list, which is a list.
           ================================================================== */
        metric("sections", "Sections reached", "once per visit each — read it top to bottom as a funnel", EV.landingSection, "Each band of the landing page, when a third of it has been on screen", {
          split: slices(rows, EV.landingSection, "section", LANDING_SECTIONS_LABELS),
        }),
        metric("nav", "Anchor followed", "moved down the page instead of leaving", EV.landingNav, "The masthead anchors, the same four inside the mobile menu, and “See pages it built” under the hero", {
          split: slices(rows, EV.landingNav, "to", LANDING_NAV_LABELS),
          splitKind: "control",
        }),
        metric("gallery", "Page preview opened", "a real build, read full size", EV.galleryOpened, "A page in the rail under the hero, or a card in the gallery grid", {
          split: slices(rows, EV.galleryOpened, "from", GALLERY_FROM),
          splitKind: "control",
        }),
        metric("gallery_type", "…which page type", "the same presses, split by what was opened", EV.galleryOpened, "The same presses as the tile before it, counted by which page type was opened", {
          split: slices(rows, EV.galleryOpened, "page_type", {}),
        }),
        /* The pills pick a STORE now, not a page category — the gallery shows
           two sample sets and the row narrows to one of them. `category` was
           the old shape and is left out of the split rather than merged: a
           press recorded under either key meant something different, and one
           tile claiming otherwise would be a number nobody could act on. */
        metric("filter", "Gallery filter used", "narrowed to one of the two stores", EV.showcaseFilter, "The “Both stores” / store-name pills above the gallery grid", {
          split: slices(rows, EV.showcaseFilter, "set", SHOWCASE_FILTERS),
          splitKind: "control",
        }),
        /* ==================================================================
           THE STRONGEST SIGNAL ON THIS PAGE.

           Somebody who takes the file has stopped asking whether the output is
           real and started checking it — without an account, which is exactly
           the visitor the front door exists to convince.

           APART FROM `design_page_exported`, which is a merchant taking their
           OWN page after a build. Same action at opposite ends of the funnel,
           and summed they would make the export number look healthy on a week
           when nobody built anything.
           ================================================================== */
        metric("file", "Sample .pagefly taken", "downloaded one of the five real files", EV.showcaseFileDownloaded, "“Download .pagefly” in the toolbar of an opened page from the rail under the hero", {
          split: slices(rows, EV.showcaseFileDownloaded, "page_type", SHOWCASE_SLUGS),
          splitKind: "control",
        }),
        /* WHICH SCREEN SIZE PEOPLE CHECK, and that it is checked at all. A
           merchant whose traffic is mostly mobile asks "will this work on a
           phone" before anything else; every press of Tablet or Mobile here is
           that question being asked out loud. */
        /* WHICH STORE people open. Two sets are shown and they are deliberately
           unalike — near-black and loud against ivory and quiet — so which one
           a visitor reaches for is the closest thing this page has to a reading
           of their taste, and it cannot be got from the page-type split. */
        metric("set", "Which store was opened", "the two sample sets", EV.galleryOpened, "The same presses as the tile above, counted by which of the two sample stores the page belonged to", {
          split: slices(rows, EV.galleryOpened, "set", SHOWCASE_SETS_LABELS),
          splitKind: "control",
        }),
        /* THE WHOLE SET, NOT A PAGE. Seven files as one import is somebody who
           has stopped evaluating and started planning, so it is counted apart
           from the single-page download — summed, one curious press and one
           decision would be the same number. */
        metric("set_file", "Whole sample set taken", "all seven pages as one import", EV.showcaseSetDownloaded, "“Export all 7” beside a store's name in the gallery", {
          split: slices(rows, EV.showcaseSetDownloaded, "set", SHOWCASE_SETS_LABELS),
          splitKind: "control",
        }),
        metric("frame", "Sample read at another width", "desktop, tablet or mobile", EV.showcaseFrameChanged, "The Desktop / Tablet / Mobile frames in the toolbar of an opened page from the rail under the hero", {
          split: slices(rows, EV.showcaseFrameChanged, "frame", SHOWCASE_FRAMES),
          splitKind: "control",
        }),
        metric("how_step", "How-it-works picture opened", "looked at a screenshot full size", EV.howStepOpened, "One of the four screenshots in “How it works”, opening the lightbox", {
          split: slices(rows, EV.howStepOpened, "step", HOW_STEPS),
          splitKind: "control",
        }),
        /* Counted apart from `cta` on purpose — see `landingLinkClicked`. Both
           are somebody leaving, and only one of them is the thing this page
           exists to make happen. */
        metric("outbound", "Left by a footer link", "not a CTA — counted apart so conversion stays honest", EV.landingLinkClicked, "The four links in the footer: PageFly, Help center, Privacy, Terms", {
          split: slices(rows, EV.landingLinkClicked, "to", {}),
          splitKind: "control",
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
        /* WHICH example, because that is the one thing this press says about
           the merchant. Two briefs are offered — a dark loud Halloween shop and
           a quiet ivory department store — and which one somebody opens is a
           reading of what kind of store is arriving that no other event on this
           screen can give. */
        metric("example", "Example opened", "read a sample brief first", EV.briefExampleClicked, "The “Example 1” / “Example 2” pills beside the description box", {
          unit: "store",
          split: slices(rows, EV.briefExampleClicked, "which", PROMPT_EXAMPLE_LABELS),
          splitKind: "control",
        }),
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


  const shared: SharedBlock[] = [
    {
      key: "install",
      title: "Install PageFly",
      event: EV.pageflyInstallClicked,
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
      event: EV.collectionExported,
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
    cta: slices(rows, EV.ctaClicked, "location", CTA_LOCATIONS),
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