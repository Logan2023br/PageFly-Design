import "server-only";

import { findBuiltinStore, builtinStores } from "./allowlist";
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
 * Three sources, in this order:
 *
 * 1. The compiled-in list (lib/allowlist.ts). Checked first so a deployment with
 *    nothing configured still lets its testers in. Seeded into the store on the
 *    way past, so the admin screens and the page counter see it like any other.
 * 2. The database — the cached copy of the sheet. Authoritative for anyone
 *    already known, so Google being slow or down never locks out a merchant.
 * 3. The sheet, pulled only for a domain nothing has heard of, which is the one
 *    case where a stale cache would wrongly reject someone.
 */
export async function findAllowedStore(
  rawDomain: string,
): Promise<StoreRecord | null> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return null;

  const repo = getRepo();

  const builtin = findBuiltinStore(domain);
  if (builtin) {
    /* Upserted, not returned directly: the row carries page_limit and the sheet
       fields the admin table reads, and a store that can sign in but appears
       nowhere in admin is worse than not being in the list at all. */
    await repo.upsertStores([builtin]).catch(() => {});
    return (await repo.getStore(domain)) ?? builtin;
  }

  const cached = await repo.getStore(domain);
  if (cached) return cached;

  const pulled = await pullSheet();
  if (!pulled.ok) return null;

  await repo.upsertStores(pulled.rows.map((r) => r.store));
  return pulled.rows.find((r) => r.store.domain === domain)?.store ?? null;
}

/** Makes sure the compiled-in stores exist as rows, so admin lists them before
    anyone has signed in. Failures are ignored: this is a convenience, and it must
    never be the reason a page does not render. */
export async function seedBuiltinStores(): Promise<void> {
  try {
    await getRepo().upsertStores(builtinStores());
  } catch {
    // ignored on purpose
  }
}

/** The signed-in account, or null when there is no valid session. */
export async function currentAccount(): Promise<Account | null> {
  const session = await readStoreSession();
  if (!session?.domain) return null;

  const repo = getRepo();

  /* The compiled-in record is used whenever storage does not have the row. On
     serverless with no database each instance has its own empty /tmp, so the
     instance that signed a merchant in is usually not the one that renders their
     next page — looking the store up in storage alone logged them straight back
     out. The built-in list needs no storage to answer. */
  const store =
    (await repo.getStore(session.domain).catch(() => null)) ??
    findBuiltinStore(session.domain);

  /* Signed in but not in any list — removed from the sheet since. Treated as
     signed out rather than silently allowed. */
  if (!store) return null;

  /* Counters degrade to zero rather than failing the whole account: a merchant
     with no page count is a merchant who can still work. */
  const [pagesUsed, review, lastRunAt] = await Promise.all([
    repo.pagesUsed(store.domain).catch(() => 0),
    repo.getReview(store.domain).catch(() => null),
    repo.lastRunAt(store.domain).catch(() => null),
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
