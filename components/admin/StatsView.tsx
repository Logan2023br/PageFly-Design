"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { AdminStats } from "@/lib/db";
import { countryLabel } from "@/lib/countries";
import { Icon, Panel } from "../ui";
import { StatTile } from "./StatTile";

/* ==========================================================================
   Thống kê.

   Charts are hand-drawn SVG rather than a charting library: the whole feature is
   meant to embed into pagefly.io with no external requests, and four numbers, a
   day bar chart and a rating split do not justify a dependency that would ship
   more code than the rest of this screen.

   FETCHED IN THE BROWSER, since the range arrived. A window that reloads the
   page loses the scroll position and every open breakdown on each press, and
   comparing seven days against thirty is the only thing a range is for. The
   analytics screen made the same trade and its note explains it at length.

   WHAT THE RANGE DOES AND DOES NOT TOUCH. Builds, pages, spend and countries
   are things that happened in a window. The beta list and the ratings are
   standing totals — a store is on the list or it is not, and "6 reviews in the
   last day" is a number that would read as a collapse every morning. Tiles in
   the second group carry the window; the first group never does.
   ========================================================================== */

/** Matching `/api/admin/stats`. 0 is everything. */
const RANGES: { days: number; label: string }[] = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All" },
];

const n = (x: number) => x.toLocaleString();

/** Dollars, at the precision the figure deserves — cents below ten dollars. */
function usd(v: number | null): string {
  if (v === null) return "—";
  if (v >= 100) return `$${Math.round(v).toLocaleString()}`;
  if (v >= 10) return `$${v.toFixed(1)}`;
  return `$${v.toFixed(2)}`;
}

/** 1,240,000 → 1.24M. A token count is read for its size, not its digits. */
function short(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

/** `home` → `Home page`, and anything unknown keeps the word it came with. */
const PAGE_TYPE_NAME: Record<string, string> = {
  home: "Home page",
  product: "Product page",
  collection: "Collection page",
  landing: "Landing page",
  about: "About page",
  contact: "Contact page",
  blog: "Blog page",
  faq: "FAQ page",
};

/** Today in UTC, which is the calendar the figures are grouped by. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StatsView({ stats: initial }: { stats: AdminStats }) {
  const [days, setDays] = useState(30);
  /* A PICKED DAY BEATS THE WINDOW, here as in the driver. Holding both and
     applying both would mean "the 23rd, if it falls inside the last seven
     days" — an empty screen nobody can explain. */
  const [day, setDay] = useState<string | null>(null);
  /* TWO LISTS, NOT ONE PICK — the same control the analytics screen carries,
     and its note says why: "show me Vietnam" and "show me everything except
     Vietnam" are both things people want, and a single selection expresses
     only the first. */
  const [only, setOnly] = useState<string[]>([]);
  const [except, setExcept] = useState<string[]>([]);
  /* Stable keys for the effect: an array is a new identity every render, and
     `only.join()` inside the dependency list is an expression the lint cannot
     check statically. */
  const onlyKey = only.join();
  const exceptKey = except.join();
  const [stats, setStats] = useState(initial);

  /* DERIVED, NOT HELD. A `loading` flag set at the top of the effect is a
     setState during render's commit, and the lint is right to refuse it — but
     the better reason is that the flag would be a second source of truth for
     something the data already says. Every payload carries the slice it
     answers for, so "the figures on screen are not the ones asked for" is a
     comparison, not a state. */
  const loading =
    stats.only.join() !== onlyKey ||
    stats.except.join() !== exceptKey ||
    (day !== null ? stats.day !== day : stats.day !== null || stats.days !== days);

  /* THE WHOLE REQUEST AS ONE STRING, built out here. The effect then depends
     on a single value that changes exactly when the question changes — arrays
     are a new identity every render, and keying off them inside the dependency
     list is something the lint cannot check and a reader cannot either. */
  const query = (() => {
    const q = new URLSearchParams({ days: String(days) });
    if (day) q.set("day", day);
    if (onlyKey) q.set("country", onlyKey);
    if (exceptKey) q.set("exclude", exceptKey);
    return q.toString();
  })();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/stats?${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AdminStats | null) => {
        if (!cancelled && d) setStats(d);
      })
      .catch(() => {
        /* The screen keeps the figures it has rather than blanking. */
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const { reviews, spend } = stats;
  const window = day
    ? day
    : days === 0
      ? "all time"
      : days === 1
        ? "last 24 hours"
        : `last ${days} days`;

  /* Whether any slice at all is in force, which decides if the store tile
     shows its windowed line. */
  const windowed = day !== null || days !== 0;

  /* What the priced rows add up to — a floor under the real bill. */
  const knownCost = spend.rows.reduce((t, r) => t + (r.costUsd ?? 0), 0);

  const topPages = Math.max(...stats.pageTypes.map((t) => t.pages), 1);
  const topCountry = Math.max(...stats.countries.map((c) => c.pages), 1);

  return (
    <div className="grid gap-4">
      {/* ---- the window ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-pf-md border border-pf-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => {
                setDays(r.days);
                setDay(null);
              }}
              /* NOT PRESSED WHILE A DAY IS PICKED. The day wins in the
                 driver, so a lit range button beside a filled date field is
                 the screen claiming two windows and showing one. */
              aria-pressed={day === null && days === r.days}
              className={`rounded-pf-sm px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                day === null && days === r.days
                  ? "bg-pf-primary text-white"
                  : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {/* A DATE, FOR ANY DAY — including one outside every window above.
            Picking one turns the ranges off rather than combining with them;
            pressing a range clears it back. Two controls for one question
            would otherwise leave a state where neither label is true. */}
        <label className="flex items-center gap-2 rounded-pf-md border border-pf-border px-2.5 py-1.5">
          <span className="text-[11.5px] text-pf-muted">Day</span>
          <input
            type="date"
            value={day ?? ""}
            max={todayUtc()}
            onChange={(e) => setDay(e.target.value || null)}
            className="bg-transparent text-[12.5px] tabular-nums text-pf-text outline-none [color-scheme:dark]"
          />
          {day && (
            <button
              type="button"
              onClick={() => setDay(null)}
              aria-label="Clear the day"
              className="text-pf-faint transition-colors hover:text-pf-text"
            >
              <Icon name="X" size={13} />
            </button>
          )}
        </label>

        <span className="text-[11.5px] text-pf-faint">
          {loading
            ? "loading…"
            : `builds, pages and spend · ${day ? day : `the ${window}`}` +
              (only.length > 0
                ? ` · only ${only.map((c) => countryLabel(c === "unknown" ? null : c)).join(", ")}`
                : except.length > 0
                  ? ` · everything except ${except
                      .map((c) => countryLabel(c === "unknown" ? null : c))
                      .join(", ")}`
                  : "")}
        </span>
      </div>

      {/* ---- the countries ------------------------------------------------
          BUILT FROM THE UNFILTERED LIST. `countries` deliberately ignores these
          chips in the driver — narrowed to what is already picked, there would
          be nothing here to switch to.

          A CHIP IS A THREE-WAY CONTROL, not a checkbox, matching the analytics
          screen exactly: press once for only that country, again to exclude it,
          again to clear. The state is written on the chip so nobody has to
          remember which press they are on. */}
      {stats.countries.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOnly([]);
              setExcept([]);
            }}
            aria-pressed={only.length === 0 && except.length === 0}
            className={`rounded-pf-pill border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
              only.length === 0 && except.length === 0
                ? "border-pf-primary bg-pf-primary/15 text-pf-primary-hi"
                : "border-pf-border text-pf-muted hover:text-pf-text"
            }`}
          >
            All countries
          </button>

          {stats.countries.map((c) => {
            const picked = only.includes(c.country);
            const banned = except.includes(c.country);
            return (
              <button
                key={c.country}
                type="button"
                title={`${c.pages} page${c.pages === 1 ? "" : "s"} · ${c.stores} store${c.stores === 1 ? "" : "s"}`}
                onClick={() => {
                  /* only → except → clear. Each press moves the chip one step
                     and never leaves it in both lists, which would be a filter
                     that contradicts itself. */
                  if (picked) {
                    setOnly((l) => l.filter((x) => x !== c.country));
                    setExcept((l) => [...l, c.country]);
                  } else if (banned) {
                    setExcept((l) => l.filter((x) => x !== c.country));
                  } else {
                    setExcept((l) => l.filter((x) => x !== c.country));
                    setOnly((l) => [...l, c.country]);
                  }
                }}
                className={`flex items-center gap-1.5 rounded-pf-pill border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  picked
                    ? "border-pf-primary bg-pf-primary/15 text-pf-primary-hi"
                    : banned
                      ? "border-pf-danger/50 bg-pf-danger/10 text-pf-danger line-through"
                      : "border-pf-border text-pf-muted hover:text-pf-text"
                }`}
              >
                {banned && <Icon name="Minus" size={11} />}
                {countryLabel(c.country === "unknown" ? null : c.country)}
                <span className="tabular-nums opacity-60">{c.pages}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* THE SELF-REGISTERED TILE IS GONE. It answered "came through the
            public form" — a number that moves for reasons nobody acts on, and
            it sat where the far more useful split belongs: of the stores that
            signed in, how many got as far as building anything. */}
        {/* THE SELF-REGISTERED TILE IS GONE. It answered "came through the
            public form" — a number that moves for reasons nobody acts on, and
            it sat where the far more useful split belongs: of the stores that
            signed in, how many got as far as building anything.

            THE COUNTRY NARROWS IT; THE WINDOW DOES NOT. A country is a
            property of a store, so picking one asks the same question of
            fewer stores — and this tile reading 70 whichever country was
            picked is exactly what got reported. A window is not a property of
            a store: "70 stores" over one day would be a different question, so
            it gets its own line rather than redefining this one. */}
        <StatTile
          icon="Users"
          label="Stores using it"
          value={stats.activeStores}
          footnote={
            `${n(stats.builtStores)} built · ${n(stats.idleStores)} signed in only` +
            (windowed ? ` · ${n(stats.builtStoresInWindow)} built in ${window}` : "")
          }
          ratio={stats.activeStores ? stats.builtStores / stats.activeStores : undefined}
          breakdown={{
            rows: [
              ...(windowed
                ? [
                    {
                      label: `Built in ${window}`,
                      value: n(stats.builtStoresInWindow),
                      note: stats.activeStores
                        ? `${Math.round((stats.builtStoresInWindow / stats.activeStores) * 100)}% of signed in`
                        : undefined,
                      ratio: stats.activeStores
                        ? stats.builtStoresInWindow / stats.activeStores
                        : 0,
                    },
                  ]
                : []),
              {
                label: "Built at least one page, ever",
                value: n(stats.builtStores),
                note: stats.activeStores
                  ? `${Math.round((stats.builtStores / stats.activeStores) * 100)}% of signed in`
                  : undefined,
                ratio: stats.activeStores ? stats.builtStores / stats.activeStores : 0,
              },
              {
                label: "Signed in, never built",
                value: n(stats.idleStores),
                note: stats.activeStores
                  ? `${Math.round((stats.idleStores / stats.activeStores) * 100)}% of signed in`
                  : undefined,
                ratio: stats.activeStores ? stats.idleStores / stats.activeStores : 0,
              },
              {
                label: "On the beta list, never signed in",
                value: n(Math.max(0, stats.allowedStores - stats.activeStores)),
                note: `of ${n(stats.allowedStores)} invited`,
                ratio: stats.allowedStores
                  ? (stats.allowedStores - stats.activeStores) / stats.allowedStores
                  : 0,
              },
            ],
          }}
        />

        <StatTile
          icon="Files"
          label="Pages created"
          value={stats.totalPages}
          footnote={`across ${n(stats.totalRuns)} ${stats.totalRuns === 1 ? "build" : "builds"} · ${window}`}
          breakdown={{
            empty: "No pages built in this window.",
            rows: stats.pageTypes.map((t) => ({
              label: PAGE_TYPE_NAME[t.type] ?? t.type,
              value: n(t.pages),
              note: stats.totalPages
                ? `${Math.round((t.pages / stats.totalPages) * 100)}%`
                : undefined,
              ratio: t.pages / topPages,
            })),
          }}
        />

        <StatTile
          icon="Coins"
          label="Tokens spent"
          value={spend.totalTokens}
          /* THE DOLLARS ARE IN THE FOOTNOTE AND NOT THE FIGURE. Tokens are
             measured; dollars are tokens times a rate a person typed in, and
             putting the softer number in the big type would be claiming the
             wrong thing is certain. */
          /* A FLOOR IS WORTH MORE THAN A DASH. When part of the window has no
             model on it the total cannot be stated, but the part that IS
             priced is still the best thing known about the bill — so it is
             shown with a `+`, meaning at least this. An earlier draft printed
             only the unattributed count here, which repeated the figure
             directly above it and dropped the money entirely. */
          footnote={
            spend.totalCostUsd !== null
              ? `${usd(spend.totalCostUsd)} · all models · ${window}`
              : `${usd(knownCost)}+ · ${short(spend.unattributedTokens)} tokens with no model on them`
          }
          breakdown={{
            empty:
              "No per-model rows in this window. Recording began when this shipped; " +
              "older builds kept only a token count with no model on it.",
            rows: [
              ...spend.rows.map((r) => ({
                label: `${r.model}`,
                value: usd(r.costUsd),
                note:
                  `${short(r.tokens)} tokens · ${n(r.calls)} call${r.calls === 1 ? "" : "s"}` +
                  (r.cached > 0
                    ? ` · ${Math.round((r.cached / Math.max(1, r.input)) * 100)}% of input cached`
                    : ""),
                ratio: spend.totalTokens ? r.tokens / spend.totalTokens : 0,
              })),
              ...(spend.unattributedTokens > 0
                ? [
                    {
                      /* NAMED, NOT HIDDEN. These tokens are real and their cost
                         is not knowable — the runs that spent them recorded a
                         count and no model. Folding them into a model's row
                         would invent an attribution; dropping them would make
                         the total smaller than the bill. */
                      label: "Before per-model recording",
                      value: "—",
                      note: `${short(spend.unattributedTokens)} tokens · model not recorded`,
                      ratio: spend.totalTokens
                        ? spend.unattributedTokens / spend.totalTokens
                        : 0,
                    },
                  ]
                : []),
            ],
          }}
        />

        <StatTile
          icon="MessageSquare"
          label="Reviews"
          value={reviews.total}
          footnote={
            reviews.total
              ? `${reviews.average} average · ${reviews.good} good, ${reviews.bad} poor`
              : "none yet"
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Panel className="p-4 sm:p-5">
          <h2 className="text-[13.5px] font-semibold text-pf-text">
            Pages per day
          </h2>
          <p className="mt-0.5 text-[11.5px] text-pf-muted">{window}</p>
          <DayChart daily={stats.daily} onPick={setDay} picked={day} />
        </Panel>

        <Panel className="p-4 sm:p-5">
          <h2 className="text-[13.5px] font-semibold text-pf-text">Ratings</h2>
          <p className="mt-0.5 text-[11.5px] text-pf-muted">
            4–5 counts as good, 1–3 as poor
          </p>
          <RatingSplit reviews={reviews} />
        </Panel>
      </div>

      <Panel className="p-4 sm:p-5">
        <h2 className="text-[13.5px] font-semibold text-pf-text">Where the pages were built</h2>
        <p className="mt-0.5 text-[11.5px] text-pf-muted">
          By the store&rsquo;s country · {window}
        </p>
        <CountrySplit rows={stats.countries} peak={topCountry} />
      </Panel>
    </div>
  );
}

/* ---- countries ----------------------------------------------------------- */

function CountrySplit({
  rows,
  peak,
}: {
  rows: AdminStats["countries"];
  peak: number;
}) {
  if (rows.length === 0) {
    return <p className="mt-4 text-[12.5px] text-pf-muted">No builds in this window.</p>;
  }

  return (
    <div className="mt-4 grid gap-2.5">
      {rows.slice(0, 12).map((c) => (
        <div key={c.country} className="flex items-center gap-2.5">
          {/* `countryLabel` carries the flag and the name, and answers null
              with "Unplaced" — its own note says a remainder with no name is a
              remainder nobody can ask about. The query writes 'unknown' where
              the store has no country, so it is turned back into the null that
              function expects rather than looked up as a code. */}
          <span className="w-[150px] shrink-0 truncate text-[12px] text-pf-body">
            {countryLabel(c.country === "unknown" ? null : c.country)}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-pf-pill bg-pf-bg-deep">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(c.pages / peak) * 100}%` }}
              transition={{ type: "spring", stiffness: 240, damping: 28 }}
              className="h-full rounded-pf-pill bg-gradient-to-r from-pf-primary to-pf-primary-hi"
            />
          </div>
          <span className="w-16 shrink-0 text-right text-[11.5px] tabular-nums text-pf-faint">
            {c.stores} {c.stores === 1 ? "store" : "stores"}
          </span>
          <span className="w-12 shrink-0 text-right text-[12px] font-semibold tabular-nums text-pf-text">
            {c.pages}
          </span>
        </div>
      ))}
    </div>
  );
}


/* ---- day bars ------------------------------------------------------------ */

function DayChart({
  daily,
  onPick,
  picked,
}: {
  daily: AdminStats["daily"];
  /* THE BAR IS THE OBVIOUS PLACE TO PRESS. A reader who sees a spike wants
     that day, and reaching for a date field to retype what is already under
     the cursor is a step that exists only because nobody wired the chart. */
  onPick: (day: string) => void;
  picked: string | null;
}) {
  if (daily.length === 0) {
    return (
      <p className="grid h-[168px] place-items-center text-[12.5px] text-pf-muted">
        No builds yet.
      </p>
    );
  }

  const peak = Math.max(...daily.map((d) => d.pages), 1);

  return (
    <div className="mt-4">
      <div className="flex h-[150px] items-end gap-[3px]">
        {daily.map((day, i) => {
          const height = Math.max(2, (day.pages / peak) * 100);
          return (
            <motion.div
              key={day.date}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{
                delay: Math.min(i * 0.02, 0.4),
                type: "spring",
                stiffness: 260,
                damping: 26,
              }}
              onClick={() => onPick(day.date)}
              role="button"
              tabIndex={0}
              aria-label={`Show ${day.date} only`}
              title={`${day.date}: ${day.pages} page${day.pages === 1 ? "" : "s"}, ${day.runs} build${day.runs === 1 ? "" : "s"} — press to show this day only`}
              className={`min-w-[4px] flex-1 cursor-pointer rounded-t-[3px] bg-gradient-to-t transition-opacity hover:opacity-100 ${
                picked === null || picked === day.date
                  ? "from-pf-primary/45 to-pf-primary-hi"
                  : "from-pf-primary/20 to-pf-primary-hi/40 opacity-60"
              }`}
            />
          );
        })}
      </div>
      {/* One bar is one day, and printing the same date at both ends of an
          axis reads as a broken range rather than as a single day. */}
      <div className="mt-2 flex justify-between text-[10.5px] tabular-nums text-pf-faint">
        <span>{daily[0].date.slice(5)}</span>
        <span>peak {peak}</span>
        {daily.length > 1 && <span>{daily[daily.length - 1].date.slice(5)}</span>}
      </div>
    </div>
  );
}

/* ---- rating split -------------------------------------------------------- */

function RatingSplit({ reviews }: { reviews: AdminStats["reviews"] }) {
  const peak = Math.max(...reviews.histogram, 1);

  return (
    <div className="mt-4 grid gap-2.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = reviews.histogram[star - 1];
        const good = star >= 4;
        return (
          <div key={star} className="flex items-center gap-2.5">
            <span className="w-8 shrink-0 text-right text-[11.5px] tabular-nums text-pf-muted">
              {star}★
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-pf-pill bg-pf-bg-deep">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(count / peak) * 100}%` }}
                transition={{
                  delay: 0.08 * (5 - star),
                  type: "spring",
                  stiffness: 240,
                  damping: 28,
                }}
                className={`h-full rounded-pf-pill ${good ? "bg-pf-success" : "bg-pf-danger"}`}
              />
            </div>
            <span
              className={`w-6 shrink-0 text-[11.5px] font-semibold tabular-nums ${
                count === 0 ? "text-pf-faint" : good ? "text-pf-success" : "text-pf-danger"
              }`}
            >
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
