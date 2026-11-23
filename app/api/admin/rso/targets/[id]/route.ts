import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminName, readAdminSection } from "@/lib/session";
import { targetAction, type TargetAction } from "@/lib/rso/core";

/* POST /api/admin/rso/targets/{id} — {action, text?}: approve / edit / skip /
   retry the heads-up, the same for the review request (…_review), restocked /
   still_out (a manual check), stop (never contact again), track (Crisp now). */
export const dynamic = "force-dynamic";

const ACTIONS: TargetAction[] = ["approve", "edit", "skip", "retry", "approve_review", "edit_review", "skip_review", "retry_review", "restocked", "still_out", "stop", "track"];

export async function POST(req: Request, ctx: RouteContext<"/api/admin/rso/targets/[id]">) {
  if (!(await readAdminSection("rso"))) return json({ ok: false, error: "Not signed in." }, 401);
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
