import type { StoreRecord } from "./db/types";
import { DEFAULT_PAGE_LIMIT as FALLBACK_PAGE_LIMIT } from "./pageCatalog";
import { normalizeDomain } from "./sheet";

/* ==========================================================================
   The built-in allowlist.

   The app has to let someone in with nothing configured. Requiring a database
   and a Google credential before the first sign-in meant a fresh deploy showed a
   setup error instead of the product, which is the wrong first impression for
   something being handed to testers.

   So these stores are compiled in. The sheet is still supported and still wins
   when it is configured (see lib/account.ts) — this is the floor, not a
   replacement.

   ADDING A STORE WITHOUT A DEPLOY: set BETA_STORES to a comma-separated list of
   domains. They are admitted with default values for everything the sheet would
   otherwise supply.

   These are real merchant details, so treat this file as such: no store goes in
   here that has not agreed to be in the beta.
   ========================================================================== */

const DEFAULT_PAGE_LIMIT = Number(process.env.DEFAULT_PAGE_LIMIT ?? FALLBACK_PAGE_LIMIT);

type Seed = Omit<StoreRecord, "firstSeenAt" | "lastSeenAt" | "blocked">;

const BUILTIN: Seed[] = [
  {
    domain: "loganpagefly.myshopify.com",
    email: "tutnv@bravebits.vn",
    storeName: "Logan",
    shopifyPlan: "Grow",
    currentPlan: "Optimize 20-slot Monthly",
    daysUsed: 1,
    country: "Vietnam",
    userType: "Test User",
    status: "Đang sử dụng",
    pageLimit: 30,
  },
];

/** Extra domains from the environment, for adding a tester without a deploy. */
function fromEnv(): Seed[] {
  const raw = process.env.BETA_STORES;
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => normalizeDomain(entry))
    .filter((domain) => domain.includes("."))
    .map((domain) => ({
      domain,
      email: null,
      storeName: null,
      shopifyPlan: null,
      currentPlan: null,
      daysUsed: null,
      country: null,
      userType: "Beta",
      status: "Đang sử dụng",
      pageLimit: DEFAULT_PAGE_LIMIT,
    }));
}

/** Every compiled-in store, with the sign-in fields the caller fills. */
export function builtinStores(): StoreRecord[] {
  const seen = new Set<string>();
  const all = [...BUILTIN, ...fromEnv()];

  return all
    .filter((s) => {
      /* An env entry that repeats a built-in domain must not create a second row
         with emptier data — the compiled record is the better one. */
      if (seen.has(s.domain)) return false;
      seen.add(s.domain);
      return true;
    })
    .map((s) => ({ ...s, firstSeenAt: null, lastSeenAt: null, blocked: false }));
}

export function findBuiltinStore(domain: string): StoreRecord | null {
  const wanted = normalizeDomain(domain);
  return builtinStores().find((s) => s.domain === wanted) ?? null;
}
