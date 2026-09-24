import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { AddStore } from "@/components/admin/AddStore";
import { PasteSheet } from "@/components/admin/PasteSheet";
import { StoreBanner } from "@/components/admin/StoreBanner";
import { SyncButton } from "@/components/admin/SyncButton";
import { UsersTable } from "@/components/admin/UsersTable";
import { DEFAULT_PAGE_SIZE } from "@/components/admin/tablePaging";
import { seedBuiltinStores } from "@/lib/account";
import { getRepo, storeFile, storeKind } from "@/lib/db";
import { readAdminSession } from "@/lib/session";
import { sheetSource } from "@/lib/sheet";

export const metadata = { title: "Users — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  if (!(await readAdminSession())) return <AdminLogin />;

  await seedBuiltinStores();
  /* THE FIRST PAGE, NOT THE WHOLE LIST. Fifteen hundred stores used to travel
     with this response so the browser could show twenty-five of them. The
     table asks for every page after this one itself, and the two header
     figures are their own cheap count rather than `array.length` over
     everything. */
  const [first, counts] = await Promise.all([
    getRepo().listStoreSummariesPage({ limit: DEFAULT_PAGE_SIZE, offset: 0, sort: "recent" }),
    getRepo().countStores(),
  ]);

  return (
    <AdminShell
      current="users"
      title="Users"
      subtitle={`${counts.total.toLocaleString()} on the list · ${counts.active} have signed in`}
      actions={<SyncButton source={sheetSource()} />}
    >
      <div className="grid gap-4">
        <StoreBanner kind={storeKind()} file={storeFile()} />
        <AddStore />
        <PasteSheet />
        <UsersTable initial={first} />
      </div>
    </AdminShell>
  );
}
