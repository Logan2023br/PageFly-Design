"use client";

import { useState } from "react";
import type { CollectionLeadRecord } from "@/lib/db/types";
import { countryLabel } from "@/lib/countries";
import { Icon, Panel } from "../../ui";

/* ==========================================================================
   LEADS — who filled in the download form on a free set.

   A list to act on rather than a chart: the store to look at, the email to
   write to. Filterable by set, and exported as CSV because the next place a
   list of emails goes is somebody's mail tool, not this screen.
   ========================================================================== */

function csv(rows: CollectionLeadRecord[]): string {
  const cell = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const head = ["received", "set", "page", "store", "email", "country"];
  return [
    head.join(","),
    ...rows.map((l) =>
      [l.createdAt, l.setName, l.pageSlug ?? "whole set", l.domain, l.email, l.country].map(cell).join(","),
    ),
  ].join("\n");
}

export function CollectionLeads({ leads }: { leads: CollectionLeadRecord[] }) {
  const [set, setSet] = useState<string>("all");
  const sets = [...new Map(leads.map((l) => [l.setSlug, l.setName])).entries()];
  const shown = set === "all" ? leads : leads.filter((l) => l.setSlug === set);
  const emails = new Set(shown.map((l) => l.email)).size;

  if (leads.length === 0) {
    return (
      <Panel className="grid place-items-center gap-2 px-6 py-16 text-center">
        <Icon name="Mail" size={28} className="text-pf-faint" />
        <p className="text-[14px] font-semibold text-pf-text">No leads yet</p>
        <p className="max-w-sm text-[13px] text-pf-muted">
          When somebody fills in the download form on a free set, their store and email show up here.
        </p>
      </Panel>
    );
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([csv(shown)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `collection-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[["all", "All sets"] as const, ...sets].map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSet(id)}
              aria-pressed={set === id}
              className={`rounded-pf-pill border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                set === id
                  ? "border-pf-primary-hi/50 bg-pf-primary/15 text-pf-text"
                  : "border-pf-border text-pf-muted hover:text-pf-text"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-pf-muted">
            {shown.length} downloads · {emails} {emails === 1 ? "email" : "emails"}
          </span>
          <button
            type="button"
            onClick={download}
            className="inline-flex h-8 items-center gap-1.5 rounded-pf-md border border-pf-border px-3 text-[12.5px] font-semibold text-pf-body transition-colors hover:border-pf-border-hi hover:text-pf-text"
          >
            <Icon name="Download" size={13} />
            Export CSV
          </button>
        </div>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-pf-border text-[11.5px] uppercase tracking-[0.06em] text-pf-faint">
              <th className="px-4 py-2.5 font-semibold">Received</th>
              <th className="px-4 py-2.5 font-semibold">Set</th>
              <th className="px-4 py-2.5 font-semibold">Store</th>
              <th className="px-4 py-2.5 font-semibold">Email</th>
              <th className="px-4 py-2.5 font-semibold">Country</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className="border-b border-pf-border last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-pf-muted">
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-semibold text-pf-text">{l.setName}</span>
                  <span className="block text-[12px] text-pf-faint">{l.pageSlug ?? "whole set"}</span>
                </td>
                <td className="px-4 py-2.5">
                  <a
                    href={`https://${l.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-pf-body hover:text-pf-text hover:underline"
                  >
                    {l.domain}
                  </a>
                </td>
                <td className="px-4 py-2.5">
                  <a href={`mailto:${l.email}`} className="text-pf-primary-hi hover:underline">
                    {l.email}
                  </a>
                </td>
                <td className="px-4 py-2.5 text-pf-body">
                  {l.country ? countryLabel(l.country) : <span className="text-pf-faint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
