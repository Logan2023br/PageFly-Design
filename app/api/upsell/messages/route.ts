import { fail, json, list, readJson, requireKey } from "@/lib/upsell/api";
import { approvedForSending, createDrafts } from "@/lib/upsell/messages";

/* GET  /api/upsell/messages?status=approved → approved, unsent messages with
        the lead's contact details, for the script to send
   POST /api/upsell/messages { messages: [{ lead_id, kind, content }] }
        → drafts in pending_review; an existing (lead_id, kind) is skipped */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  const status = new URL(req.url).searchParams.get("status") ?? "approved";
  if (status !== "approved") return json({ error: "Only status=approved is served here." }, 400);
  try {
    return json({ messages: await approvedForSending() });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  try {
    const body = await readJson(req);
    return json({ ok: true, ...(await createDrafts(list(body, "messages"))) });
  } catch (err) {
    return fail(err);
  }
}
