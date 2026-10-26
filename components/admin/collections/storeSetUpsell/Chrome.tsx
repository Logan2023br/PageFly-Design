import Link from "next/link";
import { fmtVN } from "@/lib/upsell/format";
import { SSU_TABS, type SsuFilters, type SsuTabId } from "@/lib/storeSetUpsell/queries";
import { SSU_STATUSES, SSU_STATUS_LABEL, type SsuSelection } from "@/lib/storeSetUpsell/types";

/* Server-rendered navigation for the Store set upsell screen: tabs, filters,
   pages, and the per-minute feed. Links and a GET form — the state is in the
   URL, so a filtered view can be bookmarked or pasted. */

export const BASE = "/design/admin/collections/upsell";

/* A copy of FIELD from collections/shared: that module is "use client", and a
   server component importing a string from it gets a client reference. */
const FIELD =
  "rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi";

const URGENT = new Set(["pending", "needs_check"]);
const BROKEN = new Set(["failed"]);

export function TabNav({ tab, counts }: { tab: SsuTabId; counts: Record<string, number> }) {
  return (
    <nav aria-label="Store set upsell" className="flex flex-wrap gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
      {SSU_TABS.map((t) => {
        const n = counts[t.id];
        const active = t.id === tab;
        return (
          <Link
            key={t.id}
            href={`${BASE}?tab=${t.id}`}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              active ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
            }`}
          >
            {t.label}
            {n !== undefined && (n > 0 || URGENT.has(t.id)) && (
              <span
                className={`rounded-pf-pill px-1.5 text-[11px] ${
                  BROKEN.has(t.id) && n > 0
                    ? "bg-pf-danger text-white"
                    : active
                      ? "bg-white/20"
                      : URGENT.has(t.id) && n > 0
                        ? "bg-pf-warn/20 text-pf-warn"
                        : "bg-pf-card-hi text-pf-faint"
                }`}
              >
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function FilterBar({ tab, f, sets }: { tab: SsuTabId; f: SsuFilters; sets: string[] }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="tab" value={tab} />
      <input name="q" defaultValue={f.q} placeholder="Domain, tên, email, phone…" className={`${FIELD} w-[230px]`} aria-label="Tìm" />
      <select name="set" defaultValue={f.set ?? ""} className={`${FIELD} w-[170px]`} aria-label="Store set">
        <option value="">Mọi store set</option>
        {sets.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="grid gap-0.5 text-[11px] text-pf-faint">
        Chọn từ
        <input type="date" name="from" defaultValue={f.from} className={`${FIELD} w-[150px]`} />
      </label>
      <label className="grid gap-0.5 text-[11px] text-pf-faint">
        Đến
        <input type="date" name="to" defaultValue={f.to} className={`${FIELD} w-[150px]`} />
      </label>
      {tab !== "feed" && (
        <>
          <select name="app" defaultValue={f.app ?? ""} className={`${FIELD} w-[150px]`} aria-label="Trạng thái app">
            <option value="">App: mọi trạng thái</option>
            <option value="installed">Đang cài</option>
            <option value="uninstalled">Đã gỡ</option>
          </select>
          <select name="status" defaultValue={f.status ?? ""} className={`${FIELD} w-[160px]`} aria-label="Trạng thái upsell">
            <option value="">Upsell: mọi trạng thái</option>
            {SSU_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SSU_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </>
      )}
      <button type="submit" className="h-[38px] rounded-pf-md bg-pf-primary px-4 text-[13px] font-semibold text-white hover:bg-pf-primary-hi">
        Lọc
      </button>
      <Link href={`${BASE}?tab=${tab}`} className="h-[38px] px-2 py-2 text-[12.5px] text-pf-faint hover:text-pf-text">
        Xoá lọc
      </Link>
    </form>
  );
}

export function Pager({ tab, f, page, pages, total }: { tab: SsuTabId; f: SsuFilters; page: number; pages: number; total: number }) {
  const href = (p: number) => {
    const sp = new URLSearchParams({ tab });
    for (const [k, v] of Object.entries(f)) if (v && k !== "page") sp.set(k, String(v));
    sp.set("page", String(p));
    return `${BASE}?${sp}`;
  };
  return (
    <div className="flex items-center justify-between text-[12.5px] text-pf-muted">
      <span>{total} kết quả</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 && (
            <Link className="rounded-pf-md border border-pf-border px-3 py-1 hover:text-pf-text" href={href(page - 1)}>
              ← Trước
            </Link>
          )}
          <span>
            Trang {page}/{pages}
          </span>
          {page < pages && (
            <Link className="rounded-pf-md border border-pf-border px-3 py-1 hover:text-pf-text" href={href(page + 1)}>
              Sau →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** The selects, grouped by the minute they happened in (Vietnam time). */
export function SelectionFeed({ rows }: { rows: (SsuSelection & { store_name: string | null; status: string | null })[] }) {
  if (rows.length === 0) {
    return <p className="rounded-pf-card border border-pf-border bg-pf-card p-6 text-center text-[13px] text-pf-muted">Chưa có lượt chọn nào.</p>;
  }
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = fmtVN(r.event_time, true);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <div className="grid gap-3">
      {[...groups.entries()].map(([minute, list]) => (
        <section key={minute} className="rounded-pf-card border border-pf-border bg-pf-card">
          <h3 className="flex items-center justify-between border-b border-pf-border px-4 py-2 text-[12.5px] font-semibold text-pf-text">
            <span>{minute}</span>
            <span className="text-pf-faint">{list.length} lượt</span>
          </h3>
          <ul className="divide-y divide-pf-border">
            {list.map((r) => (
              <li key={r.id} className="grid gap-1 px-4 py-2 text-[12.5px] md:grid-cols-[1.4fr_1fr_1.2fr_1fr]">
                <div className="min-w-0">
                  {r.store_domain ? (
                    <Link href={`${BASE}?tab=all&q=${encodeURIComponent(r.store_domain)}`} className="font-semibold text-pf-text hover:text-pf-primary-hi">
                      {r.store_name || r.store_domain}
                    </Link>
                  ) : (
                    <span className="text-pf-faint">(không có domain)</span>
                  )}
                  <p className="truncate text-[11.5px] text-pf-faint">
                    {r.store_domain} {r.email ? `· ${r.email}` : ""}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-pf-primary-hi">{r.store_set}</span>
                  <p className="text-[11.5px] text-pf-faint">
                    {r.page_type ?? "—"} · {r.template_id ?? ""}
                  </p>
                </div>
                <div className="text-[11.5px] text-pf-muted">
                  {[r.country, r.region, r.city].filter(Boolean).join(", ") || "—"}
                  <p className="text-pf-faint">
                    {[r.browser, r.os].filter(Boolean).join(" · ")} {r.source ? `· ${r.source}` : ""}
                  </p>
                </div>
                <div className="text-[11.5px] text-pf-muted">
                  {r.min_plan ? `Plan tối thiểu ${r.min_plan}` : ""} {r.is_locked ? "· khoá" : ""} {r.is_dev_store ? "· dev store" : ""}
                  <p className="text-pf-faint">{r.status ? SSU_STATUS_LABEL[r.status as keyof typeof SSU_STATUS_LABEL] ?? r.status : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
