import { adminActor, fail, json, readJson, requireAdmin } from "@/lib/upsell/api";
import { ROUTINES, fireRoutine, saveTriggerToken, setApprovalMode, type RoutineId } from "@/lib/upsell/routines";
import { UpsellError } from "@/lib/upsell/types";

/* POST /api/admin/upsell/routines
     { routine: "builder" | "ops", action: "token", token }  — save (empty clears)
     { routine: "builder" | "ops", action: "fire" }          — "Gọi ngay"
     { routine: "ops", action: "fire_full" }                 — "Chạy đầy đủ"
     { action: "approval", mode: "review" | "auto" }         — Duyệt / Không duyệt
   The token is never sent back: the screen only learns whether one is set. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const b = await readJson(req);
    if (b.action === "approval") {
      if (b.mode !== "review" && b.mode !== "auto") throw new UpsellError("mode must be review or auto.", 422);
      await setApprovalMode(b.mode);
      return json({ ok: true });
    }
    const r = String(b.routine ?? "") as RoutineId;
    if (!Object.hasOwn(ROUTINES, r)) throw new UpsellError("routine must be builder or ops.", 422);
    if (b.action === "token") {
      await saveTriggerToken(r, String(b.token ?? ""));
      return json({ ok: true });
    }
    if (b.action === "fire" || (b.action === "fire_full" && r === "ops")) {
      const full = b.action === "fire_full";
      const reason = full ? "admin bấm Chạy đầy đủ" : r === "ops" ? "admin bấm Gửi tin ngay" : "admin bấm Gọi ngay";
      const s = await fireRoutine(r, `${reason} · ${(await adminActor()).replace(/^admin:/, "")}`, true, full);
      return json({ ok: s.ok, state: s, ...(s.ok ? {} : { error: s.result }) }, s.ok ? 200 : 502);
    }
    throw new UpsellError("action must be token, fire, fire_full or approval.", 422);
  } catch (err) {
    return fail(err);
  }
}
