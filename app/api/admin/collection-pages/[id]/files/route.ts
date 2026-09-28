import { MAX_FILE_BYTES, RESERVED_PAGE_SLUGS, SLUG_RE } from "@/lib/collectionPages";
import { rejectFile, storeFile } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import type { CollectionSetResponse } from "../route";
import { fail, failFrom, guard } from "../../shared";

/* ==========================================================================
   POST /api/admin/collection-pages/<id>/files?slug=home&kind=html

   One file per request, as the raw body. One because a set is 1–2 MB and a
   serverless host refuses a body past about 4.5 MB, so a set sent whole would
   work for small sets and fail for the next one; and because the editor can
   then show each file landing, and retry only the one that did not.

   A new slug creates the page; a known one replaces that file on it.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/admin/collection-pages/[id]/files">,
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  const kind = params.get("kind");

  if (kind !== "html" && kind !== "pagefly") return fail("Only .html and .pagefly files.");
  if (!SLUG_RE.test(slug) || RESERVED_PAGE_SLUGS.has(slug)) return fail("That file name cannot be a page URL.");

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) return fail("The file is over 4 MB.", 413);
  const rejected = rejectFile(kind, bytes);
  if (rejected) return fail(rejected);

  const repo = getRepo();
  const set = await repo.getCollectionSet(id);
  if (!set) return fail("That set no longer exists.", 404);
  try {
    await storeFile(set, slug, kind, bytes);
  } catch (err) {
    return failFrom(err);
  }
  const saved = await repo.getCollectionSet(id);
  return Response.json({ ok: true, set: saved! } satisfies CollectionSetResponse);
}
