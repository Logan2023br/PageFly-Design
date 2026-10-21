import { fail, json, readJson, requireAdmin } from "@/lib/upsell/api";
import { maskSettings, saveSettings } from "@/lib/upsell/settings";

/* PUT /api/admin/upsell/settings { key: value, … } → { settings } */
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return json({ ok: true, settings: maskSettings(await saveSettings(await readJson(req))) });
  } catch (err) {
    return fail(err);
  }
}
