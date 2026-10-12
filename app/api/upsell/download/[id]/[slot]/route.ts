import { cookies } from "next/headers";
import { access } from "@/lib/upsell/access";
import { downloadName } from "@/lib/upsell/designs";
import { getFile } from "@/lib/upsell/storage";
import { VISITOR_COOKIE, VISITOR_MAX_AGE, clientIp, newVisitorId, trackCustomerEvent } from "@/lib/upsell/track";

/* ==========================================================================
   GET /api/upsell/download/:id/:slot[?v=]

   The .pagefly file as an attachment. A customer download is an event (and
   the first one moves the lead to `downloaded`); an admin's or the Builder's
   is not counted.
   ========================================================================== */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/upsell/download/[id]/[slot]">) {
  const { id, slot } = await ctx.params;
  const v = Number(new URL(req.url).searchParams.get("v"));
  const a = await access(id, req, Number.isInteger(v) && v > 0 ? v : undefined);
  const page = a.ok ? a.view.pages.find((p) => String(p.slot) === slot) : null;
  const bytes = page ? await getFile(page.pagefly_path) : null;
  if (!a.ok || !page || !bytes) return Response.json({ error: "Not found" }, { status: 404 });

  if (a.viewer === "customer") {
    const jar = await cookies();
    let visitor = jar.get(VISITOR_COOKIE)?.value;
    if (!visitor) {
      visitor = newVisitorId();
      jar.set(VISITOR_COOKIE, visitor, { httpOnly: true, sameSite: "lax", path: "/", maxAge: VISITOR_MAX_AGE, secure: process.env.NODE_ENV === "production" });
    }
    await trackCustomerEvent(
      { id, type: "download", page_slot: page.slot },
      { visitorId: visitor, ip: clientIp(req), userAgent: req.headers.get("user-agent"), isAdmin: false },
    ).catch((err) => console.error("[upsell] download event", err));
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${downloadName(a.view.lead, page)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
