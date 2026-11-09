import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminSection } from "@/lib/session";
import { saveUrspSettings } from "@/lib/ursp/settings";

/* POST /api/admin/ursp/settings — {key: value, …}: the Cài đặt tab's save. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await readAdminSection("ursp"))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    return json({ ok: true, settings: await saveUrspSettings(await readJson(req)) });
  } catch (err) {
    return fail(err);
  }
}
