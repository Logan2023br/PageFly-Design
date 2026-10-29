import { ssuGuard as guard } from "../../shared";
import { fail, json } from "@/lib/upsell/api";
import { runJob } from "@/lib/storeSetUpsell/job";

/* POST /api/admin/collection-pages/store-set-upsell/run — the minute job, now. */
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  try {
    return json({ ok: true, job: await runJob() });
  } catch (err) {
    return fail(err);
  }
}
