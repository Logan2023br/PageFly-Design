import { z } from "zod";
import { RESERVED_PAGE_SLUGS, slugify } from "@/lib/collectionPages";
import { newId } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import type { CollectionSetResponse } from "../route";
import { fail, failFrom, firstIssue, guard, pageSlug } from "../../shared";

/* ==========================================================================
   /api/admin/collection-pages/<id>/pages

   POST    a new, empty page — its files are dropped onto it after  { label }
   PATCH   one page's label, blurb or URL          { page, slug, label, blurb }
   PUT     the order of the pages                   { ids }
   DELETE  one page and both its files              ?page=<pageId>

   Every answer is the whole set again, so the editor redraws from what was
   stored rather than from what it hoped was stored.
   ========================================================================== */

export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/admin/collection-pages/[id]/pages">;

async function answer(id: string) {
  const set = await getRepo().getCollectionSet(id);
  if (!set) return fail("That set no longer exists.", 404);
  return Response.json({ ok: true, set } satisfies CollectionSetResponse);
}

const pageSchema = z.object({
  page: z.string().max(64),
  slug: pageSlug,
  label: z.string().trim().min(1, "The page name is empty.").max(60),
  blurb: z.string().trim().max(200).default(""),
});

export async function PATCH(request: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = pageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const repo = getRepo();
  const set = await repo.getCollectionSet(id);
  const page = set?.pages.find((p) => p.id === parsed.data.page);
  if (!set || !page) return fail("That page no longer exists.", 404);
  try {
    await repo.saveCollectionPage(id, {
      id: page.id,
      slug: parsed.data.slug,
      label: parsed.data.label,
      blurb: parsed.data.blurb,
      position: page.position,
    });
  } catch (err) {
    return failFrom(err);
  }
  return answer(id);
}

export async function POST(request: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = z
    .object({ label: z.string().trim().min(1, "The page name is empty.").max(60) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const repo = getRepo();
  const set = await repo.getCollectionSet(id);
  if (!set) return fail("That set no longer exists.", 404);

  /* A free URL from the name: `about`, then `about-2`, `about-3`… so adding a
     second page with a name already used is not an error to fix first. */
  const base = slugify(parsed.data.label) || "page";
  const taken = new Set(set.pages.map((p) => p.slug));
  let slug = RESERVED_PAGE_SLUGS.has(base) ? `${base}-page` : base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  try {
    await repo.saveCollectionPage(id, {
      id: newId(),
      slug,
      label: parsed.data.label,
      blurb: "",
      position: Math.max(0, ...set.pages.map((p) => p.position)) + 1,
    });
  } catch (err) {
    return failFrom(err);
  }
  return answer(id);
}

export async function PUT(request: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = z.object({ ids: z.array(z.string().max(64)).max(200) }).safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return fail(firstIssue(parsed.error));
  await getRepo().orderCollectionPages(id, parsed.data.ids);
  return answer(id);
}

export async function DELETE(request: Request, ctx: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const page = new URL(request.url).searchParams.get("page");
  if (!page) return fail("Which page?");
  await getRepo().deleteCollectionPage(id, page);
  return answer(id);
}
