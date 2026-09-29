"use client";

import { useEffect, useState } from "react";
import type { CpHit } from "@/lib/collectionAnalytics";
import { countryLabel } from "@/lib/countries";
import { Icon, Panel } from "../../ui";
import { api } from "./shared";

/* ==========================================================================
   WHAT A FIGURE OPENS INTO: every event behind it, newest first.

   The same columns the main Analytics screen's feed has — when, where, who —
   plus the two this section can say that the rest of the product cannot:

     WHO   the signed-in store when there was a session; otherwise the store
           and email typed into the download form by that same browser; and
           only when neither exists, an anonymous browser id, shortened.

   Fetched when opened and not before: a screen of twenty tiles would
   otherwise ask for twenty feeds nobody opened.
   ========================================================================== */

export type HitQuery = { metric: string; key?: string | null; set?: string | null };

export function HitFeed({
  query,
  days,
  day,
  title,
}: {
  query: HitQuery;
  days: number;
  day: string | null;
  title?: string;
}) {
  const [hits, setHits] = useState<CpHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const q = new URLSearchParams({
        days: String(days),
        tz: String(-new Date().getTimezoneOffset()),
        hits: query.metric,
      });
      if (day) q.set("day", day);
      if (query.key != null) q.set("key", query.key);
      if (query.set) q.set("set", query.set);
      const res = await api<{ hits: CpHit[]; total: number }>(
        `/api/admin/collection-pages/analytics?${q}`,
        { cache: "no-store" },
      );
      if (!live) return;
      if (!res.ok) return setError(res.error);
      setHits(res.hits);
      setTotal(res.total);
    })();
    return () => {
      live = false;
    };
  }, [query.metric, query.key, query.set, days, day]);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-pf-border px-4 py-3">
        <p className="text-[12.5px] font-semibold text-pf-text">
          {title ?? "Who, and when"}
          {hits && (
            <span className="ml-2 font-normal text-pf-faint">
              {total} {total === 1 ? "row" : "rows"}
              {total > hits.length ? ` · the latest ${hits.length}` : ""}
            </span>
          )}
        </p>
        <p className="text-[11px] text-pf-faint">Times are yours · newest first</p>
      </div>

      {error ? (
        <p className="px-4 py-4 text-[12.5px] text-pf-danger">{error}</p>
      ) : !hits ? (
        <p className="px-4 py-4 text-[12.5px] text-pf-muted">Reading…</p>
      ) : hits.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-pf-muted">Nothing in this window.</p>
      ) : (
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full min-w-[860px] text-left text-[12px]">
            <thead className="sticky top-0 bg-pf-card">
              <tr className="border-b border-pf-border text-[10.5px] uppercase tracking-[0.06em] text-pf-faint">
                <th className="px-4 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Country</th>
                <th className="px-3 py-2 font-semibold">Who</th>
                <th className="px-3 py-2 font-semibold">What</th>
                <th className="px-3 py-2 font-semibold">Set · page</th>
                <th className="px-4 py-2 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((h, i) => (
                <tr key={`${h.at}-${i}`} className="border-b border-pf-border/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-pf-muted">
                    {new Date(h.at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-pf-body">
                    {h.country ? countryLabel(h.country) : <span className="text-pf-faint">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Who hit={h} />
                  </td>
                  <td className="px-3 py-2 text-pf-text">{h.what}</td>
                  <td className="px-3 py-2 text-pf-body">
                    {h.set ?? <span className="text-pf-faint">—</span>}
                    {h.page && <span className="text-pf-faint"> · {h.page}</span>}
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-2 text-pf-muted" title={h.detail ?? ""}>
                    {h.detail ?? <span className="text-pf-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Who({ hit }: { hit: CpHit }) {
  if (hit.store) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-semibold text-pf-text">{hit.store}</span>
        <span className="rounded-pf-pill bg-pf-success/15 px-1.5 text-[10px] font-semibold text-pf-success">
          signed in
        </span>
      </span>
    );
  }
  if (hit.lead) {
    return (
      <span className="block leading-tight">
        <span className="block font-semibold text-pf-text">{hit.lead.domain}</span>
        <a href={`mailto:${hit.lead.email}`} className="text-[11px] text-pf-primary-hi hover:underline">
          {hit.lead.email}
        </a>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-pf-faint" title={hit.visitor ?? ""}>
      <Icon name="Users" size={11} />
      Anonymous{hit.visitor ? ` · ${hit.visitor.slice(0, 6)}` : ""}
    </span>
  );
}
