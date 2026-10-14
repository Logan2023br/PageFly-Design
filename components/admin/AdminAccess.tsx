"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminSection } from "@/lib/adminSections";

/* ==========================================================================
   Who is signed in to admin and which sections they have, read once by
   app/design/admin/layout.tsx and handed to the sidebar. It decides what the
   sidebar SHOWS; what a request may DO is decided again on the server, by
   readAdminSection, on every page and route.
   ========================================================================== */

export type AdminAccessValue = { username: string | null; sections: AdminSection[] };

const AdminAccessContext = createContext<AdminAccessValue>({ username: null, sections: [] });

export function AdminAccessProvider({
  value,
  children,
}: {
  value: AdminAccessValue;
  children: ReactNode;
}) {
  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess(): AdminAccessValue {
  return useContext(AdminAccessContext);
}
