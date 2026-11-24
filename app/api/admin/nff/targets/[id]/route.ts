import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminName, readAdminSection } from "@/lib/session";
import { targetAction, type TargetAction } from "@/lib/nff/core";

/* POST /api/admin/nff/targets/{id} — {action, text?}: approve (Duyệt & gửi,
   with the text as edited) / edit / skip / unskip / retry / track. */
export const dynamic = "force-dynamic";

const ACTIONS: TargetAction[] = ["approve", "edit", "skip", "unskip", "retry", "track"];

export async function POST(req: Request, ctx: RouteContext<"/api/admin/nff/targets/[id]">) {
  if (!(await readAdminSection("nff"))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const action = body.action as TargetAction;
    if (!ACTIONS.includes(action)) return json({ ok: false, error: `action: ${ACTIONS.join(", ")}.` }, 400);
    await targetAction(id, action, (await readAdminName()) ?? "admin", typeof body.text === "string" ? body.text : undefined);
    return json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
