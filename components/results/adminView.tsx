"use client";

import { createContext, useContext, type ReactNode } from "react";

/* ==========================================================================
   AM I BEING LOOKED AT BY AN OPERATOR?

   HANDED DOWN RATHER THAN THREADED THROUGH. The same card draws the merchant's
   results screen, their Library and the admin's view of a store, and the route
   from the page to the card is four components deep. Four props is four
   chances to miss one — where the miss is invisible in the direction that
   matters: the button simply appears on a merchant's screen.

   The same reasoning, and the same shape, as `TileGeo` on the analytics
   screen.

   FALSE BY DEFAULT, deliberately. A card rendered somewhere nobody thought
   about gets the closed answer without being told. A gate that is open by
   default is a gate nobody notices is open.
   ========================================================================== */

/**
 * Which run a page belongs to, and whether it is hidden.
 *
 * A card is handed a `PageMockup` and nothing else, and hiding is addressed by
 * `(runId, pageId)` — page ids are only unique WITHIN a run, which is exactly
 * what the primary key on `run_pages` says. So the mapping travels with the
 * gate rather than being guessed from the page.
 */
export type AdminPages = Map<string, { runId: string; hidden: boolean }>;

type AdminScope = { domain: string; pages: AdminPages };

const AdminViewContext = createContext<AdminScope | null>(null);

export function AdminView({
  domain,
  pages,
  children,
}: {
  /** The store being looked at. An operator has no merchant session, so this
      is what lets a stored `.pagefly` be found instead of rebuilt. */
  domain: string;
  pages: AdminPages;
  children: ReactNode;
}) {
  /* A fresh object each render would remount everything below on every parent
     render; keyed on the values so identity follows them. */
  return (
    <AdminViewContext.Provider key={domain} value={{ domain, pages }}>
      {children}
    </AdminViewContext.Provider>
  );
}

/** The store an operator is looking at, or null for a merchant. */
export function useAdminDomain(): string | null {
  return useContext(AdminViewContext)?.domain ?? null;
}

/** True only inside an `<AdminView>`. */
export function useAdminView(): boolean {
  return useContext(AdminViewContext) !== null;
}

/** Where this page lives and how it stands, or null outside the admin. */
export function useAdminPage(pageId: string): { runId: string; hidden: boolean } | null {
  return useContext(AdminViewContext)?.pages.get(pageId) ?? null;
}
