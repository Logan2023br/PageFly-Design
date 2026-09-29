import { z } from "zod";
import { newId } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import { cleanDomain } from "@/lib/referralServer";
import { clearReferralSession, setReferralSession } from "@/lib/session";

/* ==========================================================================
   POST   /api/collection-pages/referral/session  { domain, email, name? }
          joins the program, or signs a member back in
   DELETE signs out

   ONE FORM FOR BOTH, because a visitor does not know whether they joined last
   month. A new store becomes a member; a known store signs in when the email
   matches the one it joined with.

   WHAT THIS PROTECTS, HONESTLY. There is no password and no email to confirm —
   the app sends no mail. Knowing a member's store and email is enough to act
   as them. What that exposes is a list of store domains they typed and their
   own progress; nothing is paid out without an admin checking every referral
   by hand. A magic link is the upgrade the day this app can send email.
   ========================================================================== */

export const dynamic = "force-dynamic";

const schema = z.object({
  domain: z.string().trim().min(1, "Enter your store domain.").max(200),
  email: z.string().trim().max(200).email("That email does not look right."),
  name: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." },
      { status: 400 },
    );
  }
  const domain = cleanDomain(parsed.data.domain);
  if (!domain) {
    return Response.json(
      { ok: false, error: "Enter your store domain, like your-store.myshopify.com." },
      { status: 400 },
    );
  }
  const email = parsed.data.email.toLowerCase();
  const repo = getRepo();
  const now = new Date().toISOString();
  const known = await repo.getReferralMemberByDomain(domain);

  if (known) {
    if (known.email.toLowerCase() !== email) {
      return Response.json(
        {
          ok: false,
          error: "This store is already a member with a different email. Use the email you joined with.",
        },
        { status: 401 },
      );
    }
    await repo.saveReferralMember({ ...known, lastLoginAt: now });
    await setReferralSession(known.id);
    return Response.json({ ok: true, created: false });
  }

  const id = newId();
  await repo.saveReferralMember({
    id,
    domain,
    email,
    name: parsed.data.name || null,
    status: "active",
    rewardStatus: "none",
    rewardNote: null,
    adminNote: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  });
  await setReferralSession(id);
  return Response.json({ ok: true, created: true });
}

export async function DELETE() {
  await clearReferralSession();
  return Response.json({ ok: true });
}
