import { ssuGuard as guard } from "../../../shared";
import { adminActor, fail, json, list, readJson } from "@/lib/upsell/api";
import { bulkMessages } from "@/lib/storeSetUpsell/actions";

/* POST …/store-set-upsell/messages/bulk  { ids: [...], action: approve | reject } */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const b = await readJson(req);
    const ids = list(b, "ids").map(String);
    return json({ ok: true, ...(await bulkMessages(ids, String(b.action ?? ""), await adminActor())) });
  } catch (err) {
    return fail(err);
  }
}
