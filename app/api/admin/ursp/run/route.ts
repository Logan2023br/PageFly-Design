import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminName, readAdminSection } from "@/lib/session";
import { runJob } from "@/lib/ursp/core";
import { runState, setRunning } from "@/lib/ursp/settings";

/* POST /api/admin/ursp/run — {action: "start"} Bắt đầu, {action: "pause"}
   Tạm dừng, {action: "run"} Cập nhật ngay: read Recap and AC2 now, send,
   track (only while running). */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await readAdminSection("ursp"))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    const { action } = await readJson(req);
    const by = `admin:${(await readAdminName()) ?? "admin"}`;
    if (action === "start" || action === "pause") {
      const run = await setRunning(action === "start", by);
      /* started: the first read right away (it finds where the sheet ends) */
      if (run.on) void runJob(true).catch((err) => console.error("[ursp] start run", err));
      return json({ ok: true, run });
    }
    if (action === "run") {
      if (!(await runState()).on) return json({ ok: false, error: "Đang tạm dừng — bấm Bắt đầu trước." }, 409);
      return json({ ok: true, job: await runJob(true) });
    }
    return json({ ok: false, error: "action: start, pause hoặc run." }, 400);
  } catch (err) {
    return fail(err);
  }
}
