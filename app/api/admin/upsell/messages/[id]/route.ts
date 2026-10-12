import { adminActor, fail, json, readJson, requireAdmin } from "@/lib/upsell/api";
import { approveMessage, rejectMessage, sendNow, unapproveMessage } from "@/lib/upsell/messages";
import { UpsellError } from "@/lib/upsell/types";

/* POST /api/admin/upsell/messages/:id  { action: approve|reject|unapprove|send_now, content?, send_mode? } */
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/upsell/messages/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const b = await readJson(req);
    const actor = await adminActor();
    switch (b.action) {
      case "approve":
        await approveMessage(id, { content: typeof b.content === "string" ? b.content : null, send_mode: b.send_mode === "now" ? "now" : "window" }, actor);
        break;
      case "reject":
        await rejectMessage(id, actor);
        break;
      case "unapprove":
        await unapproveMessage(id, actor);
        break;
      case "send_now":
        await sendNow(id, actor);
        break;
      default:
        throw new UpsellError("Unknown action.");
    }
    return json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
