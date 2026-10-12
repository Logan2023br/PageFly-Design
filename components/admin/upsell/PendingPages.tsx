"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtVN } from "@/lib/upsell/format";
import type { LeadListRow } from "@/lib/upsell/leads";
import { PAGE_LABELS, type PageType } from "@/lib/upsell/types";
import { Button, Icon } from "../../ui";
import { ErrorLine, PageThumb, Pill, useAct } from "./bits";

/* Tab 1 — leads whose two pages wait for an admin. A card per lead, the two
   pages side by side; tick several and approve them together. A bulk
   approval sends the template message as it stands, so the button says so. */

const label = (t: string | null) => PAGE_LABELS[t as PageType] ?? t ?? "—";

export function PendingPages({ leads }: { leads: LeadListRow[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [run, busy, error] = useAct();
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (leads.length === 0) return <Empty text="Không có page nào chờ duyệt." />;

  const bulk = async (mode: "window" | "now") => {
    const ok = await run("/api/admin/upsell/bulk", { kind: "leads", ids: [...picked], send_mode: mode });
    if (ok) setPicked(new Set());
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12.5px] text-pf-muted">
          <input
            type="checkbox"
            checked={picked.size === leads.length}
            onChange={(e) => setPicked(e.target.checked ? new Set(leads.map((l) => l.lead_id)) : new Set())}
          />
          Chọn tất cả
        </label>
        {picked.size > 0 && (
          <>
            <Button size="sm" icon="Check" disabled={busy} onClick={() => bulk("window")}>
              Duyệt {picked.size} lead · gửi trong giờ của khách
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => bulk("now")}>
              Duyệt & gửi ngay
            </Button>
            <span className="text-[12px] text-pf-faint">Dùng tin nhắn mẫu, không sửa.</span>
          </>
        )}
        <ErrorLine error={error} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {leads.map((l) => (
          <article key={l.lead_id} className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4 shadow-pf-card">
            <header className="flex items-start gap-3">
              <input type="checkbox" className="mt-1.5" checked={picked.has(l.lead_id)} onChange={() => toggle(l.lead_id)} aria-label={`Chọn ${l.store_domain}`} />
              <div className="min-w-0 flex-1">
                <Link href={`/design/admin/upsell/leads/${l.lead_id}`} className="font-display text-[16px] font-bold text-pf-text hover:text-pf-primary-hi">
                  {l.store_name || l.store_domain}
                </Link>
                <p className="truncate text-[12px] text-pf-faint">{l.store_domain}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Pill tone="primary">Điểm {l.lead_score ?? "—"}</Pill>
                  {l.country && <Pill>{l.country}</Pill>}
                  {l.shopify_plan && <Pill>{l.shopify_plan}</Pill>}
                  {l.category_hint && <Pill>{l.category_hint.split(",")[0]}</Pill>}
                  {l.rebuild_count > 0 && <Pill tone="warn">Rebuild {l.rebuild_count}×</Pill>}
                  {l.priority === "high" && <Pill tone="bad">Ưu tiên</Pill>}
                </div>
              </div>
              <div className="text-right text-[11.5px] text-pf-faint">
                Build {fmtVN(l.built_at)}
                <br />
                {l.pic}
              </div>
            </header>
            {l.design_id && (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2].map((slot) => (
                  <div key={slot} className="grid gap-1">
                    <PageThumb designId={l.design_id!} slot={slot} label={label(slot === 1 ? l.page1_type : l.page2_type)} />
                    <span className="text-[12px] font-semibold text-pf-body">{label(slot === 1 ? l.page1_type : l.page2_type)}</span>
                  </div>
                ))}
              </div>
            )}
            {l.build_note && (
              <p className="rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2 text-[12.5px] text-pf-muted">
                <span className="font-semibold text-pf-body">Claude: </span>
                {l.build_note}
              </p>
            )}
            <Link
              href={`/design/admin/upsell/leads/${l.lead_id}`}
              className="inline-flex items-center gap-1.5 justify-self-start text-[13px] font-semibold text-pf-primary-hi hover:text-pf-text"
            >
              Xem & duyệt <Icon name="ArrowRight" size={14} />
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-pf-card border border-dashed border-pf-border px-4 py-10 text-center text-[13px] text-pf-faint">{text}</p>;
}
