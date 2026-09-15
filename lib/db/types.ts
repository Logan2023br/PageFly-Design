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

/**
 * `userType` for a store that came through the public registration form.
 *
 * Lives here rather than beside the route that writes it because the stats
 * query counts on it too, and a database driver importing an API route is the
 * dependency pointing the wrong way. Its neighbours in this column are `Beta`
 * (off the sheet), `Invite` (a signed link) and `Test User`.
 */
export const REGISTER_USER_TYPE = "Marketing/Register";

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

/**
 * A store record for a domain we hold a review for and nothing else.
 *
 * The public feedback link accepts a rating for any domain, and deliberately
 * does NOT write to `stores` — that table is the sign-in allowlist. So the
 * admin listing has to be able to show a domain that has no store row, and
 * this is the shape it shows it in: everything unknown, `pageLimit` zero
 * because no allowance was ever granted, and `blocked` false because nobody
 * barred it either.
 *
 * Lives beside StoreRecord rather than in a driver so both drivers answer with
 * the same row for the same absence.
 */
export function reviewOnlyStore(domain: string): StoreRecord {
  return {
    domain,
    email: null,
    storeName: null,
    shopifyPlan: null,
    currentPlan: null,
    daysUsed: null,
    country: null,
    userType: null,
    status: null,
    pageLimit: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    blocked: false,
  };
}

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
  /**
   * Stores that came through the public registration form.
   *
   * Counted off `userType` rather than a column of its own, because that field
   * already carries where every other row came from — `Beta` off the sheet,
   * `Invite` from a signed link. A boolean beside it would be a second answer
   * to a question already answered, and the two would eventually disagree.
   */
  registeredStores: number;
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
  /**
   * How far along each page that has NOT landed yet is: `pageId` → 0..1.
   *
   * `pages` answers "what is finished"; this answers "what is happening", and
   * the build screen needed both. A page takes about fifteen minutes and used
   * to produce exactly one event — itself — so the bar sat at zero for the
   * whole of it and then jumped, which looks the same as a build that hung.
   *
   * The fraction is characters of model output over an expected total, so it
   * moves at the rate the model is actually working. It is deliberately capped
   * below 1 by the runner: the expected total is a measurement with a shelf
   * life, and a fraction allowed to reach 1 would claim a page had landed
   * before it had. Only `pages` may say that.
   */
  progress: unknown;
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

/** One screenshot, and what it in particular is worth looking at for. */
export type TrainingImage = {
  src: string;
  /** specific to THIS shot — "the hero split", "how the price sits under the
      title". The reference's own note says what the store does in general. */
  note: string | null;
};

export type TrainingItem = {
  id: string;
  /** the industry this reference belongs to — one vertical, never several */
  vertical: string;
  /** what an operator should take from it: "serif headings, warm neutrals" */
  note: string | null;
  /** the screenshots. One reference is usually several pages of the same store,
      or the same page at several widths. */
  images: TrainingImage[];
  /**
   * May a build read this reference?
   *
   * A switch rather than a delete, because the two are different acts. A
   * reference an operator is unsure about should stop reaching merchants
   * immediately and stay filed so it can be looked at again; deleting it throws
   * away the screenshots and the reading with them.
   *
   * Optional in the type because rows written before the switch existed have no
   * value for it, and the migration reads a missing value as ON — those rows
   * were filed to be used.
   */
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
};

/* ==========================================================================
   TRAINING SECTIONS — the same idea, one element at a time.

   A template reference is a whole page filed by industry. A section reference is
   a single element filed by ELEMENT NAME: what a good `ProductBox` looks like,
   what a good `Accordion3` looks like. The build looks one up when it is about
   to write that element and the merchant gave it nothing to go on.

   THE ANALYSIS IS STORED, NOT PERFORMED AT BUILD TIME, and that is the whole
   design. DeepSeek cannot see an image — both v4 models reject an `image_url`
   outright — so a screenshot has to become TEXT before it is any use, and the
   only thing that can do that here is Haiku. Read at build time, that is a
   vision call and three to six seconds on every page. Read once when the
   operator saves it, it is free for ever: the screenshot does not change, so
   neither does the reading.

   It also makes the collection judgeable, which the template tab has wanted
   since it was written. The operator can see what Haiku understood, and fix the
   note or throw the reference away, BEFORE it changes what a merchant sees.
   ========================================================================== */

export type TrainingSection = {
  id: string;
  /**
   * The PageFly element this is a reference for — `ProductBox`, `Accordion3`.
   *
   * UNIQUE. One entry per element, holding as many screenshots as an operator
   * wants to file: a second `ProductBox` entry would leave the build choosing
   * between two collections for one element, and the answer to "I have another
   * good product box" is another screenshot, not another entry.
   */
  element: string;
  /**
   * The trade this filing is for, or null for "every trade".
   *
   * ONE FILING PER ELEMENT WAS THE WRONG SHAPE. A `ProductBox` reference served
   * every store on the platform, so a headphone shop, a moisturiser and a sofa
   * were all handed the same reading — which is the "every store looks the same"
   * disease the whole resolver exists to treat, arriving through the one door
   * left open.
   *
   * Null is a genuine answer, not a missing one: some readings are about the
   * ELEMENT rather than the trade — how a thumbnail strip sits, how a spec table
   * is spaced — and those are worth having once. A build prefers the filing that
   * names its trade and falls back to the shared one.
   *
   * The id is a slug from `skills/_sliced/30-verticals.md`, the same list Step 1
   * offers, because that is what a build has in hand when it looks one up.
   */
  vertical: string | null;
  /** what an operator wants remembered about it, in their own words */
  note: string | null;
  /**
   * Haiku's reading of the screenshots, as text a page designer can act on.
   *
   * Null until the analysis runs, and null again if it failed — in which case
   * the entry still holds its screenshots and can be re-analysed. A build reads
   * this field and never the images.
   */
  analysis: string | null;
  analysedAt: string | null;
  /** see `TrainingItem.enabled` — same switch, same reason */
  enabled?: boolean;
  images: TrainingImage[];
  createdAt: string;
  updatedAt: string;
};

/** A section reference without its pictures, save one. Same reason as above. */
export type TrainingSectionSummary = {
  id: string;
  element: string;
  vertical: string | null;
  note: string | null;
  analysis: string | null;
  enabled?: boolean;
  cover: string;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * A reference WITHOUT its pictures, save one.
 *
 * The listing has to exist separately because the images do not fit in it:
 * twenty references at eight screenshots each is roughly fifty megabytes, and
 * a grid of cards needs exactly one image per card to draw. The full set is
 * fetched for the one reference being opened.
 */
export type TrainingSummary = {
  id: string;
  vertical: string;
  note: string | null;
  enabled?: boolean;
  /** the first screenshot, which is what a card shows */
  cover: string;
  imageCount: number;
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
  /**
   * An operator writing, correcting or removing a rating.
   *
   * SEPARATE FROM `saveReview` ON PURPOSE, and the separation is the feature.
   * `saveReview` cannot change stars or comment — one review per store, for
   * ever, enforced by the primary key rather than by hiding the form, so that
   * a second tab cannot quietly replace what a merchant already said. That
   * rule is about the MERCHANT. Feedback also arrives by mail and by chat, and
   * a rating filed against the wrong store has no way back out.
   *
   * `null` DELETES the row rather than zeroing it. A nought-star row would sit
   * in the stats as a rating nobody gave, and would keep the store out of the
   * list the review invitations are built from — cleared has to mean "never
   * said", because that is what it means to everything downstream.
   *
   * `createdAt` is preserved when a review already exists: it records when the
   * merchant gave the feedback, not when somebody fixed a typo in it.
   */
  adminSetReview(
    domain: string,
    review: { stars: number; comment: string | null } | null,
  ): Promise<void>;

  /* ---- build jobs ---- */
  createJob(job: JobRecord): Promise<void>;
  getJob(id: string): Promise<JobRecord | null>;
  /** The store's most recent job, whatever its state. Drives "am I mid-build?"
      on a fresh page load. */
  latestJob(domain: string): Promise<JobRecord | null>;
  updateJob(
    id: string,
    patch: Partial<
      Pick<JobRecord, "status" | "pages" | "failures" | "tokens" | "error" | "progress">
    >,
  ): Promise<void>;
  /** Marks every job still claiming to run as failed. Called once at startup:
      a job lives in this process, so anything left running is from a process
      that no longer exists and would otherwise poll for ever. */
  failOrphanedJobs(): Promise<number>;

  /* ---- training design ---- */
  /** cards only — one image each, never the whole set */
  listTrainingItems(): Promise<TrainingSummary[]>;
  /** every screenshot on one reference, for the lightbox and the editor */
  getTrainingItem(id: string): Promise<TrainingItem | null>;
  saveTrainingItem(item: TrainingItem): Promise<void>;
  deleteTrainingItem(id: string): Promise<boolean>;

  /* ---- training sections ---- */
  listTrainingSections(): Promise<TrainingSectionSummary[]>;
  getTrainingSection(id: string): Promise<TrainingSection | null>;
  /** by element name and trade, which is how a BUILD finds one. Prefers the
      filing that names the trade, falls back to the shared one, then null. */
  getTrainingSectionByElementAndVertical(
    element: string,
    vertical: string | null,
  ): Promise<TrainingSection | null>;
  saveTrainingSection(item: TrainingSection): Promise<void>;
  deleteTrainingSection(id: string): Promise<boolean>;

  /* ---- stock photos ---- */
  getPhotos(queries: string[]): Promise<PhotoRecord[]>;
  savePhotos(photos: PhotoRecord[]): Promise<void>;

  /* ---- analytics ---- */
  recordEvents(events: EventRecord[]): Promise<void>;
  countEvents(from: string, to: string): Promise<EventCount[]>;

  /* ---- admin ---- */
  listStoreSummaries(): Promise<StoreSummary[]>;
  stats(): Promise<AdminStats>;
};

/* ==========================================================================
   Product analytics.

   ONE ROW PER EVENT, and nothing aggregated on the way in. A funnel is a
   question somebody asks after the fact, and the questions change — "which CTA
   converts" became "which CTA converts for people who looked at the gallery
   first" the moment the first number came back. Counters written at capture
   time can only answer the question they were written for; rows can be cut
   again.

   NO PERSONAL DATA. `visitorId` is a random id this browser made up for
   itself; it joins a landing view to the sign-in that followed and says
   nothing about who that is. `domain` is only ever present once a merchant has
   signed in, and the admin already sees every domain on the Users screen.
   ========================================================================== */

export type EventRecord = {
  id: string;
  /** `design_landing_viewed`, `design_cta_clicked`, … */
  name: string;
  /**
   * The event's own parameters — `result`, `location`, `page_type`.
   *
   * A bag rather than columns because the interesting ones differ per event
   * and adding a column per parameter is a migration every time somebody wants
   * to measure something new.
   */
  props: Record<string, unknown>;
  /** anonymous, per browser, so a funnel can be followed across pages */
  visitorId: string;
  /** the signed-in store, when there is one */
  domain: string | null;
  createdAt: string;
};

/** One event name and one combination of its parameters, counted. */
export type EventCount = {
  name: string;
  props: Record<string, unknown>;
  count: number;
  /** distinct visitors, which is the number a funnel wants — one person
      pressing a CTA four times is one person who pressed it */
  visitors: number;
  /**
   * Distinct stores, for the steps where a store is the unit.
   *
   * A visitor is a BROWSER — `visitorId` lives in its localStorage. Two
   * accounts signed into one browser are one visitor, which is right for the
   * landing page and wrong for everything after sign-in: "how many stores
   * exported a page" is a question about stores, and answering it in browsers
   * reported 1 for somebody testing with two accounts.
   *
   * Zero before anybody signs in, because `domain` is null until then.
   */
  stores: number;
};
