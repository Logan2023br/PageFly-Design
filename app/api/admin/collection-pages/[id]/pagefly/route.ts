import { zipSync } from "fflate";
import { getRepo } from "@/lib/db";
import { fail, guard } from "../../shared";

/* ==========================================================================
   /api/admin/collection-pages/<id>/pagefly

   GET   every page's .pagefly of one set, as <slug>-pagefly.zip — the
         admin's "Download .pagefly" on the set list. Same as …/html, for
         the other kind. Admin only, never cached.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/admin/collection-pages/[id]/pagefly">,
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const repo = getRepo();
  const set = await repo.getCollectionSet(id);
  if (!set) return fail("That set no longer exists.", 404);

  const files: Record<string, Uint8Array> = {};
  for (const page of set.pages) {
    if (page.pageflySize === null) continue;
    const bytes = await repo.getCollectionFile(set.id, page.id, "pagefly");
    if (bytes) files[`${set.slug}/${page.slug}.pagefly`] = bytes;
  }
  if (Object.keys(files).length === 0) return fail("This set has no .pagefly files yet.", 404);

  return new Response(Buffer.from(zipSync(files, { level: 0 })), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${set.slug}-pagefly.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
