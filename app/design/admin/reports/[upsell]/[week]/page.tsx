import Link from "next/link";
import { notFound } from "next/navigation";
import { adminGate } from "@/components/admin/adminGate";
import { PrintButton, RegenerateButton } from "@/components/admin/reports/ReportActions";
import { ReportView } from "@/components/admin/reports/ReportView";
import { REPORTS, isReportUpsell, isWeek, weekIsOver, weekOf } from "@/lib/reports/defs";
import { getReport, liveReport } from "@/lib/reports/store";
import { hasUpsellDatabase } from "@/lib/upsell/db";

/* /design/admin/reports/{upsell}/{week} — one week's report as a document:
   the saved one, or worked out now (this week so far, or a week no one has
   saved yet). Tải PDF prints it; the page title is the PDF's file name. */

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/design/admin/reports/[upsell]/[week]">) {
  const { upsell, week } = await props.params;
  const label = isReportUpsell(upsell) ? REPORTS[upsell].label : "Upsell";
  return { title: `Bao cao ${label} - tuan ${week}` };
}

export default async function ReportPage(props: PageProps<"/design/admin/reports/[upsell]/[week]">) {
  const { upsell, week } = await props.params;
  if (!isReportUpsell(upsell) || !isWeek(week) || !hasUpsellDatabase()) notFound();
  const gate = await adminGate(REPORTS[upsell].section);
  if (gate) return gate;
  if (week > weekOf()) notFound();

  const saved = await getReport(upsell, week);
  const report = saved ?? (await liveReport(upsell, week));
  const finished = weekIsOver(week);

  return (
    <div className="rp-shell min-h-screen bg-pf-bg-deep px-4 py-6 sm:px-6">
      <div className="rp-noprint mx-auto mb-4 flex max-w-[900px] flex-wrap items-center justify-between gap-3">
        <Link href={`/design/admin/reports/${upsell}`} className="text-[13px] text-pf-muted hover:text-pf-text">
          ← Tất cả báo cáo tuần
        </Link>
        <div className="flex flex-wrap items-start gap-2">
          {finished && <RegenerateButton upsell={upsell} week={week} label={saved ? "Tạo lại" : "Lưu báo cáo"} />}
          <PrintButton />
        </div>
      </div>
      <ReportView report={report} />
    </div>
  );
}
