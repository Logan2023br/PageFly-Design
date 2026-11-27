import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminName, readAdminSection } from "@/lib/session";
import { approveAll, recompose, retryAllFailed, runJob } from "@/lib/nff/core";

/* POST /api/admin/nff/run — {action: "run"} Cập nhật ngay (collect, send what
   was approved, track), {action: "approve_all"} Duyệt & gửi tất cả,
   {action: "retry_failed"} Gửi lại tất cả tin lỗi,
   {action: "recompose"} write the Chờ duyệt messages again from the template,
   {action: "import_sheet", url} Nhập từ Google Sheet: its stores onto Chờ duyệt. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await readAdminSection("nff"))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    const body = await readJson(req);
    const { action } = body;
    const by = (await readAdminName()) ?? "admin";
    if (action === "run") return json({ ok: true, job: await runJob(true) });
    if (action === "approve_all") return json({ ok: true, approved: await approveAll(by) });
    if (action === "retry_failed") return json({ ok: true, retried: await retryAllFailed(by) });
    if (action === "recompose") return json({ ok: true, rewritten: await recompose() });
    if (action === "import_sheet") {
      const { importSheet } = await import("@/lib/nff/importSheet");
      return json({ ok: true, imported: await importSheet(String(body.url ?? ""), by) });
    }
    return json({ ok: false, error: "action: run, approve_all, retry_failed, recompose hoặc import_sheet." }, 400);
  } catch (err) {
    return fail(err);
  }
}
