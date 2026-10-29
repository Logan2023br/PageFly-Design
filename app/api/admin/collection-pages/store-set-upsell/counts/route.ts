import { ssuGuard as guard } from "../../shared";
import { fail, json } from "@/lib/upsell/api";
import { hasStoreSetDatabase } from "@/lib/storeSetUpsell/db";
import { ssuCounts } from "@/lib/storeSetUpsell/queries";

/* GET …/store-set-upsell/counts — the number on the sidebar item: drafts to
   approve and replies to read. */
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  if (!hasStoreSetDatabase()) return json({ ok: true, n: 0 });
  try {
    const c = await ssuCounts();
    return json({ ok: true, n: (c.pending ?? 0) + (c.needs_check ?? 0) });
  } catch (err) {
    return fail(err);
  }
}
