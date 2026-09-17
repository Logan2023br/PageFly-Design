"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { IconName } from "@/lib/icons";
import { DETAIL_OF } from "@/lib/analytics/detail";
import { CountUp, Icon, Panel } from "../ui";
import { TileDetail } from "./TileDetail";

/* ==========================================================================
   One number, in a box.

   LIFTED OUT OF `StatsView` RATHER THAN COPIED. Two admin screens now show
   numbers in this shape, and two copies of a tile drift — one gets a type
   size, the other does not, and the two screens stop looking like one
   product. This is the only definition.

   THREE TIERS, AND THEY ARE NOT INTERCHANGEABLE. The label says what is being
   counted, the figure is the count, and the footnote is what it should be read
   against — "43% of the step above", "of 1,243 on the list". A number with no
   third line is a number a reader has to find a comparison for themselves, and
   most of them will not.

   THE BAR IS OPTIONAL AND CARRIES NO SECOND MEASURE. When a tile is one of a
   row that shares a scale — the steps of a funnel, the outcomes of a form —
   a figure alone makes the reader do the division. A hairline along the bottom
   edge restores the one thing a grid of boxes loses to a chart: which of them
   is long and which is short, seen rather than computed. It is the same ratio
   the footnote states, never a different one.
   ========================================================================== */

export function StatTile({
  icon,
  label,
  value,
  footnote,
  ratio,
  tone = "default",
  delay = 0,
  hint,
  event,
  days,
  day,
}: {
  icon: IconName;
  label: string;
  value: number;
  footnote: string;
  /** 0–1, drawn as a hairline along the bottom. Omit when nothing shares a
      scale with this tile — a lone bar at some arbitrary length is decoration
      that reads as data. */
  ratio?: number;
  /** `danger` for a figure that is the problem rather than the result — a
      drop-off, a failure count. Applied to the bar and the footnote, never to
      the figure: the number itself is not bad news, what it measures is. */
  tone?: "default" | "danger";
  delay?: number;
  /**
   * What fires this, shown on hover.
   *
   * The first line names the control and the screen; anything after a newline
   * is rendered quieter underneath, which is where the event's own name goes.
   * A reader surprised by a number asks "what exactly did they press", and a
   * label like "CTA pressed" could be four things on this product.
   */
  hint?: string;
  /**
   * The analytics event this tile counts.
   *
   * Given one that `lib/analytics/detail` knows how to open, the tile becomes a
   * button and presses into the list it is a summary of. Given one it does not
   * — the landing page, the CTA, the moving strip, where there is no store to
   * name — the tile stays exactly as it was. That is deliberate: an opener that
   * reveals a column of anonymous ids looks like detail and is not.
   */
  event?: string;
  /** The window the screen is showing, passed to the drill-down unchanged. */
  days?: number;
  /** And the day within it, when one is picked. */
  day?: string | null;
}) {
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  const canOpen = Boolean(event && DETAIL_OF[event]);
  const [what, ...rest] = (hint ?? "").split("\n");

  return (
    /* A FRAGMENT, AND THE REASON IS THE LAYOUT. These tiles are a four-column
       grid; the detail panel is a second grid item with `col-span-full`, which
       lands it under the whole row rather than inside a quarter-width cell.
       Wrapping the pair in a div would make THAT the grid item and break the
       row into pieces. */
    <>
    {/* THE TOOLTIP LIVES OUTSIDE THE PANEL. The Panel is `overflow-hidden` so
        the hairline can sit on its bottom edge, and anything escaping upward
        would be cut off by the same rule. */}
    <div
      className="relative"
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      onFocus={() => setOver(true)}
      onBlur={() => setOver(false)}
      tabIndex={hint ? 0 : undefined}
    >
      <AnimatePresence>
        {hint && over && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
            /* Above, because a grid of tiles has another tile directly below
               every one of them and a tooltip underneath would cover the next
               number rather than explain this one. */
            className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[290px] max-w-[92vw] rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2.5 text-left shadow-pf-float"
          >
            <p className="text-[11.5px] leading-snug text-pf-body">{what}</p>
            {rest.length > 0 && (
              <p className="mt-1.5 font-mono text-[10.5px] text-pf-faint">{rest.join(" ")}</p>
            )}
            <span className="absolute -bottom-1 left-6 size-2 rotate-45 border-b border-r border-pf-border bg-pf-bg-deep" />
          </motion.div>
        )}
      </AnimatePresence>

    <div
      /* The handler sits on a wrapper rather than on `Panel`, which takes only
         a className — one shared box component that every screen styles, and
         giving it a click handler would be the first crack in that. */
      onClick={canOpen ? () => setOpen((o) => !o) : undefined}
      role={canOpen ? "button" : undefined}
      aria-expanded={canOpen ? open : undefined}
      className={canOpen ? "cursor-pointer" : undefined}
    >
    <Panel
      className={`relative overflow-hidden p-4 ${
        canOpen ? "transition-colors duration-150 hover:border-pf-primary-hi/50" : ""
      }`}
    >
      <div className="flex items-center gap-2 text-pf-muted">
        <Icon name={icon} size={14} />
        <span className="text-[12px] font-semibold">{label}</span>
        {canOpen && (
          /* The only thing that says a tile can be pressed. Rotated rather
             than swapped, so the open state is the same mark turned. */
          <Icon
            name="ChevronDown"
            size={13}
            className={`ml-auto text-pf-faint transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        )}
      </div>

      <p className="mt-2 font-display text-[30px] font-bold tabular-nums leading-none tracking-[-0.03em] text-pf-text">
        <CountUp to={value} />
      </p>

      <p
        className={`mt-1.5 text-[11.5px] ${
          tone === "danger" ? "text-pf-danger" : "text-pf-muted"
        }`}
      >
        {footnote}
      </p>

      {ratio !== undefined && (
        /* On the border itself, so it reads as the edge of the box rather than
           as a chart somebody put inside one. */
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-pf-bg-deep">
          <motion.div
            className={`h-full ${tone === "danger" ? "bg-pf-danger" : "bg-pf-primary"}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
            transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      )}
    </Panel>
    </div>
    </div>
    {open && event && (
      <TileDetail
        key={`${event}-${days ?? 30}-${day ?? "all"}`}
        event={event}
        days={days ?? 30}
        day={day}
      />
    )}
    </>
  );
}

/** Four to a row on a wide screen, two on a tablet, one on a phone. */
export function TileRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/** A heading over a row of tiles, so a screen of boxes still has sections. */
export function TileGroup({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-[13.5px] font-semibold text-pf-text">{title}</h2>
        {note && <p className="mt-0.5 text-[11.5px] leading-snug text-pf-muted">{note}</p>}
      </div>
      <TileRow>{children}</TileRow>
    </section>
  );
}
