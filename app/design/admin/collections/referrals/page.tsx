import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { ReferralsAdmin } from "@/components/admin/collections/ReferralsAdmin";
import { getRepo } from "@/lib/db";

/* /design/admin/collections/referrals — the referral program, for the team.
   A static segment, so it wins over `[id]`. */

export const metadata = { title: "Referral program — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function ReferralsAdminPage() {
  const gate = await adminGate("collections");
  if (gate) return gate;
  const repo = getRepo();
  const [members, referrals] = await Promise.all([
    repo.listReferralMembers().catch(() => []),
    repo.listReferrals().catch(() => []),
  ]);
  return (
    <AdminShell
      current="collections"
      title="Referral program"
      subtitle="Members, the stores they referred, and the rewards they are owed"
    >
      <ReferralsAdmin initial={{ members, referrals }} />
    </AdminShell>
  );
}
