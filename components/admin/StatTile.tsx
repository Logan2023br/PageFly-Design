"use client";

import { motion } from "framer-motion";
import type { IconName } from "@/lib/icons";
import { CountUp, Icon, Panel } from "../ui";

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
}) {
  return (
    <Panel className="relative overflow-hidden p-4">
      <div className="flex items-center gap-2 text-pf-muted">
        <Icon name={icon} size={14} />
        <span className="text-[12px] font-semibold">{label}</span>
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
