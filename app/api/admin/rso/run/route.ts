import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminName, readAdminSection } from "@/lib/session";
import { runJob, runSend } from "@/lib/rso/core";
import { runState, setRunning } from "@/lib/rso/settings";

/* POST /api/admin/rso/run — {action: "start"} Bắt đầu, {action: "pause"}
   Tạm dừng, {action: "run"} Cập nhật ngay: scan the Radar, track, check and
   send now (only while running). */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await readAdminSection("rso"))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    const { action } = await readJson(req);
    const by = `admin:${(await readAdminName()) ?? "admin"}`;
    if (action === "start" || action === "pause") {
      const run = await setRunning(action === "start", by);
      if (run.on) void runJob(true).catch((err) => console.error("[rso] start run", err));
      return json({ ok: true, run });
    }
    if (action === "run") {
      if (!(await runState()).on) return json({ ok: false, error: "Đang tạm dừng — bấm Bắt đầu trước." }, 409);
      const [job, send] = await Promise.all([runJob(true), runSend()]);
      return json({ ok: true, job, send });
    }
    return json({ ok: false, error: "action: start, pause hoặc run." }, 400);
  } catch (err) {
    return fail(err);
  }
}
