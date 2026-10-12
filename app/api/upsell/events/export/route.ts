import { fail, json, requireKey } from "@/lib/upsell/api";
import { db } from "@/lib/upsell/db";

/* GET /api/upsell/events/export?limit=3000
   → { events: [{ created_at, store_domain, lead_id, type, detail, actor }] }, newest first */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  const n = Number(new URL(req.url).searchParams.get("limit") ?? 3000);
  const limit = Number.isFinite(n) ? Math.max(1, Math.min(20_000, Math.round(n))) : 3000;
  try {
    const p = await db();
    const { rows } = await p.query(
      `select e.created_at, l.store_domain, e.lead_id, e.type,
              case when e.detail is null and e.rating is null and e.comment is null and e.page_slot is null then null
                   else coalesce(e.detail, '{}'::jsonb)
                        || jsonb_strip_nulls(jsonb_build_object('page_slot', e.page_slot, 'rating', e.rating, 'comment', e.comment))
              end as detail,
              e.actor
         from upsell_events e left join upsell_leads l on l.lead_id = e.lead_id
        order by e.created_at desc, e.id desc
        limit $1`,
      [limit],
    );
    return json({ events: rows });
  } catch (err) {
    return fail(err);
  }
}
