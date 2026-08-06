"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { AdminStats } from "@/lib/db";
import type { IconName } from "@/lib/icons";
import { Icon, Panel } from "../ui";

/* ==========================================================================
   Thống kê.

   Charts are hand-drawn SVG rather than a charting library: the whole feature is
   meant to embed into pagefly.io with no external requests, and four numbers, a
   day bar chart and a rating split do not justify a dependency that would ship
   more code than the rest of this screen.
   ========================================================================== */

export function StatsView({ stats }: { stats: AdminStats }) {
  const { reviews } = stats;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="Users"
          label="Stores using it"
          value={stats.activeStores}
          footnote={`${stats.allowedStores} on the beta list`}
        />
        <StatCard
          icon="Files"
          label="Pages created"
          value={stats.totalPages}
          footnote={`across ${stats.totalRuns} ${stats.totalRuns === 1 ? "build" : "builds"}`}
        />
        <StatCard
          icon="Coins"
          label="Tokens spent"
          value={stats.totalTokens}
          /* Honest rather than blank: generation is deterministic today, so this
             is genuinely zero and not a broken counter. */
          footnote={
            stats.totalTokens === 0
              ? "0 — generation does not call a model yet"
              : "model spend, all stores"
          }
        />
        <StatCard
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
          <p className="mt-0.5 text-[11.5px] text-pf-muted">Last 30 days</p>
          <DayChart daily={stats.daily} />
        </Panel>

        <Panel className="p-4 sm:p-5">
          <h2 className="text-[13.5px] font-semibold text-pf-text">Ratings</h2>
          <p className="mt-0.5 text-[11.5px] text-pf-muted">
            4–5 counts as good, 1–3 as poor
          </p>
          <RatingSplit reviews={reviews} />
        </Panel>
      </div>
    </div>
  );
}

/* ---- number that counts up ---------------------------------------------- */

function StatCard({
  icon,
  label,
  value,
  footnote,
}: {
  icon: IconName;
  label: string;
  value: number;
  footnote: string;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-pf-muted">
        <Icon name={icon} size={14} />
        <span className="text-[12px] font-semibold">{label}</span>
      </div>
      <p className="mt-2 font-display text-[30px] font-bold tabular-nums leading-none tracking-[-0.03em] text-pf-text">
        <CountUp to={value} />
      </p>
      <p className="mt-1.5 text-[11.5px] text-pf-muted">{footnote}</p>
    </Panel>
  );
}

/**
 * Counts from zero to the value once, when it scrolls into view.
 *
 * requestAnimationFrame rather than a spring on a motion value: this needs a
 * whole number on every frame, and animating a number then rounding it produces
 * visible stutter near the end. Skipped entirely under reduced motion — a
 * counter racing upward is exactly the kind of movement that setting turns off.
 */
function CountUp({ to, duration = 900 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  /* Nothing to animate: reduced motion, or a value of zero. Resolved during
     render rather than by setting state in the effect, which would cascade. */
  const skip = Boolean(reduced) || to === 0;

  useEffect(() => {
    if (!inView || skip) return;

    let raf = 0;
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(to * ease(t)));
      if (t < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, skip]);

  return <span ref={ref}>{(skip ? to : shown).toLocaleString()}</span>;
}

/* ---- day bars ------------------------------------------------------------ */

function DayChart({ daily }: { daily: AdminStats["daily"] }) {
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
              title={`${day.date}: ${day.pages} page${day.pages === 1 ? "" : "s"}, ${day.runs} build${day.runs === 1 ? "" : "s"}`}
              className="min-w-[4px] flex-1 rounded-t-[3px] bg-gradient-to-t from-pf-primary/45 to-pf-primary-hi"
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] tabular-nums text-pf-faint">
        <span>{daily[0].date.slice(5)}</span>
        <span>peak {peak}</span>
        <span>{daily[daily.length - 1].date.slice(5)}</span>
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
