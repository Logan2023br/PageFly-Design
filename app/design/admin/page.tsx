import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { StatsView } from "@/components/admin/StatsView";
import { SyncButton } from "@/components/admin/SyncButton";
import { StoreBanner } from "@/components/admin/StoreBanner";
import { seedBuiltinStores } from "@/lib/account";
import { getRepo, storeFile, storeKind } from "@/lib/db";
import { readAdminSession } from "@/lib/session";
import { sheetSource } from "@/lib/sheet";

export const metadata = { title: "Admin — PageFly Design" };
export const dynamic = "force-dynamic";

export default async function AdminStatsPage() {
  if (!(await readAdminSession())) return <AdminLogin />;

  await seedBuiltinStores();
  const stats = await getRepo().stats();

  return (
    <AdminShell
      current="stats"
      title="Thống kê"
      actions={<SyncButton source={sheetSource()} />}
    >
      <div className="grid gap-4">
        <StoreBanner kind={storeKind()} file={storeFile()} />
        <StatsView stats={stats} />
      </div>
    </AdminShell>
  );
}
