import { EV } from "./analytics";
import { CUSTOM_REQUEST } from "./collectionPages";
import type {
  CollectionEventRow,
  CollectionLeadRecord,
  CollectionOrderRecord,
  CollectionSetRecord,
  DayCount,
} from "./db/types";

/* ==========================================================================
   ADMIN → COLLECTION PAGES → ANALYTICS, AS NUMBERS.

   A pure function from rows to the screen: the events of /collection-pages in
   the window, the orders, and the sets. No database here, so the whole of
   "what does this screen claim" can be run in a test with rows written by
   hand.

   THREE KINDS OF NUMBER, AND THE SCREEN SAYS WHICH IS WHICH:

     presses   every event counts — five opens are five
     people    distinct visitors (a random per-browser id, nobody's identity)
     orders    rows in collection_orders — the server's own record, which no
               ad blocker or closed tab can lose

   Funnels are drawn in PEOPLE, because "how many got this far" is a question
   about people; a step can still exceed the one above it when visitors arrive
   on a set's page from outside without passing the list.
   ========================================================================== */

type Count = { n: number; people: number };

export type CpPageRow = {
  slug: string;
  label: string;
  opens: Count;
  /** median seconds a preview of it stayed open, or null with no reads */
  medianRead: number | null;
  downloads: Count;
};

export type CpSetRow = {
  slug: string;
  name: string;
  access: "free" | "paid";
  priceCents: number | null;
  visible: boolean;
  /** the set is no longer in the table — its history is still counted */
  gone: boolean;
  views: Count;
  opens: Count;
  medianRead: number | null;
  /** free: whole-set downloads + single pages, and the people behind either */
  downloads: { sets: number; pages: number; people: number };
  /** download forms filled in for this set */
  leads: number;
  buys: Count;
  checkouts: Count;
  orders: number;
  confirmed: number;
  revenueCents: number;
  /** free: downloaders ÷ viewers. paid: orders ÷ viewers. null with no viewers. */
  conversion: number | null;
  pages: CpPageRow[];
};

export type CpSlice = { key: string; n: number; people: number };

/** `metric` is what the step opens into — see `collectionHits`. */
export type FunnelStep = {
  label: string;
  value: number;
  unit: "people" | "orders" | "leads";
  metric: string;
};

export type CpView = {
  days: number;
  day: string | null;
  from: string;
  to: string;
  /** true when the event cap was reached and the figures are a floor */
  truncated: boolean;
  daily: DayCount[];
  overview: {
    visitors: number;
    listViews: Count;
    setViews: Count;
    opens: Count;
    medianRead: number | null;
    freeDownloads: { sets: number; pages: number; people: number };
    buys: Count;
    ordersReceived: number;
    customRequests: number;
    revenueCents: number;
    pendingCents: number;
    /** the download form: presses on Download, leads stored, Install PageFly presses */
    gateOpened: Count;
    leads: number;
    leadPeople: number;
    installs: Count;
  };
  funnels: {
    free: FunnelStep[];
    paid: FunnelStep[];
    gate: FunnelStep[];
  };
  sets: CpSetRow[];
  frames: CpSlice[];
  sections: { list: number; free: number; premium: number; promo: number };
  promo: { custom: Count; build: Count; requestsSent: number };
  buyPlaces: CpSlice[];
  orders: {
    pending: number;
    confirmed: number;
    cancelled: number;
    medianHoursToConfirm: number | null;
    recent: CollectionOrderRecord[];
  };
  entries: CpSlice[];
  referrers: CpSlice[];
  countries: CpSlice[];
  screens: CpSlice[];
  checkoutFailures: CpSlice[];
};

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Presses and distinct people for the rows that pass `keep`. */
function count(rows: CollectionEventRow[], keep: (r: CollectionEventRow) => boolean): Count {
  const people = new Set<string>();
  let n = 0;
  for (const r of rows) {
    if (!keep(r)) continue;
    n++;
    people.add(r.visitorId);
  }
  return { n, people: people.size };
}

function peopleWhere(rows: CollectionEventRow[], keep: (r: CollectionEventRow) => boolean) {
  const out = new Set<string>();
  for (const r of rows) if (keep(r)) out.add(r.visitorId);
  return out;
}

/** Group rows by a key; largest first. An empty key becomes `blank`. */
function slices(
  rows: CollectionEventRow[],
  keep: (r: CollectionEventRow) => boolean,
  key: (r: CollectionEventRow) => string,
  blank = "(none)",
): CpSlice[] {
  const m = new Map<string, { n: number; people: Set<string> }>();
  for (const r of rows) {
    if (!keep(r)) continue;
    const k = key(r) || blank;
    const hit = m.get(k) ?? { n: 0, people: new Set<string>() };
    hit.n++;
    hit.people.add(r.visitorId);
    m.set(k, hit);
  }
  return [...m]
    .map(([k, v]) => ({ key: k, n: v.n, people: v.people.size }))
    .sort((a, b) => b.people - a.people || b.n - a.n);
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** `YYYY-MM-DD` of an instant, in a day shifted by `tz` minutes east of UTC. */
function dayKey(iso: string, tz: number): string {
  return new Date(Date.parse(iso) + tz * 60_000).toISOString().slice(0, 10);
}

export function buildCollectionView(input: {
  /** every event in the WHOLE window — the strip is drawn from these */
  events: CollectionEventRow[];
  /** every order ever; filtered to the window here */
  orders: CollectionOrderRecord[];
  /** recent leads; filtered to the window here */
  leads: CollectionLeadRecord[];
  sets: CollectionSetRecord[];
  days: number;
  day: string | null;
  /** the window actually read, ISO */
  from: string;
  to: string;
  tz: number;
  truncated: boolean;
}): CpView {
  const { sets, tz } = input;

  /* The strip is always the whole window; everything else is the picked day
     when there is one. */
  const daily = new Map<string, { events: number; people: Set<string> }>();
  for (const e of input.events) {
    const k = dayKey(e.createdAt, tz);
    const hit = daily.get(k) ?? { events: 0, people: new Set<string>() };
    hit.events++;
    hit.people.add(e.visitorId);
    daily.set(k, hit);
  }

  const ev = input.day
    ? input.events.filter((e) => dayKey(e.createdAt, tz) === input.day)
    : input.events;
  const inWindow = (iso: string) =>
    input.day ? dayKey(iso, tz) === input.day : iso >= input.from && iso < input.to;
  const orders = input.orders.filter((o) => inWindow(o.createdAt));
  const leads = input.leads.filter((l) => inWindow(l.createdAt));

  const is = (name: string) => (r: CollectionEventRow) => r.name === name;
  const setOf = (r: CollectionEventRow) => str(r.props.set);

  /* ---- sets: the table's sets, then any slug the events name that is gone ---- */
  const known = new Map(sets.map((s) => [s.slug, s]));
  const slugs = [...sets.map((s) => s.slug)];
  for (const r of ev) {
    const s = setOf(r);
    if (s && s !== CUSTOM_REQUEST.slug && !known.has(s) && !slugs.includes(s)) slugs.push(s);
  }

  const reads = (keep: (r: CollectionEventRow) => boolean) =>
    ev
      .filter((r) => r.name === EV.showcasePageViewed && keep(r))
      .map((r) => num(r.props.seconds))
      .filter((x): x is number => x !== null);

  const setRows: CpSetRow[] = slugs.map((slug) => {
    const rec = known.get(slug);
    const mine = (r: CollectionEventRow) => setOf(r) === slug;
    const access =
      rec?.access ??
      (ev.find((r) => mine(r) && str(r.props.access))?.props.access === "paid" ? "paid" : "free");

    const views = count(ev, (r) => is(EV.cpSetViewed)(r) && mine(r));
    const opens = count(ev, (r) => is(EV.cpPageOpened)(r) && mine(r));
    const wholeSets = ev.filter((r) => is(EV.showcaseSetDownloaded)(r) && mine(r)).length;
    const singlePages = ev.filter((r) => is(EV.showcaseFileDownloaded)(r) && mine(r)).length;
    const downloaders = peopleWhere(
      ev,
      (r) => (is(EV.showcaseSetDownloaded)(r) || is(EV.showcaseFileDownloaded)(r)) && mine(r),
    );
    const myOrders = orders.filter((o) => o.setSlug === slug);
    const confirmed = myOrders.filter((o) => o.status === "confirmed");

    const pageSlugs = [
      ...(rec?.pages.map((p) => p.slug) ?? []),
      ...new Set(
        ev
          .filter((r) => mine(r) && str(r.props.page_type))
          .map((r) => str(r.props.page_type)),
      ),
    ].filter((v, i, a) => a.indexOf(v) === i);

    const pages: CpPageRow[] = pageSlugs.map((p) => {
      const onPage = (r: CollectionEventRow) => mine(r) && str(r.props.page_type) === p;
      return {
        slug: p,
        label: rec?.pages.find((x) => x.slug === p)?.label ?? p,
        opens: count(ev, (r) => is(EV.cpPageOpened)(r) && onPage(r)),
        medianRead: median(reads(onPage)),
        downloads: count(ev, (r) => is(EV.showcaseFileDownloaded)(r) && onPage(r)),
      };
    });

    return {
      slug,
      name: rec?.name ?? slug,
      access,
      priceCents: rec?.priceCents ?? null,
      visible: rec?.visible ?? false,
      gone: !rec,
      views,
      opens,
      medianRead: median(reads(mine)),
      downloads: { sets: wholeSets, pages: singlePages, people: downloaders.size },
      leads: leads.filter((l) => l.setSlug === slug).length,
      buys: count(ev, (r) => is(EV.cpBuyClicked)(r) && mine(r)),
      checkouts: count(ev, (r) => is(EV.cpCheckoutViewed)(r) && mine(r)),
      orders: myOrders.length,
      confirmed: confirmed.length,
      revenueCents: confirmed.reduce((a, o) => a + (o.priceCents ?? 0), 0),
      conversion:
        views.people === 0
          ? null
          : access === "free"
            ? downloaders.size / views.people
            : myOrders.length / views.people,
      pages,
    };
  });

  /* ---- overview ---- */
  const setOrders = orders.filter((o) => o.setSlug !== CUSTOM_REQUEST.slug);
  const confirmedAll = setOrders.filter((o) => o.status === "confirmed");
  const freeSlugs = new Set(setRows.filter((s) => s.access === "free").map((s) => s.slug));
  const paidSlugs = new Set(setRows.filter((s) => s.access === "paid").map((s) => s.slug));

  const listPeople = peopleWhere(ev, is(EV.cpListViewed));
  const isInstall = (r: CollectionEventRow) =>
    r.name === EV.pageflyInstallClicked && r.props.surface === "collection_pages";
  const download = (r: CollectionEventRow) =>
    is(EV.showcaseSetDownloaded)(r) || is(EV.showcaseFileDownloaded)(r);

  const overview: CpView["overview"] = {
    visitors: new Set(ev.map((r) => r.visitorId)).size,
    listViews: count(ev, is(EV.cpListViewed)),
    setViews: count(ev, is(EV.cpSetViewed)),
    opens: count(ev, is(EV.cpPageOpened)),
    medianRead: median(reads(() => true)),
    freeDownloads: {
      sets: ev.filter(is(EV.showcaseSetDownloaded)).length,
      pages: ev.filter(is(EV.showcaseFileDownloaded)).length,
      people: peopleWhere(ev, download).size,
    },
    buys: count(ev, is(EV.cpBuyClicked)),
    ordersReceived: setOrders.length,
    customRequests: orders.length - setOrders.length,
    revenueCents: confirmedAll.reduce((a, o) => a + (o.priceCents ?? 0), 0),
    pendingCents: setOrders
      .filter((o) => o.status === "pending")
      .reduce((a, o) => a + (o.priceCents ?? 0), 0),
    gateOpened: count(ev, is(EV.cpGateOpened)),
    leads: leads.length,
    leadPeople: peopleWhere(ev, is(EV.cpLeadSubmitted)).size,
    installs: count(ev, isInstall),
  };

  /* ---- funnels, in people (the last two paid steps are orders) ---- */
  const funnels: CpView["funnels"] = {
    free: [
      { label: "Visited the list", value: listPeople.size, unit: "people", metric: "list" },
      {
        label: "Opened a free set",
        value: peopleWhere(ev, (r) => is(EV.cpSetViewed)(r) && freeSlugs.has(setOf(r))).size,
        unit: "people",
        metric: "free_set",
      },
      {
        label: "Opened a preview",
        value: peopleWhere(ev, (r) => is(EV.cpPageOpened)(r) && freeSlugs.has(setOf(r))).size,
        unit: "people",
        metric: "free_open",
      },
      {
        label: "Downloaded",
        value: peopleWhere(ev, (r) => download(r) && freeSlugs.has(setOf(r))).size,
        unit: "people",
        metric: "downloads",
      },
    ],
    paid: [
      { label: "Visited the list", value: listPeople.size, unit: "people", metric: "list" },
      {
        label: "Opened a premium set",
        value: peopleWhere(ev, (r) => is(EV.cpSetViewed)(r) && paidSlugs.has(setOf(r))).size,
        unit: "people",
        metric: "paid_set",
      },
      { label: "Pressed Buy", value: overview.buys.people, unit: "people", metric: "buys" },
      {
        label: "Saw checkout",
        value: peopleWhere(
          ev,
          (r) => is(EV.cpCheckoutViewed)(r) && setOf(r) !== CUSTOM_REQUEST.slug,
        ).size,
        unit: "people",
        metric: "checkout",
      },
      { label: "Sent an order", value: setOrders.length, unit: "orders", metric: "orders" },
      { label: "Confirmed", value: confirmedAll.length, unit: "orders", metric: "confirmed" },
    ],
    gate: [
      { label: "Pressed Download", value: overview.gateOpened.people, unit: "people", metric: "gate_opened" },
      { label: "Filled in the form", value: overview.leadPeople, unit: "people", metric: "lead_submitted" },
      {
        label: "Took the file",
        value: peopleWhere(ev, download).size,
        unit: "people",
        metric: "downloads",
      },
      { label: "Pressed Install PageFly", value: overview.installs.people, unit: "people", metric: "installs" },
    ],
  };

  /* ---- orders ---- */
  const confirmHours = orders
    .filter((o) => o.status === "confirmed")
    .map((o) => (Date.parse(o.updatedAt) - Date.parse(o.createdAt)) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0);

  return {
    days: input.days,
    day: input.day,
    from: input.from,
    to: input.to,
    truncated: input.truncated,
    daily: [...daily]
      .map(([date, v]) => ({ date, events: v.events, visitors: v.people.size }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    overview,
    funnels,
    sets: setRows,
    frames: slices(ev, is(EV.showcaseFrameChanged), (r) => str(r.props.frame)),
    sections: {
      list: listPeople.size,
      free: peopleWhere(ev, (r) => is(EV.cpSectionSeen)(r) && r.props.section === "free").size,
      premium: peopleWhere(ev, (r) => is(EV.cpSectionSeen)(r) && r.props.section === "premium")
        .size,
      promo: peopleWhere(ev, (r) => is(EV.cpSectionSeen)(r) && r.props.section === "promo").size,
    },
    promo: {
      custom: count(ev, (r) => is(EV.cpPromoClicked)(r) && r.props.card === "custom"),
      build: count(ev, (r) => is(EV.cpPromoClicked)(r) && r.props.card === "build"),
      requestsSent: overview.customRequests,
    },
    buyPlaces: slices(ev, is(EV.cpBuyClicked), (r) => str(r.props.place)),
    orders: {
      pending: orders.filter((o) => o.status === "pending").length,
      confirmed: orders.filter((o) => o.status === "confirmed").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      medianHoursToConfirm:
        confirmHours.length === 0
          ? null
          : Math.round((median(confirmHours.map((h) => h * 10)) ?? 0) / 10),
      recent: orders.slice(0, 8),
    },
    entries: slices(
      ev,
      (r) => is(EV.cpListViewed)(r) || is(EV.cpSetViewed)(r),
      (r) => str(r.props.entry),
      "unknown",
    ),
    referrers: slices(
      ev,
      (r) => (is(EV.cpListViewed)(r) || is(EV.cpSetViewed)(r)) && r.props.entry === "external",
      (r) => str(r.props.ref),
      "unknown",
    ),
    countries: slices(ev, () => true, (r) => r.country ?? "", "Unplaced"),
    screens: slices(
      ev,
      (r) => is(EV.cpListViewed)(r) || is(EV.cpSetViewed)(r),
      (r) => str(r.props.screen),
      "unknown",
    ),
    checkoutFailures: slices(ev, is(EV.cpCheckoutFailed), (r) => str(r.props.reason)),
  };
}

/* ==========================================================================
   "WHO, AND WHEN" — WHAT A TILE OPENS INTO.

   Every tile, funnel step and breakdown row on the screen names a `metric`;
   this turns one into the list of what happened, newest first: the time, the
   country, the store when a PageFly Design session was signed in, and the
   store and email from the download form when that browser filled one in.

   THE SAME PREDICATES AS THE COUNTS. A list built from a second copy of the
   rules would drift from the number above it the first time either changed,
   and a tile reading 12 that opens onto 9 rows is a screen nobody trusts.
   ========================================================================== */

export type CpHit = {
  at: string;
  country: string | null;
  /** the signed-in store, from the session */
  store: string | null;
  /** what the download form said for this browser, when it filled one in */
  lead: { domain: string; email: string } | null;
  visitor: string | null;
  /** what happened, in words */
  what: string;
  /** the set, and the page within it */
  set: string | null;
  page: string | null;
  /** the one extra fact worth a column: seconds read, width, button, reason */
  detail: string | null;
};

const WHAT: Record<string, string> = {
  [EV.cpListViewed]: "Viewed the list",
  [EV.cpSetViewed]: "Viewed a set",
  [EV.cpSectionSeen]: "Scrolled to a row",
  [EV.cpPageOpened]: "Opened a preview",
  [EV.showcasePageViewed]: "Read a preview",
  [EV.showcaseFrameChanged]: "Changed preview width",
  [EV.showcaseSetDownloaded]: "Downloaded the whole set",
  [EV.showcaseFileDownloaded]: "Downloaded one page",
  [EV.cpBuyClicked]: "Pressed Buy",
  [EV.cpCheckoutViewed]: "Saw the checkout",
  [EV.cpCheckoutFailed]: "Checkout refused",
  [EV.cpPromoClicked]: "Pressed a promo card",
  [EV.cpGateOpened]: "Pressed Download",
  [EV.cpLeadSubmitted]: "Filled in the download form",
  [EV.cpLeadFailed]: "Download form refused",
  [EV.pageflyInstallClicked]: "Pressed Install PageFly",
};

function detailOf(r: CollectionEventRow): string | null {
  const p = r.props;
  if (r.name === EV.showcasePageViewed) return typeof p.seconds === "number" ? `${p.seconds}s` : null;
  if (r.name === EV.showcaseFrameChanged) return str(p.frame) || null;
  if (r.name === EV.cpBuyClicked) return [str(p.place), str(p.price)].filter(Boolean).join(" · ") || null;
  if (r.name === EV.cpGateOpened) return str(p.place) || null;
  if (r.name === EV.cpCheckoutFailed || r.name === EV.cpLeadFailed) return str(p.reason) || null;
  if (r.name === EV.cpPromoClicked) return str(p.card) || null;
  if (r.name === EV.cpSectionSeen) return str(p.section) || null;
  if (r.name === EV.cpListViewed || r.name === EV.cpSetViewed || r.name === EV.cpCheckoutViewed) {
    const bits = [str(p.entry), str(p.ref), str(p.screen)].filter(Boolean);
    return bits.join(" · ") || null;
  }
  return null;
}

/** The metrics a screen element can open, and the rows each one means. */
export function collectionHits(input: {
  metric: string;
  /** narrows a breakdown to one of its rows: the row's key */
  key: string | null;
  /** narrows to one set, by slug */
  set: string | null;
  events: CollectionEventRow[];
  orders: CollectionOrderRecord[];
  leads: CollectionLeadRecord[];
  sets: CollectionSetRecord[];
  day: string | null;
  from: string;
  to: string;
  tz: number;
  limit: number;
}): { hits: CpHit[]; total: number } | null {
  const { metric, key, tz } = input;
  const inWindow = (iso: string) =>
    input.day ? dayKey(iso, tz) === input.day : iso >= input.from && iso < input.to;
  const ev = input.events.filter((e) => inWindow(e.createdAt));
  const names = new Map(input.sets.map((s) => [s.slug, s]));
  const free = new Set(input.sets.filter((s) => s.access === "free").map((s) => s.slug));
  const paid = new Set(input.sets.filter((s) => s.access === "paid").map((s) => s.slug));
  const setOf = (r: CollectionEventRow) => str(r.props.set);
  const bySet = (slug: string) => !input.set || slug === input.set;
  const pageLabel = (setSlug: string, page: string) =>
    names.get(setSlug)?.pages.find((p) => p.slug === page)?.label ?? page;

  /* The latest lead per browser, so a row can say who it was. */
  const leadOf = new Map<string, CollectionLeadRecord>();
  for (const l of [...input.leads].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (l.visitorId) leadOf.set(l.visitorId, l);
  }

  const done = (hits: CpHit[]) => ({
    hits: hits.sort((a, b) => b.at.localeCompare(a.at)).slice(0, input.limit),
    total: hits.length,
  });

  /* ---- rows from the orders table ---- */
  const orderMetrics: Record<string, (o: CollectionOrderRecord) => boolean> = {
    orders: (o) => o.setSlug !== CUSTOM_REQUEST.slug,
    confirmed: (o) => o.status === "confirmed" && o.setSlug !== CUSTOM_REQUEST.slug,
    revenue: (o) => o.status === "confirmed" && o.setSlug !== CUSTOM_REQUEST.slug,
    pending: (o) => o.status === "pending",
    cancelled: (o) => o.status === "cancelled",
    custom: (o) => o.setSlug === CUSTOM_REQUEST.slug,
    all_orders: () => true,
  };
  if (orderMetrics[metric]) {
    return done(
      input.orders
        .filter((o) => inWindow(o.createdAt) && orderMetrics[metric](o) && bySet(o.setSlug))
        .map((o) => ({
          at: o.createdAt,
          country: null,
          store: null,
          lead: { domain: o.domain, email: o.email },
          visitor: null,
          what: o.setSlug === CUSTOM_REQUEST.slug ? "Sent a template request" : "Sent an order",
          set: o.setName,
          page: null,
          detail:
            [o.status === "pending" ? "new" : o.status, o.priceCents === null ? "" : `$${o.priceCents / 100}`, o.note ?? ""]
              .filter(Boolean)
              .join(" · ") || null,
        })),
    );
  }

  /* ---- rows from the leads table ---- */
  if (metric === "leads") {
    return done(
      input.leads
        .filter((l) => inWindow(l.createdAt) && bySet(l.setSlug))
        .map((l) => ({
          at: l.createdAt,
          country: l.country,
          store: null,
          lead: { domain: l.domain, email: l.email },
          visitor: l.visitorId,
          what: l.pageSlug ? "Asked for one page" : "Asked for the whole set",
          set: l.setName,
          page: l.pageSlug ? pageLabel(l.setSlug, l.pageSlug) : null,
          detail: null,
        })),
    );
  }

  /* ---- rows from events ---- */
  const is = (name: string) => (r: CollectionEventRow) => r.name === name;
  const download = (r: CollectionEventRow) =>
    is(EV.showcaseSetDownloaded)(r) || is(EV.showcaseFileDownloaded)(r);
  const view = (r: CollectionEventRow) => is(EV.cpListViewed)(r) || is(EV.cpSetViewed)(r);
  const keyed = (name: string | ((r: CollectionEventRow) => boolean), prop: (r: CollectionEventRow) => string) =>
    (r: CollectionEventRow) =>
      (typeof name === "string" ? r.name === name : name(r)) && (key === null || prop(r) === key);

  const EVENTS: Record<string, (r: CollectionEventRow) => boolean> = {
    visitors: () => true,
    list: is(EV.cpListViewed),
    set_views: is(EV.cpSetViewed),
    opens: is(EV.cpPageOpened),
    reads: is(EV.showcasePageViewed),
    downloads: download,
    buys: is(EV.cpBuyClicked),
    checkout: (r) => is(EV.cpCheckoutViewed)(r) && setOf(r) !== CUSTOM_REQUEST.slug,
    gate_opened: is(EV.cpGateOpened),
    lead_submitted: is(EV.cpLeadSubmitted),
    lead_failed: keyed(EV.cpLeadFailed, (r) => str(r.props.reason)),
    installs: (r) => is(EV.pageflyInstallClicked)(r) && r.props.surface === "collection_pages",
    free_set: (r) => is(EV.cpSetViewed)(r) && free.has(setOf(r)),
    free_open: (r) => is(EV.cpPageOpened)(r) && free.has(setOf(r)),
    paid_set: (r) => is(EV.cpSetViewed)(r) && paid.has(setOf(r)),
    sections: keyed(EV.cpSectionSeen, (r) => str(r.props.section)),
    promo: keyed(EV.cpPromoClicked, (r) => str(r.props.card)),
    buy_places: keyed(EV.cpBuyClicked, (r) => str(r.props.place)),
    frames: keyed(EV.showcaseFrameChanged, (r) => str(r.props.frame)),
    entries: keyed(view, (r) => str(r.props.entry) || "unknown"),
    referrers: keyed((r) => view(r) && r.props.entry === "external", (r) => str(r.props.ref) || "unknown"),
    countries: keyed(() => true, (r) => r.country ?? "Unplaced"),
    screens: keyed(view, (r) => str(r.props.screen) || "unknown"),
    checkout_failures: keyed(EV.cpCheckoutFailed, (r) => str(r.props.reason)),
    page_opens: keyed(EV.cpPageOpened, (r) => str(r.props.page_type)),
  };
  const match = EVENTS[metric];
  if (!match) return null;

  return done(
    ev
      .filter((r) => match(r) && bySet(setOf(r)))
      .map((r) => {
        const lead = leadOf.get(r.visitorId);
        const s = setOf(r);
        const page = str(r.props.page_type) || str(r.props.page);
        return {
          at: r.createdAt,
          country: r.country,
          store: r.domain,
          lead: lead ? { domain: lead.domain, email: lead.email } : null,
          visitor: r.visitorId,
          what: WHAT[r.name] ?? r.name,
          set: s ? (names.get(s)?.name ?? (s === CUSTOM_REQUEST.slug ? "Custom request" : s)) : null,
          page: s && page ? pageLabel(s, page) : null,
          detail: detailOf(r),
        };
      }),
  );
}
