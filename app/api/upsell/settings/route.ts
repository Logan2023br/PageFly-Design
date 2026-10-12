import { fail, json, requireKey } from "@/lib/upsell/api";
import { getSettings } from "@/lib/upsell/settings";

/* GET /api/upsell/settings → { settings: { key: value } } */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireKey(req);
  if (denied) return denied;
  try {
    const settings = await getSettings();
    /* The webhook is a credential of its own; the script has no use for it. */
    return json({ settings: { ...settings, slack_webhook_url: settings.slack_webhook_url ? "(set)" : "" } });
  } catch (err) {
    return fail(err);
  }
}
