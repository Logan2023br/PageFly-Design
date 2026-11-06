import Link from "next/link";
import type { ReportUpsell } from "@/lib/reports/defs";
import { Icon } from "../../ui";

/** "Báo cáo tuần" in an upsell screen's header: its weekly reports. */
export function ReportsLink({ upsell }: { upsell: ReportUpsell }) {
  return (
    <Link
      href={`/design/admin/reports/${upsell}`}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pf-md border border-pf-border px-3 text-[12.5px] font-semibold text-pf-body transition-colors hover:border-pf-border-hi hover:bg-pf-card"
    >
      <Icon name="FileText" size={14} />
      Báo cáo tuần
    </Link>
  );
}
