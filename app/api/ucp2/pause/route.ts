import { fail, json, requireKey } from "@/lib/upsell/api";
import { UpsellError } from "@/lib/upsell/types";
import { readAdminName, readAdminSection } from "@/lib/session";
import { setUcp2Pause, ucp2Pause } from "@/lib/ucp2/core";

/* ==========================================================================
   Upsell Collection Pages 2 — Tạm dừng gửi.

   PageFly Design does not send the invite: the flow that sends it on Crisp
   (and appends the row to the "User Testing" sheet) must ask here first and
   send nothing while paused.

   GET   X-API-Key (UPSELL_API_KEY) or an admin of this section
         → { paused: boolean, at, by }
   POST  an admin of this section: { action: "pause", paused: boolean }
   ========================================================================== */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("x-api-key")) {
    const denied = requireKey(req);
    if (denied) return denied;
  } else if (!(await readAdminSection("ucp2"))) return json({ error: "Invalid or missing X-API-Key." }, 401);
  try {
    const p = await ucp2Pause();
    return json({ ok: true, paused: !!p, at: p?.at ?? null, by: p?.by ?? null });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  if (!(await readAdminSection("ucp2"))) return json({ error: "Admin only." }, 401);
  try {
    const b = (await req.json().catch(() => null)) as { action?: unknown; paused?: unknown } | null;
    if (b?.action !== "pause" || typeof b.paused !== "boolean") throw new UpsellError('Body must be { "action": "pause", "paused": true | false }.', 422);
    await setUcp2Pause(b.paused, (await readAdminName()) ?? "admin");
    return json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
