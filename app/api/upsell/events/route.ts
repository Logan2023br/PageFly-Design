import { cookies } from "next/headers";
import { readAdminSession } from "@/lib/session";
import { VISITOR_COOKIE, VISITOR_MAX_AGE, clientIp, newVisitorId, trackCustomerEvent } from "@/lib/upsell/track";

/* ==========================================================================
   POST /api/upsell/events   public
   { id, type, page_slot, rating, comment }

   Always 200 with { recorded }: a beacon from a page has no use for an error,
   and a bot learns nothing from the difference. The visitor cookie (a year)
   is what `unique_views` counts.
   ========================================================================== */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  /* Refused before the body is read, when the size is declared. */
  if (Number(req.headers.get("content-length") ?? 0) > 8_000) return Response.json({ recorded: false, reason: "too large" });
  try {
    const text = await req.text();
    if (text.length > 8_000) return Response.json({ recorded: false, reason: "too large" });
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Response.json({ recorded: false, reason: "bad body" });
  }
  const jar = await cookies();
  let visitor = jar.get(VISITOR_COOKIE)?.value;
  if (!visitor || !/^[A-Za-z0-9_-]{8,40}$/.test(visitor)) {
    visitor = newVisitorId();
    jar.set(VISITOR_COOKIE, visitor, { httpOnly: true, sameSite: "lax", path: "/", maxAge: VISITOR_MAX_AGE, secure: process.env.NODE_ENV === "production" });
  }
  try {
    const result = await trackCustomerEvent(
      {
        id: String(body.id ?? ""),
        type: String(body.type ?? ""),
        page_slot: typeof body.page_slot === "number" ? body.page_slot : Number(body.page_slot) || null,
        rating: body.rating === undefined || body.rating === null ? null : Number(body.rating),
        comment: typeof body.comment === "string" ? body.comment : null,
        detail: body.detail && typeof body.detail === "object" ? (body.detail as Record<string, unknown>) : null,
      },
      { visitorId: visitor, ip: clientIp(req), userAgent: req.headers.get("user-agent"), isAdmin: await readAdminSession() },
    );
    return Response.json(result);
  } catch (err) {
    console.error("[upsell] event", err);
    return Response.json({ recorded: false, reason: "error" });
  }
}
