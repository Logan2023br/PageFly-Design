import { ssuGuard as guard } from "../../shared";
import { fail, json, readJson } from "@/lib/upsell/api";
import { connectionStates, saveSsuSettings } from "@/lib/storeSetUpsell/settings";

/* PUT …/store-set-upsell/settings { key: value, … } → { settings, connections }.
   A connection sent empty is removed (the environment's, if any, then applies). */
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const settings = await saveSsuSettings(await readJson(req));
    return json({ ok: true, settings, connections: await connectionStates() });
  } catch (err) {
    return fail(err);
  }
}
