import { hasUpsellDatabase } from "@/lib/upsell/db";
import { fail, json, requireAdmin } from "@/lib/upsell/api";
import { pendingCounts } from "@/lib/upsell/review";

/* GET /api/admin/upsell/counts — the numbers on the sidebar item. */
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!hasUpsellDatabase()) return json({ ok: true, pages: 0, messages: 0 });
  try {
    return json({ ok: true, ...(await pendingCounts()) });
  } catch (err) {
    return fail(err);
  }
}
