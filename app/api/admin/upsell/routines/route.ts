import { adminActor, fail, json, readJson, requireAdmin } from "@/lib/upsell/api";
import { ROUTINES, fireRoutine, saveTriggerToken, type RoutineId } from "@/lib/upsell/routines";
import { UpsellError } from "@/lib/upsell/types";

/* POST /api/admin/upsell/routines
     { routine: "builder" | "ops", action: "token", token }  — save (empty clears)
     { routine: "builder" | "ops", action: "fire" }          — "Gọi ngay"
   The token is never sent back: the screen only learns whether one is set. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const b = await readJson(req);
    const r = String(b.routine ?? "") as RoutineId;
    if (!Object.hasOwn(ROUTINES, r)) throw new UpsellError("routine must be builder or ops.", 422);
    if (b.action === "token") {
      await saveTriggerToken(r, String(b.token ?? ""));
      return json({ ok: true });
    }
    if (b.action === "fire") {
      const reason = r === "ops" ? "admin bấm Gọi ngay (gửi tin)" : "admin bấm Gọi ngay";
      const s = await fireRoutine(r, `${reason} · ${(await adminActor()).replace(/^admin:/, "")}`, true);
      return json({ ok: s.ok, state: s, ...(s.ok ? {} : { error: s.result }) }, s.ok ? 200 : 502);
    }
    throw new UpsellError("action must be token or fire.", 422);
  } catch (err) {
    return fail(err);
  }
}
