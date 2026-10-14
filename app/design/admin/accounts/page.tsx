import { AdminShell } from "@/components/admin/AdminShell";
import { AccountsAdmin } from "@/components/admin/AccountsAdmin";
import { adminGate } from "@/components/admin/adminGate";
import { getRepo } from "@/lib/db";

/* /design/admin/accounts — the sign-ins to admin and what each may open. */

export const metadata = { title: "Tài khoản — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  const gate = await adminGate("accounts");
  if (gate) return gate;
  const accounts = await getRepo().listAdminAccounts();

  return (
    <AdminShell
      current="accounts"
      title="Tài khoản"
      subtitle="Tài khoản đăng nhập admin, và mỗi tài khoản được vào những mục nào"
    >
      <AccountsAdmin
        owner={process.env.ADMIN_USERNAME ?? "admin"}
        initial={accounts.map((a) => ({
          id: a.id,
          username: a.username,
          sections: a.sections,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        }))}
      />
    </AdminShell>
  );
}
