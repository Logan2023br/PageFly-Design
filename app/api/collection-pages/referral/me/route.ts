import { z } from "zod";
import { getRepo } from "@/lib/db";
import { publicMember, publicReferral } from "@/lib/referralServer";
import { currentMember } from "../member";

/* GET    the signed-in member and their referrals
   PATCH  { email, name } — their own contact details */

export const dynamic = "force-dynamic";

async function answer(memberId: string) {
  const repo = getRepo();
  const [member, referrals] = await Promise.all([
    repo.getReferralMember(memberId),
    repo.listReferrals(memberId),
  ]);
  return Response.json({
    ok: true,
    member: publicMember(member!),
    referrals: referrals.map(publicReferral),
  });
}

export async function GET() {
  const { member, denied } = await currentMember();
  return denied ?? answer(member.id);
}

export async function PATCH(request: Request) {
  const { member, denied } = await currentMember();
  if (denied) return denied;
  const parsed = z
    .object({
      email: z.string().trim().max(200).email("That email does not look right."),
      name: z.string().trim().max(80).nullable().optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  }
  await getRepo().saveReferralMember({
    ...member,
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name || null,
    updatedAt: new Date().toISOString(),
  });
  return answer(member.id);
}
