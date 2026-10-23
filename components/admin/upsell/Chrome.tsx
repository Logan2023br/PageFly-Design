import Link from "next/link";
import { LEAD_ACTIVITY, type Filters } from "@/lib/upsell/adminQueries";

/* A copy of FIELD from collections/shared, not an import: that module is
   "use client", and a server component importing a plain string from it
   gets a client reference instead of the string — the inputs rendered
   unstyled. */
const FIELD =
  "rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[13px] text-pf-text outline-none transition-colors placeholder:text-pf-faint focus:border-pf-primary-hi";

/* Server-rendered navigation for the Upsell screen: tabs, filters, pages.
   Plain links and a GET form — the state lives in the URL, so a filtered
   view can be bookmarked or pasted into Slack. */

export const TABS = [
  { id: "pages", label: "Chờ duyệt page" },
  { id: "messages", label: "Tin chờ duyệt" },
  { id: "waiting", label: "Chờ gửi" },
  { id: "failed", label: "Lỗi gửi" },
  { id: "auto", label: "Tin tự động" },
  { id: "tracking", label: "Theo dõi tất cả" },
  { id: "upgraded", label: "Đã nâng cấp" },
  { id: "queue", label: "Hàng đợi build" },
  { id: "control", label: "Đối chứng" },
  { id: "closed", label: "Từ chối / Lỗi / Bỏ qua" },
  { id: "installs", label: "Store mới cài" },
  { id: "stats", label: "Thống kê" },
  { id: "criteria", label: "Tiêu chí lead" },
  { id: "settings", label: "Cài đặt" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

/** Tabs whose count is work waiting — drawn amber; something broken — red. */
const URGENT = new Set(["pages", "messages"]);
const BROKEN = new Set(["failed"]);

export function TabNav({ tab, counts }: { tab: TabId; counts: Record<string, number> }) {
  return (
    <nav aria-label="Upsell" className="flex flex-wrap gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
      {TABS.map((t) => {
        const n = counts[t.id];
        const active = t.id === tab;
        return (
          <Link
            key={t.id}
            href={`/design/admin/upsell?tab=${t.id}`}
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

/** Tabs whose leads have been sent pages, so "đã tải / đã xem" means something. */
const ACTIVITY_TABS = new Set<string>(["tracking", "upgraded", "closed", "stats"]);

export function FilterBar({ tab, f, pics, categories }: { tab: TabId; f: Filters; pics: string[]; categories: string[] }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="tab" value={tab} />
      <input name="q" defaultValue={f.q} placeholder="Domain, tên, email…" className={`${FIELD} w-[220px]`} aria-label="Tìm" />
      <label className="grid gap-0.5 text-[11px] text-pf-faint">
        Từ
        <input type="date" name="from" defaultValue={f.from} className={`${FIELD} w-[150px]`} />
      </label>
      <label className="grid gap-0.5 text-[11px] text-pf-faint">
        Đến
        <input type="date" name="to" defaultValue={f.to} className={`${FIELD} w-[150px]`} />
      </label>
      {tab !== "installs" && (
        <select name="pic" defaultValue={f.pic ?? ""} className={`${FIELD} w-[130px]`} aria-label="PIC">
          <option value="">Mọi PIC</option>
          {pics.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      )}
      <input name="cat" list="upsell-cats" defaultValue={f.cat} placeholder="Ngành hàng" className={`${FIELD} w-[160px]`} aria-label="Ngành hàng" />
      <datalist id="upsell-cats">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {ACTIVITY_TABS.has(tab) && (
        <select name="act" defaultValue={f.act ?? ""} className={`${FIELD} w-[170px]`} aria-label="Khách đã làm gì">
          <option value="">Mọi hoạt động</option>
          {Object.entries(LEAD_ACTIVITY).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      )}
      <input name="min_score" type="number" defaultValue={f.min_score} placeholder="Điểm ≥" className={`${FIELD} w-[96px]`} aria-label="Điểm tối thiểu" />
      <button type="submit" className="h-[38px] rounded-pf-md bg-pf-primary px-4 text-[13px] font-semibold text-white hover:bg-pf-primary-hi">
        Lọc
      </button>
      <Link href={`/design/admin/upsell?tab=${tab}`} className="h-[38px] px-2 py-2 text-[12.5px] text-pf-faint hover:text-pf-text">
        Xoá lọc
      </Link>
    </form>
  );
}

export function Pager({ tab, f, page, pages, total }: { tab: TabId; f: Filters; page: number; pages: number; total: number }) {
  const href = (p: number) => {
    const sp = new URLSearchParams({ tab });
    for (const [k, v] of Object.entries(f)) if (v && k !== "page") sp.set(k, String(v));
    sp.set("page", String(p));
    return `/design/admin/upsell?${sp}`;
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
