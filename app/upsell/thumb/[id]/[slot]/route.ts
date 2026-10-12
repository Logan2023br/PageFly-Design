import { access } from "@/lib/upsell/access";
import { getFile } from "@/lib/upsell/storage";

/* GET /upsell/thumb/:id/:slot[?v=] — the PNG thumbnail, same rules as the
   preview. 404 when there is none; the screens then draw a live preview. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/upsell/thumb/[id]/[slot]">) {
  const { id, slot } = await ctx.params;
  const v = Number(new URL(req.url).searchParams.get("v"));
  const a = await access(id, req, Number.isInteger(v) && v > 0 ? v : undefined);
  const page = a.ok ? a.view.pages.find((p) => String(p.slot) === slot) : null;
  const png = page ? await getFile(page.thumb_path) : null;
  if (!png) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" },
  });
}
