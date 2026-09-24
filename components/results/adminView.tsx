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

const AdminViewContext = createContext(false);

export function AdminView({ children }: { children: ReactNode }) {
  return <AdminViewContext.Provider value={true}>{children}</AdminViewContext.Provider>;
}

/** True only inside an `<AdminView>`. */
export function useAdminView(): boolean {
  return useContext(AdminViewContext);
}
