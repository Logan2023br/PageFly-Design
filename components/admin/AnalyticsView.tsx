"use client";

import { motion } from "framer-motion";
import { Fragment, useEffect, useState } from "react";
import type {
  AnalyticsResponse,
  AnalyticsView as View,
  CollectionSet,
  PageBlock,
  SharedBlock,
  Slice,
} from "@/app/api/admin/analytics/route";
import { EV } from "@/lib/analytics";
import { compareViews, type Change, type Comparison } from "@/lib/analytics/compare";
import type { IconName } from "@/lib/icons";
import { CountUp, Icon, Panel } from "../ui";
import { countryLabel } from "@/lib/countries";
import type { CountryCount } from "@/lib/db/types";
import { StatTile, TileGeo, TileGroup, TileRow, useTileGeo } from "./StatTile";
import { TileDetail } from "./TileDetail";
import { DayStrip } from "./DayStrip";

/* ==========================================================================
   Analytics.

   ONE COLOUR WHERE THERE IS ONE SERIES. The funnel, the CTA split, the error
   fields and the durations are all one measure across categories — a bar per
   row, all the same hue. Four hues there would be decoration that reads as
   meaning: a viewer who sees four colours looks for four groups.

   FOUR ONLY WHERE FOUR THINGS DIFFER IN KIND: the sign-in outcomes. Those are
   states, not a series — signed in, not registered, not a store domain, our
   fault — and they are stacked into one bar, so they have to be told apart at
   a glance. Those four were run through the palette validator against this
   app's own dark surface:

     #1f9c62  #4a90d9  #bd8320  #cf4a86
     lightness band · chroma floor · CVD separation · normal-vision floor ·
     contrast — all pass

   The first attempt used the brand purple and a blue next to each other and
   failed on two of those at once: ΔE 5.2 under deuteranopia and 13.9 even with
   full colour vision. A pair that close is a stacked bar nobody can read.

   AND EVERY SEGMENT IS LABELLED as well as coloured, so identity never rests
   on hue alone — and the table at the bottom is the same numbers for anyone
   the charts do not serve.

   ==========================================================================
   TILES, FOUR TO A ROW, and it turned out to be the better shape rather than
   only the requested one. A statistic here has exactly the three tiers a tile
   has: what is counted, the count, and what to read it against — "Sign-in
   tried · 6 · 43% of the step above". A panel of stacked rows was showing the
   same three things with more furniture around them.

   What a grid of boxes loses to a chart is length: which step is long and
   which is short, seen rather than divided. So a tile in a row that shares a
   scale carries a hairline along its bottom edge at the same ratio its
   footnote states. Not a second measure, and never on a tile that shares a
   scale with nothing.
   ========================================================================== */

/** Validated against #0a0616. See the note above before changing any of these. */
const RESULT_COLOR: Record<string, string> = {
  success: "#1f9c62",
  not_registered: "#4a90d9",
  invalid_format: "#bd8320",
  server_error: "#cf4a86",
};

const RANGES = [7, 30, 90] as const;

export function AnalyticsView() {
  /* ==========================================================================
     WHICH HALF OF THE SCREEN IS SHOWING.

     ABOVE THE FILTERS, NOT INSIDE THEM. The window, the day and the countries
     apply to both halves and are the same question on either — so they sit
     above the switch and survive crossing it. A reader who has narrowed to
     Germany and the 24th and presses Collection pages is still looking at
     Germany on the 24th, which is what makes the switch a view and not a
     second screen.

     AND IT CHANGES NOTHING ABOUT WHAT IS FETCHED. One response carries both;
     splitting the request would make the switch cost a round trip and would
     put the two halves on different windows the moment one of them polled.
     ========================================================================== */
  const [tab, setTab] = useState<"design" | "collections">("design");
  const [days, setDays] = useState<number>(30);
  /* The day being read, or null for the whole window. Kept beside `days` rather
     than replacing it: the strip of days is always drawn from the window, so
     picking a day must not throw away which window it was picked from — that
     would leave nowhere to press to get back. */
  const [day, setDay] = useState<string | null>(null);
  /* Bumped to ask again. A counter rather than a boolean: two refreshes in a
     row have to be two different values or the effect does not re-run. */
  const [tick, setTick] = useState(0);
  const [at, setAt] = useState<Date | null>(null);
  const [view, setView] = useState<View | null>(null);
  /* Off by default, and that is the point of a button. Comparing costs two more
     grouped queries per load on a screen that polls every thirty seconds, and
     most visits are somebody checking a number rather than asking whether it
     moved. */
  const [compare, setCompare] = useState(false);
  const [previous, setPrevious] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /* ==========================================================================
     WHERE THE NUMBERS COME FROM, AS A PLACE.

     TWO LISTS RATHER THAN ONE, because the two questions are different and
     neither can be built from the other. `only` is "how does this look in
     Vietnam"; `except` is "how does this look with our own country OUT" —
     which on a product whose team all sit in one place is the honest read of
     whether strangers are using it, and cannot be got by picking countries one
     at a time.

     The list of countries to pick FROM is separate again, and unfiltered: the
     server sends every country in the window regardless of what is selected,
     or picking one would leave a single chip and no way back.
     ========================================================================== */
  const [only, setOnly] = useState<string[]>([]);
  const [except, setExcept] = useState<string[]>([]);
  const [countries, setCountries] = useState<CountryCount[]>([]);

  useEffect(() => {
    let live = true;

    void (async () => {
      /* Inside the async body rather than in the effect's own turn: a
         setState on the effect's synchronous pass is a second render before
         the first has painted, and React says so. */
      setLoading(true);
      setError(null);
      try {
        /* Asked for afresh every time. The response says `no-store` too; this
           is the half that also defeats a fetch served from the browser's own
           memory cache on a back-navigation, where no request is made at all
           and no response header can be consulted. */
        /* NEGATED, because `getTimezoneOffset` returns minutes to ADD to
           local time to reach UTC — so UTC+7 reports -420. The server wants
           the reader's offset the way a person would say it. */
        const tz = -new Date().getTimezoneOffset();
        const res = await fetch(
          `/api/admin/analytics?days=${days}&tz=${tz}` +
            `${day ? `&day=${day}` : ""}${compare ? "&compare=1" : ""}` +
            `${only.length > 0 ? `&country=${only.join(",")}` : ""}` +
            `${except.length > 0 ? `&exclude=${except.join(",")}` : ""}`,
          { cache: "no-store" },
        );
        const body = (await res.json()) as AnalyticsResponse;
        if (!live) return;
        if (body.ok) {
          setView(body.view);
          setPrevious(body.previous ?? null);
          setCountries(body.countries);
          setAt(new Date());
        } else setError(body.error);
      } catch {
        if (live) setError("Could not load the numbers.");
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
    /* Joined rather than passed as arrays: a new array every render would
       re-fetch on every render, which on a screen that also polls is a request
       loop. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, day, tick, compare, only.join(), except.join()]);

  /* ==========================================================================
     ASKED AGAIN EVERY THIRTY SECONDS, AND ONLY WHILE THE TAB IS VISIBLE.

     An event reaches the database about a second after somebody presses the
     button; this screen was fetching once and then never again, so the only
     way to see a number move was to reload — which is what somebody testing
     their own funnel does twenty times in a row.

     Thirty seconds rather than five: this is somebody watching, not a live
     dashboard on a wall, and the query groups every event in a thirty-day
     window. Paused when the tab is hidden, because a background tab polling a
     grouped count all afternoon is work nobody is looking at.
     ========================================================================== */
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    };
    const timer = setInterval(again, 30_000);
    /* And immediately on coming back, so returning to the tab does not mean
       waiting out the rest of an interval that started while it was hidden. */
    document.addEventListener("visibilitychange", again);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", again);
    };
  }, []);

  return (
    /* ONE PROVIDER AROUND THE WHOLE SCREEN, so every tile — including any added
       later, anywhere in here — opens onto the same countries it counted. See
       the note on `TileGeo`: threading two more props through seven call sites
       is seven chances to miss one, and the miss is invisible. */
    <TileGeo only={only} except={except}>
    <div className="grid gap-4">
      {/* ONE ROW, TWO VIEWS, and the filters below belong to both. */}
      <div className="flex items-center gap-1 self-start rounded-pf-md border border-pf-border p-0.5">
        {(
          [
            ["design", "PageFly Design"],
            ["collections", "Collection pages"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`rounded-pf-sm px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
              tab === id ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters in one row above the charts, which is where somebody looks
          for them — and the only control here, because a date range is the
          only question this screen has more than one answer to. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-pf-md border border-pf-border p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDays(d);
                /* A day picked out of the last seven is not necessarily in the
                   last ninety's strip in the same place, and leaving it set
                   would show one day under a button that says ninety. */
                setDay(null);
              }}
              aria-pressed={days === d}
              className={`rounded-pf-sm px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                days === d ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>

        {/* Beside the range and not inside it: the range picks WHICH window,
            this picks whether there are two. Pressed, the label names what it
            is being compared against, so nobody has to work out that 30 days
            means the 30 before these. */}
        <button
          type="button"
          onClick={() => setCompare((c) => !c)}
          aria-pressed={compare}
          className={`flex items-center gap-1.5 rounded-pf-md border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
            compare
              ? "border-pf-primary bg-pf-primary/15 text-pf-primary-hi"
              : "border-pf-border text-pf-muted hover:text-pf-text"
          }`}
        >
          <Icon name="ArrowLeftRight" size={13} />
          {compare ? `vs ${days} ngày trước đó` : "Compare"}
        </button>

        <div className="flex items-center gap-3">
          {at && (
            <span className="text-[11.5px] tabular-nums text-pf-faint">
              Updated {at.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => setTick((t) => t + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-pf-md border border-pf-border px-2.5 py-1.5 text-[12px] font-semibold text-pf-muted transition-colors hover:text-pf-text disabled:opacity-50"
          >
            <motion.span
              animate={loading ? { rotate: 360 } : { rotate: 0 }}
              transition={loading ? { duration: 1, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
            >
              <Icon name="RefreshCw" size={13} />
            </motion.span>
            {loading ? "Checking…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ====================================================================
          WHERE, UNDER WHEN.

          Its own row rather than squeezed beside the range buttons: there can
          be a dozen countries and a row that wraps to three lines inside a
          control bar breaks the bar. It sits directly under the range because
          the two narrow the same numbers and are read together — "thirty days,
          Vietnam" is one sentence.

          A CHIP IS A THREE-WAY CONTROL, not a checkbox. Press once to see only
          that country, again to exclude it, again to clear — because "show me
          Vietnam" and "show me everything except Vietnam" are both things
          people want and a checkbox can only express the first. The state is
          written on the chip so nobody has to remember which press they are on.
          ==================================================================== */}
      {countries.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOnly([]);
              setExcept([]);
            }}
            className={`rounded-pf-pill border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
              only.length === 0 && except.length === 0
                ? "border-pf-primary bg-pf-primary/15 text-pf-primary-hi"
                : "border-pf-border text-pf-muted hover:text-pf-text"
            }`}
          >
            All countries
          </button>

          {countries.map((c) => {
            const key = c.country ?? "unknown";
            const picked = only.includes(key);
            const banned = except.includes(key);
            return (
              <button
                key={key}
                type="button"
                title={`${c.events} events · ${c.visitors} browsers`}
                onClick={() => {
                  /* only → except → clear. Each press moves the chip one step
                     and never leaves it in both lists, which would be a filter
                     that contradicts itself. */
                  if (picked) {
                    setOnly((l) => l.filter((x) => x !== key));
                    setExcept((l) => [...l, key]);
                  } else if (banned) {
                    setExcept((l) => l.filter((x) => x !== key));
                  } else {
                    setExcept((l) => l.filter((x) => x !== key));
                    setOnly((l) => [...l, key]);
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
                {countryLabel(c.country)}
                <span className="tabular-nums opacity-60">{c.visitors}</span>
              </button>
            );
          })}

          {(only.length > 0 || except.length > 0) && (
            <span className="ml-1 text-[11.5px] text-pf-faint">
              {only.length > 0
                ? `only ${only.map((c) => countryLabel(c === "unknown" ? null : c)).join(", ")}`
                : `everything except ${except
                    .map((c) => countryLabel(c === "unknown" ? null : c))
                    .join(", ")}`}
            </span>
          )}
        </div>
      )}

      {/* UNDER THE RANGE, ABOVE EVERYTHING ELSE. It belongs to the window the
          buttons chose, and everything below it is what it selects — so it sits
          between the two rather than off at the side. */}
      {view && (
        <Panel className="p-3.5">
          <DayStrip
            daily={view.daily}
            days={view.days}
            selected={view.day}
            onSelect={setDay}
          />
        </Panel>
      )}

      {error && (
        <Panel className="flex items-start gap-2 border-pf-danger/35 bg-pf-danger/10 p-4">
          <span className="mt-px text-pf-danger">
            <Icon name="CircleAlert" size={14} />
          </span>
          <p className="text-[12.5px] text-pf-danger">{error}</p>
        </Panel>
      )}

      {view && view.empty && tab === "design" && (
        <Panel className="p-8 text-center">
          <p className="text-[13px] text-pf-muted">
            {view.day
              ? `Nothing recorded on ${view.day}.`
              : `Nothing recorded in the last ${view.days} days.`}
          </p>
          <p className="mt-1 text-[11.5px] text-pf-faint">
            Events start arriving as soon as somebody opens the front page.
          </p>
        </Panel>
      )}

      {view && tab === "collections" && (
        <Collections sets={view.collections} days={view.days} day={view.day} />
      )}

      {view && !view.empty && tab === "design" && (
        <>
          {/* ABOVE THE NUMBERS, not below them. A reader who has pressed
              Compare is asking one question — what changed — and the answer
              belongs where the question was asked. Scrolling past nine blocks
              of tiles to reach a verdict is the same as not having one. */}
          {compare && previous && <CompareBlock now={view} before={previous} />}

          {/* The funnel first, because it is the only thing here that crosses
              screens — which is what a funnel is. Everything below answers a
              different question: given one screen, what happens on it. */}
          <Funnel view={view} />
          <SigninTiles view={view} />
          <RegisterTiles view={view} />
          <BuildTiles view={view} />

          <div className="mt-2 border-t border-pf-border pt-6">
            <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-pf-text">
              Screen by screen
            </h2>
            <p className="mt-0.5 text-[11.5px] text-pf-muted">
              Every event, filed under the screen it fires from. Nothing is
              counted in two blocks.
            </p>
          </div>

          {view.pages.map((page) => (
            <PageSection key={page.key} page={page} days={view.days} day={view.day} />
          ))}

          <div className="mt-2 border-t border-pf-border pt-6">
            <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-pf-text">
              Across the product
            </h2>
            <p className="mt-0.5 text-[11.5px] text-pf-muted">
              Elements that exist on more than one screen, counted per screen
              and in total.
            </p>
          </div>

          {view.shared.map((block) => (
            <SharedSection
              key={block.key}
              block={block}
              days={view.days}
              day={view.day}
            />
          ))}

          <RawTable view={view} />

          {/* Two reasons a step can exceed the one above it, and both are
              information rather than error — which is worth saying, because
              the first real reading showed sign-in at 117% of the CTA and
              looked for a minute like a counting bug. */}
          <p className="px-1 text-[11px] leading-relaxed text-pf-faint">
            Every figure is a press: pressing something five times counts five,
            and a number moves the moment somebody does it. A step can therefore
            exceed the one above it — one person exports four pages, and the
            sign-in page has its own address so anyone arriving by bookmark
            never passed the landing page. Each tile also carries the number of
            distinct people or stores underneath. Landing views include crawlers
            that do not announce themselves, so treat the top of the funnel as
            an upper bound.
          </p>
        </>
      )}
    </div>
    </TileGeo>
  );
}

/* ---- the funnel ---------------------------------------------------------- */

/** One icon per step, so a tile is recognisable before it is read. */
const STEP_ICON: Record<string, IconName> = {
  landing: "Eye",
  cta: "Sparkles",
  signin: "LogIn",
  submitted: "Keyboard",
  brief: "ClipboardList",
  started: "Rocket",
  completed: "CircleCheck",
  exported: "Download",
};

/**
 * The eight steps, as tiles against the first.
 *
 * NOT A TAPERED FUNNEL SHAPE. Those encode the number in a trapezoid's area,
 * which nobody can compare by eye, and the slope between two steps reads as a
 * rate when it is two numbers. Each step is a tile whose footnote states the
 * drop from the step above, and whose hairline is that step against the top of
 * the funnel — so the number is read and the shape is seen.
 */
function Funnel({ view }: { view: View }) {
  /* EVENTS, NOT PEOPLE, and every figure on this screen now works this way.
     A press adds one. The distinct count is still carried underneath, because
     "forty presses by two people" and "forty by forty" are different findings
     and the same number — but it is the note, not the headline.

     The consequence is stated plainly in the group note: a step CAN now
     exceed the one above it, because one person pressing Export five times is
     five. That is what counting presses means. */
  const top = view.funnel[0]?.events || 1;

  return (
    <TileGroup
      title="The funnel"
      note={`${view.day ? `Every press on ${view.day}` : `Every press over ${view.days} days`} — five presses count five. A step can exceed the one above it: somebody exporting four pages is four, and the sign-in page has its own address so arrivals there never passed the landing page.`}
    >
      {view.funnel.map((step, i) => {
        const prev = i === 0 ? null : view.funnel[i - 1].events;
        const ofPrev = prev && prev > 0 ? step.events / prev : null;
        /* Below half of the step above is where a gap stops being ordinary
           attrition and becomes a question — coloured rather than left for
           somebody to spot by reading eight footnotes. */
        const steep = ofPrev !== null && ofPrev < 0.5;

        return (
          <StatTile
            key={step.key}
            icon={STEP_ICON[step.key] ?? "ChartColumn"}
            label={step.label}
            value={step.events}
            footnote={[
              ofPrev === null ? step.note : `${Math.round(ofPrev * 100)}% of the step above`,
              /* The distinct count underneath, and named for what it counts:
                 browsers before sign-in, where no store exists yet, and stores
                 after it. `2 people` and `2 stores` answer different questions
                 and the label is the only thing that says which. */
              step.visitors > 0
                ? `${step.visitors.toLocaleString()} ${step.unit === "store" ? "stores" : "people"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            ratio={step.events / top}
            hint={step.where}
            event={step.event}
            days={view.days}
            day={view.day}
            tone={steep ? "danger" : "default"}
            delay={Math.min(i * 0.04, 0.3)}
          />
        );
      })}
    </TileGroup>
  );
}

/* ---- sign-in ------------------------------------------------------------- */

const RESULT_ICON: Record<string, IconName> = {
  success: "CircleCheck",
  not_registered: "UserPlus",
  invalid_format: "CircleAlert",
  server_error: "TriangleAlert",
};

/**
 * The four outcomes of a sign-in attempt.
 *
 * THE ONE PLACE FOUR HUES EARN THEIR KEEP on this screen, which is why the
 * proportion bar survives the move to tiles: these are four states of one
 * thing, and the question is how they divide — a shape no row of separate
 * boxes can show. The tiles carry the numbers, the bar carries the split, and
 * every segment is labelled underneath so identity never rests on colour.
 */
function SigninTiles({ view }: { view: View }) {
  const total = view.signin.reduce((a, b) => a + b.count, 0);
  if (total === 0) return null;

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-[13.5px] font-semibold text-pf-text">
          What happened at sign-in
        </h2>
        <p className="mt-0.5 text-[11.5px] text-pf-muted">
          {total.toLocaleString()} attempts, by outcome
        </p>
      </div>

      {/* A 2px gap between segments, so two adjacent fills never read as one
          longer one. */}
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {view.signin.map((r) => (
          <motion.div
            key={r.key}
            initial={{ width: 0 }}
            animate={{ width: `${(r.count / total) * 100}%` }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ backgroundColor: RESULT_COLOR[r.key] ?? "var(--color-pf-border-hi)" }}
            title={`${r.label}: ${r.count}`}
            className="first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>

      <TileRow>
        {view.signin.map((r, i) => (
          <SigninTile key={r.key} slice={r} total={total} delay={Math.min(i * 0.04, 0.2)} />
        ))}
      </TileRow>
    </section>
  );
}

/**
 * A sign-in tile, which is the one tile that paints its own hairline.
 *
 * `StatTile`'s bar is the app's primary purple, and here the bar has to be the
 * segment's own colour or the tiles and the split above them would disagree
 * about which is which.
 */
function SigninTile({
  slice,
  total,
  delay,
}: {
  slice: Slice;
  total: number;
  delay: number;
}) {
  const color = RESULT_COLOR[slice.key] ?? "var(--color-pf-border-hi)";

  return (
    <Panel className="relative overflow-hidden p-4">
      <div className="flex items-center gap-2 text-pf-muted">
        <span style={{ color }}>
          <Icon name={RESULT_ICON[slice.key] ?? "ChartColumn"} size={14} />
        </span>
        <span className="text-[12px] font-semibold">{slice.label}</span>
      </div>
      <p className="mt-2 font-display text-[30px] font-bold tabular-nums leading-none tracking-[-0.03em] text-pf-text">
        <CountUp to={slice.count} />
      </p>
      <p className="mt-1.5 text-[11.5px] text-pf-muted">
        {Math.round((slice.count / total) * 100)}% of attempts
      </p>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-pf-bg-deep">
        <motion.div
          className="h-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${(slice.count / total) * 100}%` }}
          transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </Panel>
  );
}

/* ---- CTA ----------------------------------------------------------------- */



/* ---- the cost of a second screen ----------------------------------------- */

/**
 * The four numbers that answer one question, so they belong in one row.
 *
 * Somebody told "this store is not registered" either goes and registers or
 * leaves. The gap between those counts is what asking people to register on a
 * separate screen costs — the evidence for or against merging the two forms,
 * which is why the fourth tile is the loss rather than another total.
 */
function RegisterTiles({ view }: { view: View }) {
  const refused = view.signin.find((r) => r.key === "not_registered")?.count ?? 0;
  if (refused === 0) return null;

  const wentOn = view.rows
    .filter((r) => r.name === "design_register_link_clicked")
    .reduce((a, b) => a + b.count, 0);
  const registered = view.registerResults.find((r) => r.key === "success")?.count ?? 0;
  const lost = Math.max(0, refused - wentOn);

  return (
    <TileGroup
      title="The cost of a second screen"
      note="Of everyone told they are not registered, how many went and did it"
    >
      <StatTile
        icon="CircleAlert"
        label="Turned away"
        value={refused}
        footnote="told they are not registered"
        ratio={1}
      />
      <StatTile
        icon="ArrowRight"
        label="Followed the link"
        value={wentOn}
        footnote={`${Math.round((wentOn / refused) * 100)}% carried on`}
        ratio={wentOn / refused}
        delay={0.04}
      />
      <StatTile
        icon="CircleCheck"
        label="Finished registering"
        value={registered}
        footnote={`${Math.round((registered / refused) * 100)}% of those turned away`}
        ratio={registered / refused}
        delay={0.08}
      />
      <StatTile
        icon="LogOut"
        label="Lost between screens"
        value={lost}
        footnote="never reached the register form"
        ratio={lost / refused}
        tone="danger"
        delay={0.12}
      />
    </TileGroup>
  );
}

/* ---- builds -------------------------------------------------------------- */

function BuildTiles({ view }: { view: View }) {
  const { started, completed, failed, cancelled } = view.builds;
  if (started + completed + failed + cancelled === 0) return null;
  const base = Math.max(started, completed, 1);

  return (
    <TileGroup
      title="Builds"
      note="Outcomes are the server's, so a merchant who closes the tab still counts"
    >
      <StatTile icon="Rocket" label="Started" value={started} footnote="pressed the button" ratio={started / base} />
      <StatTile
        icon="CircleCheck"
        label="Finished"
        value={completed}
        footnote={started > 0 ? `${Math.round((completed / started) * 100)}% of those started` : "none started"}
        ratio={completed / base}
        delay={0.04}
      />
      <StatTile
        icon="CircleAlert"
        label="Failed"
        value={failed}
        footnote="the build itself did not finish"
        ratio={failed / base}
        tone={failed > 0 ? "danger" : "default"}
        delay={0.08}
      />
      <StatTile
        icon="ArrowLeft"
        label="Cancelled"
        value={cancelled}
        footnote="the merchant went back to the brief"
        ratio={cancelled / base}
        delay={0.12}
      />

      {view.durations
        .filter((d) => d.count > 0)
        .map((d, i) => (
          <StatTile
            key={d.label}
            icon="Clock"
            label={`Took ${d.label}`}
            value={d.count}
            footnote={completed > 0 ? `${Math.round((d.count / completed) * 100)}% of finished builds` : ""}
            ratio={completed > 0 ? d.count / completed : 0}
            delay={Math.min(0.16 + i * 0.04, 0.35)}
          />
        ))}
    </TileGroup>
  );
}

/* ---- registration and the gallery ---------------------------------------- */


/* ---- one screen ---------------------------------------------------------- */

/**
 * Every metric on one screen, four tiles to a row, with its splits under it.
 *
 * The path is printed beside the title because "Brief", "While it builds" and
 * "The finished deck" are all `/design` — three moments on one address, and a
 * heading alone would leave somebody wondering which page is meant.
 */
function PageSection({
  page,
  days,
  day,
}: {
  page: PageBlock;
  days: number;
  day: string | null;
}) {
  const top = Math.max(...page.metrics.map((m) => m.count), 1);

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="text-[13.5px] font-semibold text-pf-text">{page.title}</h3>
        <code className="rounded-pf-sm bg-pf-bg-deep px-1.5 py-0.5 font-mono text-[11px] text-pf-muted">
          {page.path}
        </code>
        <p className="w-full text-[11.5px] leading-snug text-pf-muted">{page.note}</p>
      </div>

      {/* A CONTROL SPLIT BECOMES TILES, an outcome split stays a list.
 
          Two `Design now` buttons on one page are two buttons, and "which one
          gets pressed" is the question — one summed figure cannot answer it,
          and a bar list under a tile reads as detail rather than as the point.
          A result split is the opposite: one button fired all of it, so a tile
          each would claim four buttons where there is one. */}
      <TileRow>
        {page.metrics.flatMap((m, i) => [
          <StatTile
            key={m.key}
            icon={METRIC_ICON[m.key] ?? "ChartColumn"}
            label={m.label}
            value={m.count}
            footnote={[
              m.note,
              /* The people count, whenever it differs from the presses. Read
                 alone by somebody who has just pressed a button five times, a
                 `5` and a `1` are the same shape of surprise in opposite
                 directions. */
              /* The distinct count, whenever it differs from the presses. A
                 tile showing 5 presses by 1 person and a tile showing 5 by 5
                 are different findings and the same number. */
              m.people > 0 && m.people !== m.count
                ? `${m.people.toLocaleString()} ${m.people === 1 ? "person" : "people"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            ratio={m.count / top}
            hint={m.where}
            event={m.event}
            days={days}
            day={day}
            delay={Math.min(i * 0.03, 0.2)}
          />,
          ...(m.splitKind === "control" && m.split
            ? m.split.map((sl, j) => (
                <StatTile
                  key={`${m.key}-${sl.key}`}
                  icon={METRIC_ICON[m.key] ?? "ChartColumn"}
                  label={sl.label}
                  value={sl.count}
                  footnote={`${Math.round((sl.count / Math.max(m.count, 1)) * 100)}% of ${m.label.toLowerCase()}`}
                  ratio={sl.count / top}
                  hint={`${sl.label} — one of the controls counted by ${m.label.toLowerCase()}\n${m.where.split("\n")[1] ?? ""}`}
                  delay={Math.min(i * 0.03 + (j + 1) * 0.03, 0.3)}
                />
              ))
            : []),
        ])}
      </TileRow>

      {page.metrics
        .filter((m) => m.split && m.split.length > 0 && m.splitKind !== "control")
        .map((m) => (
          <Split key={`${m.key}-split`} label={m.label} rows={m.split!} />
        ))}
    </section>
  );
}

/** One metric's breakdown, as a row of bars under the tiles it belongs to. */
function Split({ label, rows }: { label: string; rows: Slice[] }) {
  const peak = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="rounded-pf-md border border-pf-border bg-pf-card/40 p-3.5">
      <p className="text-[11.5px] font-semibold text-pf-body">{label}, split</p>
      <div className="mt-2.5 grid gap-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5">
            <span className="w-40 shrink-0 truncate text-[11.5px] text-pf-muted">{r.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-pf-bg-deep">
              <motion.div
                className="h-full rounded-full bg-pf-primary"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max((r.count / peak) * 100, 1.5)}%` }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-pf-text">
              {r.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const METRIC_ICON: Record<string, IconName> = {
  viewed: "Eye",
  cta: "Sparkles",
  gallery: "Images",
  submitted: "Keyboard",
  register_link: "ArrowRight",
  no_register: "UserPlus",
  fields: "CircleAlert",
  shopify: "ArrowUpRight",
  done: "CircleCheck",
  return: "LogIn",
  mode: "ListChecks",
  example: "FileText",
  started: "Rocket",
  completed: "CircleCheck",
  failed: "CircleAlert",
  cancelled: "ArrowLeft",
  exported: "Download",
  png: "Images",
  preview: "Eye",
  regenerate: "RefreshCw",
  edit: "Pencil",
};

/* ---- one element, across screens ----------------------------------------- */

/**
 * THE TOTAL IS NOT THE SUM OF THE COLUMNS, and the note says so on the screen.
 *
 * The same person can press the install button on the landing page and again
 * after an export. Per-screen counts answer "which placement works"; the total
 * answers "how many did it at all". Adding the columns would produce a third
 * number that is neither.
 */
/* ==========================================================================
   THE ONE BLOCK ON THIS SCREEN WHOSE TILES DID NOT OPEN.

   Every other tile here presses into the list it is a summary of, and these
   did not — not by decision, but because the block never carried the event
   name the drill-down is keyed on. The number that gets asked about most on
   this screen is "fourteen presses of Install PageFly, by whom, and when", and
   the answer existed behind a route nothing on this block called.

   Each tile opens into its OWN rows: the total into every store that pressed
   it anywhere, a placement into the stores that pressed it there. A tile whose
   list does not add up to the number printed on it is worse than a tile that
   does not open.
   ========================================================================== */
function SharedSection({
  block,
  days,
  day,
}: {
  block: SharedBlock;
  days: number;
  day: string | null;
}) {
  if (block.total === 0) return null;
  const peak = Math.max(...block.bySurface.map((s) => s.count), 1);

  return (
    <section className="grid gap-3">
      <div>
        <h3 className="text-[13.5px] font-semibold text-pf-text">{block.title}</h3>
        <p className="mt-0.5 text-[11.5px] leading-snug text-pf-muted">{block.note}</p>
      </div>

      <TileRow>
        <StatTile
          icon="Layers"
          label="All screens"
          value={block.total}
          hint={block.where}
          footnote={`${block.totalPeople.toLocaleString()} ${block.totalPeople === 1 ? "person" : "people"}`}
          event={block.event}
          days={days}
          day={day}
        />
        {block.bySurface.map((s, i) => (
          <StatTile
            key={s.key}
            icon="ArrowUpRight"
            label={s.label}
            value={s.count}
            footnote={`${Math.round((s.count / block.total) * 100)}% of all presses`}
            ratio={s.count / peak}
            hint={`${s.label}\n${block.where.split("\n")[1] ?? ""}`}
            delay={Math.min((i + 1) * 0.04, 0.24)}
            event={block.event}
            part={s.key}
            days={days}
            day={day}
          />
        ))}
      </TileRow>

      {/* And by CONTROL as well as by screen, where more than one button does
          the same thing. Two of the three collection exports hand over the
          same bytes from different places, and which one people reach for is a
          different question from which screen they were on. */}
      {block.byControl && block.byControl.length > 1 && (
        <Split label={`${block.title}, by control`} rows={block.byControl} />
      )}
    </section>
  );
}

/* ---- everything, as a table ---------------------------------------------- */

/**
 * The same numbers for anyone the charts do not serve.
 *
 * Also the only view that shows parameters nothing above has a panel for — a
 * new one added to an event appears here the day it ships, rather than being
 * invisible until somebody writes a chart for it.
 */
function RawTable({ view }: { view: View }) {
  const [open, setOpen] = useState(false);

  return (
    <Panel className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-[13px] font-semibold text-pf-text">
          Every event, counted
        </span>
        <span className="flex items-center gap-2 text-[11.5px] text-pf-muted">
          {view.rows.length} rows
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} />
        </span>
      </button>

      {open && (
        <div className="max-h-[420px] overflow-auto border-t border-pf-border">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-pf-bg-deep">
              <tr className="text-[10.5px] uppercase tracking-[0.08em] text-pf-faint">
                <th className="px-4 py-2 font-semibold">Event</th>
                <th className="px-4 py-2 font-semibold">Parameters</th>
                <th className="px-4 py-2 text-right font-semibold">Events</th>
                <th className="px-4 py-2 text-right font-semibold">People</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-t border-pf-border/60">
                  <td className="px-4 py-2 font-mono text-[11px] text-pf-body">{r.name}</td>
                  <td className="px-4 py-2 text-[11px] text-pf-muted">
                    {Object.keys(r.props).length === 0
                      ? "—"
                      : Object.entries(r.props)
                          .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("+") : String(v)}`)
                          .join("  ")}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-pf-text">{r.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-pf-muted">{r.visitors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ==========================================================================
   What changed against the window before.

   THREE LISTS, AND THE THIRD IS THE HONEST ONE. Improving, declining, and
   "moved but the numbers are too small to read anything into". Most products
   would drop the third; this one cannot. A month here puts the narrow end of
   the funnel in single figures, and a reader who sees only two lists will
   assume everything absent from them held steady. It did not — it moved, over
   numbers where movement means nothing, and saying so is the difference
   between a summary and a horoscope.

   COUNTS AND RATES ARE SHOWN DIFFERENTLY because they mean differently. A
   count gets its two figures and a percentage; a rate gets its two figures and
   a POINT difference, because "conversion rose 20%" is ambiguous — from 25% to
   30%, or from 25% to 45%? Points are not.
   ========================================================================== */

function pct(n: number): string {
  const s = Math.round(Math.abs(n) * 100);
  return `${n >= 0 ? "+" : "−"}${s}%`;
}

function ChangeRow({ c }: { c: Change }) {
  const good = c.verdict === "good";
  const thin = c.verdict === "thin";
  const tone = thin ? "text-pf-faint" : good ? "text-pf-success" : "text-pf-danger";

  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-pf-border/60 py-2 last:border-0">
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] text-pf-body">{c.label}</span>
        <span className="block text-[10.5px] uppercase tracking-[0.08em] text-pf-faint">
          {c.group}
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
        <span className="text-[11.5px] text-pf-faint">
          {c.before}
          {c.unit === "rate" ? "%" : ""} →{" "}
        </span>
        <span className="text-[14px] font-semibold text-pf-text">
          {c.now}
          {c.unit === "rate" ? "%" : ""}
        </span>
        <span className={`w-[52px] text-right text-[11.5px] font-semibold ${tone}`}>
          {c.unit === "rate"
            ? `${c.delta >= 0 ? "+" : "−"}${Math.abs(c.delta)}đ`
            : c.pct === null
              ? `+${c.delta}`
              : pct(c.pct)}
        </span>
      </span>
    </li>
  );
}

function ChangeList({
  title,
  note,
  icon,
  items,
  tone,
}: {
  title: string;
  note: string;
  icon: IconName;
  items: Change[];
  tone: string;
}) {
  if (items.length === 0) return null;
  return (
    <Panel className="p-4">
      <div className={`flex items-center gap-2 ${tone}`}>
        <Icon name={icon} size={14} />
        <span className="text-[12px] font-semibold">{title}</span>
        <span className="ml-auto text-[11.5px] tabular-nums text-pf-faint">{items.length}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-pf-faint">{note}</p>
      {/* Eight is what fits before a list stops being a summary. The rest are
          still on the screen below, in the block each came from. */}
      <ul className="mt-2">
        {items.slice(0, 8).map((c) => (
          <ChangeRow key={`${c.group}:${c.key}`} c={c} />
        ))}
      </ul>
      {items.length > 8 && (
        <p className="mt-2 text-[11px] text-pf-faint">
          và {items.length - 8} chỉ số nữa
        </p>
      )}
    </Panel>
  );
}

function CompareBlock({ now, before }: { now: View; before: View }) {
  const c: Comparison = compareViews(now, before);

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-[13.5px] font-semibold text-pf-text">
          So với {c.days} ngày trước đó
        </h2>
        <p className="mt-0.5 text-[11.5px] leading-snug text-pf-muted">
          {c.headline} Hai kỳ cùng độ dài, kỳ trước kết thúc đúng lúc kỳ này bắt đầu.
          {c.flat.length > 0 && ` ${c.flat.length} chỉ số không đổi.`}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChangeList
          title="Đang tốt"
          note="Đi đúng hướng, trên số liệu đủ lớn để tin."
          icon="TrendingUp"
          tone="text-pf-success"
          items={c.good}
        />
        <ChangeList
          title="Cần cải thiện"
          note="Đi sai hướng, trên số liệu đủ lớn để tin."
          icon="TrendingDown"
          tone="text-pf-danger"
          items={c.bad}
        />
        <ChangeList
          title="Chưa đủ dữ liệu"
          note="Có dịch chuyển, nhưng số quá nhỏ để kết luận — giữ lại để không bị hiểu nhầm là đứng yên."
          icon="Minus"
          tone="text-pf-faint"
          items={c.thin}
        />
      </div>
    </section>
  );
}

/* ==========================================================================
   THE COLLECTION PAGES, AS THEIR OWN SCREEN.

   WHY A TAB AND NOT A SECTION. Everything above is filed by screen, and every
   figure below fires from ONE screen — the landing page. Appended there, the
   showcase would be a tenth block a reader scrolls past nine others to reach,
   under a country filter and a day strip that belong to all ten. So the
   filters stay where they are, above both tabs, and only what they filter
   changes. A reader who picks Germany and the 24th keeps both when they cross
   over.

   THE SET IS THE UNIT AND THE PAGE TYPE IS THE UNIT UNDER IT. Three stores
   each have a page called Home; the whole argument the showcase makes is that
   those three Homes are unalike, so a figure that adds them up is a figure
   about nothing.

   FIVE TILES, AND THEY ARE NOT FIVE VERSIONS OF ONE NUMBER:

     Took all 7      a decision — somebody planning what to do with them
     Read to the end the only one that is not a press, and the denominator
                     the other four should be read against
     Pages opened    interest, one card at a time
     Pages taken     the same decision as the first, one page at a time
     Average read    how long a page held somebody, which no count can say

   THEY SHARE A HAIRLINE SCALE WITH EACH OTHER AND NOT WITH THE NEXT SET, so
   the bars compare the five measures of one store rather than ranking the
   three stores — which the numbers themselves already do, in a column.
   ========================================================================== */
function Collections({
  sets,
  days,
  day,
}: {
  sets: CollectionSet[];
  days: number;
  day: string | null;
}) {
  const nothing = sets.every(
    (s) => s.setExports + s.reachedEnd + s.opens + s.pageExports + s.reads === 0,
  );

  return (
    <>
      <div className="mt-2 border-t border-pf-border pt-6">
        <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-pf-text">
          Collection pages
        </h2>
        <p className="mt-0.5 text-[11.5px] text-pf-muted">
          The finished stores on the front door, counted one at a time. Every
          figure here is under the same window and the same countries as the
          other tab.
        </p>
      </div>

      {nothing && (
        <Panel className="p-8 text-center">
          <p className="text-[13px] text-pf-muted">
            {day
              ? `Nobody touched the collections on ${day}.`
              : `Nobody touched the collections in the last ${days} days.`}
          </p>
          <p className="mt-1 text-[11.5px] text-pf-faint">
            The sets are listed below with their figures at zero, which is not
            the same as them being missing.
          </p>
        </Panel>
      )}

      {sets.map((set) => (
        <CollectionBlock key={set.id} set={set} days={days} day={day} />
      ))}

      <p className="px-1 text-[11px] leading-relaxed text-pf-faint">
        <strong className="font-semibold text-pf-muted">Read to the end</strong>{" "}
        counts once per visit, not once per crossing — scrolling back up and
        down again is one read.{" "}
        <strong className="font-semibold text-pf-muted">Average read</strong> is
        over the openings that reported a duration, and a page closed inside a
        second reports none: the reading count beside it says how many did. A
        tab left open is capped at an hour so one abandoned window cannot carry
        an average.
      </p>
    </>
  );
}

/**
 * How long, as a reader would say it.
 *
 * `short` for a column, where the row already says what is being measured and
 * the words would only repeat the heading seven times.
 */
function readLength(seconds: number | null, short = false): string {
  if (seconds === null) return short ? "—" : "no readings yet";
  const tail = short ? "" : " on a page";
  if (seconds < 60) return `${Math.round(seconds)}s${tail}`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(Math.round(seconds - m * 60)).padStart(2, "0")}s${tail}`;
}

function CollectionBlock({
  set,
  days,
  day,
}: {
  set: CollectionSet;
  days: number;
  day: string | null;
}) {
  /* The five tiles share a scale with each other, so the hairlines compare the
     measures of THIS set. `1` as the floor keeps a set with nothing recorded
     from dividing by zero. */
  const top = Math.max(set.setExports, set.reachedEnd, set.opens, set.pageExports, 1);

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="text-[13.5px] font-semibold text-pf-text">{set.name}</h3>
        <code className="rounded-pf-sm bg-pf-bg-deep px-1.5 py-0.5 font-mono text-[11px] text-pf-muted">
          {set.id}
        </code>
        <span className="text-[11.5px] text-pf-muted">{set.size} pages</span>
        <p className="w-full text-[11.5px] leading-snug text-pf-muted">{set.blurb}</p>
      </div>

      {/* FIVE ACROSS, NOT THE SHARED FOUR. `TileRow` is four to a row because
          that is what the screens above have, and five tiles in it left
          Average read alone on a second row under three empty columns — which
          reads as a tile that failed to load rather than as the fifth measure.
          None of the five can go: they are the five things asked of a set, and
          the labels here are short enough to hold a narrower column. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          icon="Download"
          label={`Took all ${set.size}`}
          value={set.setExports}
          footnote={
            set.setExportVisitors > 0 && set.setExportVisitors !== set.setExports
              ? `at least ${set.setExportVisitors.toLocaleString()} ${
                  set.setExportVisitors === 1 ? "person" : "people"
                }`
              : "the whole set as one file"
          }
          ratio={set.setExports / top}
          hint={`Export all ${set.size} pages, on the ${set.name} row of the showcase\n${EV.showcaseSetDownloaded}`}
          event={EV.showcaseSetDownloaded}
          part={set.id}
          days={days}
          day={day}
        />
        <StatTile
          icon="Eye"
          label="Read to the end"
          value={set.reachedEnd}
          footnote={
            set.reachedEnd > 0
              ? `${Math.round((set.setExports / set.reachedEnd) * 100)}% of them took the set`
              : "nobody has reached the last card"
          }
          ratio={set.reachedEnd / top}
          hint={`The last card of the ${set.name} row came into view — once per visit\n${EV.showcaseSetScrolled}`}
          event={EV.showcaseSetScrolled}
          part={set.id}
          days={days}
          day={day}
        />
        <StatTile
          icon="Maximize"
          label="Pages opened"
          value={set.opens}
          footnote="cards opened into the viewer"
          ratio={set.opens / top}
          hint={`Opening one of the ${set.name} cards full-screen\n${EV.galleryOpened}`}
          event={EV.galleryOpened}
          slice={set.id}
          days={days}
          day={day}
        />
        <StatTile
          icon="Download"
          label="Pages taken"
          value={set.pageExports}
          footnote={
            set.opens > 0
              ? `${Math.round((set.pageExports / set.opens) * 100)}% of the pages opened`
              : "single pages taken from the viewer"
          }
          ratio={set.pageExports / top}
          hint={`The .pagefly behind one ${set.name} page, taken from the viewer\n${EV.showcaseFileDownloaded}`}
          event={EV.showcaseFileDownloaded}
          slice={set.id}
          days={days}
          day={day}
        />
        <StatTile
          icon="Clock"
          label="Average read"
          value={Math.round(set.seconds ?? 0)}
          footnote={
            set.reads > 0
              ? `seconds · over ${set.reads.toLocaleString()} ${set.reads === 1 ? "reading" : "readings"}`
              : "seconds · nothing measured yet"
          }
          hint={`How long a ${set.name} page stayed open, averaged\n${EV.showcasePageViewed}`}
          event={EV.showcasePageViewed}
          slice={set.id}
          days={days}
          day={day}
        />
      </div>

      <PageTypeTable set={set} days={days} day={day} />
    </section>
  );
}

/* ==========================================================================
   THE PAGE TYPES OF ONE SET, AS ROWS RATHER THAN AS TILES.

   SEVEN PAGES TIMES THREE NUMBERS IS TWENTY-ONE TILES PER SET, sixty-three on
   the screen, and the comparison somebody wants is down a column — is Home
   opened more than Contact — which a grid of boxes is the wrong shape for. A
   table puts the seven in one column and the reader's eye does the rest.

   A ROW IS THE BUTTON. The question under every one of these numbers is the
   same as under a tile — who, how long, from where — so the row opens the same
   panel a tile does, narrowed to this page type AND this set. That second
   narrowing is the whole reason `slice` exists: all three sets have a Home.
   ========================================================================== */
function PageTypeTable({
  set,
  days,
  day,
}: {
  set: CollectionSet;
  days: number;
  day: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  /* Rendered outside a `StatTile`, so the context has to be read by hand —
     see `useTileGeo`. */
  const geo = useTileGeo();
  const peak = Math.max(...set.pages.map((p) => p.opens), 1);

  /* ONE SET OF WIDTHS, USED BY THE HEADING AND BY EVERY ROW. Written as a
     `<table>` first, which put the headings in real table cells and the values
     in a flex row inside one `colSpan` cell — two different layout algorithms
     sizing what has to be one column. The headings would have sat over nothing
     in particular, and only at some widths. `shrink-0` because a flex child
     with a width is still allowed to shrink below it. */
  const COLS = ["w-24 shrink-0", "w-24 shrink-0", "w-32 shrink-0"] as const;

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center border-b border-pf-border px-4 py-2.5 text-[11px] text-pf-faint">
        <span className="flex-1">Page</span>
        <span className={`${COLS[0]} text-right`}>Opened</span>
        <span className={`${COLS[1]} text-right`}>Taken</span>
        <span className={`${COLS[2]} text-right`}>Average read</span>
        <span className="w-8 shrink-0" />
      </div>

      {set.pages.map((page) => {
        const showing = open === page.slug;
        return (
          <Fragment key={page.slug}>
            <button
              type="button"
              onClick={() => setOpen(showing ? null : page.slug)}
              aria-expanded={showing}
              className={`flex w-full cursor-pointer items-center border-t border-pf-border/60 px-4 text-left transition-colors hover:bg-pf-bg-deep ${
                showing ? "bg-pf-bg-deep" : ""
              }`}
            >
              <span className="relative min-w-0 flex-1 py-2.5">
                <span className="block truncate text-[12.5px] font-medium text-pf-text">
                  {page.label}
                </span>
                {/* The hairline a tile carries, on a row: opens against the
                    most-opened page of THIS set, so the shape of the set is
                    seen as well as read. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0.5 block h-px bg-pf-primary/45"
                  style={{ width: `${(page.opens / peak) * 100}%` }}
                />
              </span>
              <span className={`${COLS[0]} py-2.5 text-right text-[12px] tabular-nums text-pf-body`}>
                {page.opens.toLocaleString()}
              </span>
              <span className={`${COLS[1]} py-2.5 text-right text-[12px] tabular-nums text-pf-body`}>
                {page.exports.toLocaleString()}
              </span>
              <span className={`${COLS[2]} py-2.5 text-right text-[12px] tabular-nums`}>
                {page.seconds === null ? (
                  <span className="text-pf-faint">—</span>
                ) : (
                  <span className="text-pf-body">{readLength(page.seconds, true)}</span>
                )}
                {page.reads > 0 && (
                  <span className="block text-[10.5px] text-pf-faint">
                    {page.reads.toLocaleString()} {page.reads === 1 ? "reading" : "readings"}
                  </span>
                )}
              </span>
              {/* Rotated rather than swapped for a second icon: the arrow
                  turning is the same object moving, which is what an expander
                  is. */}
              <span
                className={`w-8 shrink-0 py-2.5 text-right text-pf-faint transition-transform duration-150 ${
                  showing ? "rotate-180" : ""
                }`}
              >
                <Icon name="ChevronDown" size={13} />
              </span>
            </button>

            {showing && (
              <div className="border-t border-pf-border/60">
                <TileDetail
                  event={EV.showcasePageViewed}
                  part={page.slug}
                  slice={set.id}
                  days={days}
                  day={day}
                  only={geo.only}
                  except={geo.except}
                />
              </div>
            )}
          </Fragment>
        );
      })}
    </Panel>
  );
}
