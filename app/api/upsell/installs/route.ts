import { fail, json, list, readJson, requireKey } from "@/lib/upsell/api";
import { listInstalls, upsertInstalls } from "@/lib/upsell/leads";

/* GET  /api/upsell/installs?since_hours=80 → { installs: [...] }, newest first
   POST /api/upsell/installs { installs: [...] } — upsert by store_domain */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  const hours = Number(new URL(req.url).searchParams.get("since_hours") ?? 80);
  try {
    return json({ installs: await listInstalls(Number.isFinite(hours) ? Math.min(hours, 24 * 400) : 80) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  try {
    const body = await readJson(req);
    return json({ ok: true, ...(await upsertInstalls(list(body, "installs"))) });
  } catch (err) {
    return fail(err);
  }
}
