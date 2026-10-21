import { access } from "@/lib/upsell/access";
import { getFile } from "@/lib/upsell/storage";

/* ==========================================================================
   GET /upsell/preview/:id/:slot[?v=2]

   The page's HTML, for the iframes. Sandboxed by header as well as by the
   iframe attribute: opened directly in a tab, the CSP sandbox still applies.
   `?v=` (an older version) is for admin and the Builder only.
   ========================================================================== */
export const dynamic = "force-dynamic";

const HEADERS = {
  /* NO allow-same-origin. The page is HTML a model wrote from a merchant's
     storefront, served from this origin: with same-origin and scripts
     together, a script in it could call /api/admin/* with the cookies of the
     admin reviewing it. Without, it runs in an opaque origin, wherever it is
     opened — in the admin's iframe or straight in a tab. */
  "Content-Security-Policy": "sandbox allow-scripts",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
  "Content-Type": "text/html; charset=utf-8",
};

export async function GET(req: Request, ctx: RouteContext<"/upsell/preview/[id]/[slot]">) {
  const { id, slot } = await ctx.params;
  const v = Number(new URL(req.url).searchParams.get("v"));
  const a = await access(id, req, Number.isInteger(v) && v > 0 ? v : undefined);
  const page = a.ok ? a.view.pages.find((p) => String(p.slot) === slot) : null;
  const html = page ? await getFile(page.html_path) : null;
  if (!html) return new Response("Not found", { status: 404, headers: { ...HEADERS, "Content-Type": "text/plain" } });
  return new Response(new Uint8Array(html), { headers: HEADERS });
}
