import { getRepo } from "@/lib/db";
import type { ReferralsResponse } from "./route";

/** Every member and every referral — what each referral route answers with. */
export async function listing() {
  const repo = getRepo();
  const [members, referrals] = await Promise.all([repo.listReferralMembers(), repo.listReferrals()]);
  return Response.json({ ok: true, members, referrals } satisfies ReferralsResponse);
}
