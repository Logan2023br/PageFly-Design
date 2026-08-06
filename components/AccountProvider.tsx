"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Account } from "@/lib/account";
import type { AccountResponse } from "@/app/api/account/route";

/* ==========================================================================
   The signed-in store, for the client.

   One value shared by the quota counter, the Create gate and the review prompt,
   so those three cannot show different numbers on the same screen.

   Seeded from the server, NOT fetched on mount. The route reads the session
   anyway, so a mount-time fetch would be a second round trip for data the first
   render already had — and it would show an empty counter for a frame. It also
   satisfies "mỗi lần reload nó sẽ check": a reload re-runs the server component.

   `refresh` re-reads it after a build, because the server owns the page count
   and a locally incremented guess drifts as soon as the same store is open in a
   second tab.
   ========================================================================== */

type Ctx = {
  account: Account | null;
  /** true only while a refresh the user triggered is in flight */
  loading: boolean;
  error: string | null;
  refresh: () => Promise<Account | null>;
};

const AccountContext = createContext<Ctx>({
  account: null,
  loading: false,
  error: null,
  refresh: async () => null,
});

export function AccountProvider({
  children,
  account: initial,
}: {
  children: React.ReactNode;
  account: Account | null;
}) {
  const [account, setAccount] = useState<Account | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account", { cache: "no-store" });
      const body = (await res.json()) as AccountResponse;
      if (body.ok) {
        setAccount(body.account);
        setError(null);
        return body.account;
      }
      /* 401 means the session is gone. The route guard sends them to sign-in on
         the next navigation, so there is nothing useful to say here — and
         blanking the counter would be the only visible effect. */
      if (res.status !== 401) setError(body.error);
      return null;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({ account, loading, error, refresh }),
    [account, loading, error, refresh],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount(): Ctx {
  return useContext(AccountContext);
}
