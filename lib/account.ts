import "server-only";

import { getRepo, isEphemeralStore } from "./db";
import { readStoreSession } from "./session";
import { normalizeDomain, pullSheet } from "./sheet";
import type { StoreRecord } from "./db/types";

/* ==========================================================================
   Who is signed in, what they are allowed, and how much of it they have used.

   Shared by the sign-in route, the quota check and the review gate so those
   three can never disagree about a store's allowance.
   ========================================================================== */

export type Account = {
  domain: string;
  storeName: string | null;
  email: string | null;
  userType: string | null;
  pageLimit: number;
  pagesUsed: number;
  /** false once the allowance is spent, which is what blocks Create */
  canBuild: boolean;
  hasReviewed: boolean;
  /** ISO of the last finished build. The review prompt is timed from this rather
      than from a local timestamp, so it survives a reload and a device change. */
  lastRunAt: string | null;
  /** true when running on the dev store, so the UI can say data is not durable */
  ephemeral: boolean;
};

/**
 * Look a domain up in the allowlist.
 *
 * The database is checked first and is authoritative for a sign-in: it is the
 * cached copy of the sheet, so Google being slow or unreachable never locks a
 * merchant out. The sheet is only pulled when the domain is NOT known yet, which
 * is the one case where a stale cache would wrongly reject someone.
 */
export async function findAllowedStore(
  rawDomain: string,
): Promise<StoreRecord | null> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return null;

  const repo = getRepo();
  const cached = await repo.getStore(domain);
  if (cached) return cached;

  const pulled = await pullSheet();
  if (!pulled.ok) return null;

  await repo.upsertStores(pulled.rows.map((r) => r.store));
  return pulled.rows.find((r) => r.store.domain === domain)?.store ?? null;
}

/** The signed-in account, or null when there is no valid session. */
export async function currentAccount(): Promise<Account | null> {
  const session = await readStoreSession();
  if (!session?.domain) return null;

  const repo = getRepo();
  const store = await repo.getStore(session.domain);
  /* Signed in but no longer in the allowlist — removed from the sheet since.
     Treated as signed out rather than silently allowed. */
  if (!store) return null;

  const [pagesUsed, review, lastRunAt] = await Promise.all([
    repo.pagesUsed(store.domain),
    repo.getReview(store.domain),
    repo.lastRunAt(store.domain),
  ]);

  return {
    domain: store.domain,
    storeName: store.storeName,
    email: store.email,
    userType: store.userType,
    pageLimit: store.pageLimit,
    pagesUsed,
    canBuild: pagesUsed < store.pageLimit,
    hasReviewed: review !== null,
    lastRunAt,
    ephemeral: isEphemeralStore(),
  };
}

/**
 * How many more pages this store may build.
 *
 * Checked again on the server when a run is saved, not only in the UI: the
 * button state is a courtesy, and a page count is the thing being sold.
 */
export function remainingPages(account: Account): number {
  return Math.max(0, account.pageLimit - account.pagesUsed);
}
