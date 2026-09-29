"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../../ui";
import type { CollectionLeadRecord, CollectionOrderRecord, CollectionSetRecord } from "@/lib/db/types";
import { CollectionLeads } from "./CollectionLeads";
import { CollectionOrders } from "./CollectionOrders";
import { CollectionSetsAdmin } from "./CollectionSetsAdmin";

/* Sets and the orders for them, one screen. The Orders tab counts what is
   still waiting, because that is the number somebody opens it to act on. */
type Tab = "sets" | "orders" | "leads";

export function CollectionsTabs({
  sets,
  missing,
  orders: initialOrders,
  ordersError,
  leads,
  referralsToCheck,
  tab: initialTab,
}: {
  sets: CollectionSetRecord[];
  missing: string[];
  orders: CollectionOrderRecord[];
  ordersError: string | null;
  leads: CollectionLeadRecord[];
  /** referrals waiting for the team — shown on the Referral button */
  referralsToCheck: number;
  tab: Tab;
}) {
  const [tab, setTab] = useState(initialTab);
  const [orders, setOrders] = useState(initialOrders);
  const pending = orders.filter((o) => o.status === "pending").length;

  const button = (id: Tab, label: string, badge?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => {
        setTab(id);
        /* In the URL, so a reload or a shared link lands on the same tab. */
        window.history.replaceState(null, "", id === "sets" ? "?" : `?tab=${id}`);
      }}
      className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        tab === id ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
      }`}
    >
      {label}
      {badge ? (
        <span
          className={`rounded-pf-pill px-1.5 text-[11px] ${
            tab === id ? "bg-white/20" : "bg-pf-warn/20 text-pf-warn"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Collection pages"
          className="flex w-fit items-center gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1"
        >
          {button("sets", "Sets")}
          {button("orders", "Orders", pending)}
          {button("leads", `Leads · ${leads.length}`)}
        </div>
        {/* A screen of its own rather than a third tab: it has its own window,
            its own day and its own refresh, none of which mean anything to a
            list of sets. */}
        <div className="flex items-center gap-2">
        <Link
          href="/design/admin/collections/referrals"
          className="inline-flex h-10 items-center gap-2 rounded-pf-md border border-pf-warn/40 bg-pf-warn/10 px-4 text-[13.5px] font-semibold text-pf-text transition-colors hover:border-pf-warn hover:bg-pf-warn/20"
        >
          <Icon name="Gift" size={16} className="text-pf-warn" />
          Referral
          {referralsToCheck > 0 && (
            <span className="rounded-pf-pill bg-pf-warn/25 px-1.5 text-[11px] text-pf-warn">{referralsToCheck}</span>
          )}
        </Link>
        <Link
          href="/design/admin/collections/analytics"
          className="inline-flex h-10 items-center gap-2 rounded-pf-md border border-pf-primary-hi/40 bg-pf-primary/10 px-4 text-[13.5px] font-semibold text-pf-text transition-colors hover:border-pf-primary-hi hover:bg-pf-primary/20"
        >
          <Icon name="TrendingUp" size={16} className="text-pf-primary-hi" />
          Analytics
        </Link>
        </div>
      </div>
      {tab === "sets" ? (
        <CollectionSetsAdmin initial={sets} missing={missing} />
      ) : tab === "orders" ? (
        <CollectionOrders orders={orders} onChange={setOrders} loadError={ordersError} />
      ) : (
        <CollectionLeads leads={leads} />
      )}
    </div>
  );
}
