import { ssuGuard as guard } from "../../shared";
import { adminActor, fail, json, readJson } from "@/lib/upsell/api";
import { addStore } from "@/lib/storeSetUpsell/job";

/* POST …/store-set-upsell/add { domain } → { result } — one store added by
   hand: its selects read from Mixpanel, then checked; a thanks is drafted
   for approval, never sent from here. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const b = await readJson(req);
    return json({ ok: true, result: await addStore(String(b.domain ?? ""), await adminActor()) });
  } catch (err) {
    return fail(err);
  }
}
