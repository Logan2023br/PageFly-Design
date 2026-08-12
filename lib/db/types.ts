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
  /** model spend for this run. 0 when no model is configured. */
  tokens: number;
  /**
   * The pages exactly as they were built.
   *
   * Was optional while generation was deterministic — the brief alone rebuilt the
   * deck. A model writes the copy now, so replaying the brief produces DIFFERENT
   * words, and a merchant opening the Library would find a page they never saw.
   *
   * Stored for every run, not only the ones a model touched: it also decouples the
   * Library from the generator, so improving the generator later cannot rewrite
   * what someone already approved.
   */
  snapshot: unknown | null;
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

/**
 * One stock photo, remembered so the same subject is never searched twice.
 *
 * Cached in the database rather than in memory because the free tier allows
 * 200 searches an hour and a single thirty-page build asks for about 210 —
 * and a process-lifetime cache is lost on every deploy, which is exactly when
 * someone is about to test a build.
 */
export type PhotoRecord = {
  /** the search phrase, lowercased — the cache key */
  query: string;
  url: string;
  /** photographer, for the credit the API guidelines require */
  credit: string;
  /** the photo's page, which is where the credit has to link */
  link: string;
  fetchedAt: string;
};

/* ==========================================================================
   A build, as the SERVER sees it.

   Generation used to live entirely in the browser, which was right while it
   was instant. A model designing every page turned it into a minute of
   waiting, and a minute is long enough that people reload, switch tabs, or
   close the laptop — and everything was lost, including the tokens already
   spent on calls that had finished.

   The job owns the build instead. The browser starts it, polls it, and can go
   away; the pages land in the row as they finish, and the run is saved when
   the last one does.
   ========================================================================== */

export type JobStatus = "running" | "done" | "failed" | "cancelled";

export type JobRecord = {
  id: string;
  domain: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  /** encoded brief + variants — the same string a run stores */
  payload: string;
  /** what the deck is meant to contain, so progress means something before
      any page has landed */
  plan: unknown;
  /** pages finished so far, in plan order */
  pages: unknown;
  failures: unknown;
  tokens: number;
  /** why it failed, for the merchant and for the log */
  error: string | null;
};

/* ==========================================================================
   Training Design.

   Reference material an operator collects: a screenshot of a page that got it
   right, filed under the industry it belongs to. The intent is that a build for
   that industry can look at what has worked before rather than inventing a look
   from the brief alone.

   Nothing reads these during a build yet, deliberately. They are collected
   first and connected later, so the collection can be judged on its own before
   it is allowed to change what merchants see.

   The image lives in the row as a data URL rather than on disk. The app already
   runs against two storage drivers and a VPS whose disk is not part of the
   deploy; a row that carries its own picture cannot get separated from it.
   Uploads are downscaled in the browser before they are sent, so a row is
   roughly a few hundred KB rather than the several MB a screenshot arrives as.
   ========================================================================== */

export type TrainingItem = {
  id: string;
  /** the industry this reference belongs to — one vertical, never several */
  vertical: string;
  /** what an operator should take from it: "serif headings, warm neutrals" */
  note: string | null;
  /** the screenshot, as a data URL */
  image: string;
  createdAt: string;
  updatedAt: string;
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

  /* ---- build jobs ---- */
  createJob(job: JobRecord): Promise<void>;
  getJob(id: string): Promise<JobRecord | null>;
  /** The store's most recent job, whatever its state. Drives "am I mid-build?"
      on a fresh page load. */
  latestJob(domain: string): Promise<JobRecord | null>;
  updateJob(
    id: string,
    patch: Partial<Pick<JobRecord, "status" | "pages" | "failures" | "tokens" | "error">>,
  ): Promise<void>;
  /** Marks every job still claiming to run as failed. Called once at startup:
      a job lives in this process, so anything left running is from a process
      that no longer exists and would otherwise poll for ever. */
  failOrphanedJobs(): Promise<number>;

  /* ---- training design ---- */
  listTrainingItems(): Promise<TrainingItem[]>;
  saveTrainingItem(item: TrainingItem): Promise<void>;
  deleteTrainingItem(id: string): Promise<boolean>;

  /* ---- stock photos ---- */
  getPhotos(queries: string[]): Promise<PhotoRecord[]>;
  savePhotos(photos: PhotoRecord[]): Promise<void>;

  /* ---- admin ---- */
  listStoreSummaries(): Promise<StoreSummary[]>;
  stats(): Promise<AdminStats>;
};
