import { guard } from "../../shared";
import { fail, json } from "@/lib/upsell/api";
import { testConnections } from "@/lib/storeSetUpsell/clients";
import { db } from "@/lib/storeSetUpsell/db";

/* POST …/store-set-upsell/connections-test → { results: [{ service, ok, detail }] }.
   One read per service with what is configured now; AC2 is asked for the
   store that most recently picked a Store set, when there is one. */
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const q = await db();
    const { rows } = await q.query<{ store_domain: string }>(
      "select store_domain from ssu_selections where store_domain is not null order by event_time desc limit 1",
    );
    return json({ ok: true, results: await testConnections(rows[0]?.store_domain ?? null) });
  } catch (err) {
    return fail(err);
  }
}
