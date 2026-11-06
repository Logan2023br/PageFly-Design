import { fail, json } from "@/lib/upsell/api";
import { readAdminName, readAdminSection } from "@/lib/session";
import { REPORTS, isReportUpsell, isWeek } from "@/lib/reports/defs";
import { saveReport } from "@/lib/reports/store";

/* POST /api/admin/reports/{upsell}/{week} — "Tạo lại" / "Lưu báo cáo": the
   finished week worked out again from today's data and saved over. */
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: RouteContext<"/api/admin/reports/[upsell]/[week]">) {
  const { upsell, week } = await ctx.params;
  if (!isReportUpsell(upsell) || !isWeek(week)) return json({ ok: false, error: "No such report." }, 404);
  if (!(await readAdminSection(REPORTS[upsell].section))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    const report = await saveReport(upsell, week, `admin:${(await readAdminName()) ?? "?"}`, true);
    if (!report) return json({ ok: false, error: "Tuần này chưa hết — chỉ xem tạm tính được." }, 409);
    return json({ ok: true, generated_at: report.generated_at });
  } catch (err) {
    return fail(err);
  }
}
