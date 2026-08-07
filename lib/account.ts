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

  /* Checked before anything else. A blocked row is how an operator removes a
     store that is compiled into the built-in list, so it has to outrank it. */
  const existing = await repo.getStore(domain).catch(() => null);
  if (existing?.blocked) return null;

  const builtin = findBuiltinStore(domain);
  if (builtin) {
    /* Inserted only when the row does not exist yet. Upserting on every sign-in
       overwrote whatever an operator had edited in admin — a renamed store or a
       raised page limit reverted to the compiled-in values on the next request,
       which looks like the edit silently failing to save.

       A row that IS there is authoritative: it is the edited one. */
    if (!existing) {
      await repo.upsertStores([builtin]).catch(() => {});
      return (await repo.getStore(domain)) ?? builtin;
    }
    return existing;
  }

  if (existing) return existing;

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
    const repo = getRepo();
    const all = builtinStores();
    /* Only the ones with no row yet. Seeding unconditionally meant opening the
       admin Users page rewrote every compiled-in store back to its original name
       and page limit, undoing edits made moments earlier. */
    const existing = await Promise.all(
      all.map((s) => repo.getStore(s.domain).catch(() => null)),
    );
    const missing = all.filter((_, i) => existing[i] === null);
    if (missing.length) await repo.upsertStores(missing);
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
  const stored = await repo.getStore(session.domain).catch(() => null);
  /* A session that outlives access is not access. */
  if (stored?.blocked) return null;
  const store = stored ?? findBuiltinStore(session.domain);

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
