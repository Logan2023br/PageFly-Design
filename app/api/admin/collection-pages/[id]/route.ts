import { getRepo } from "@/lib/db";
import type { CollectionSetRecord } from "@/lib/db/types";
import { fail, failFrom, firstIssue, guard, settings } from "../shared";

/* ==========================================================================
   /api/admin/collection-pages/<id>

   GET     one set
   PATCH   its settings — name, URL, blurb, visibility, price
   DELETE  the set, its pages and their files
   ========================================================================== */

export const dynamic = "force-dynamic";

export type CollectionSetResponse =
  | { ok: true; set: CollectionSetRecord }
  | { ok: false; error: string };

export async function GET(_request: Request, ctx: RouteContext<"/api/admin/collection-pages/[id]">) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const set = await getRepo().getCollectionSet(id);
  if (!set) return fail("That set no longer exists.", 404);
  return Response.json({ ok: true, set } satisfies CollectionSetResponse);
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/collection-pages/[id]">) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const repo = getRepo();
  const set = await repo.getCollectionSet(id);
  if (!set) return fail("That set no longer exists.", 404);

  const parsed = settings.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    await repo.saveCollectionSet({ ...parsed.data, id, position: set.position });
  } catch (err) {
    return failFrom(err);
  }
  const saved = await repo.getCollectionSet(id);
  return Response.json({ ok: true, set: saved! } satisfies CollectionSetResponse);
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/collection-pages/[id]">) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  await getRepo().deleteCollectionSet(id);
  return Response.json({ ok: true });
}
