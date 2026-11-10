import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminName, readAdminSection } from "@/lib/session";
import { releaseHeldB, runJob, runSend, startRecapBackfill, startSegmentCleanup } from "@/lib/ursp/core";
import { runState, setRunning } from "@/lib/ursp/settings";

/* POST /api/admin/ursp/run — {action: "start"} Bắt đầu, {action: "pause"}
   Tạm dừng, {action: "run"} Cập nhật ngay: read Recap and AC2 now, send,
   track (only while running). {action: "backfill", from: "YYYY-MM-DD"}:
   the Recap rows already in the sheet since that day, in the background.
   {action: "release_b"}: the stores held for the A/B test's B get the B message. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await readAdminSection("ursp"))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    const { action, from, split } = await readJson(req);
    const by = `admin:${(await readAdminName()) ?? "admin"}`;
    if (action === "start" || action === "pause") {
      const run = await setRunning(action === "start", by);
      /* started: the first read right away (it finds where the sheet ends) */
      if (run.on) void runJob(true).catch((err) => console.error("[ursp] start run", err));
      return json({ ok: true, run });
    }
    if (action === "segment_cleanup") return json({ ok: true, cleanup: await startSegmentCleanup(by) });
    if (action === "release_b") return json({ ok: true, released: await releaseHeldB(by) });
    if (action === "backfill") return json({ ok: true, backfill: await startRecapBackfill(String(from ?? ""), by, split === true) });
    if (action === "run") {
      if (!(await runState()).on) return json({ ok: false, error: "Đang tạm dừng — bấm Bắt đầu trước." }, 409);
      /* the send on its own too: a job already busy tracking would not send */
      const [job, send] = await Promise.all([runJob(true), runSend()]);
      return json({ ok: true, job, send });
    }
    return json({ ok: false, error: "action: start, pause hoặc run." }, 400);
  } catch (err) {
    return fail(err);
  }
}
