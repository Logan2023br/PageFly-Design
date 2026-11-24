import { fail, json, readJson } from "@/lib/upsell/api";
import { readAdminSection } from "@/lib/session";
import { recompose } from "@/lib/nff/core";
import { saveNffSettings } from "@/lib/nff/settings";

/* POST /api/admin/nff/settings — {key: value, …}: the Cài đặt tab's save.
   The messages still on Chờ duyệt are written again from the new template. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await readAdminSection("nff"))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    const settings = await saveNffSettings(await readJson(req));
    await recompose();
    return json({ ok: true, settings });
  } catch (err) {
    return fail(err);
  }
}
