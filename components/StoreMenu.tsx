"use client";

import { useState } from "react";
import { useAccount } from "./AccountProvider";
import { Icon } from "./ui";

/* ==========================================================================
   Who is signed in, and how to stop being signed in.

   Shown on every merchant screen rather than only in the Library: the domain is
   what the whole session is scoped to — the pages, the allowance, the review —
   so it belongs wherever a merchant might wonder whose data they are looking at.
   ========================================================================== */

export function StoreMenu() {
  const { account } = useAccount();
  const [busy, setBusy] = useState(false);

  if (!account) return null;

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/store", { method: "DELETE" });
    } catch {
      /* Even if the request failed, sending them to sign-in is the right next
         move — the cookie is httpOnly, so there is nothing to clear here. */
    }
    /* Full navigation, not a router push: every route behind the guard has to be
       re-evaluated without the cookie, and the store's in-memory deck must not
       survive into the next merchant's session on a shared machine. */
    window.location.assign("/design/login");
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        title={account.storeName ? `${account.storeName} — ${account.domain}` : account.domain}
        className="hidden max-w-[220px] truncate text-[12px] text-pf-muted md:inline"
      >
        {account.domain}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        title="Sign out"
        aria-label="Sign out"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-pf-md px-2 py-1.5 text-[12px] font-semibold text-pf-faint transition-colors hover:bg-pf-card hover:text-pf-text disabled:opacity-50"
      >
        <Icon name="LogOut" size={14} />
        <span className="hidden lg:inline">{busy ? "Signing out…" : "Sign out"}</span>
      </button>
    </div>
  );
}
