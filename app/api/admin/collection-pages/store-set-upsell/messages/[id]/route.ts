import { guard } from "../../../shared";
import { adminActor, fail, json, readJson } from "@/lib/upsell/api";
import { messageAction } from "@/lib/storeSetUpsell/actions";

/* POST …/store-set-upsell/messages/:id  { action: approve | approve_later | reject, content? }
   approve sends on Crisp at once; approve_later leaves it for the minute job. */
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/collection-pages/store-set-upsell/messages/[id]">) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const b = await readJson(req);
    await messageAction(id, String(b.action ?? ""), typeof b.content === "string" ? b.content : null, await adminActor());
    return json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
