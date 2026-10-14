/* ==========================================================================
   The parts of admin an account can be given, in sidebar order.

   One permission per sidebar section: an account that has "collections" can
   open Collection pages and everything under it, its API included, and sees
   nothing else in the sidebar. "accounts" is the screen that creates accounts
   and hands these out, so it is a permission like the others — give it only
   to someone who may give out everything.

   The sign-in from ADMIN_USERNAME / ADMIN_PASSWORD is the owner: it always has
   every section, and is not an account that can be edited or deleted here.

   No server-only import: the sidebar and the accounts screen read it too.
   ========================================================================== */

export const ADMIN_SECTIONS = [
  { id: "stats", label: "Thống kê", href: "/design/admin" },
  { id: "users", label: "Users", href: "/design/admin/users" },
  { id: "analytics", label: "Analytics", href: "/design/admin/analytics" },
  { id: "training", label: "Training Design", href: "/design/admin/training" },
  { id: "collections", label: "Collection pages", href: "/design/admin/collections" },
  { id: "upsell", label: "Upsell Build Pages", href: "/design/admin/upsell" },
  { id: "accounts", label: "Tài khoản", href: "/design/admin/accounts" },
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number]["id"];

export const ALL_ADMIN_SECTIONS: AdminSection[] = ADMIN_SECTIONS.map((s) => s.id);

export function isAdminSection(v: unknown): v is AdminSection {
  return typeof v === "string" && (ALL_ADMIN_SECTIONS as string[]).includes(v);
}
