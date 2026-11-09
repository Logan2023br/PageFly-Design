import { fail, json, requireKey } from "@/lib/upsell/api";
import { UpsellError } from "@/lib/upsell/types";
import { importRecap } from "@/lib/ursp/core";

/* ==========================================================================
   POST /api/ursp/recap — new rows of the support Recap sheet ("Recap v11"),
   for when the server cannot read the sheet itself (no service account):
   n8n posts each row it adds, as its Google Sheets node gives them — an
   array, or {"rows": [...]}, with the sheet's own headers (recap_at_vn,
   store_domain, category_issue, resolution, session_id, ticket_url, …).
   X-API-Key: the upsell API's key (UPSELL_API_KEY).

   Only rows written since Bắt đầu are taken, each once; nothing while the
   screen says Tạm dừng.
   → { read, added, responsive, targets }
   ========================================================================== */
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  try {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) throw new UpsellError("The body is too large.", 413);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new UpsellError("The body must be JSON.", 400);
    }
    return json({ ok: true, ...(await importRecap(body)) });
  } catch (err) {
    return fail(err);
  }
}
