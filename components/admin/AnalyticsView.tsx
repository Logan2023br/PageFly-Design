"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { AnalyticsResponse, AnalyticsView as View, Slice } from "@/app/api/admin/analytics/route";
import { Icon, Panel } from "../ui";

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
        const res = await fetch(`/api/admin/analytics?days=${days}`);
        const body = (await res.json()) as AnalyticsResponse;
        if (!live) return;
        if (body.ok) setView(body.view);
        else setError(body.error);
      } catch {
        if (live) setError("Could not load the numbers.");
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [days]);

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
        {loading && <span className="text-[12px] text-pf-faint">Loading…</span>}
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

          <div className="grid gap-4 lg:grid-cols-2">
            <SigninResults view={view} />
            <CtaSplit view={view} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RegisterCost view={view} />
            <BuildOutcomes view={view} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bars
              title="What stops people registering"
              note="Every field a refused submission named, so a form failing on three boxes counts three"
              rows={view.registerFields}
              empty="No refused registrations"
            />
            <Bars
              title="Gallery, by page type"
              note="Which templates a visitor opens before deciding"
              rows={view.gallery}
              empty="Nobody opened the gallery"
            />
          </div>

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

/**
 * Ordered steps, as bars against the first.
 *
 * NOT A TAPERED FUNNEL SHAPE. Those encode the number in a trapezoid's area,
 * which nobody can compare by eye, and the slope between two steps reads as a
 * rate when it is just two numbers. A bar per step against one baseline is the
 * same data where the lengths can actually be compared — and the only number
 * worth acting on, the drop from the step above, is printed rather than left
 * to be estimated.
 */
function Funnel({ view }: { view: View }) {
  const top = view.funnel[0]?.visitors || 1;

  return (
    <Panel className="p-4 sm:p-5">
      <h2 className="text-[13.5px] font-semibold text-pf-text">The funnel</h2>
      <p className="mt-0.5 text-[11.5px] text-pf-muted">
        Distinct people at each step, over {view.days} days
      </p>

      <div className="mt-4 grid gap-2.5">
        {view.funnel.map((step, i) => {
          const prev = i === 0 ? null : view.funnel[i - 1].visitors;
          const ofTop = top > 0 ? step.visitors / top : 0;
          const ofPrev = prev && prev > 0 ? step.visitors / prev : null;
          /* Below half of the previous step is where a gap stops being normal
             attrition and starts being a question — flagged rather than left
             for somebody to notice. */
          const steep = ofPrev !== null && ofPrev < 0.5;

          return (
            <div key={step.key} className="group grid gap-1" title={`${step.events} events`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] font-semibold text-pf-body">{step.label}</span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-[13px] font-semibold text-pf-text">
                    {step.visitors.toLocaleString()}
                  </span>
                  {ofPrev !== null && (
                    <span
                      className={`text-[11.5px] ${steep ? "text-pf-danger" : "text-pf-muted"}`}
                    >
                      {Math.round(ofPrev * 100)}% of previous
                    </span>
                  )}
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-pf-bg-deep">
                <motion.div
                  className="h-full rounded-full bg-pf-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(ofTop * 100, step.visitors > 0 ? 1.5 : 0)}%` }}
                  transition={{ duration: 0.5, delay: Math.min(i * 0.04, 0.3), ease: [0.22, 1, 0.36, 1] }}
                />
              </div>

              <p className="text-[11px] text-pf-faint">
                {step.note}
                {i > 0 && ` · ${Math.round(ofTop * 100)}% of everyone who landed`}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ---- sign-in results ----------------------------------------------------- */

function SigninResults({ view }: { view: View }) {
  const total = view.signin.reduce((a, b) => a + b.count, 0);

  return (
    <Panel className="p-4 sm:p-5">
      <h2 className="text-[13.5px] font-semibold text-pf-text">What happened at sign-in</h2>
      <p className="mt-0.5 text-[11.5px] text-pf-muted">
        Every attempt, by outcome — {total.toLocaleString()} in total
      </p>

      {total === 0 ? (
        <Empty>Nobody has tried to sign in</Empty>
      ) : (
        <>
          {/* A 2px gap between segments, so two adjacent fills never read as
              one longer one. */}
          <div className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
            {view.signin.map((s) => (
              <motion.div
                key={s.key}
                initial={{ width: 0 }}
                animate={{ width: `${(s.count / total) * 100}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                style={{ backgroundColor: RESULT_COLOR[s.key] ?? "var(--color-pf-border-hi)" }}
                title={`${s.label}: ${s.count}`}
                className="first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>

          {/* The legend is also the numbers, so identity never rests on the
              colour alone — and a reader who cannot separate two hues still
              gets the answer from the row. */}
          <div className="mt-3.5 grid gap-2">
            {view.signin.map((s) => (
              <div key={s.key} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: RESULT_COLOR[s.key] ?? "var(--color-pf-border-hi)" }}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-pf-body">{s.label}</span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-pf-text">
                  {s.count.toLocaleString()}
                </span>
                <span className="w-10 shrink-0 text-right text-[11.5px] tabular-nums text-pf-faint">
                  {Math.round((s.count / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

/* ---- CTA ----------------------------------------------------------------- */

function CtaSplit({ view }: { view: View }) {
  return (
    <Bars
      title="Which CTA gets pressed"
      note="Hero and closing are Design now; the header pair belong to people who already have an account"
      rows={view.cta}
      empty="No CTA presses yet"
    />
  );
}

/* ---- the cost of a second screen ----------------------------------------- */

/**
 * The number this screen exists for, stated rather than left to arithmetic.
 *
 * Somebody told "this store is not registered" either goes and registers or
 * leaves. The gap between those two counts is what asking people to register
 * on a separate screen costs — and it is the evidence for or against merging
 * the two forms, which is why it gets its own panel instead of being two rows
 * in a table.
 */
function RegisterCost({ view }: { view: View }) {
  const refused = view.signin.find((s) => s.key === "not_registered")?.count ?? 0;
  const wentOn = view.rows
    .filter((r) => r.name === "design_register_link_clicked")
    .reduce((a, b) => a + b.count, 0);
  const registered = view.registerResults.find((s) => s.key === "success")?.count ?? 0;

  const carried = refused > 0 ? wentOn / refused : null;

  return (
    <Panel className="p-4 sm:p-5">
      <h2 className="text-[13.5px] font-semibold text-pf-text">
        The cost of a second screen
      </h2>
      <p className="mt-0.5 text-[11.5px] text-pf-muted">
        Of everyone told they are not registered, how many went and did it
      </p>

      {refused === 0 ? (
        <Empty>Nobody has been turned away yet</Empty>
      ) : (
        <>
          <p className="mt-4 font-display text-[34px] font-bold tabular-nums leading-none tracking-[-0.03em] text-pf-text">
            {Math.round((carried ?? 0) * 100)}
            <span className="text-[20px] text-pf-muted">%</span>
          </p>
          <p className="mt-1.5 text-[11.5px] text-pf-muted">
            carried on to the register form
          </p>

          <div className="mt-4 grid gap-2 border-t border-pf-border pt-3.5 text-[12px]">
            <Row label="Told they are not registered" value={refused} />
            <Row label="Pressed the register link" value={wentOn} />
            <Row label="Finished registering" value={registered} />
            <Row
              label="Lost between the two screens"
              value={Math.max(0, refused - wentOn)}
              tone="danger"
            />
          </div>
        </>
      )}
    </Panel>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate text-pf-muted">{label}</span>
      <span
        className={`shrink-0 font-semibold tabular-nums ${
          tone === "danger" ? "text-pf-danger" : "text-pf-text"
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

/* ---- builds -------------------------------------------------------------- */

function BuildOutcomes({ view }: { view: View }) {
  const { started, completed, failed, cancelled } = view.builds;
  const peak = Math.max(...view.durations.map((d) => d.count), 1);

  return (
    <Panel className="p-4 sm:p-5">
      <h2 className="text-[13.5px] font-semibold text-pf-text">Builds</h2>
      <p className="mt-0.5 text-[11.5px] text-pf-muted">
        Outcomes are the server&rsquo;s, so a closed tab still counts
      </p>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Started", value: started },
          { label: "Finished", value: completed },
          { label: "Failed", value: failed },
          { label: "Cancelled", value: cancelled },
        ].map((s) => (
          <div key={s.label} className="rounded-pf-md bg-pf-bg-deep px-2 py-2.5">
            <p className="font-display text-[19px] font-semibold tabular-nums leading-none text-pf-text">
              {s.value.toLocaleString()}
            </p>
            <p className="mt-1 text-[10.5px] text-pf-faint">{s.label}</p>
          </div>
        ))}
      </div>

      {completed > 0 && (
        <>
          <p className="mt-4 text-[11.5px] font-semibold text-pf-body">How long they took</p>
          <div className="mt-2.5 grid gap-1.5">
            {view.durations.map((d) => (
              <div key={d.label} className="flex items-center gap-2.5">
                <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-pf-muted">
                  {d.label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-pf-bg-deep">
                  <motion.div
                    className="h-full rounded-full bg-pf-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${(d.count / peak) * 100}%` }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-pf-faint">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

/* ---- a plain bar list ---------------------------------------------------- */

/**
 * One measure across categories: one hue, bars against the largest.
 *
 * Every row carries its own number, so nobody has to read a length against a
 * missing axis — which is also why there is no axis.
 */
function Bars({
  title,
  note,
  rows,
  empty,
}: {
  title: string;
  note: string;
  rows: Slice[];
  empty: string;
}) {
  const peak = Math.max(...rows.map((r) => r.count), 1);

  return (
    <Panel className="p-4 sm:p-5">
      <h2 className="text-[13.5px] font-semibold text-pf-text">{title}</h2>
      <p className="mt-0.5 text-[11.5px] leading-snug text-pf-muted">{note}</p>

      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="mt-4 grid gap-2">
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[12px] text-pf-body">{r.label}</span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-pf-text">
                  {r.count.toLocaleString()}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-pf-bg-deep">
                <motion.div
                  className="h-full rounded-full bg-pf-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max((r.count / peak) * 100, 1.5)}%` }}
                  transition={{ duration: 0.45, delay: Math.min(i * 0.03, 0.2), ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 pb-2 text-center text-[12px] text-pf-faint">{children}</p>
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
