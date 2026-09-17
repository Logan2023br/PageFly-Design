"use client";

import { motion } from "framer-motion";
import type { DayCount } from "@/lib/db/types";
import { Icon } from "../ui";

/* ==========================================================================
   The days in the window, and one of them picked.

   7, 30 and 90 were the only answers this screen had, and a window is a poor
   instrument for a question about a day: a spike on one Tuesday and the same
   total spread over a fortnight are the same number in a thirty-day view.

   A BAR PER DAY, AND THE BAR IS THE BUTTON. There is no calendar here on
   purpose — a calendar shows every day equally, including the ones nothing
   happened on, and hides the shape of the fortnight while asking somebody to
   remember which date they meant. A row of bars answers "which day was busy"
   and "show me that day" with the same gesture.

   EVERY DAY IN THE WINDOW IS DRAWN, including the empty ones. The query returns
   only days that have something, because a query that invents rows has to know
   about calendars; the gaps are filled here, where the window is known. A run
   of empty days is a finding — a deploy that broke tracking looks exactly like
   this — and a strip that silently closed the gap would hide it.
   ========================================================================== */

/** `YYYY-MM-DD` for a date, in the reader's own timezone rather than UTC — the
    same boundary the server was asked to group on. */
function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The label under a bar. Days, not dates, when there are few enough to read. */
function labelFor(key: string, dense: boolean): string {
  const d = new Date(`${key}T12:00:00`);
  if (dense) return String(d.getDate());
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function DayStrip({
  daily,
  days,
  selected,
  onSelect,
}: {
  daily: DayCount[];
  /** The window, so the empty days can be filled in. */
  days: number;
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const have = new Map(daily.map((d) => [d.date, d]));

  /* Built backwards from today so the last bar is always today, whatever the
     data does. A strip that starts at the first day with events would move its
     right-hand edge as the window changes. */
  const cells: DayCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localKey(d);
    cells.push(have.get(key) ?? { date: key, events: 0, visitors: 0 });
  }

  const top = Math.max(...cells.map((c) => c.events), 1);
  /* Past a fortnight the labels stop fitting, so they become the day of the
     month and then disappear entirely — the bars still carry the shape, and
     the tooltip still carries the date. */
  const dense = cells.length > 14;
  const veryDense = cells.length > 45;
  const today = localKey(new Date());

  return (
    <div className="grid gap-2">
      <div className="flex items-end justify-between gap-2">
        <p className="text-[11.5px] text-pf-muted">
          {selected ? (
            <>
              Showing{" "}
              <span className="font-semibold text-pf-text">
                {labelFor(selected, false)}
              </span>{" "}
              only
            </>
          ) : (
            <>Press a day to read it on its own</>
          )}
        </p>

        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex items-center gap-1 rounded-pf-sm px-1.5 py-0.5 text-[11.5px] font-semibold text-pf-primary-hi hover:text-pf-text"
          >
            <Icon name="X" size={12} />
            All {days} days
          </button>
        )}
      </div>

      <div className="flex items-end gap-[3px] overflow-x-auto pb-1">
        {cells.map((c) => {
          const on = c.date === selected;
          return (
            <button
              key={c.date}
              type="button"
              /* Pressing the day already shown clears it, so the same control
                 gets in and back out. */
              onClick={() => onSelect(on ? null : c.date)}
              aria-pressed={on}
              title={`${labelFor(c.date, false)} · ${c.events} event${c.events === 1 ? "" : "s"} · ${c.visitors} ${c.visitors === 1 ? "person" : "people"}`}
              className="group flex min-w-[10px] flex-1 flex-col items-center gap-1"
            >
              {/* A FIXED-HEIGHT TRACK, so every bar shares a baseline and a
                  short one still has something to press. Without it a day with
                  no events is a one-pixel target. */}
              <span className="flex h-[46px] w-full items-end">
                <motion.span
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(c.events / top, c.events > 0 ? 0.08 : 0.03) * 100}%` }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className={`w-full rounded-t-[2px] transition-colors ${
                    on
                      ? "bg-pf-primary-hi"
                      : c.events === 0
                        ? "bg-pf-border group-hover:bg-pf-muted/50"
                        : "bg-pf-primary/55 group-hover:bg-pf-primary"
                  }`}
                />
              </span>
              {!veryDense && (
                <span
                  className={`whitespace-nowrap text-[9.5px] tabular-nums ${
                    on
                      ? "font-semibold text-pf-text"
                      : c.date === today
                        ? "text-pf-body"
                        : "text-pf-faint"
                  }`}
                >
                  {labelFor(c.date, dense)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
