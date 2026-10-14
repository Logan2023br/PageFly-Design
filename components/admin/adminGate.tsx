import { redirect } from "next/navigation";
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/adminSections";
import { readAdmin } from "@/lib/session";
import { AdminLogin } from "./AdminLogin";
import { AdminShell } from "./AdminShell";

/**
 * The first line of every admin page: null when the page may draw, else what
 * to draw instead.
 *
 *   signed out                 the sign-in
 *   signed in, not this one    their first section — so an account that has
 *                              only Collection pages lands there from /admin
 *   signed in, no section      a page that says so, with Sign out
 */
export async function adminGate(section: AdminSection) {
  const me = await readAdmin();
  if (!me) return <AdminLogin />;
  if (me.sections.includes(section)) return null;
  const first = ADMIN_SECTIONS.find((s) => me.sections.includes(s.id));
  if (first) redirect(first.href);
  return (
    <AdminShell current={section} title="Không có quyền">
      <p className="text-[13.5px] text-pf-muted">
        Tài khoản {me.username ?? ""} chưa được cấp quyền vào mục nào trong admin. Hãy nhờ người
        quản lý tài khoản cấp quyền.
      </p>
    </AdminShell>
  );
}
