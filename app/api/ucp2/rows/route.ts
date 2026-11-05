import { fail, json, requireKey } from "@/lib/upsell/api";
import { UpsellError } from "@/lib/upsell/types";
import { readAdminSection } from "@/lib/session";
import { importRows, pullRows } from "@/lib/ucp2/core";

/* ==========================================================================
   Upsell Collection Pages 2 ⇄ the "User Testing" sheet, through n8n.
   X-API-Key: the same key as the upsell API (UPSELL_API_KEY) — or an admin
   with Upsell Collection Pages 2 signed in.

   POST  the sheet's rows, as n8n's Google Sheets node gives them — an array,
         or {"rows": [...]}. Each needs Time, Store Domain and a Ticket with
         its Crisp session; Code Store, Email, Tên store, Plan, Type User are
         kept too. Posting rows already in changes only what changed.
         → { received, added, updated, skipped: [{row, reason}] }

   GET   ?since=ISO (optional) — every row (or those changed since), keyed by
         Ticket, with the sheet's PFD columns written out:
         → { columns: ["PFD Đã đọc", …], rows: [{ Ticket, "Store Domain",
              session_id, "PFD Đã đọc": "2026-11-05 15:20:01", … }] }
         n8n: Google Sheets "Update row", match column Ticket.
   ========================================================================== */
export const dynamic = "force-dynamic";

/** The whole tab in one post: a few thousand rows, not the 1 MB of the other upsell routes. */
const MAX_BYTES = 8 * 1024 * 1024;

/** n8n by key; an admin of this section by cookie. */
async function allowed(req: Request): Promise<Response | null> {
  if (req.headers.get("x-api-key")) return requireKey(req);
  if (await readAdminSection("ucp2")) return null;
  return json({ error: "Invalid or missing X-API-Key." }, 401);
}

async function body(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) throw new UpsellError("The body is too large.", 413);
  try {
    return await req.json();
  } catch {
    throw new UpsellError("The body must be JSON.", 400);
  }
}

export async function POST(req: Request) {
  const denied = await allowed(req);
  if (denied) return denied;
  try {
    return json({ ok: true, ...(await importRows(await body(req))) });
  } catch (err) {
    return fail(err);
  }
}

export async function GET(req: Request) {
  const denied = await allowed(req);
  if (denied) return denied;
  try {
    return json({ ok: true, ...(await pullRows(new URL(req.url).searchParams.get("since"))) });
  } catch (err) {
    return fail(err);
  }
}
