import { z } from "zod";
import { getRepo } from "@/lib/db";
import type { ReferralMemberRecord, ReferralRecord } from "@/lib/db/types";
import { listing } from "./list";
import { cleanDomain } from "@/lib/referralServer";
import { fail, firstIssue, guard } from "../shared";

/* ==========================================================================
   /api/admin/collection-pages/referrals — the referral program, for the team.

   GET     every member and every referral
   PATCH   one member: contact, status, reward, the team's note  { id, … }
   DELETE  one member and their referrals                         ?id=
   ========================================================================== */

export const dynamic = "force-dynamic";

export type ReferralsResponse =
  | { ok: true; members: ReferralMemberRecord[]; referrals: ReferralRecord[] }
  | { ok: false; error: string };

export async function GET() {
  return (await guard()) ?? listing();
}

const memberSchema = z.object({
  id: z.string().max(64),
  domain: z.string().trim().max(200),
  email: z.string().trim().max(200).email("That email does not look right."),
  name: z.string().trim().max(80).nullable(),
  status: z.enum(["active", "paused"]),
  rewardStatus: z.enum(["none", "granted"]),
  rewardNote: z.string().trim().max(300).nullable(),
  adminNote: z.string().trim().max(1000).nullable(),
});

export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = memberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const repo = getRepo();
  const member = await repo.getReferralMember(parsed.data.id);
  if (!member) return fail("That member no longer exists.", 404);
  const domain = cleanDomain(parsed.data.domain);
  if (!domain) return fail("That is not a store domain.");
  const clash = await repo.getReferralMemberByDomain(domain);
  if (clash && clash.id !== member.id) return fail("Another member already uses that store.", 409);
  await repo.saveReferralMember({
    ...member,
    ...parsed.data,
    domain,
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name || null,
    rewardNote: parsed.data.rewardNote || null,
    adminNote: parsed.data.adminNote || null,
    updatedAt: new Date().toISOString(),
  });
  return listing();
}

export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return fail("Which member?");
  await getRepo().deleteReferralMember(id);
  return listing();
}
