"use client";

import Link from "next/link";
import { Icon } from "../../ui";
import { useFolded } from "../collections/shared";

/* ==========================================================================
   Thống kê nhanh — above the filters on every list tab: of the leads whose
   pages went out, how many viewed, downloaded, read, replied, got WhatsApp.
   Each number opens Theo dõi tất cả filtered to those leads. The arrow on the
   right folds it away; the choice is remembered in this browser.
   ========================================================================== */

export type ActivityItem = { key: string; label: string; n: number };

export function ActivityBar({ sent, items }: { sent: number; items: ActivityItem[] }) {
  const [folded, toggle] = useFolded("bpu-activity");
  const open = !folded;
  const pct = (n: number) => (sent ? `${Math.round((n / sent) * 100)}%` : "—");

  return (
    <section className="rounded-pf-card border border-pf-border bg-pf-card">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="text-[13px] font-semibold text-pf-text">Thống kê nhanh</span>
        <span className="text-[12px] text-pf-muted">
          {sent} lead đã gửi page
          {!open && items.length > 0 && <> · {items.slice(0, 3).map((i) => `${i.label} ${i.n}`).join(" · ")}</>}
        </span>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} className="ml-auto text-pf-muted" />
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2 border-t border-pf-border p-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          {items.map((i) => (
            <Link
              key={i.key}
              href={`/design/admin/upsell?tab=tracking&act=${i.key}`}
              className="grid gap-0.5 rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 transition-colors hover:border-pf-primary"
            >
              <span className="text-[11.5px] text-pf-faint">{i.label}</span>
              <span className="text-[20px] font-semibold leading-tight text-pf-text">{i.n}</span>
              <span className="text-[11px] text-pf-muted">{pct(i.n)} lead đã gửi</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
