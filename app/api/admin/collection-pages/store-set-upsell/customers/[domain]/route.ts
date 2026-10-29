import { ssuGuard as guard } from "../../../shared";
import { adminActor, fail, json, readJson } from "@/lib/upsell/api";
import { customerAction } from "@/lib/storeSetUpsell/actions";
import { customerDetail } from "@/lib/storeSetUpsell/queries";

/* GET  …/store-set-upsell/customers/:domain → { selections, messages, events }
   POST …/store-set-upsell/customers/:domain  { action, … } — see actions.ts */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/collection-pages/store-set-upsell/customers/[domain]">) {
  const denied = await guard();
  if (denied) return denied;
  const { domain } = await ctx.params;
  try {
    return json({ ok: true, ...(await customerDetail(decodeURIComponent(domain))) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/admin/collection-pages/store-set-upsell/customers/[domain]">) {
  const denied = await guard();
  if (denied) return denied;
  const { domain } = await ctx.params;
  try {
    const b = await readJson(req);
    const result = await customerAction(decodeURIComponent(domain), String(b.action ?? ""), b, await adminActor());
    return json({ ok: true, result });
  } catch (err) {
    return fail(err);
  }
}
