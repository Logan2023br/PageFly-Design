"use client";

import Link from "next/link";
import { fmtVN } from "@/lib/upsell/format";
import type { InstallRow } from "@/lib/upsell/types";
import { Button } from "../../ui";
import { ErrorLine, Pill, PhoneLine, useAct } from "./bits";
import { Empty } from "./PendingPages";

/* Tab 9 — every new install the script looked at, with its score and why it
   was or was not made a lead. A skipped one can be added by hand. */

export function InstallsTable({ rows }: { rows: (InstallRow & { lead_id: string | null })[] }) {
  if (rows.length === 0) return <Empty text="Chưa có store mới cài nào." />;
  return (
    <div className="overflow-x-auto rounded-pf-card border border-pf-border">
      <table className="w-full text-left text-[12.5px]">
        <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
          <tr>
            {["Store", "Cài lúc", "Plan", "Storefront", "SP", "Ngành hàng", "Điểm", "Kết quả", ""].map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.store_domain} className="border-t border-pf-border align-top">
              <td className="px-3 py-2.5">
                <div className="min-w-[180px] font-semibold text-pf-text">{i.store_name || "—"}</div>
                <div className="text-[11.5px] text-pf-faint">
                  {i.store_domain} · {i.country ?? "?"} · {i.email_type ?? ""}
                </div>
                <PhoneLine phone={i.phone} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">{fmtVN(i.installed_at)}</td>
              <td className="px-3 py-2.5">
                {i.shopify_plan ?? "—"}
                <div className="text-[11.5px] text-pf-faint">PF {i.pf_plan || "—"}</div>
              </td>
              <td className="px-3 py-2.5">{i.storefront ?? "—"}</td>
              <td className="px-3 py-2.5">{i.product_count ?? "—"}</td>
              <td className="px-3 py-2.5">
                <span className="line-clamp-2 max-w-[180px]">{i.category_hint ?? "—"}</span>
              </td>
              <td className="px-3 py-2.5">
                <span className="font-semibold">{i.lead_score ?? "—"}</span>
                <p className="line-clamp-3 max-w-[260px] text-[11px] text-pf-faint" title={i.score_reasons ?? ""}>
                  {i.score_reasons}
                </p>
              </td>
              <td className="px-3 py-2.5">
                {i.lead_id ? (
                  <Link href={`/design/admin/upsell/leads/${i.lead_id}`}>
                    <Pill tone="ok">Lead {i.lead_id}</Pill>
                  </Link>
                ) : (
                  <Pill tone="muted">{i.skip_reason || "Không phải lead"}</Pill>
                )}
                {i.rechecked && <div className="mt-1 text-[11px] text-pf-faint">đã kiểm lại</div>}
              </td>
              <td className="px-3 py-2.5">{!i.lead_id && <AddLead domain={i.store_domain} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddLead({ domain }: { domain: string }) {
  const [run, busy, error] = useAct();
  return (
    <div className="grid gap-1">
      <Button size="sm" variant="ghost" icon="UserPlus" disabled={busy} onClick={() => run("/api/admin/upsell/installs", { store_domain: domain })}>
        Thêm thành lead
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}
