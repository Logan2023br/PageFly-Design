"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/collectionPages";
import type { CollectionOrderRecord, CollectionOrderStatus } from "@/lib/db/types";
import { Icon, Panel } from "../../ui";
import { api } from "./shared";

/* ==========================================================================
   ORDERS — requests for a paid set, from /collection-pages/checkout.

   Nothing is paid and nothing is sent automatically. An operator reads the
   order, checks the store, writes to the buyer, and marks it here so the next
   person on the team can see it has been handled. The email is a mailto link
   with the subject filled in, because writing back is the next act every time.
   ========================================================================== */

const STATUS: Record<CollectionOrderStatus, { label: string; cls: string }> = {
  pending: { label: "New", cls: "border-pf-warn/40 bg-pf-warn/10 text-pf-warn" },
  confirmed: { label: "Confirmed", cls: "border-pf-success/30 bg-pf-success/10 text-pf-success" },
  cancelled: { label: "Cancelled", cls: "border-pf-border bg-pf-card-hi text-pf-faint" },
};

type Filter = "all" | CollectionOrderStatus;

export function CollectionOrders({
  orders: initial,
  onChange,
  loadError = null,
}: {
  orders: CollectionOrderRecord[];
  loadError?: string | null;
  onChange?: (orders: CollectionOrderRecord[]) => void;
}) {
  const [orders, setOrders] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = async (id: string, status: CollectionOrderStatus) => {
    setBusy(id);
    setError(null);
    const res = await api<{ orders: CollectionOrderRecord[] }>("/api/admin/collection-pages/orders", {
      method: "PATCH",
      body: JSON.stringify({ id, status }),
    });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setOrders(res.orders);
    onChange?.(res.orders);
  };

  const shown = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  const count = (f: Filter) => (f === "all" ? orders.length : orders.filter((o) => o.status === f).length);

  if (loadError) {
    return (
      <Panel className="flex items-center gap-2 border-pf-danger/40 p-4 text-[13.5px] text-pf-danger">
        <Icon name="CircleAlert" size={16} />
        {loadError}
      </Panel>
    );
  }

  if (orders.length === 0) {
    return (
      <Panel className="grid place-items-center gap-2 px-6 py-16 text-center">
        <Icon name="ShoppingCart" size={28} className="text-pf-faint" />
        <p className="text-[14px] font-semibold text-pf-text">No orders yet</p>
        <p className="max-w-sm text-[13px] text-pf-muted">
          When somebody confirms the checkout form on a paid set, the order shows up here.
        </p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(["all", "pending", "confirmed", "cancelled"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-pf-pill border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
              filter === f
                ? "border-pf-primary-hi/50 bg-pf-primary/15 text-pf-text"
                : "border-pf-border text-pf-muted hover:text-pf-text"
            }`}
          >
            {f === "all" ? "All" : STATUS[f].label} <span className="text-pf-faint">{count(f)}</span>
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-pf-danger">
          {error}
        </p>
      )}

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-pf-border text-[11.5px] uppercase tracking-[0.06em] text-pf-faint">
              <th className="px-4 py-2.5 font-semibold">Received</th>
              <th className="px-4 py-2.5 font-semibold">Set</th>
              <th className="px-4 py-2.5 font-semibold">Store</th>
              <th className="px-4 py-2.5 font-semibold">Buyer</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => (
              <tr
                key={o.id}
                className={`border-b border-pf-border last:border-0 ${busy === o.id ? "opacity-60" : ""}`}
              >
                <td className="whitespace-nowrap px-4 py-3 text-pf-muted">
                  {new Date(o.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-pf-text">{o.setName}</span>
                  <span className="block text-[12px] text-pf-faint">{formatPrice(o.priceCents) ?? "—"}</span>
                  {o.note && (
                    <span className="mt-1 block max-w-[320px] whitespace-pre-wrap text-[12px] text-pf-muted">
                      {o.note}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`https://${o.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-pf-body hover:text-pf-text hover:underline"
                  >
                    {o.domain}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <span className="text-pf-text">{o.name}</span>
                  <a
                    href={`mailto:${o.email}?subject=${encodeURIComponent(`Your ${o.setName} order`)}`}
                    className="block text-[12px] text-pf-primary-hi hover:underline"
                  >
                    {o.email}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-pf-pill border px-2 py-0.5 text-[11px] font-semibold ${STATUS[o.status].cls}`}
                  >
                    {STATUS[o.status].label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {o.status === "pending" ? (
                    <div className="inline-flex gap-1.5">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void mark(o.id, "confirmed")}
                        className="inline-flex h-7 items-center gap-1 rounded-pf-md bg-pf-primary px-2.5 text-[12px] font-semibold text-white hover:bg-pf-primary-hi"
                      >
                        <Icon name="Check" size={12} />
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void mark(o.id, "cancelled")}
                        className="inline-flex h-7 items-center rounded-pf-md border border-pf-border px-2.5 text-[12px] font-semibold text-pf-muted hover:text-pf-text"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void mark(o.id, "pending")}
                      className="text-[12px] font-semibold text-pf-faint hover:text-pf-text"
                    >
                      Reopen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
