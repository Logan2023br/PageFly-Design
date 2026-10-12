import { adminActor, fail, json, readJson, requireAdmin } from "@/lib/upsell/api";
import { installToLead } from "@/lib/upsell/review";

/* POST /api/admin/upsell/installs { store_domain } — "Thêm thành lead". */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const b = await readJson(req);
    const leadId = await installToLead(String(b.store_domain ?? "").trim().toLowerCase(), await adminActor());
    return json({ ok: true, lead_id: leadId });
  } catch (err) {
    return fail(err);
  }
}
