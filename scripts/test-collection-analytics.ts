/* ==========================================================================
   ADMIN → COLLECTION PAGES → ANALYTICS COUNTS WHAT IT SAYS IT COUNTS.

       npx tsx scripts/test-collection-analytics.ts

   Rows written by hand, so every figure on the screen has a known answer:
   presses against people, free against paid, orders from the table rather
   than from events, and the funnel in people.
   ========================================================================== */
import { EV } from "../lib/analytics";
import { buildCollectionView, collectionHits } from "../lib/collectionAnalytics";
import type {
  CollectionEventRow,
  CollectionLeadRecord,
  CollectionOrderRecord,
  CollectionSetRecord,
} from "../lib/db/types";

let bad = 0;
function check(ok: boolean, label: string, detail: unknown = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail !== "" ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) bad += 1;
}

const T = "2026-09-20T10:00:00.000Z";
const e = (name: string, visitorId: string, props: Record<string, unknown> = {}, at = T, country: string | null = "VN"): CollectionEventRow => ({
  name,
  props,
  visitorId,
  domain: visitorId === "b" ? "signed-in.myshopify.com" : null,
  country,
  createdAt: at,
});

const page = (slug: string) => ({ id: slug, slug, label: slug.toUpperCase(), blurb: "", position: 0, htmlSize: 1, pageflySize: 1, updatedAt: T });
const sets: CollectionSetRecord[] = [
  { id: "f1", slug: "free", name: "Free Set", blurb: "", visible: true, access: "free", priceCents: null, buyUrl: null, position: 1, createdAt: T, updatedAt: T, pages: [page("home"), page("about")] },
  { id: "p1", slug: "paid", name: "Paid Set", blurb: "", visible: true, access: "paid", priceCents: 6900, buyUrl: null, position: 2, createdAt: T, updatedAt: T, pages: [page("home")] },
];

const CP = { from: "collection_pages" };
const events: CollectionEventRow[] = [
  // a: list → free set → opens home twice → reads → downloads whole set
  e(EV.cpListViewed, "a", { entry: "external", ref: "google.com", screen: "desktop" }),
  e(EV.cpSectionSeen, "a", { section: "free" }),
  e(EV.cpSectionSeen, "a", { section: "premium" }),
  e(EV.cpSetViewed, "a", { set: "free", access: "free", entry: "list", screen: "desktop" }),
  e(EV.cpPageOpened, "a", { set: "free", page_type: "home" }),
  e(EV.cpPageOpened, "a", { set: "free", page_type: "home" }),
  e(EV.showcasePageViewed, "a", { set: "free", page_type: "home", seconds: 10, ...CP }),
  e(EV.showcasePageViewed, "a", { set: "free", page_type: "home", seconds: 30, ...CP }),
  e(EV.showcaseFrameChanged, "a", { set: "free", page_type: "home", frame: "mobile", ...CP }),
  e(EV.cpGateOpened, "a", { set: "free", page: "", place: "card" }),
  e(EV.cpLeadSubmitted, "a", { set: "free", page: "" }),
  e(EV.showcaseSetDownloaded, "a", { set: "free", pages: 2, ...CP }),
  e(EV.pageflyInstallClicked, "a", { surface: "collection_pages" }),
  // an install press somewhere else in the product is not this screen's
  e(EV.pageflyInstallClicked, "a", { surface: "results" }),
  e(EV.showcaseFileDownloaded, "a", { set: "free", page_type: "about", ...CP }),
  // b: list → paid set → buy on card → checkout → failed once; also promo
  e(EV.cpListViewed, "b", { entry: "direct", ref: "", screen: "mobile" }, "2026-09-21T10:00:00.000Z", "US"),
  e(EV.cpSectionSeen, "b", { section: "promo" }, "2026-09-21T10:00:00.000Z", "US"),
  e(EV.cpPromoClicked, "b", { card: "build" }, "2026-09-21T10:00:00.000Z", "US"),
  e(EV.cpSetViewed, "b", { set: "paid", access: "paid", entry: "list", screen: "mobile" }, "2026-09-21T10:00:00.000Z", "US"),
  e(EV.cpBuyClicked, "b", { set: "paid", place: "card" }, "2026-09-21T10:00:00.000Z", "US"),
  e(EV.cpCheckoutViewed, "b", { set: "paid" }, "2026-09-21T10:00:00.000Z", "US"),
  e(EV.cpCheckoutFailed, "b", { set: "paid", reason: "That email does not look right." }, "2026-09-21T10:00:00.000Z", "US"),
  // c: lands on the free set from outside, opens nothing
  e(EV.cpSetViewed, "c", { set: "free", access: "free", entry: "external", ref: "facebook.com" }, T, null),
  // an event for a set that has since been deleted
  e(EV.cpSetViewed, "d", { set: "gone", access: "paid", entry: "direct" }),
];

const order = (id: string, setSlug: string, status: CollectionOrderRecord["status"], price: number | null, created = T, updated = T): CollectionOrderRecord => ({
  id, setId: setSlug, setSlug, setName: setSlug, priceCents: price, domain: "x.myshopify.com", name: "N", email: "e@x.co", note: null, status, createdAt: created, updatedAt: updated,
});
const orders: CollectionOrderRecord[] = [
  order("o1", "paid", "confirmed", 6900, "2026-09-21T10:00:00.000Z", "2026-09-21T14:00:00.000Z"),
  order("o2", "paid", "pending", 6900),
  order("o3", "custom", "pending", null),
  order("old", "paid", "confirmed", 6900, "2025-01-01T00:00:00.000Z", "2025-01-01T01:00:00.000Z"),
];

const leads: CollectionLeadRecord[] = [
  { id: "l1", setSlug: "free", setName: "Free Set", pageSlug: null, domain: "alpha.myshopify.com", email: "a@alpha.co", visitorId: "a", country: "VN", createdAt: T },
  { id: "l0", setSlug: "free", setName: "Free Set", pageSlug: "about", domain: "old.myshopify.com", email: "old@x.co", visitorId: "z", country: null, createdAt: "2025-01-01T00:00:00.000Z" },
];

const v = buildCollectionView({
  events,
  orders,
  leads,
  sets,
  days: 30,
  day: null,
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-10-01T00:00:00.000Z",
  tz: 0,
  truncated: false,
});

console.log("\noverview");
check(v.overview.visitors === 4, "visitors are distinct browsers", v.overview.visitors);
check(v.overview.listViews.n === 2 && v.overview.listViews.people === 2, "list views");
check(v.overview.setViews.n === 4 && v.overview.setViews.people === 4, "set views", v.overview.setViews);
check(v.overview.opens.n === 2 && v.overview.opens.people === 1, "two opens by one person are 2 presses, 1 person");
check(v.overview.medianRead === 20, "median read of 10s and 30s is 20s", v.overview.medianRead);
check(
  v.overview.freeDownloads.people === 1 && v.overview.freeDownloads.sets === 1 && v.overview.freeDownloads.pages === 1,
  "a whole set and a single page by one person is one downloader",
  v.overview.freeDownloads,
);
check(v.overview.ordersReceived === 2, "orders in the window, not the custom request or last year's", v.overview.ordersReceived);
check(v.overview.customRequests === 1, "custom requests counted apart");
check(v.overview.revenueCents === 6900, "revenue is confirmed orders only", v.overview.revenueCents);
check(v.overview.pendingCents === 6900, "pending value is waiting orders");

console.log("\nfunnels");
check(JSON.stringify(v.funnels.free.map((s) => s.value)) === "[2,2,1,1]", "free funnel in people", v.funnels.free.map((s) => s.value));
/* 2 opened a premium set: b, and d on a set that has since been deleted — a
   deleted set's history still counts. */
check(JSON.stringify(v.funnels.paid.map((s) => s.value)) === "[2,2,1,1,2,1]", "paid funnel", v.funnels.paid.map((s) => s.value));

console.log("\nset by set");
const free = v.sets.find((s) => s.slug === "free")!;
const paid = v.sets.find((s) => s.slug === "paid")!;
check(free.views.people === 2, "free set viewers", free.views);
check(free.conversion === 0.5, "free conversion = downloaders ÷ viewers", free.conversion);
check(free.pages.find((p) => p.slug === "home")!.opens.n === 2, "page opens");
check(free.pages.find((p) => p.slug === "about")!.downloads.people === 1, "single page taken alone");
check(paid.orders === 2 && paid.confirmed === 1 && paid.revenueCents === 6900, "paid orders, confirmed, revenue", paid);
check(paid.conversion === 2, "paid conversion = orders ÷ viewers (can exceed 1 when orders arrive without a tracked view)", paid.conversion);
check(v.sets.some((s) => s.slug === "gone" && s.gone), "a deleted set keeps its history");

console.log("\nbehaviour and audience");
check(v.sections.list === 2 && v.sections.free === 1 && v.sections.premium === 1 && v.sections.promo === 1, "rows reached", v.sections);
check(v.promo.build.n === 1 && v.promo.custom.n === 0 && v.promo.requestsSent === 1, "promo cards");
check(v.buyPlaces[0]?.key === "card", "which buy button");
check(v.frames[0]?.key === "mobile", "preview widths");
check(v.referrers.some((r) => r.key === "google.com") && v.referrers.some((r) => r.key === "facebook.com"), "referrers from external entries");
check(v.countries.some((c) => c.key === "Unplaced"), "no country reads as Unplaced");
check(v.checkoutFailures[0]?.key === "That email does not look right.", "checkout failures by message");
check(v.orders.medianHoursToConfirm === 4, "hours from order to confirm", v.orders.medianHoursToConfirm);

console.log("\nthe download form");
check(v.overview.gateOpened.people === 1 && v.overview.leads === 1, "form opened and leads in the window", [v.overview.gateOpened, v.overview.leads]);
check(v.overview.installs.n === 1, "only installs pressed from this section count", v.overview.installs);
check(JSON.stringify(v.funnels.gate.map((s) => s.value)) === "[1,1,1,1]", "form funnel", v.funnels.gate.map((s) => s.value));
check(free.leads === 1, "leads per set");

console.log("\nwho, and when");
const W = { day: null, from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z", tz: 0, limit: 300, events, orders, leads, sets, key: null, set: null };
const opens = collectionHits({ ...W, metric: "opens" })!;
check(opens.total === v.overview.opens.n, "a feed has as many rows as its tile counts", [opens.total, v.overview.opens.n]);
check(opens.hits[0].lead?.email === "a@alpha.co", "an anonymous browser is named by the form it filled in", opens.hits[0].lead);
const bRows = collectionHits({ ...W, metric: "buys" })!;
check(bRows.hits[0].store === "signed-in.myshopify.com", "a signed-in store is named from the session");
check(bRows.hits[0].country === "US", "rows carry the country");
const leadRows = collectionHits({ ...W, metric: "leads" })!;
check(leadRows.total === 1, "leads in the window only", leadRows.total);
const pend = collectionHits({ ...W, metric: "pending" })!;
check(pend.total === 2, "orders by status, custom requests included", pend.total);
const promo = collectionHits({ ...W, metric: "promo", key: "build" })!;
check(promo.total === 1 && collectionHits({ ...W, metric: "promo", key: "custom" })!.total === 0, "a breakdown row narrows by its key");
const onSet = collectionHits({ ...W, metric: "visitors", set: "free" })!;
check(onSet.hits.every((h) => h.set === "Free Set"), "a set's activity is that set's only");
check(collectionHits({ ...W, metric: "nonsense" }) === null, "an unknown figure opens nothing");

console.log("\nthe referral program");
const members = [
  { id: "m1", domain: "alpha.myshopify.com", email: "a@x.co", name: null, status: "active" as const, rewardStatus: "none" as const, rewardNote: null, adminNote: null, createdAt: T, updatedAt: T, lastLoginAt: T },
  { id: "m2", domain: "beta.myshopify.com", email: "b@x.co", name: null, status: "active" as const, rewardStatus: "granted" as const, rewardNote: null, adminNote: null, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: T, lastLoginAt: null },
];
const referrals = [
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `r${n}`, memberId: "m1", domain: `s${n}.myshopify.com`, plan: null, note: null, status: "verified" as const, adminNote: null, createdAt: T, updatedAt: T })),
  { id: "r6", memberId: "m1", domain: "s6.myshopify.com", plan: null, note: null, status: "pending" as const, adminNote: null, createdAt: T, updatedAt: T },
];
const ref = buildCollectionView({ events: [...events, e(EV.cpReferralBoxClicked, "a"), e(EV.cpReferralViewed, "a", { signed_in: false })], orders, leads, members, referrals, sets, days: 30, day: null, from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z", tz: 0, truncated: false });
check(ref.referral.joined === 1 && ref.referral.members === 2, "joined in the window, members in total", [ref.referral.joined, ref.referral.members]);
check(ref.referral.submitted === 6 && ref.referral.verified === 5 && ref.referral.toCheck === 1, "referred, verified, to check", ref.referral);
check(ref.referral.rewardsOwed === 1 && ref.referral.rewardsSent === 1, "a member at 5 verified is owed; a granted one is sent");
check(ref.funnels.referral.at(-1)!.value === 1, "reached the goal");
const memberRows = collectionHits({ ...W, metric: "referral_members", members, referrals })!;
check(memberRows.total === 1 && memberRows.hits[0].detail!.startsWith("5/5"), "members joined, with their progress", memberRows.hits[0]?.detail);

console.log("\na picked day");
const one = buildCollectionView({ events, orders, leads, sets, days: 30, day: "2026-09-21", from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z", tz: 0, truncated: false });
check(one.overview.visitors === 1, "only that day's visitors", one.overview.visitors);
check(one.overview.ordersReceived === 1, "only that day's orders", one.overview.ordersReceived);
check(one.daily.length === 2, "the strip still shows the whole window", one.daily.length);
const shifted = buildCollectionView({ events, orders, leads, sets, days: 30, day: "2026-09-21", from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z", tz: 840, truncated: false });
/* At UTC+14, 10:00Z on the 20th is midnight on the 21st (a, c, d) and b's
   10:00Z on the 21st has moved on to the 22nd. */
check(shifted.overview.visitors === 3, "a day is the reader's day, not UTC's", shifted.overview.visitors);

console.log(bad === 0 ? "\nall good" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
