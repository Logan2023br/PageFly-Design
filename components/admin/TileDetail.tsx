"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { DetailResponse, DetailRow } from "@/lib/analytics/detail";
import type { EventHit } from "@/lib/db/types";
import { countryName, flagOf } from "@/lib/countries";
import { Icon, Panel } from "../ui";

/* ==========================================================================
   The list a tile is a summary of.

   "28 exports · 4 stores" is where every conversation about this screen used
   to stop, because the next question — which four, which pages, how often —
   was a query somebody had to go and write. This is that query, opened by
   pressing the tile.

   IT SPANS THE WHOLE ROW. The tiles are a four-column grid, and a detail panel
   inside one cell would be a column of text a quarter of the screen wide. As a
   grid item with `col-span-full` it lands directly beneath the row the tile is
   in — under the number it explains, not at the bottom of the page.

   FETCHED WHEN OPENED, NEVER BEFORE. Most tiles are never pressed, and loading
   every one of them would be a few hundred rows of nothing for every visit to
   this screen.

   TWO VIEWS OF THE SAME PRESSES, and they answer different questions.

   `Recent` is one row per press, newest first: when, who, and which control.
   This is the one people mean when they open a tile — an order of events, which
   is the only thing that shows a path through a page. It is capped at the newest
   few hundred, so its count is not the total; the tile above carries that.

   `By store` is the older fold: one row per store with a total and a parameter
   breakdown. Right for "which four stores exported", useless for a signed-out
   event where it is a single row reading "not signed in · 85" — which is why
   the feed is what opens first.
   ========================================================================== */

/**
 * When, to the minute — without the year, because every row is inside the
 * window.
 *
 * THE TIME AS WELL AS THE DAY. "Who pressed it and when" is the whole reason a
 * tile is opened, and a date alone cannot tell two presses on one afternoon
 * from two a week apart. Rendered on two lines so the column stays narrow.
 */
function when(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: "—", time: "" };
  return {
    day: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

export function TileDetail({
  event,
  part,
  slice,
  days,
  day,
  only = [],
  except = [],
}: {
  event: string;
  /** One value of the event's parameter — see `StatTile.part`. */
  part?: string;
  /** One value of the event's SECOND parameter — see `StatTile.slice`. */
  slice?: string;
  days: number;
  /** The day the screen is showing, or null for the whole window. The tile
      above was counted over exactly this range, so the rows must be too. */
  day?: string | null;
  /** The country filter the tile above was counted under — same reason as
      `day`: a panel that contradicts the number it opened from is worse than
      no panel. */
  only?: string[];
  except?: string[];
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [hits, setHits] = useState<EventHit[]>([]);
  /* WHICH HALF IS SHOWING. Defaults to the feed: "who pressed this and when" is
     the question a tile is opened for, and on a signed-out event the fold
     beside it is a single row saying "not signed in · 85". */
  const [tab, setTab] = useState<"feed" | "stores">("feed");
  const [partLabel, setPartLabel] = useState("");
  const [error, setError] = useState("");

  /* NO `setState("loading")` HERE. The state already starts there, and the call
     site remounts this component when the event or the window changes — see the
     `key` in `StatTile`. Resetting it synchronously inside the effect is the
     cascading-render React warns about, and remounting says the same thing
     without the extra pass. */
  useEffect(() => {
    let live = true;

    const tz = -new Date().getTimezoneOffset();
    fetch(
      `/api/admin/analytics/detail?event=${encodeURIComponent(event)}` +
        `&days=${days}&tz=${tz}${day ? `&day=${day}` : ""}` +
        (part ? `&part=${encodeURIComponent(part)}` : "") +
        (slice ? `&slice=${encodeURIComponent(slice)}` : "") +
        (only.length > 0 ? `&country=${only.join(",")}` : "") +
        (except.length > 0 ? `&exclude=${except.join(",")}` : ""),
    )
      .then((r) => r.json() as Promise<DetailResponse>)
      .then((body) => {
        if (!live) return;
        if (!body.ok) {
          setError(body.error);
          setState("error");
          return;
        }
        setRows(body.rows);
        setHits(body.hits);
        setPartLabel(body.partLabel);
        setState("ready");
      })
      .catch(() => {
        if (!live) return;
        setError("Could not load the detail.");
        setState("error");
      });

    /* The window switch is right above these tiles, so an open panel can have a
       second request overtake the first. */
    return () => {
      live = false;
    };
  }, [event, part, slice, days, day, only, except]);

  const total = rows.reduce((a, r) => a + r.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="col-span-full"
    >
      <Panel className="overflow-hidden p-0">
        {state === "loading" && (
          <p className="px-4 py-5 text-[12px] text-pf-faint">Loading…</p>
        )}

        {state === "error" && (
          <p className="px-4 py-5 text-[12px] text-pf-danger">{error}</p>
        )}

        {state === "ready" && rows.length === 0 && hits.length === 0 && (
          /* A REASON, NOT AN EMPTY BOX. The two events that carry the typed
             domain only started carrying it when that was added, so the first
             weeks of a window can be genuinely blank — and "nothing here" reads
             as a broken screen unless it says why it might be. */
          <p className="px-4 py-5 text-[12px] leading-relaxed text-pf-faint">
            {day ? `Nothing recorded on ${day}.` : "Nothing recorded in this window."}{" "}
            If the tile above shows a count, those presses happened before this
            breakdown was being kept.
          </p>
        )}

        {state === "ready" && (rows.length > 0 || hits.length > 0) && (
          <div className="flex items-center gap-1 border-b border-pf-border/60 px-2 py-1.5">
            {(
              [
                ["feed", `Recent${hits.length ? ` · ${hits.length}` : ""}`],
                ["stores", `By store${rows.length ? ` · ${rows.length}` : ""}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={
                  "rounded-pf-sm px-2.5 py-1 text-[11.5px] font-medium transition-colors " +
                  (tab === id
                    ? "bg-pf-card-hi text-pf-text"
                    : "text-pf-faint hover:text-pf-body")
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ==================================================================
            ONE ROW PER PRESS, NEWEST FIRST.

            `who` is the store when the session knew one and the browser id
            otherwise — shortened, because the whole of a uuid is forty
            characters of noise and the first eight are enough to tell two
            visitors apart in a list this long. Same browser twice in a row is
            one person moving through the page, which is the reading the fold
            beside this cannot produce at all.

            `what` prints the event's own parameters rather than a chosen one:
            a press carries `location`, or `section`, or `page_type` AND `from`,
            and which of those matters depends on the tile. Printing them all
            costs a narrow column and never hides the one that mattered.
            ================================================================== */}
        {state === "ready" && tab === "feed" && hits.length > 0 && (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-pf-bg-deep text-[11px] text-pf-faint">
                <tr>
                  <th className="w-24 px-4 py-2 font-medium">When</th>
                  <th className="w-20 px-2 py-2 font-medium">Country</th>
                  <th className="px-2 py-2 font-medium">Who</th>
                  <th className="px-4 py-2 font-medium">What</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.id} className="border-t border-pf-border/60 align-top">
                    <td className="px-4 py-2 tabular-nums text-pf-body">
                      {when(h.at).day}
                      <span className="block text-[10.5px] text-pf-faint">{when(h.at).time}</span>
                    </td>
                    {/* THE FLAG AND THE CODE, not one or the other. A flag alone
                        is unreadable at 11px and ambiguous between a dozen
                        similar ones; the code alone is a puzzle. Together the
                        row scans and stays unambiguous. */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      {h.country ? (
                        <span className="text-pf-body" title={countryName(h.country)}>
                          <span className="mr-1">{flagOf(h.country)}</span>
                          <span className="font-mono text-[11.5px]">{h.country}</span>
                        </span>
                      ) : (
                        <span className="text-pf-faint">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {h.domain ? (
                        <span className="font-mono text-[11.5px] text-pf-text">{h.domain}</span>
                      ) : (
                        <span className="text-pf-faint">
                          not signed in
                          <span className="block font-mono text-[10.5px] text-pf-faint/70">
                            {h.visitorId.slice(0, 8)}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="flex flex-wrap gap-1">
                        {Object.entries(h.props)
                          .filter(([, v]) => v !== null && v !== undefined && v !== "")
                          .map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded-pf-sm border border-pf-border px-1.5 py-0.5 text-[11px] text-pf-body"
                            >
                              <span className="text-pf-faint">{k}</span> {propText(k, v)}
                            </span>
                          ))}
                        {Object.keys(h.props).length === 0 && (
                          <span className="text-pf-faint">—</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {state === "ready" && tab === "feed" && hits.length > 0 && (
          <p className="flex items-center gap-1.5 border-t border-pf-border/60 px-4 py-2 text-[11px] text-pf-faint">
            <Icon name="Info" size={12} />
            the {hits.length} most recent press{hits.length === 1 ? "" : "es"}, newest first ·
            the tile above carries the true total
          </p>
        )}

        {state === "ready" && tab === "feed" && hits.length === 0 && rows.length > 0 && (
          <p className="px-4 py-5 text-[12px] text-pf-faint">
            No individual presses in this window.
          </p>
        )}

        {state === "ready" && tab === "stores" && rows.length > 0 && (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-pf-bg-deep text-[11px] text-pf-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">Store</th>
                  <th className="w-16 px-2 py-2 text-right font-medium">Times</th>
                  {partLabel && <th className="px-2 py-2 font-medium">{partLabel}</th>}
                  <th className="w-24 px-4 py-2 text-right font-medium">Last</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.domain ?? "(none)"}
                    className="border-t border-pf-border/60 align-top"
                  >
                    <td className="px-4 py-2">
                      {r.domain ? (
                        <span className="font-mono text-[11.5px] text-pf-text">{r.domain}</span>
                      ) : (
                        /* Not a gap — for the install button this row is the
                           finding: presses from people with no account. */
                        <span className="text-pf-faint">not signed in</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-pf-text">{r.count}</td>
                    {partLabel && (
                      <td className="px-2 py-2">
                        <span className="flex flex-wrap gap-1">
                          {r.parts.map((p) => (
                            <span
                              key={p.key}
                              className="rounded-pf-sm border border-pf-border px-1.5 py-0.5 text-[11px] text-pf-body"
                            >
                              {p.key}
                              {p.count > 1 && (
                                <span className="ml-1 tabular-nums text-pf-faint">×{p.count}</span>
                              )}
                            </span>
                          ))}
                          {r.parts.length === 0 && <span className="text-pf-faint">—</span>}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-2 text-right tabular-nums text-pf-faint">
                      {when(r.lastAt).day}
                      <span className="block text-[10.5px] text-pf-faint/70">
                        {when(r.lastAt).time}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {state === "ready" && tab === "stores" && rows.length > 0 && (
          <p className="flex items-center gap-1.5 border-t border-pf-border/60 px-4 py-2 text-[11px] text-pf-faint">
            <Icon name="Info" size={12} />
            {rows.length} row{rows.length === 1 ? "" : "s"} · {total} press
            {total === 1 ? "" : "es"} · busiest first
          </p>
        )}
      </Panel>
    </motion.div>
  );
}

/* ==========================================================================
   A PARAMETER AS THE READER WOULD SAY IT.

   BY THE NAME, NOT BY THE EVENT. `184` in a column of chips is a number
   somebody has to decide the unit of, and the chip's own label — `seconds` —
   is the unit, sitting right there unused. Anything called `seconds` or ending
   `_seconds` is a duration whatever fired it, so a later event that measures
   one gets the same reading without a line here.

   EVERYTHING ELSE IS PRINTED AS IT ARRIVED. A props bag is the event's own
   vocabulary and this panel exists to show it; a formatter that guessed at
   values rather than at named units would hide the thing somebody opened the
   panel to see.
   ========================================================================== */
function propText(key: string, value: unknown): string {
  if (!/^(.*_)?seconds$/.test(key)) return String(value);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return String(value);
  if (n < 60) return `${Math.round(n)}s`;
  const m = Math.floor(n / 60);
  /* Padded, so a column of these lines up as times rather than as decimals. */
  return `${m}m ${String(Math.round(n - m * 60)).padStart(2, "0")}s`;
}
