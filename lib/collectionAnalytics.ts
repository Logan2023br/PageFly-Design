import { EV } from "./analytics";
import { CUSTOM_REQUEST } from "./collectionPages";
import type {
  CollectionEventRow,
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
  };
  funnels: {
    free: { label: string; value: number; unit: "people" | "orders" }[];
    paid: { label: string; value: number; unit: "people" | "orders" }[];
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
  };

  /* ---- funnels, in people (the last two paid steps are orders) ---- */
  const funnels: CpView["funnels"] = {
    free: [
      { label: "Visited the list", value: listPeople.size, unit: "people" },
      {
        label: "Opened a free set",
        value: peopleWhere(ev, (r) => is(EV.cpSetViewed)(r) && freeSlugs.has(setOf(r))).size,
        unit: "people",
      },
      {
        label: "Opened a preview",
        value: peopleWhere(ev, (r) => is(EV.cpPageOpened)(r) && freeSlugs.has(setOf(r))).size,
        unit: "people",
      },
      {
        label: "Downloaded",
        value: peopleWhere(ev, (r) => download(r) && freeSlugs.has(setOf(r))).size,
        unit: "people",
      },
    ],
    paid: [
      { label: "Visited the list", value: listPeople.size, unit: "people" },
      {
        label: "Opened a premium set",
        value: peopleWhere(ev, (r) => is(EV.cpSetViewed)(r) && paidSlugs.has(setOf(r))).size,
        unit: "people",
      },
      { label: "Pressed Buy", value: overview.buys.people, unit: "people" },
      {
        label: "Saw checkout",
        value: peopleWhere(
          ev,
          (r) => is(EV.cpCheckoutViewed)(r) && setOf(r) !== CUSTOM_REQUEST.slug,
        ).size,
        unit: "people",
      },
      { label: "Sent an order", value: setOrders.length, unit: "orders" },
      { label: "Confirmed", value: confirmedAll.length, unit: "orders" },
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
