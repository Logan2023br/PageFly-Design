import { fail, json } from "@/lib/upsell/api";
import { readAdminSection } from "@/lib/session";
import { runTrack } from "@/lib/ucp2/core";

/* POST /api/admin/ucp2/run — "Cập nhật ngay": one tracking batch, now. */
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await readAdminSection("ucp2"))) return json({ ok: false, error: "Not signed in." }, 401);
  try {
    return json({ ok: true, job: await runTrack() });
  } catch (err) {
    return fail(err);
  }
}
