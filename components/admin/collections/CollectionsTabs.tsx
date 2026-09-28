"use client";

import { useState } from "react";
import type { CollectionOrderRecord, CollectionSetRecord } from "@/lib/db/types";
import { CollectionOrders } from "./CollectionOrders";
import { CollectionSetsAdmin } from "./CollectionSetsAdmin";

/* Sets and the orders for them, one screen. The Orders tab counts what is
   still waiting, because that is the number somebody opens it to act on. */
export function CollectionsTabs({
  sets,
  missing,
  orders: initialOrders,
  ordersError,
  tab: initialTab,
}: {
  sets: CollectionSetRecord[];
  missing: string[];
  orders: CollectionOrderRecord[];
  ordersError: string | null;
  tab: "sets" | "orders";
}) {
  const [tab, setTab] = useState(initialTab);
  const [orders, setOrders] = useState(initialOrders);
  const pending = orders.filter((o) => o.status === "pending").length;

  const button = (id: "sets" | "orders", label: string, badge?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => {
        setTab(id);
        /* In the URL, so a reload or a shared link lands on the same tab. */
        window.history.replaceState(null, "", id === "orders" ? "?tab=orders" : "?");
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
      <div
        role="tablist"
        aria-label="Collection pages"
        className="flex w-fit items-center gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1"
      >
        {button("sets", "Sets")}
        {button("orders", "Orders", pending)}
      </div>
      {tab === "sets" ? (
        <CollectionSetsAdmin initial={sets} missing={missing} />
      ) : (
        <CollectionOrders orders={orders} onChange={setOrders} loadError={ordersError} />
      )}
    </div>
  );
}
