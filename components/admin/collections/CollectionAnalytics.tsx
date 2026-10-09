"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import type { CpSetRow, CpSlice, CpView, FunnelStep, ReadStats } from "@/lib/collectionAnalytics";
import { formatPrice } from "@/lib/collectionPages";
import { REFERRAL_GOAL } from "@/lib/referral";
import { countryLabel } from "@/lib/countries";
import { Icon, Panel } from "../../ui";
import { DayStrip } from "../DayStrip";
import { StatTile, TileGroup, TileRow } from "../StatTile";
import { HitFeed } from "./HitFeed";
import { api } from "./shared";

/* ==========================================================================
   ADMIN → COLLECTION PAGES → ANALYTICS.

   The same instruments as the main Analytics screen — the strip of days, the
   tiles with their hairlines, the funnel read left to right — pointed at one
   section of the site, so an operator who reads one can read the other.

   IN THE ORDER THE QUESTIONS ARE ASKED:

     1  Is anybody coming, and is it growing?          the strip, the overview
     2  Where do they drop, free and paid?             the two funnels
     3  Which sets work, and which pages in them?      set by set, opened per page
     4  How do they read, and what do they press?      buttons, widths, rows reached
     5  Is money arriving, and are we answering it?    orders
     6  Who are they?                                  entry, referrer, country, screen
     7  What went wrong?                               checkout errors

   Every number says whether it is presses, people or orders — see the note in
   `lib/collectionAnalytics.ts`.
   ========================================================================== */

const RANGES = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
  [0, "All time"],
] as const;

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const ratio = (a: number, b: number) => (b > 0 ? Math.min(1, a / b) : 0);
const money = (cents: number) => formatPrice(cents) ?? "$0";
const secs = (s: number | null) =>
  s === null ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const ENTRY_LABELS: Record<string, string> = {
  direct: "Direct — typed, bookmarked or no referrer",
  external: "Another website",
  site: "Another page of PageFly Design",
  list: "The collection list",
  set: "Another set",
  checkout: "The checkout",
  unknown: "Not recorded",
};
const FRAME_LABELS: Record<string, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};
const PLACE_LABELS: Record<string, string> = {
  card: "On the card in the list",
  detail: "On the set’s page",
  viewer: "Inside a page preview",
};
const SCREEN_LABELS: Record<string, string> = {
  desktop: "Desktop (1024px and up)",
  tablet: "Tablet (640–1023px)",
  mobile: "Mobile (under 640px)",
  unknown: "Not recorded",
};

export function CollectionAnalytics() {
  const [days, setDays] = useState<number>(30);
  const [day, setDay] = useState<string | null>(null);
  const [view, setView] = useState<CpView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      /* Inside the async body, as on the main screen: a setState on the
         effect's own pass is a second render before the first has painted. */
      setLoading(true);
      const tz = -new Date().getTimezoneOffset();
      const q = new URLSearchParams({ days: String(days), tz: String(tz) });
      if (day) q.set("day", day);
      const res = await api<{ view: CpView }>(`/api/admin/collection-pages/analytics?${q}`, {
        cache: "no-store",
      });
      if (!live) return;
      setLoading(false);
      if (!res.ok) return setError(res.error);
      setError(null);
      setView(res.view);
      setAt(new Date());
    })();
    return () => {
      live = false;
    };
  }, [days, day, tick]);

  /* A minute is plenty for a screen read by people rather than watched. */
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const o = view?.overview;
  const window = day ? `on ${day}` : days === 0 ? "all time" : `over ${days} days`;
  /* What every figure opens into — see `HitFeed`. */
  const feed = (metric: string, title?: string) => (
    <HitFeed query={{ metric }} days={days} day={day} title={title} />
  );

  return (
    <div className="grid gap-6">
      {/* ---- controls ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/design/admin/collections"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-pf-muted transition-colors hover:text-pf-text"
          >
            <Icon name="ArrowLeft" size={14} />
            Sets
          </Link>
          <div className="ml-2 flex items-center gap-1 rounded-pf-md border border-pf-border p-0.5">
            {RANGES.map(([d, label]) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  if (d === days && !day) return;
                  setDays(d);
                  setDay(null);
                }}
                aria-pressed={days === d}
                className={`rounded-pf-sm px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  days === d ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {day && (
            <button
              type="button"
              onClick={() => setDay(null)}
              className="inline-flex items-center gap-1.5 rounded-pf-pill border border-pf-primary-hi/50 bg-pf-primary/15 px-3 py-1 text-[12px] font-semibold text-pf-text"
            >
              {day}
              <Icon name="X" size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {at && (
            <span className="text-[11.5px] text-pf-faint">Updated {at.toLocaleTimeString()}</span>
          )}
          <button
            type="button"
            onClick={() => setTick((n) => n + 1)}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-pf-md border border-pf-border px-3 text-[12.5px] font-semibold text-pf-body transition-colors hover:border-pf-border-hi disabled:opacity-60"
          >
            <Icon name="RefreshCw" size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <Panel className="flex items-center gap-2 border-pf-danger/35 bg-pf-danger/10 p-4 text-[13px] text-pf-danger">
          <Icon name="CircleAlert" size={14} />
          {error}
        </Panel>
      )}

      {!view && !error && (
        <Panel className="p-10 text-center text-[13px] text-pf-muted">Reading the figures…</Panel>
      )}

      {view && o && (
        <>
          {view.truncated && (
            <Panel className="border-pf-warn/40 bg-pf-warn/10 p-3 text-[12.5px] text-pf-warn">
              More events than this screen reads at once — every figure below is a floor. Pick a
              shorter window for exact numbers.
            </Panel>
          )}

          {days > 0 && (
            <Panel className="p-4">
              <DayStrip
                daily={view.daily}
                days={days}
                selected={day}
                onSelect={setDay}
              />
            </Panel>
          )}

          {/* ================= 1 · OVERVIEW ================= */}
          <TileGroup
            title="Overview"
            note={`Everything on /collection-pages ${window}. People are browsers, not accounts.`}
          >
            <StatTile
              icon="Users"
              label="Visitors"
              panel={feed("visitors", "Everything visitors did")}
              value={o.visitors}
              footnote="anyone who did anything on these pages"
              ratio={1}
              hint="Distinct browsers behind any event on the list, a set, a preview or the checkout."
            />
            <StatTile
              icon="LayoutGrid"
              label="List views"
              panel={feed("list")}
              value={o.listViews.n}
              footnote={`${people(o.listViews.people)} · ${pct(o.listViews.people, o.visitors)} of visitors`}
              ratio={ratio(o.listViews.people, o.visitors)}
              hint="Loads of /collection-pages itself. The rest arrived straight on a set or the checkout."
            />
            <StatTile
              icon="Eye"
              label="Set pages viewed"
              value={o.setViews.n}
              footnote={`${people(o.setViews.people)} · ${pct(o.setViews.people, o.visitors)} of visitors`}
              ratio={ratio(o.setViews.people, o.visitors)}
              panel={feed("set_views")}
            />
            <StatTile
              icon="Maximize"
              label="Previews opened"
              panel={feed("opens")}
              value={o.opens.n}
              footnote={`${people(o.opens.people)} · median read ${secs(o.medianRead)}`}
              ratio={ratio(o.opens.people, o.setViews.people)}
              hint="A page opened full size from a set. The read time is how long it stayed open."
            />
            <StatTile
              icon="Download"
              label="Free downloads"
              value={o.freeDownloads.people}
              footnote={`people · ${plural(o.freeDownloads.sets, "whole set")} + ${plural(o.freeDownloads.pages, "single page")}`}
              ratio={ratio(o.freeDownloads.people, o.visitors)}
              panel={feed("downloads")}
            />
            <StatTile
              icon="Mail"
              label="Leads collected"
              value={o.leads}
              footnote={`download forms · from ${people(o.gateOpened.people)} who pressed Download`}
              ratio={ratio(o.leadPeople, o.gateOpened.people)}
              panel={feed("leads", "Download forms filled in")}
              hint="The store and email typed into the download form on a free set, stored before the file is offered."
            />
            <StatTile
              icon="ShoppingBag"
              label="Orders received"
              panel={feed("orders")}
              value={o.ordersReceived}
              footnote={`orders · plus ${o.customRequests} custom ${o.customRequests === 1 ? "request" : "requests"}`}
              ratio={ratio(o.ordersReceived, o.buys.people)}
              hint="Rows in the orders table — the server's own record, which no ad blocker or closed tab can lose."
            />
            <StatTile
              icon="Coins"
              label="Revenue confirmed"
              panel={feed("revenue", "Confirmed orders")}
              value={Math.round(o.revenueCents / 100)}
              footnote={`USD · ${money(o.pendingCents)} waiting to be confirmed`}
              ratio={ratio(o.revenueCents, o.revenueCents + o.pendingCents)}
              hint="The price copied onto each confirmed order at the moment it was placed."
            />
          </TileGroup>

          {/* ================= 2 · FUNNELS ================= */}
          <Funnel
            title="Free funnel"
            note="From the list to a download, in people. A step can exceed the one above it when somebody lands straight on a set."
            steps={view.funnels.free}
            feed={feed}
          />
          <Funnel
            title="Download form"
            note="From pressing Download on a free set to pressing Install PageFly after the file arrived, in people."
            steps={view.funnels.gate}
            feed={feed}
          />
          <Funnel
            title="Premium funnel"
            note="From the list to a confirmed order. The last two steps are orders, not people — the orders table has no visitor id."
            steps={view.funnels.paid}
            feed={feed}
          />

          {/* ================= 3 · SET BY SET ================= */}
          <section className="grid gap-3">
            <div>
              <h2 className="text-[13.5px] font-semibold text-pf-text">Set by set</h2>
              <p className="mt-0.5 text-[11.5px] text-pf-muted">
                Press a set to see its pages. Conversion is downloaders ÷ viewers for a free set,
                orders ÷ viewers for a premium one.
              </p>
            </div>
            <SetTable sets={view.sets} days={days} day={day} />
          </section>

          {/* ================= READING TIME ================= */}
          <TileGroup
            title="Reading time"
            note="How long each page preview stayed open, from opening it to closing it — or to closing the tab. Readings under a second are not kept."
          >
            <StatTile
              icon="Clock"
              label="Readings"
              value={view.reading.all.n}
              footnote={`${people(view.reading.all.people)} read at least one page`}
              ratio={ratio(view.reading.all.n, o.opens.n)}
              panel={feed("reads", "Every reading")}
            />
            <StatTile
              icon="Clock"
              label="Median read"
              value={view.reading.all.median ?? 0}
              footnote={`seconds · half read longer, half shorter`}
              hint="The middle reading. Unlike the average, one preview left open over lunch cannot move it."
            />
            <StatTile
              icon="Clock"
              label="Average read"
              value={view.reading.all.average ?? 0}
              footnote={`seconds · longest ${secs(view.reading.all.longest)}`}
            />
            <StatTile
              icon="Clock"
              label="Total time reading"
              value={
                view.reading.all.total < 120
                  ? view.reading.all.total
                  : Math.round(view.reading.all.total / 60)
              }
              footnote={`${view.reading.all.total < 120 ? "seconds" : "minutes"} across every page · ${secs(view.reading.all.total)}`}
            />
          </TileGroup>
          <div className="grid gap-3">
            <Breakdown
              title="How long people read"
              note="Readings by length — press one to see who"
              metric="read_buckets"
              keys={view.reading.buckets.map((b) => b.key)}
              days={days}
              day={day}
              rows={view.reading.buckets.map((b) => ({ key: b.label, n: b.n, people: b.people }))}
              empty="No page was read in this window."
            />
            <ReadingPages rows={view.reading.pages} days={days} day={day} />
          </div>

          {/* ================= 4 · BEHAVIOUR ================= */}
          <section className="grid gap-3">
            <div>
              <h2 className="text-[13.5px] font-semibold text-pf-text">How they browse</h2>
              <p className="mt-0.5 text-[11.5px] text-pf-muted">
                How far down the list people get, which buttons they press, and which widths they
                check a page at.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Breakdown
                title="How far down the list" metric="sections" keys={["free","premium","promo"]} days={days} day={day}
                note="People who saw each row, of those who opened the list"
                rows={[
                  { key: "Free page sets", n: view.sections.free, people: view.sections.free },
                  { key: "Premium page sets", n: view.sections.premium, people: view.sections.premium },
                  { key: "The two promo cards", n: view.sections.promo, people: view.sections.promo },
                ]}
                total={view.sections.list}
                showPct
              />
              <Breakdown
                title="Promo cards" metric="promo" keys={["custom","build"]} days={days} day={day}
                note="Presses on the two cards after the premium sets"
                rows={[
                  { key: "Pre-order your template", ...view.promo.custom },
                  { key: "Build 3 pages free", ...view.promo.build },
                ]}
                footer={`${view.promo.requestsSent} custom template ${view.promo.requestsSent === 1 ? "request" : "requests"} sent`}
              />
              <Breakdown
                title="Which Buy button" metric="buy_places" days={days} day={day}
                note="Where the press on Buy came from"
                rows={view.buyPlaces}
                labels={PLACE_LABELS}
                empty="Nobody pressed Buy in this window."
              />
              <Breakdown
                title="Preview widths" metric="frames" days={days} day={day}
                note="Switches to a width inside a page preview — it opens on desktop"
                rows={view.frames}
                labels={FRAME_LABELS}
                empty="Nobody switched width in this window."
              />
            </div>
          </section>

          {/* ================= 5 · ORDERS ================= */}
          <section className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[13.5px] font-semibold text-pf-text">Orders</h2>
                <p className="mt-0.5 text-[11.5px] text-pf-muted">
                  Premium orders and custom requests placed {window}.
                </p>
              </div>
              <Link
                href="/design/admin/collections?tab=orders"
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-pf-primary-hi hover:underline"
              >
                Open Orders
                <Icon name="ArrowRight" size={13} />
              </Link>
            </div>
            <TileRow>
              <StatTile
                icon="Clock"
                label="Waiting"
                panel={feed("pending")}
                value={view.orders.pending}
                footnote="not answered yet"
                ratio={ratio(view.orders.pending, view.orders.pending + view.orders.confirmed + view.orders.cancelled)}
                tone={view.orders.pending > 0 ? "danger" : "default"}
              />
              <StatTile
                icon="CircleCheck"
                label="Confirmed"
                panel={feed("confirmed")}
                value={view.orders.confirmed}
                footnote={`${money(o.revenueCents)} confirmed`}
                ratio={ratio(view.orders.confirmed, view.orders.pending + view.orders.confirmed + view.orders.cancelled)}
              />
              <StatTile
                icon="X"
                label="Cancelled"
                panel={feed("cancelled")}
                value={view.orders.cancelled}
                footnote="closed without a sale"
                ratio={ratio(view.orders.cancelled, view.orders.pending + view.orders.confirmed + view.orders.cancelled)}
              />
              <StatTile
                icon="Clock"
                label="Time to confirm"
                panel={feed("confirmed")}
                value={view.orders.medianHoursToConfirm ?? 0}
                footnote={
                  view.orders.medianHoursToConfirm === null
                    ? "nothing confirmed yet"
                    : "hours, median, from order to Confirm"
                }
              />
            </TileRow>
            {view.orders.recent.length > 0 && (
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                      <th className="px-4 py-2 font-semibold">Received</th>
                      <th className="px-4 py-2 font-semibold">For</th>
                      <th className="px-4 py-2 font-semibold">Store</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                      <th className="px-4 py-2 text-right font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.orders.recent.map((r) => (
                      <tr key={r.id} className="border-b border-pf-border last:border-0">
                        <td className="px-4 py-2 text-pf-muted">{new Date(r.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2 text-pf-text">{r.setName}</td>
                        <td className="px-4 py-2 text-pf-body">{r.domain}</td>
                        <td className="px-4 py-2 capitalize text-pf-body">{r.status === "pending" ? "new" : r.status}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-pf-body">
                          {formatPrice(r.priceCents) ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </section>

          {/* ================= REFERRAL PROGRAM ================= */}
          <TileGroup
            title="Referral program"
            note={`The offer beside the premium sets and the members it brought in, ${window}. "To check" and the rewards are the whole program, not the window.`}
          >
            <StatTile
              icon="Gift"
              label="Join now pressed"
              value={view.referral.boxClicks.n}
              footnote={`${people(view.referral.boxClicks.people)} · on the box beside the premium sets`}
              ratio={ratio(view.referral.boxClicks.people, view.sections.premium)}
              panel={feed("referral_box")}
            />
            <StatTile
              icon="Eye"
              label="Program page views"
              value={view.referral.views.n}
              footnote={`${people(view.referral.views.people)} · signed in or out`}
              ratio={ratio(view.referral.views.people, o.visitors)}
              panel={feed("referral_views")}
            />
            <StatTile
              icon="UserPlus"
              label="Members joined"
              value={view.referral.joined}
              footnote={`${view.referral.members} members in total · ${view.referral.logins.n} returning logins`}
              ratio={ratio(view.referral.joined, view.referral.views.people)}
              panel={feed("referral_members", "Members who joined")}
            />
            <StatTile
              icon="ListChecks"
              label="Stores referred"
              value={view.referral.submitted}
              footnote={`${view.referral.verified} verified so far`}
              ratio={ratio(view.referral.verified, view.referral.submitted)}
              panel={feed("referral_stores", "Stores members referred")}
            />
            <StatTile
              icon="Clock"
              label="To check"
              value={view.referral.toCheck}
              footnote="referred stores waiting on the team"
              tone={view.referral.toCheck > 0 ? "danger" : "default"}
              ratio={view.referral.toCheck > 0 ? 1 : 0}
            />
            <StatTile
              icon="PartyPopper"
              label="Rewards owed"
              value={view.referral.rewardsOwed}
              footnote={`${view.referral.rewardsSent} sent · members at ${REFERRAL_GOAL} verified not yet rewarded`}
              tone={view.referral.rewardsOwed > 0 ? "danger" : "default"}
              ratio={view.referral.rewardsOwed > 0 ? 1 : 0}
              panel={feed("referral_earned", "Members who reached the goal")}
            />
            <StatTile
              icon="CircleAlert"
              label="Login refused"
              value={view.referral.loginFailed.n}
              footnote={`${people(view.referral.loginFailed.people)} — usually a different email`}
              tone={view.referral.loginFailed.n > 0 ? "danger" : "default"}
              panel={feed("referral_failed")}
            />
            <StatTile
              icon="TrendingUp"
              label="Member activity"
              value={view.referral.storesAdded.n}
              footnote="stores added from the program page"
              panel={feed("referral_activity", "Everything members did")}
            />
          </TileGroup>
          <Funnel
            title="Referral funnel"
            note="From seeing the offer to reaching the goal. Joined and after are members, from the program's own table."
            steps={view.funnels.referral}
            feed={feed}
          />
          <p className="-mt-3 text-[11.5px] text-pf-muted">
            Verifying stores and sending rewards happens in{" "}
            <Link href="/design/admin/collections/referrals" className="font-semibold text-pf-primary-hi hover:underline">
              Referral
            </Link>
            .
          </p>

          {/* ================= 6 · AUDIENCE ================= */}
          <section className="grid gap-3">
            <div>
              <h2 className="text-[13.5px] font-semibold text-pf-text">Who they are</h2>
              <p className="mt-0.5 text-[11.5px] text-pf-muted">
                How people reached a list or set page, from where, and on what. In people.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Breakdown title="How they arrived" metric="entries" days={days} day={day} rows={view.entries} labels={ENTRY_LABELS} empty="No visits recorded." byPeople />
              <Breakdown title="Referring websites" metric="referrers" days={days} day={day} note="For visits from another website" rows={view.referrers} empty="No visits from another website." byPeople />
              <Breakdown
                title="Countries" metric="countries" days={days} day={day}
                rows={view.countries.slice(0, 10)}
                format={(k) => (k === "Unplaced" ? "Unplaced" : countryLabel(k))}
                empty="No visits recorded."
                byPeople
                unit="events"
                footer={view.countries.length > 10 ? `+ ${view.countries.length - 10} more` : undefined}
              />
              <Breakdown title="Screen size" metric="screens" days={days} day={day} rows={view.screens} labels={SCREEN_LABELS} empty="No visits recorded." byPeople />
            </div>
          </section>

          {/* ================= 7 · PROBLEMS ================= */}
          <section className="grid gap-3">
            <div>
              <h2 className="text-[13.5px] font-semibold text-pf-text">Checkout problems</h2>
              <p className="mt-0.5 text-[11.5px] text-pf-muted">
                What the checkout form said when it refused or could not send. Every one of these is
                somebody who tried to buy.
              </p>
            </div>
            <Breakdown
              title="Messages shown" metric="checkout_failures" days={days} day={day}
              rows={view.checkoutFailures}
              empty="The checkout has not refused anybody in this window."
              danger
            />
          </section>

          <p className="px-1 text-[11px] leading-relaxed text-pf-faint">
            <strong className="font-semibold text-pf-muted">Where these come from.</strong> Views,
            presses and read times are browser events, so a visitor with tracking blocked is not
            counted and a reload counts again. Orders and revenue come from the orders table and are
            exact. Downloads count people who pressed a download button — a file link opened
            directly is not seen. Sets that were deleted still appear under their URL so their
            history is not lost.
          </p>
        </>
      )}
    </div>
  );
}

/* ---- a funnel: a tile per step, each against the step before ---- */
function Funnel({
  title,
  note,
  steps,
  feed,
}: {
  title: string;
  note: string;
  steps: FunnelStep[];
  feed: (metric: string, title?: string) => React.ReactNode;
}) {
  const icons = ["LayoutGrid", "Eye", "Maximize", "Download", "ShoppingBag", "CircleCheck"] as const;
  const gateIcons = ["Download", "Mail", "Package", "Rocket"] as const;
  const referralIcons = ["Eye", "Gift", "LayoutGrid", "UserPlus", "ListChecks", "PartyPopper"] as const;
  return (
    <TileGroup title={title} note={note}>
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].value;
        const low = prev !== null && prev > 0 && s.value / prev < 0.25;
        return (
          <StatTile
            key={s.label}
            panel={feed(s.metric, s.label)}
            icon={
              title === "Download form"
                ? gateIcons[Math.min(i, gateIcons.length - 1)]
                : title === "Referral funnel"
                  ? referralIcons[Math.min(i, referralIcons.length - 1)]
                : title.startsWith("Premium") && i === 2
                ? "ShoppingCart"
                : title.startsWith("Premium") && i === 3
                  ? "ClipboardList"
                  : icons[Math.min(i, icons.length - 1)]
            }
            label={s.label}
            value={s.value}
            footnote={
              prev === null
                ? `${s.unit} · the top of the funnel`
                : prev === 0
                  ? `${s.unit} · the step above is 0, so they arrived another way`
                  : `${pct(s.value, prev)} of the step above · ${s.unit}`
            }
            ratio={prev === null ? 1 : ratio(s.value, prev)}
            tone={low ? "danger" : "default"}
            delay={i * 0.04}
          />
        );
      })}
    </TileGroup>
  );
}

/* ---- a ranked list with hairline bars ---- */
function Breakdown({
  title,
  note,
  rows,
  labels,
  format,
  empty = "Nothing yet.",
  total,
  showPct = false,
  byPeople = false,
  danger = false,
  footer,
  unit = "views",
  metric,
  keys,
  days = 30,
  day = null,
}: {
  title: string;
  note?: string;
  rows: CpSlice[];
  labels?: Record<string, string>;
  format?: (key: string) => string;
  empty?: string;
  /** what the bars are a share of; the largest row when absent */
  total?: number;
  showPct?: boolean;
  byPeople?: boolean;
  danger?: boolean;
  footer?: string;
  /** what `n` counts when rows are ranked by people */
  unit?: string;
  /** what a row opens into; rows are not pressable without one */
  metric?: string;
  /** each row's key for the feed, when the row's own key is a display label */
  keys?: string[];
  days?: number;
  day?: string | null;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const top = total ?? Math.max(1, ...rows.map((r) => (byPeople ? r.people : r.n)));
  const nothing = rows.every((r) => r.n === 0);
  return (
    <Panel className="p-4">
      <p className="text-[12.5px] font-semibold text-pf-text">{title}</p>
      {note && <p className="mt-0.5 text-[11px] text-pf-faint">{note}</p>}
      {nothing ? (
        <p className="mt-3 text-[12px] text-pf-muted">{empty}</p>
      ) : (
        <div className="mt-3 grid gap-2.5">
          {rows.map((r, i) => {
            const v = byPeople || showPct ? r.people : r.n;
            const on = picked === i;
            return (
              <div
                key={r.key}
                role={metric ? "button" : undefined}
                tabIndex={metric ? 0 : undefined}
                aria-expanded={metric ? on : undefined}
                onClick={metric ? () => setPicked(on ? null : i) : undefined}
                onKeyDown={
                  metric
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setPicked(on ? null : i);
                        }
                      }
                    : undefined
                }
                className={`grid gap-1 rounded-pf-sm ${
                  metric ? "-mx-2 cursor-pointer px-2 py-1 transition-colors hover:bg-pf-card-hi/60" : ""
                } ${on ? "bg-pf-card-hi/60" : ""}`}
              >
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-pf-body" title={r.key}>
                    {format ? format(r.key) : (labels?.[r.key] ?? r.key)}
                  </span>
                  {!showPct && !byPeople && r.people !== r.n && (
                    <span className="shrink-0 text-[11px] tabular-nums text-pf-faint">{people(r.people)}</span>
                  )}
                  {byPeople && r.n !== r.people && (
                    <span className="shrink-0 text-[11px] tabular-nums text-pf-faint">
                      {r.n} {unit}
                    </span>
                  )}
                  <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-pf-text">
                    {showPct ? `${v} · ${pct(v, top)}` : v}
                  </span>
                </div>
                <div className="h-[3px] rounded-full bg-pf-bg-deep">
                  <div
                    className={`h-full rounded-full ${danger ? "bg-pf-danger" : "bg-pf-primary"}`}
                    style={{ width: `${ratio(v, top) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {footer && <p className="mt-3 border-t border-pf-border pt-2 text-[11.5px] text-pf-muted">{footer}</p>}
      {metric && !nothing && picked === null && (
        <p className="mt-3 text-[11px] text-pf-faint">Press a row to see who, and when.</p>
      )}
      {metric && picked !== null && rows[picked] && (
        <div className="mt-3">
          <HitFeed
            query={{ metric, key: keys?.[picked] ?? rows[picked].key }}
            days={days}
            day={day}
            title={format ? format(rows[picked].key) : (labels?.[rows[picked].key] ?? rows[picked].key)}
          />
        </div>
      )}
    </Panel>
  );
}

/* ---- set by set, each opening into its pages ---- */
function SetTable({ sets, days, day }: { sets: CpSetRow[]; days: number; day: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("views");
  const rows = [...sets].sort((a, b) =>
    sort === "views"
      ? b.views.people - a.views.people
      : sort === "conversion"
        ? (b.conversion ?? -1) - (a.conversion ?? -1)
        : b.revenueCents - a.revenueCents,
  );

  const th = "px-3 py-2.5 font-semibold";

  if (sets.length === 0) {
    return <Panel className="p-6 text-center text-[12.5px] text-pf-muted">No sets yet.</Panel>;
  }

  return (
    <Panel className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-pf-border text-[10.5px] uppercase tracking-[0.06em] text-pf-faint">
            <th className={th}>Set</th>
            <th className={`${th} text-right`}>
              <SortBtn id="views" sort={sort} onSort={setSort}>Viewers</SortBtn>
            </th>
            <th className={`${th} text-right`}>Previews</th>
            <th className={`${th} text-right`}>Median read</th>
            <th className={`${th} text-right`}>Downloads</th>
            <th className={`${th} text-right`}>Buy pressed</th>
            <th className={`${th} text-right`}>Checkout</th>
            <th className={`${th} text-right`}>Orders</th>
            <th className={`${th} text-right`}>
              <SortBtn id="revenue" sort={sort} onSort={setSort}>Revenue</SortBtn>
            </th>
            <th className={`${th} text-right`}>
              <SortBtn id="conversion" sort={sort} onSort={setSort}>Conversion</SortBtn>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const free = s.access === "free";
            const isOpen = open === s.slug;
            return (
              <Fragment key={s.slug}>
                <tr
                  onClick={() => setOpen(isOpen ? null : s.slug)}
                  className="cursor-pointer border-b border-pf-border transition-colors hover:bg-pf-card-hi/50"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Icon
                        name="ChevronRight"
                        size={13}
                        className={`shrink-0 text-pf-faint transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      <span className="font-semibold text-pf-text">{s.name}</span>
                      <span
                        className={`rounded-pf-pill border px-1.5 py-px text-[10.5px] font-semibold ${
                          free
                            ? "border-pf-primary-hi/30 text-pf-primary-hi"
                            : "border-pf-warn/30 text-pf-warn"
                        }`}
                      >
                        {free ? "Free" : (formatPrice(s.priceCents) ?? "Paid")}
                      </span>
                      {s.gone && <span className="text-[10.5px] text-pf-faint">deleted</span>}
                      {!s.gone && s.visibility !== "visible" && (
                        <span className="text-[10.5px] text-pf-faint">{s.visibility}</span>
                      )}
                    </div>
                  </td>
                  <Num main={s.views.people} sub={plural(s.views.n, "view")} />
                  <Num main={s.opens.n} sub={people(s.opens.people)} />
                  <td className="px-3 py-3 text-right tabular-nums text-pf-body">{secs(s.medianRead)}</td>
                  {free ? (
                    <Num
                      main={s.downloads.people}
                      sub={`${plural(s.downloads.sets, "set")} · ${plural(s.downloads.pages, "page")} · ${plural(s.leads, "lead")}`}
                    />
                  ) : (
                    <td className="px-3 py-3 text-right text-pf-faint">—</td>
                  )}
                  {free ? (
                    <td className="px-3 py-3 text-right text-pf-faint">—</td>
                  ) : (
                    <Num main={s.buys.n} sub={people(s.buys.people)} />
                  )}
                  {free ? (
                    <td className="px-3 py-3 text-right text-pf-faint">—</td>
                  ) : (
                    <Num main={s.checkouts.people} sub={plural(s.checkouts.n, "view")} />
                  )}
                  {free ? (
                    <td className="px-3 py-3 text-right text-pf-faint">—</td>
                  ) : (
                    <Num main={s.orders} sub={`${s.confirmed} confirmed`} />
                  )}
                  <td className="px-3 py-3 text-right tabular-nums text-pf-body">
                    {free ? <span className="text-pf-faint">—</span> : money(s.revenueCents)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-semibold tabular-nums text-pf-text">
                      {s.conversion === null ? "—" : `${Math.round(s.conversion * 100)}%`}
                    </span>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-pf-border bg-pf-bg-deep/40">
                    <td colSpan={10} className="px-3 py-3">
                      <PageTable set={s} days={days} day={day} />
                      <div className="mt-4 pl-6">
                        <HitFeed
                          query={{ metric: "visitors", set: s.slug }}
                          days={days}
                          day={day}
                          title={`Everything that happened on ${s.name}`}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

type SortKey = "views" | "conversion" | "revenue";

function SortBtn({
  id,
  sort,
  onSort,
  children,
}: {
  id: SortKey;
  sort: SortKey;
  onSort: (id: SortKey) => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(id)}
      className={`inline-flex items-center gap-1 uppercase ${sort === id ? "text-pf-text" : "hover:text-pf-body"}`}
    >
      {children}
      {sort === id && <Icon name="ArrowDown" size={10} />}
    </button>
  );
}

function Num({ main, sub }: { main: number; sub: string }) {
  return (
    <td className="px-3 py-3 text-right">
      <span className="block font-semibold tabular-nums text-pf-text">{main}</span>
      <span className="block text-[10.5px] tabular-nums text-pf-faint">{sub}</span>
    </td>
  );
}

function ReadCells({ r }: { r: ReadStats }) {
  return (
    <>
      <td className="py-2 text-right tabular-nums text-pf-body">{r.n}</td>
      <td className="py-2 text-right tabular-nums text-pf-body">{r.people}</td>
      <td className="py-2 text-right tabular-nums font-semibold text-pf-text">{secs(r.median)}</td>
      <td className="py-2 text-right tabular-nums text-pf-body">{secs(r.average)}</td>
      <td className="py-2 text-right tabular-nums text-pf-body">{secs(r.longest)}</td>
      <td className="py-2 text-right tabular-nums text-pf-body">{secs(r.total)}</td>
    </>
  );
}

const READ_HEAD = ["Reads", "People", "Median", "Average", "Longest", "Total"];

/* Every page that was read, across every set, longest total first. A row
   opens into each reading of it: who, when, where, how long. */
function ReadingPages({
  rows,
  days,
  day,
}: {
  rows: CpView["reading"]["pages"];
  days: number;
  day: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const top = Math.max(1, ...rows.map((r) => r.reads.total));
  return (
    <Panel className="p-4">
      <p className="text-[12.5px] font-semibold text-pf-text">Pages by reading time</p>
      <p className="mt-0.5 text-[11px] text-pf-faint">
        Every set, every page — press one to see each reading: who, when, from where, and for how long
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[12px] text-pf-muted">No page was read in this window.</p>
      ) : (
        <div className="mt-3 max-h-[640px] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.06em] text-pf-faint">
                <th className="py-1.5 font-semibold">Set · page</th>
                {READ_HEAD.map((h) => (
                  <th key={h} className="py-1.5 text-right font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = `${r.set}/${r.page}`;
                return (
                  <Fragment key={id}>
                    <tr
                      onClick={() => setOpen(open === id ? null : id)}
                      className={`cursor-pointer border-t border-pf-border/60 transition-colors hover:bg-pf-card-hi/50 ${open === id ? "bg-pf-card-hi/50" : ""}`}
                    >
                      <td className="py-2 pr-3">
                        <span className="text-pf-text">{r.setName}</span>
                        <span className="text-pf-faint"> · {r.label}</span>
                        <div className="mt-1 h-[3px] rounded-full bg-pf-bg-deep">
                          <div className="h-full rounded-full bg-pf-primary" style={{ width: `${ratio(r.reads.total, top) * 100}%` }} />
                        </div>
                      </td>
                      <ReadCells r={r.reads} />
                    </tr>
                    {open === id && (
                      <tr>
                        <td colSpan={7} className="pb-3 pt-1">
                          <HitFeed
                            query={{ metric: "reads", key: r.page, set: r.set }}
                            days={days}
                            day={day}
                            title={`Every reading of ${r.setName} · ${r.label}`}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function PageTable({ set, days, day }: { set: CpSetRow; days: number; day: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (set.pages.length === 0) {
    return <p className="pl-6 text-[12px] text-pf-muted">No pages.</p>;
  }
  const topOpens = Math.max(1, ...set.pages.map((p) => p.opens.n));
  return (
    <div className="pl-6">
      <p className="mb-2 text-[11px] text-pf-faint">
        Page by page — opens, how long each page was read, and which were taken on their own. Press a
        page to see every reading of it.
      </p>
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-[0.06em] text-pf-faint">
            <th className="py-1.5 font-semibold">Page</th>
            <th className="w-[22%] py-1.5 font-semibold">Opens</th>
            {READ_HEAD.map((h) => (
              <th key={h} className="py-1.5 text-right font-semibold">
                {h === "Reads" ? "Reads" : h === "People" ? "Readers" : h}
              </th>
            ))}
            {set.access === "free" && <th className="py-1.5 text-right font-semibold">Taken alone</th>}
          </tr>
        </thead>
        <tbody>
          {set.pages.map((p) => (
            <Fragment key={p.slug}>
              <tr
                onClick={() => setOpen(open === p.slug ? null : p.slug)}
                className={`cursor-pointer border-t border-pf-border/60 transition-colors hover:bg-pf-card-hi/50 ${open === p.slug ? "bg-pf-card-hi/50" : ""}`}
              >
                <td className="py-2 pr-3 text-pf-body">{p.label}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="h-[5px] flex-1 rounded-full bg-pf-bg-deep">
                      <div
                        className="h-full rounded-full bg-pf-primary"
                        style={{ width: `${ratio(p.opens.n, topOpens) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-semibold tabular-nums text-pf-text">{p.opens.n}</span>
                  </div>
                </td>
                <ReadCells r={p.reads} />
                {set.access === "free" && (
                  <td className="py-2 text-right tabular-nums text-pf-body">{p.downloads.people}</td>
                )}
              </tr>
              {open === p.slug && (
                <tr>
                  <td colSpan={set.access === "free" ? 9 : 8} className="pb-3 pt-1">
                    <HitFeed
                      query={{ metric: "reads", key: p.slug, set: set.slug }}
                      days={days}
                      day={day}
                      title={`Every reading of ${set.name} · ${p.label}`}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
