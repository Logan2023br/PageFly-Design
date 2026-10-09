import { z } from "zod";
import { isPublic } from "@/lib/collectionPages";
import { newId } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import { countryOf } from "@/lib/geo";
import { normalizeDomain } from "@/lib/storeForm";

/* ==========================================================================
   POST /api/collection-pages/leads — the download form on a free set.

   The store and email are stored before the file is offered, so the lead is
   kept even if the download itself is never pressed. Only a visible, free set
   can be asked for; the set's name is read here, not trusted from the form.

   A SOFT GATE, AND IT SAYS SO. The file routes do not check for a lead — the
   URL of a free file is public, as it was before this form existed. What the
   form adds is who took it, which is the point; locking the file would need a
   signed link per lead and buys nothing a determined visitor cannot get from
   the preview's own network tab.

   The country is read from the request the same way `/api/events` reads it,
   and the address itself is not kept.
   ========================================================================== */

export const dynamic = "force-dynamic";

const schema = z.object({
  set: z.string().max(80),
  page: z.string().max(80).nullable().optional(),
  domain: z.string().trim().min(1, "Enter your store domain.").max(200),
  email: z.string().trim().max(200).email("That email does not look right."),
  visitorId: z.string().min(8).max(64).nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." },
      { status: 400 },
    );
  }
  const domain = normalizeDomain(parsed.data.domain);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    return Response.json(
      { ok: false, error: "Enter your store domain, like your-store.myshopify.com." },
      { status: 400 },
    );
  }

  const repo = getRepo();
  const set = await repo.getCollectionSetBySlug(parsed.data.set);
  if (!set || !isPublic(set) || set.access !== "free") {
    return Response.json({ ok: false, error: "This set is not a free download." }, { status: 404 });
  }
  const page = parsed.data.page ? set.pages.find((p) => p.slug === parsed.data.page) : null;
  if (parsed.data.page && !page) {
    return Response.json({ ok: false, error: "That page is no longer in the set." }, { status: 404 });
  }

  await repo.createCollectionLead({
    id: newId(),
    setSlug: set.slug,
    setName: set.name,
    pageSlug: page?.slug ?? null,
    domain,
    email: parsed.data.email.toLowerCase(),
    visitorId: parsed.data.visitorId ?? null,
    country: await countryOf(request).catch(() => null),
    createdAt: new Date().toISOString(),
  });
  return Response.json({ ok: true });
}
