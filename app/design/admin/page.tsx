import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { StatsView } from "@/components/admin/StatsView";
import { SyncButton } from "@/components/admin/SyncButton";
import { getRepo, isEphemeralStore } from "@/lib/db";
import { readAdminSession } from "@/lib/session";
import { sheetSource } from "@/lib/sheet";

export const metadata = { title: "Admin — PageFly Design" };
export const dynamic = "force-dynamic";

export default async function AdminStatsPage() {
  if (!(await readAdminSession())) return <AdminLogin />;

  const stats = await getRepo().stats();

  return (
    <AdminShell
      current="stats"
      title="Thống kê"
      subtitle={
        isEphemeralStore()
          ? "Development store — numbers are local to this machine and are not durable."
          : undefined
      }
      actions={<SyncButton source={sheetSource()} />}
    >
      <StatsView stats={stats} />
    </AdminShell>
  );
}
