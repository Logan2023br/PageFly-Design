import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { PasteSheet } from "@/components/admin/PasteSheet";
import { StoreBanner } from "@/components/admin/StoreBanner";
import { SyncButton } from "@/components/admin/SyncButton";
import { UsersTable } from "@/components/admin/UsersTable";
import { getRepo, storeFile, storeKind } from "@/lib/db";
import { readAdminSession } from "@/lib/session";
import { sheetSource } from "@/lib/sheet";

export const metadata = { title: "Users — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  if (!(await readAdminSession())) return <AdminLogin />;

  const stores = await getRepo().listStoreSummaries();
  const active = stores.filter((s) => s.lastSeenAt).length;

  return (
    <AdminShell
      current="users"
      title="Users"
      subtitle={`${stores.length} on the list · ${active} have signed in`}
      actions={<SyncButton source={sheetSource()} />}
    >
      <div className="grid gap-4">
        <StoreBanner kind={storeKind()} file={storeFile()} />
        <PasteSheet />
        <UsersTable stores={stores} />
      </div>
    </AdminShell>
  );
}
