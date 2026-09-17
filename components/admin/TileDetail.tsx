"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { DetailResponse, DetailRow } from "@/lib/analytics/detail";
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
   ========================================================================== */

/** A date a person can read, without the year — every row is inside the window. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function TileDetail({ event, days }: { event: string; days: number }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [partLabel, setPartLabel] = useState("");
  const [error, setError] = useState("");

  /* NO `setState("loading")` HERE. The state already starts there, and the call
     site remounts this component when the event or the window changes — see the
     `key` in `StatTile`. Resetting it synchronously inside the effect is the
     cascading-render React warns about, and remounting says the same thing
     without the extra pass. */
  useEffect(() => {
    let live = true;

    fetch(`/api/admin/analytics/detail?event=${encodeURIComponent(event)}&days=${days}`)
      .then((r) => r.json() as Promise<DetailResponse>)
      .then((body) => {
        if (!live) return;
        if (!body.ok) {
          setError(body.error);
          setState("error");
          return;
        }
        setRows(body.rows);
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
  }, [event, days]);

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

        {state === "ready" && rows.length === 0 && (
          /* A REASON, NOT AN EMPTY BOX. The two events that carry the typed
             domain only started carrying it when that was added, so the first
             weeks of a window can be genuinely blank — and "nothing here" reads
             as a broken screen unless it says why it might be. */
          <p className="px-4 py-5 text-[12px] leading-relaxed text-pf-faint">
            Nothing recorded in this window. If the tile above shows a count,
            those presses happened before this breakdown was being kept.
          </p>
        )}

        {state === "ready" && rows.length > 0 && (
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
                      {when(r.lastAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {state === "ready" && rows.length > 0 && (
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
