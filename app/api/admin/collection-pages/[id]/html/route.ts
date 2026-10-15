import { zipSync } from "fflate";
import { getRepo } from "@/lib/db";
import { fail, guard } from "../../shared";

/* ==========================================================================
   /api/admin/collection-pages/<id>/html

   GET   every page's .html of one set, as <slug>-html.zip, for the TS review.

   The files go out as they were stored: not run through stayPut, and not
   served as HTML on this origin, so nothing in them runs here. Admin only,
   so it never lands in a shared cache.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/admin/collection-pages/[id]/html">,
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const repo = getRepo();
  const set = await repo.getCollectionSet(id);
  if (!set) return fail("That set no longer exists.", 404);

  const files: Record<string, Uint8Array> = {};
  for (const page of set.pages) {
    if (page.htmlSize === null) continue;
    const bytes = await repo.getCollectionFile(set.id, page.id, "html");
    if (bytes) files[`${set.slug}/${page.slug}.html`] = bytes;
  }
  if (Object.keys(files).length === 0) return fail("This set has no .html files yet.", 404);

  return new Response(Buffer.from(zipSync(files)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${set.slug}-html.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
