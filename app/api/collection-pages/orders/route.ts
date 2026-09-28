import { z } from "zod";
import { newId } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import { normalizeDomain } from "@/lib/storeForm";

/* ==========================================================================
   POST /api/collection-pages/orders — a buyer asking for a paid set.

   Public, and it records a request rather than taking a payment: an operator
   reads it under Admin → Collection pages → Orders and writes back. Only a
   VISIBLE, PAID set can be ordered, and the name and price are read from the
   set here rather than trusted from the form.

   NO HONEYPOT. There was one — a hidden `website` field whose orders were
   answered "received" and dropped — and a browser's autofill filled it in, so
   a real buyer was told their order had arrived while nothing was stored. An
   order that is silently lost is worse than a spam order an operator cancels,
   and every order here is read by a person before anything happens.
   ========================================================================== */

export const dynamic = "force-dynamic";

const schema = z.object({
  set: z.string().max(80),
  domain: z.string().trim().min(1, "Enter your store domain.").max(200),
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().max(200).email("That email does not look right."),
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
  if (!set || !set.visible || set.access !== "paid") {
    return Response.json({ ok: false, error: "This set is not for sale." }, { status: 404 });
  }

  const now = new Date().toISOString();
  await repo.createCollectionOrder({
    id: newId(),
    setId: set.id,
    setSlug: set.slug,
    setName: set.name,
    priceCents: set.priceCents,
    domain,
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  return Response.json({ ok: true });
}
