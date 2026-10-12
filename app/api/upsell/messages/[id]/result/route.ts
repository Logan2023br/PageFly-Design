import { fail, json, readJson, requireKey } from "@/lib/upsell/api";
import { reportResult, type ResultBody } from "@/lib/upsell/messages";

/* POST /api/upsell/messages/:id/result
   { status: sent|failed, error, sent_at, crisp_session, ticket_link,
     plan_at_send, price_at_send, pages_at_send }
   Idempotent: reporting a sent message again changes nothing. */
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/upsell/messages/[id]/result">) {
  const denied = requireKey(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const body = (await readJson(req)) as unknown as ResultBody;
    const { changed, message } = await reportResult(id, body);
    return json({ ok: true, changed, id: message.id, status: message.status });
  } catch (err) {
    return fail(err);
  }
}
