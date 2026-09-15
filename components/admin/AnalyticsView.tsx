"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { AnalyticsResponse, AnalyticsView as View, Slice } from "@/app/api/admin/analytics/route";
import type { IconName } from "@/lib/icons";
import { CountUp, Icon, Panel } from "../ui";
import { StatTile, TileGroup, TileRow } from "./StatTile";

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
  const [days, setDays] = useState<number>(30);
  /* Bumped to ask again. A counter rather than a boolean: two refreshes in a
     row have to be two different values or the effect does not re-run. */
  const [tick, setTick] = useState(0);
  const [at, setAt] = useState<Date | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        const res = await fetch(`/api/admin/analytics?days=${days}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as AnalyticsResponse;
        if (!live) return;
        if (body.ok) {
          setView(body.view);
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
  }, [days, tick]);

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
    <div className="grid gap-4">
      {/* Filters in one row above the charts, which is where somebody looks
          for them — and the only control here, because a date range is the
          only question this screen has more than one answer to. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-pf-md border border-pf-border p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`rounded-pf-sm px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                days === d ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
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

      {error && (
        <Panel className="flex items-start gap-2 border-pf-danger/35 bg-pf-danger/10 p-4">
          <span className="mt-px text-pf-danger">
            <Icon name="CircleAlert" size={14} />
          </span>
          <p className="text-[12.5px] text-pf-danger">{error}</p>
        </Panel>
      )}

      {view && view.empty && (
        <Panel className="p-8 text-center">
          <p className="text-[13px] text-pf-muted">
            Nothing recorded in the last {view.days} days.
          </p>
          <p className="mt-1 text-[11.5px] text-pf-faint">
            Events start arriving as soon as somebody opens the front page.
          </p>
        </Panel>
      )}

      {view && !view.empty && (
        <>
          <Funnel view={view} />
          <SigninTiles view={view} />
          <CtaTiles view={view} />
          <RegisterTiles view={view} />
          <BuildTiles view={view} />
          <FieldTiles view={view} />

          <RawTable view={view} />

          {/* WRITTEN AFTER THE FIRST REAL READING, which showed sign-in at
              117% of the CTA above it and briefly looked like a counting bug.
              It is not: /design/login has its own address, and somebody with a
              bookmark never passes the landing page. A funnel with more than
              one entrance can exceed a step, and saying so is the difference
              between a reader trusting the screen and debugging it. */}
          <p className="px-1 text-[11px] leading-relaxed text-pf-faint">
            Counted in distinct people, not clicks. A step can exceed the one
            above it — the sign-in page has its own address, so anyone arriving
            by bookmark or a direct link never passes the landing page. Landing
            views also include crawlers that do not announce themselves, so
            treat the top of the funnel as an upper bound.
          </p>
        </>
      )}
    </div>
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
  const top = view.funnel[0]?.visitors || 1;

  return (
    <TileGroup
      title="The funnel"
      note={`Over ${view.days} days. Counted once per browser until sign-in and once per store after it — pressing a button five times counts once either way`}
    >
      {view.funnel.map((step, i) => {
        const prev = i === 0 ? null : view.funnel[i - 1].visitors;
        const ofPrev = prev && prev > 0 ? step.visitors / prev : null;
        /* Below half of the step above is where a gap stops being ordinary
           attrition and becomes a question — coloured rather than left for
           somebody to spot by reading eight footnotes. */
        const steep = ofPrev !== null && ofPrev < 0.5;

        return (
          <StatTile
            key={step.key}
            icon={STEP_ICON[step.key] ?? "ChartColumn"}
            label={step.label}
            value={step.visitors}
            footnote={[
              ofPrev === null ? step.note : `${Math.round(ofPrev * 100)}% of the step above`,
              /* THE EVENT COUNT, whenever it differs from the people count.
                 The figure is distinct people — one person pressing Export
                 five times is one person who exported — and that is the only
                 way a step cannot outrun the step above it. But read alone, by
                 somebody who has just pressed a button five times, `1` looks
                 like a bug rather than a convention. The group heading says
                 "distinct people" and that was not enough: the tile has to say
                 it where the number is. */
              step.events > step.visitors
                ? `${step.events.toLocaleString()} times in total`
                : null,
              /* WHICH UNIT THIS STEP IS IN, because it changes halfway down and
                 a reader who does not know that reads the drop at `Brief seen`
                 as people leaving. Before sign-in a store does not exist, so
                 the only unit available is the browser; after it, the question
                 is about stores. */
              step.unit === "store" ? "stores" : "browsers",
            ]
              .filter(Boolean)
              .join(" · ")}
            ratio={step.visitors / top}
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

const CTA_ICON: Record<string, IconName> = {
  hero: "Sparkles",
  closing: "ChevronDown",
  header_signin: "LogIn",
  header_store: "Building2",
};

function CtaTiles({ view }: { view: View }) {
  if (view.cta.length === 0) return null;
  const peak = Math.max(...view.cta.map((c) => c.count), 1);

  return (
    <TileGroup
      title="Which CTA gets pressed"
      note="Hero and closing are Design now; the header pair belong to people who already have an account"
    >
      {view.cta.map((c, i) => (
        <StatTile
          key={c.key}
          icon={CTA_ICON[c.key] ?? "ArrowUpRight"}
          label={c.label}
          value={c.count}
          footnote={`${c.visitors.toLocaleString()} ${c.visitors === 1 ? "person" : "people"}`}
          ratio={c.count / peak}
          delay={Math.min(i * 0.04, 0.2)}
        />
      ))}
    </TileGroup>
  );
}

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

function FieldTiles({ view }: { view: View }) {
  const fields = view.registerFields;
  const gallery = view.gallery;
  if (fields.length === 0 && gallery.length === 0) return null;

  const fieldPeak = Math.max(...fields.map((f) => f.count), 1);
  const galleryPeak = Math.max(...gallery.map((g) => g.count), 1);

  return (
    <>
      {fields.length > 0 && (
        <TileGroup
          title="What stops people registering"
          note="Every field a refused submission named, so a form failing on three boxes counts three"
        >
          {fields.map((f, i) => (
            <StatTile
              key={f.key}
              icon="CircleAlert"
              label={f.label}
              value={f.count}
              footnote="refusals named this box"
              ratio={f.count / fieldPeak}
              tone="danger"
              delay={Math.min(i * 0.04, 0.2)}
            />
          ))}
        </TileGroup>
      )}

      {gallery.length > 0 && (
        <TileGroup
          title="Gallery, by page type"
          note="Which templates a visitor opens before deciding"
        >
          {gallery.slice(0, 8).map((g, i) => (
            <StatTile
              key={g.key}
              icon="Images"
              label={g.label}
              value={g.count}
              footnote={`${g.visitors.toLocaleString()} ${g.visitors === 1 ? "person" : "people"}`}
              ratio={g.count / galleryPeak}
              delay={Math.min(i * 0.04, 0.3)}
            />
          ))}
        </TileGroup>
      )}
    </>
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
