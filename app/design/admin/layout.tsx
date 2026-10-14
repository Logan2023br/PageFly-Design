import { AdminAccessProvider } from "@/components/admin/AdminAccess";
import { readAdmin } from "@/lib/session";

/* Every admin screen learns here who is signed in and what they may open, so
   the sidebar lists only those sections. Signed out, the list is empty and the
   page itself shows the sign-in. */
export default async function AdminLayout(props: LayoutProps<"/design/admin">) {
  const me = await readAdmin();
  return (
    <AdminAccessProvider value={{ username: me?.username ?? null, sections: me?.sections ?? [] }}>
      {props.children}
    </AdminAccessProvider>
  );
}
