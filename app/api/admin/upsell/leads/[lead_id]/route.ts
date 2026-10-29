import { adminActor, fail, json, readJson, requireAdmin } from "@/lib/upsell/api";
import { createCustomMessage } from "@/lib/upsell/messages";
import { approveLead, rejectLead, requestRebuild, requeueLead, setLeadMeta, setReplyChecked, setSubmitState, setWhatsappSent, setWhatsappState } from "@/lib/upsell/review";
import { UpsellError } from "@/lib/upsell/types";

/* ==========================================================================
   POST /api/admin/upsell/leads/:lead_id   { action, … }

   approve  { content?, send_mode: window|now, note? }
   rebuild  { note, page_types? }
   reject   { reason }
   requeue  {}
   meta     { pic?, priority?, note?, internal_notes? }
   message  { content }   — a custom message, drafted for approval
   reply_check { checked: bool } — "Đã kiểm tra" on the customer's reply
   submit   { state: submitted|not_submitted|none } — "Đã submit" / "Chưa
            submit" on an upgraded lead / back to undecided
   whatsapp { state: sent|skipped|none } — "Đã gửi WhatsApp" / "Không dùng
            WhatsApp" / back to undecided  (older { sent: bool } still read)
   ========================================================================== */
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/upsell/leads/[lead_id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { lead_id } = await ctx.params;
  try {
    const b = await readJson(req);
    const actor = await adminActor();
    const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : null);
    switch (b.action) {
      case "approve":
        return json({ ok: true, ...(await approveLead(lead_id, { content: s("content"), send_mode: b.send_mode === "now" ? "now" : "window", note: s("note") }, actor)) });
      case "rebuild":
        await requestRebuild(lead_id, { note: s("note") ?? "", page_types: Array.isArray(b.page_types) ? b.page_types.map(String) : null }, actor);
        return json({ ok: true });
      case "reject":
        await rejectLead(lead_id, s("reason") ?? "", actor);
        return json({ ok: true });
      case "requeue":
        await requeueLead(lead_id, actor);
        return json({ ok: true });
      case "meta":
        await setLeadMeta(
          lead_id,
          {
            ...("pic" in b ? { pic: s("pic") } : {}),
            ...(b.priority === "high" || b.priority === "normal" ? { priority: b.priority } : {}),
            ...("internal_notes" in b ? { internal_notes: s("internal_notes") } : {}),
            note: s("note"),
          },
          actor,
        );
        return json({ ok: true });
      case "whatsapp":
        if (b.state === "sent" || b.state === "skipped" || b.state === "none") await setWhatsappState(lead_id, b.state, actor);
        else await setWhatsappSent(lead_id, b.sent === true, actor);
        return json({ ok: true });
      case "reply_check":
        await setReplyChecked(lead_id, b.checked !== false, actor);
        return json({ ok: true });
      case "submit":
        if (b.state !== "submitted" && b.state !== "not_submitted" && b.state !== "none") throw new UpsellError("state must be submitted, not_submitted or none.", 422);
        await setSubmitState(lead_id, b.state, actor);
        return json({ ok: true });
      case "message":
        return json({ ok: true, id: await createCustomMessage(lead_id, s("content") ?? "", actor) });
      default:
        throw new UpsellError("Unknown action.");
    }
  } catch (err) {
    return fail(err);
  }
}
