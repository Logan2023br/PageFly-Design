import { fail, json, list, readJson, requireKey } from "@/lib/upsell/api";
import { syncLeads } from "@/lib/upsell/leads";

/* POST /api/upsell/leads/sync { leads: [{ lead_id, …outcome fields }] }
   Only the fields present are written. `status` applies only when it moves
   forward (sent < viewed < downloaded < used < upgraded) or is uninstalled,
   and never out of a review decision. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  try {
    const body = await readJson(req);
    return json({ ok: true, ...(await syncLeads(list(body, "leads"))) });
  } catch (err) {
    return fail(err);
  }
}
