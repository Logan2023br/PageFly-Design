import { fail, json, readJson, requireKey } from "@/lib/upsell/api";
import { setBuildStatus } from "@/lib/upsell/leads";

/* POST /api/upsell/leads/:lead_id/status { status: building|error|skipped, error } */
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/upsell/leads/[lead_id]/status">) {
  const denied = requireKey(req);
  if (denied) return denied;
  const { lead_id } = await ctx.params;
  try {
    const body = await readJson(req);
    const lead = await setBuildStatus(lead_id, String(body.status ?? ""), typeof body.error === "string" ? body.error : null);
    return json({ ok: true, lead_id, status: lead.status, build_started_at: lead.build_started_at });
  } catch (err) {
    return fail(err);
  }
}
