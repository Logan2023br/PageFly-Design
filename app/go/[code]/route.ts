import { clickTarget, recordClick } from "@/lib/ucp2/core";

/* ==========================================================================
   GET /go/{Code Store}?to=…  — the link in an Upsell Collection Pages 2
   message. Counts the click on that store's row, then sends the customer on:
   to `to` when it is this site or a pagefly.io address, else Collection
   pages. A code nobody knows still goes on — the customer never sees an error.
   ========================================================================== */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/go/[code]">) {
  const { code } = await ctx.params;
  const url = new URL(req.url);
  const to = url.searchParams.get("to");
  await recordClick(decodeURIComponent(code), { to, ua: req.headers.get("user-agent") }).catch((err) => console.error("[ucp2] click", err));
  return new Response(null, { status: 302, headers: { Location: clickTarget(to), "Cache-Control": "no-store" } });
}
