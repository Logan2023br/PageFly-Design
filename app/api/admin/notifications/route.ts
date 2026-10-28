import { recentNotices } from "@/lib/adminNotifications";
import { readAdmin } from "@/lib/session";

/* GET /api/admin/notifications — what the admin's sound notice reads, for the
   sections this sign-in may open. */
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await readAdmin();
  if (!me) return Response.json({ ok: false, error: "Sign in." }, { status: 401 });
  return Response.json({ ok: true, notices: await recentNotices(me.sections) }, { headers: { "Cache-Control": "no-store" } });
}
