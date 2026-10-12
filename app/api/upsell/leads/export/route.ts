import { fail, json, requireKey } from "@/lib/upsell/api";
import { exportLeads } from "@/lib/upsell/leads";

/* GET /api/upsell/leads/export?active=1&tracking_days=30
       → leads being tracked (approved … used, control) created in the window
   GET /api/upsell/leads/export?all=1 → every lead, for the sheet */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const days = Number(sp.get("tracking_days"));
  try {
    const leads = await exportLeads({
      all: sp.get("all") === "1",
      trackingDays: Number.isFinite(days) && days > 0 ? days : undefined,
    });
    return json({ leads });
  } catch (err) {
    return fail(err);
  }
}
