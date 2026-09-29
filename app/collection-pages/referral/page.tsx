import { CollectionShell } from "@/components/collection-pages/Shell";
import { ReferralPortal } from "@/components/collection-pages/ReferralPortal";
import { getRepo } from "@/lib/db";
import { publicMember, publicReferral } from "@/lib/referralServer";
import { readReferralSession } from "@/lib/session";

/* /collection-pages/referral — the referral program. A static segment, so it
   wins over `[set]`; `referral` is a reserved set URL for that reason. Read
   per request: the member's list is theirs and changes as they use it. */

export const metadata = { title: "Referral program — PageFly Design" };
export const dynamic = "force-dynamic";

export default async function ReferralPage() {
  const id = await readReferralSession();
  const repo = getRepo();
  const member = id ? await repo.getReferralMember(id).catch(() => null) : null;
  const referrals = member ? await repo.listReferrals(member.id).catch(() => []) : [];
  return (
    <CollectionShell>
      <ReferralPortal
        initial={member ? { member: publicMember(member), referrals: referrals.map(publicReferral) } : null}
      />
    </CollectionShell>
  );
}
