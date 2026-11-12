import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminName, readAdminSection } from "@/lib/session";
import { targetAction, type TargetAction } from "@/lib/ursp/core";

/* POST /api/admin/ursp/targets/{id} — {action, text?}: approve (with an
   edited text), edit, skip, retry, send_anyway (a skipped store, by hand),
   done / undone (Đã xử lý xong), track (check Crisp and AC2 now). */
export const dynamic = "force-dynamic";

const ACTIONS: TargetAction[] = [
  "approve",
  "skip",
  "edit",
  "done",
  "undone",
  "dismiss",
  "undismiss",
  "start",
  "cancel",
  "note",
  "retry",
  "send_anyway",
  "track",
  "ask_review",
  "close",
  "reopen",
  "approve_followup",
  "skip_followup",
  "edit_followup",
  "retry_followup",
];

export async function POST(req: Request, ctx: RouteContext<"/api/admin/ursp/targets/[id]">) {
  if (!(await readAdminSection("ursp"))) return json({ ok: false, error: "Not signed in." }, 401);
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
