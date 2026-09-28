import { z } from "zod";
import { RESERVED_SET_SLUGS, slugify } from "@/lib/collectionPages";
import { missingBuiltIns, newId } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import type { CollectionSetRecord } from "@/lib/db/types";
import { fail, failFrom, firstIssue, guard, setSlug } from "./shared";

/* ==========================================================================
   /api/admin/collection-pages

   GET   every set, with page metadata and no file bytes
   POST  a new set, from a name — hidden until it has been filled and checked
   PUT   the order of the sets, as a list of ids
   ========================================================================== */

export const dynamic = "force-dynamic";

export type CollectionSetsResponse =
  | { ok: true; sets: CollectionSetRecord[]; missing: string[] }
  | { ok: false; error: string };

async function listing() {
  const sets = await getRepo().listCollectionSets();
  return Response.json({ ok: true, sets, missing: missingBuiltIns(sets) } satisfies CollectionSetsResponse);
}

export async function GET() {
  return (await guard()) ?? listing();
}

const createSchema = z.object({
  name: z.string().trim().min(1, "The name is empty.").max(80),
  slug: setSlug.optional(),
});

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const repo = getRepo();
  const sets = await repo.listCollectionSets();
  const id = newId();
  const derived = slugify(parsed.data.name) || id;
  const slug = parsed.data.slug ?? (RESERVED_SET_SLUGS.has(derived) ? `${derived}-set` : derived);
  try {
    await repo.saveCollectionSet({
      id,
      slug,
      name: parsed.data.name,
      blurb: "",
      /* HIDDEN FROM BIRTH. A new set has no pages yet, and a visible empty set
         is a card on the public page that opens onto nothing. */
      visible: false,
      access: "free",
      priceCents: null,
      buyUrl: null,
      position: Math.max(0, ...sets.map((s) => s.position)) + 1,
    });
  } catch (err) {
    return failFrom(err);
  }
  return Response.json({ ok: true, id });
}

export async function PUT(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = z.object({ ids: z.array(z.string().max(64)).max(500) }).safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return fail(firstIssue(parsed.error));
  await getRepo().orderCollectionSets(parsed.data.ids);
  return listing();
}
