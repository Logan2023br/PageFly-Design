import { adminActor, fail, json, readJson, requireAdmin } from "@/lib/upsell/api";
import { approveMessage } from "@/lib/upsell/messages";
import { approveLead } from "@/lib/upsell/review";
import { UpsellError } from "@/lib/upsell/types";

/* ==========================================================================
   POST /api/admin/upsell/bulk  { kind: leads|messages, ids: [...], send_mode }

   Approves each with its default content — the template for a lead, the
   draft as written for a message. One failure does not stop the rest; the
   answer lists which ones did not go through and why.
   ========================================================================== */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const b = await readJson(req);
    const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 200) : [];
    if (ids.length === 0) throw new UpsellError("Nothing selected.");
    const mode = b.send_mode === "now" ? "now" : "window";
    const actor = await adminActor();
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        if (b.kind === "leads") await approveLead(id, { send_mode: mode }, actor);
        else if (b.kind === "messages") await approveMessage(id, { send_mode: mode }, actor);
        else throw new UpsellError("kind must be leads or messages.");
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return json({ ok: true, approved: ids.length - failed.length, failed });
  } catch (err) {
    return fail(err);
  }
}
