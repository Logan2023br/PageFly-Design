import { fail, json, list, readJson, requireKey } from "@/lib/upsell/api";
import { upsertLeads } from "@/lib/upsell/leads";

/* POST /api/upsell/leads { leads: [...] } — upsert by lead_id. A lead past
   new/control keeps its status whatever the request says. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  try {
    const body = await readJson(req);
    return json({ ok: true, ...(await upsertLeads(list(body, "leads"))) });
  } catch (err) {
    return fail(err);
  }
}
