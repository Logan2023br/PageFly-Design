import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminSection } from "@/lib/session";
import { saveRsoSettings } from "@/lib/rso/settings";

/* POST /api/admin/rso/settings — {key: value, …}: the Cài đặt tab's save. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await readAdminSection("rso"))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    return json({ ok: true, settings: await saveRsoSettings(await readJson(req)) });
  } catch (err) {
    return fail(err);
  }
}
