import { fail, json, requireKey } from "@/lib/upsell/api";
import { buildQueue } from "@/lib/upsell/leads";
import { db } from "@/lib/upsell/db";
import { upsellOrigin } from "@/lib/upsell/common";
import { getSettings } from "@/lib/upsell/settings";
import type { LeadStatus, PageRow } from "@/lib/upsell/types";

/* ==========================================================================
   GET /api/upsell/queue?status=new|rebuild_requested&limit=2

   Test-group leads waiting for a build, high priority first, then highest
   score, then oldest. `status` may name one status or both (comma-separated);
   omitted, both. `limit` defaults to the max_builds_per_run setting.

   A rebuild carries what the admin asked for and links to the two pages it
   is replacing — fetched with the same X-API-Key.
   ========================================================================== */
export const dynamic = "force-dynamic";

const QUEUE_STATUSES = new Set(["new", "rebuild_requested"]);

export async function GET(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const asked = (sp.get("status") ?? "new,rebuild_requested").split(/[,|]/).map((s) => s.trim()).filter((s) => QUEUE_STATUSES.has(s));
  try {
    const cfg = await getSettings();
    const limit = Number(sp.get("limit") ?? cfg.max_builds_per_run);
    const leads = await buildQueue((asked.length ? asked : ["new", "rebuild_requested"]) as LeadStatus[], Number.isFinite(limit) ? limit : 2);
    const p = await db();
    const origin = upsellOrigin();
    const out = [];
    for (const l of leads) {
      let current_pages: unknown[] = [];
      if (l.design_id && l.design_version) {
        const { rows } = await p.query<PageRow>("select * from upsell_pages where design_id=$1 and version=$2 order by slot", [l.design_id, l.design_version]);
        current_pages = rows.map((r) => ({
          slot: r.slot,
          type: r.type,
          title: r.title,
          version: r.version,
          html_url: `${origin}/upsell/preview/${l.design_id}/${r.slot}`,
          pagefly_url: `${origin}/api/upsell/download/${l.design_id}/${r.slot}`,
        }));
      }
      out.push({ ...l, current_pages });
    }
    return json({ leads: out });
  } catch (err) {
    return fail(err);
  }
}
