/* ==========================================================================
   What gets stored, and why so little of it.

   A built deck is NOT stored as pages. Generation is a pure function of the
   brief — seeded PRNG only, no Math.random and no Date.now anywhere under
   lib/generate — so a run only has to keep its brief, and reopening it rebuilds
   the same deck the merchant saw, byte for byte. A row is a few hundred bytes
   instead of megabytes of markup and images.

   `snapshot` is the escape hatch. The day page generation calls a model,
   determinism is gone and the payload alone no longer reproduces anything; from
   then on a run stores the generated pages here and the reader prefers it. The
   column exists now so that change needs no migration.
   ========================================================================== */

export type StoreRecord = {
  domain: string;
  email: string | null;
  storeName: string | null;
  shopifyPlan: string | null;
  currentPlan: string | null;
  daysUsed: number | null;
  country: string | null;
  userType: string | null;
  status: string | null;
  /** page allowance, from the sheet's "Số page" (the 30 in "09/30") */
  pageLimit: number;
  /** first and last time this store actually signed in */
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  /**
   * Refused at sign-in even though a row exists.
   *
   * Needed because some stores are compiled into lib/allowlist.ts: deleting the
   * row would let the built-in list admit them again on the next request, so a
   * removal has to leave something behind that says "no".
   */
  blocked: boolean;
};

export type RunRecord = {
  id: string;
  domain: string;
  createdAt: string;
  /** encoded brief + variants + notes — the same payload a share link carries */
  payload: string;
  pageCount: number;
  /** model spend for this run. Always 0 until generation calls a model. */
  tokens: number;
  sell: string;
  styleLabel: string;
};

export type RunPageRecord = {
  runId: string;
  pageId: string;
  pageType: string;
  label: string;
  index: number;
};

export type ReviewRecord = {
  domain: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  /** whether the n8n webhook accepted it, so failures can be retried */
  forwarded: boolean;
};

/** One row of the admin Users table: the sheet's view of a store plus what the
    app actually observed. */
export type StoreSummary = StoreRecord & {
  runCount: number;
  pagesUsed: number;
  tokens: number;
  lastRunAt: string | null;
  review: { stars: number; comment: string | null; createdAt: string } | null;
};

export type AdminStats = {
  /** stores that have signed in at least once */
  activeStores: number;
  /** stores present in the allowlist, whether they signed in or not */
  allowedStores: number;
  totalRuns: number;
  totalPages: number;
  totalTokens: number;
  reviews: {
    total: number;
    /** 4-5 stars */
    good: number;
    /** 1-3 stars */
    bad: number;
    average: number;
    /** index 0 = 1 star … index 4 = 5 stars */
    histogram: number[];
  };
  /** pages built per day, oldest first — drives the stats chart */
  daily: { date: string; pages: number; runs: number }[];
};

export type Repo = {
  /** Creates tables when missing. Safe to call on every request. */
  ready(): Promise<void>;

  /* ---- stores ---- */
  upsertStores(stores: StoreRecord[]): Promise<void>;
  getStore(domain: string): Promise<StoreRecord | null>;
  /** Removes a store. `tombstone` keeps a blocked row so a compiled-in entry
      cannot re-admit it. Returns false when there was nothing to remove. */
  deleteStore(domain: string, tombstone: boolean): Promise<boolean>;
  markSignedIn(domain: string, at: Date): Promise<void>;

  /* ---- runs ---- */
  saveRun(run: RunRecord, pages: RunPageRecord[]): Promise<void>;
  listRuns(domain: string): Promise<(RunRecord & { pages: RunPageRecord[] })[]>;
  getRun(id: string): Promise<(RunRecord & { pages: RunPageRecord[] }) | null>;
  pagesUsed(domain: string): Promise<number>;
  /** ISO of the store's most recent run, or null. Drives the review timer. */
  lastRunAt(domain: string): Promise<string | null>;

  /* ---- reviews ---- */
  getReview(domain: string): Promise<ReviewRecord | null>;
  saveReview(review: ReviewRecord): Promise<void>;

  /* ---- admin ---- */
  listStoreSummaries(): Promise<StoreSummary[]>;
  stats(): Promise<AdminStats>;
};
