import { fail, json, requireKey } from "@/lib/upsell/api";
import { tick } from "@/lib/upsell/maintenance";

/* POST /api/upsell/cron — the maintenance tick on demand. The server runs it
   by itself every few minutes (instrumentation.ts); this is for a system
   cron, or for checking it does what it says. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  try {
    return json({ ok: true, ...(await tick()) });
  } catch (err) {
    return fail(err);
  }
}
