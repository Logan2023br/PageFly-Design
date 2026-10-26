import Link from "next/link";
import { fmtVN, money } from "@/lib/upsell/format";
import type { SsuFilters, StoreStats } from "@/lib/storeSetUpsell/queries";
import { SSU_STATUS_LABEL } from "@/lib/storeSetUpsell/types";
import { BASE } from "./Chrome";

/* ==========================================================================
   Store dùng page sets — one row per store, not per click: how many Store
   set pages it uses and which, and the store itself (installed when, how
   long on the app, plans, country, pages in the store). The summary above it
   answers "how many, which sets, which plans, where".
   ========================================================================== */

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-pf-card border border-pf-border bg-pf-card p-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-pf-faint">{label}</p>
      <p className="mt-1 text-[22px] font-semibold text-pf-text">{value}</p>
      {hint && <p className="text-[11.5px] text-pf-muted">{hint}</p>}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <section className="rounded-pf-card border border-pf-border bg-pf-card p-3">
      <h3 className="mb-2 text-[12.5px] font-semibold text-pf-text">{title}</h3>
      <ul className="grid gap-1 text-[12.5px]">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-2">
            <span className="truncate text-pf-body">{r.label}</span>
            <span className="shrink-0 text-pf-muted">{r.value}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-pf-faint">—</li>}
      </ul>
    </section>
  );
}

const TH = "whitespace-nowrap px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-pf-faint";
const TD = "px-3 py-2 align-top text-[12.5px] text-pf-body";

export function StoresTable({ s, f }: { s: StoreStats; f: SsuFilters }) {
  const sum = s.summary;
  const csv = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && k !== "page") csv.set(k, String(v));
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Store dùng page sets" value={String(sum.stores)} hint={`${sum.installed} đang cài app`} />
        <Tile label="Page đang dùng" value={String(sum.page_uses)} hint={`TB ${sum.avg_pages.toFixed(1)} page / store`} />
        <Tile label="Plan trả phí" value={String(sum.paid)} hint={sum.stores ? `${Math.round((sum.paid / sum.stores) * 100)}% số store` : undefined} />
        <Tile label="Dùng app TB" value={sum.avg_days_on_app === null ? "—" : `${Math.round(sum.avg_days_on_app)} ngày`} hint="từ ngày cài" />
        <Tile label="Store set" value={String(sum.by_set.length)} hint="được chọn" />
        <Tile label="Quốc gia" value={String(sum.by_country.length)} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Breakdown title="Theo store set" rows={sum.by_set.map((r) => ({ label: r.store_set, value: `${r.stores} store · ${r.pages} page` }))} />
        <Breakdown title="Theo plan PageFly" rows={sum.by_plan.map((r) => ({ label: r.plan, value: `${r.stores} store` }))} />
        <Breakdown title="Theo quốc gia" rows={sum.by_country.map((r) => ({ label: r.country, value: `${r.stores} store` }))} />
      </div>
      <div className="flex justify-end">
        <a
          href={`/api/admin/collection-pages/store-set-upsell/stores.csv?${csv}`}
          className="inline-flex h-8 items-center rounded-pf-md border border-pf-border px-3 text-[12.5px] font-semibold text-pf-body hover:border-pf-border-hi hover:text-pf-text"
        >
          Tải CSV
        </a>
      </div>
      <div className="overflow-x-auto rounded-pf-card border border-pf-border bg-pf-card">
        <table className="w-full min-w-[1300px] border-collapse">
          <thead className="border-b border-pf-border">
            <tr>
              <th className={TH}>Store</th>
              <th className={TH}>Page đang dùng</th>
              <th className={TH}>Cài app</th>
              <th className={TH}>Dùng app</th>
              <th className={TH}>Plan PageFly</th>
              <th className={TH}>Shopify plan</th>
              <th className={TH}>Quốc gia</th>
              <th className={TH}>Page trong store</th>
              <th className={TH}>App</th>
              <th className={TH}>Chọn gần nhất</th>
              <th className={TH}>Upsell</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pf-border">
            {s.rows.map((r) => (
              <tr key={r.store_domain}>
                <td className={TD}>
                  <Link href={`${BASE}?tab=all&q=${encodeURIComponent(r.store_domain)}`} className="font-semibold text-pf-text hover:text-pf-primary-hi">
                    {r.store_name || r.store_domain}
                  </Link>
                  <p className="text-[11.5px] text-pf-faint">{r.store_domain}</p>
                  <p className="text-[11.5px] text-pf-muted">{r.email ?? "—"}</p>
                  {r.phone && <p className="text-[11.5px] text-pf-faint">{r.phone}</p>}
                </td>
                <td className={TD}>
                  <span className="font-semibold text-pf-text">{r.page_count}</span>
                  <ul className="text-[11.5px] text-pf-muted">
                    {r.pages_used.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </td>
                <td className={TD}>{fmtVN(r.installed_at, true).split(" ")[1] ?? "—"}</td>
                <td className={TD}>{r.days_on_app === null ? "—" : `${r.days_on_app} ngày`}</td>
                <td className={TD}>
                  {r.pf_plan ?? "—"}
                  <p className="text-[11.5px] text-pf-faint">{r.pf_price !== null ? money(r.pf_price) : ""}</p>
                </td>
                <td className={TD}>
                  {r.shopify_plan ?? "—"}
                  {r.is_dev_store ? <p className="text-[11.5px] text-pf-faint">dev store</p> : null}
                </td>
                <td className={TD}>
                  {r.country ?? "—"}
                  <p className="text-[11.5px] text-pf-faint">{r.city ?? ""}</p>
                </td>
                <td className={TD}>
                  {r.pages ?? "—"}
                  <p className="text-[11.5px] text-pf-faint">{r.published ?? "—"} publish</p>
                </td>
                <td className={TD}>
                  <span className={r.app_status === "uninstalled" ? "text-pf-danger" : ""}>{r.app_status ?? "—"}</span>
                </td>
                <td className={TD}>{fmtVN(r.last_selected_at, true)}</td>
                <td className={TD}>{SSU_STATUS_LABEL[r.status] ?? r.status}</td>
              </tr>
            ))}
            {s.rows.length === 0 && (
              <tr>
                <td className={`${TD} text-center text-pf-muted`} colSpan={11}>
                  Chưa có store nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
