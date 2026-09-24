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

/**
 * `userType` for a store that signed in without ever filling the register form.
 *
 * The gate used to refuse an unknown domain and send it to a second screen; of
 * thirty-one merchants turned away in a month, four finished registering. So an
 * unknown domain is now verified against Shopify at the door, asked for an
 * email, and admitted — and this is what marks the rows that came in that way.
 *
 * A SEPARATE VALUE FROM `REGISTER_USER_TYPE`, not a reuse of it. These rows
 * were created from a domain the merchant typed and an email they gave in one
 * breath, with nothing filled in afterwards; a row off the register form had a
 * store name and a second deliberate step behind it. Telling them apart is the
 * whole point of measuring the change.
 */
export const NO_REGISTER_USER_TYPE = "Marketing/No Register";

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

/* ==========================================================================
   THE .PAGEFLY FILE ITSELF, BUILT ONCE AND KEPT.

   Converting one mockup is a model call per band — about two minutes and
   twenty cents — and until this existed the result was held in a variable in
   the browser tab. Closing the tab lost it; reloading the results screen
   converted the WHOLE DECK again, which is the single most expensive thing
   this application did and nothing anywhere said so.

   Kept per document, not per page slot. `keyForHtml` is the page's id plus a
   hash of the mockup, so a rebuild under the same id writes a new key and the
   old file is simply never asked for again — the file follows the document it
   was made from rather than the slot the document is in.

   BYTES, NOT BASE64 IN THE SNAPSHOT. A `.pagefly` is a zip; base64 in
   `runs.snapshot` would have tripled a jsonb value that Postgres rewrites
   whole on every save of the run, to carry something no reader of that value
   wants. Its own table is read only when somebody downloads.
   ========================================================================== */
export type PageFileRecord = {
  /** the store this was built for; two stores may hold the same document */
  domain: string;
  /** `keyForHtml(page.id, mockup)` — see `lib/pagefly/prepared.ts` */
  key: string;
  /** what the merchant downloads, exactly */
  bytes: Uint8Array;
  /** the name the download is given */
  filename: string;
  createdAt: string;
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


/* ==========================================================================
   ONE ROW PER MODEL CALL.

   Before this, a build added `input + output` into a running `tokens` integer
   and threw the model's name away, so "24,596,534 tokens" could not be asked
   which model spent them or what they cost. Worse, the export path — one
   DeepSeek call per band, and the largest single consumer in the product —
   only ever wrote its usage to `console.log`, so it was not in that figure at
   all.

   ROWS, NOT COUNTERS, for the reason the events table already states: a
   counter can only answer the question it was written for. "What did Opus cost
   last week" and "which stage is expensive" and "how much of our input is
   cache hits" are three questions and one row shape.

   `costUsd` is stored rather than derived at read time because a rate is a
   fact about the day the call was made. Re-pricing history against today's
   card would silently rewrite what last month cost.
   ========================================================================== */
export type ModelCallRecord = {
  id: string;
  createdAt: string;
  /** null for work not done on behalf of one store */
  domain: string | null;
  /** which part of the pipeline spent it — "design", "page", "export" … */
  stage: string;
  vendor: string;
  model: string;
  input: number;
  output: number;
  /** of `input`, how many were served from the vendor's prompt cache */
  cached: number;
  /** of `output`, how many were the model thinking */
  reasoning: number;
  /** null when the model had no rate on file — NOT zero; see lib/ai/pricing.ts */
  costUsd: number | null;
};

/** One model's share of the bill, over a window. */
export type ModelSpendRow = {
  vendor: string;
  model: string;
  calls: number;
  input: number;
  output: number;
  cached: number;
  tokens: number;
  /** null when any call in this group was unpriced — an unknown, not a zero */
  costUsd: number | null;
};

/**
 * What slice of the build history to report on.
 *
 * `day` BEATS `days`. A picked date is a smaller and more specific question
 * than a window, and having both apply would mean "the 23rd, if it happens to
 * fall inside the last seven days" — an empty screen the operator cannot
 * explain. One or the other, and the answer says which it used.
 *
 * THE COUNTRY FILTERS THE FIGURES, NOT THE COUNTRY LIST. Narrowing the list to
 * the country already chosen leaves nothing to switch to.
 */
export type StatsQuery = {
  /** window in days; 0 is everything. Ignored when `day` is given. */
  days?: number;
  /** a calendar day in UTC, YYYY-MM-DD */
  day?: string | null;
  /** a two-letter code, or "unknown" for stores with no country on file */
  country?: string | null;
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
  /**
   * Of the stores that signed in, how many got as far as building.
   *
   * `activeStores` alone cannot tell a merchant who arrived and left from one
   * who is using the product, and those two numbers move for opposite reasons.
   */
  builtStores: number;
  /** signed in, never built — `activeStores - builtStores` */
  idleStores: number;
  /** what kind of pages were built, commonest first */
  pageTypes: { type: string; pages: number }[];
  /** where the stores are, by pages built */
  countries: { country: string; stores: number; pages: number }[];
  spend: {
    /** one row per model, dearest first */
    rows: ModelSpendRow[];
    /**
     * Tokens on runs recorded before per-call rows existed.
     *
     * Kept as its own figure rather than folded in or dropped: folding it in
     * would attribute it to a model that may not have spent it, and dropping
     * it would make the headline fall off a cliff on the day this shipped.
     */
    unattributedTokens: number;
    totalTokens: number;
    /** null when any part of the window is unpriced */
    totalCostUsd: number | null;
  };
  /** the window these build figures cover, in days; 0 means everything */
  days: number;
  /** the single day being shown, when one is picked — then `days` is moot */
  day: string | null;
  /** the country the build figures are filtered to, when one is picked */
  country: string | null;
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
  /* ---- built files ---- */
  /** Overwrites: a second build of the same document is the same document. */
  savePageFile(file: PageFileRecord): Promise<void>;
  getPageFile(domain: string, key: string): Promise<PageFileRecord | null>;
  /** Which of these keys already have a file — one round trip, not N. */
  pageFilesPresent(domain: string, keys: string[]): Promise<string[]>;

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
  countEvents(from: string, to: string, geo?: GeoFilter): Promise<EventCount[]>;
  /**
   * The same window, grouped by NAME ALONE.
   *
   * `countEvents` groups by name AND parameters, which is what a breakdown
   * needs and what a distinct-people count cannot be built from: somebody who
   * pressed the install button on two screens appears in two groups, so the
   * largest group is a FLOOR and the sum is a ceiling, and neither is the
   * answer. Only the database can intersect them.
   */
  countEventTotals(from: string, to: string, geo?: GeoFilter): Promise<EventTotal[]>;
  /**
   * The same window, split into days.
   *
   * The screen offered 7, 30 and 90 and nothing between, so a spike on one
   * Tuesday and the same total spread over a fortnight were the same number.
   * This is what lets it draw the days and let somebody pick one.
   *
   * `offsetMinutes` is the READER's offset from UTC — 420 for UTC+7. Events are
   * stored in UTC; grouped in UTC and read in Vietnam, everything before 7am
   * lands on the day before, and "today" is missing its morning. Days with no
   * events are absent rather than zero: the caller knows the window and can
   * fill the gaps, and a query that invents rows is a query that has to know
   * about calendars.
   */
  countEventsByDay(
    from: string,
    to: string,
    offsetMinutes: number,
    geo?: GeoFilter,
  ): Promise<DayCount[]>;
  /**
   * One event name, opened up: who did it, how often, and to what.
   *
   * `countEvents` answers "how many" and `countEventTotals` answers "how many
   * people". Neither can answer WHICH — the domain that made each press is
   * summed away by both, and a tile reading "28 exports · 4 stores" is exactly
   * the number whose next question is "which four".
   *
   * `propKey` is the parameter to break each store's presses down by —
   * `page_type` for an export, `result` for a sign-in, `surface` for the
   * install button. Pass null when the event carries nothing worth splitting.
   *
   * `groupProp` names a parameter to use as the row key INSTEAD of the domain
   * column, and the gate is why it exists: a refused sign-in happens before
   * there is a session, so `events.domain` is null for every one of them and
   * the domain the merchant typed is on the event's own props. Without this the
   * most-asked tile on the screen — "Not registered · 31" — opens into a single
   * row saying nobody was signed in, which is true and useless.
   *
   * Rows still come back with a null domain when neither source has one, rather
   * than being dropped: for the landing page that is the only honest answer.
   */
  eventsByStore(
    name: string,
    from: string,
    to: string,
    propKey: string | null,
    groupProp?: string | null,
    /**
     * One value of `propKey`, when the caller wants a single slice of it.
     *
     * The Install PageFly tiles are one event fired from five placements and
     * the screen draws a tile per placement; a tile that opened into all five
     * would not be the list it is a summary of. The KEY still comes from
     * `lib/analytics/detail`, which the route does not own — only this value
     * comes from a query string, and it is bound, never interpolated.
     */
    part?: string | null,
    geo?: GeoFilter,
  ): Promise<EventByStore[]>;

  /**
   * The individual presses, newest first — see `EventHit`.
   *
   * CAPPED, AND THE CAP IS THE POINT. A busy event over thirty days is tens of
   * thousands of rows and nobody reads the ten-thousandth; the tile above
   * already carries the total, so this is the recent end of it. Ordered in the
   * database rather than here, or a cap would keep an arbitrary slice instead
   * of the newest one.
   */
  recentEvents(
    name: string,
    from: string,
    to: string,
    propKey?: string | null,
    part?: string | null,
    limit?: number,
    geo?: GeoFilter,
  ): Promise<EventHit[]>;

  /**
   * Every country that appears in this window, busiest first.
   *
   * NOT FILTERED BY `geo`, deliberately: it is the list the filter is chosen
   * FROM, so narrowing it to the current choice would leave one chip on screen
   * and no way back to the others.
   */
  countriesSeen(from: string, to: string): Promise<CountryCount[]>;

  /* ---- admin ---- */
  listStoreSummaries(): Promise<StoreSummary[]>;
  /** Best-effort: metering must never fail the request it is measuring. */
  recordModelCall(call: ModelCallRecord): Promise<void>;
  stats(q?: StatsQuery): Promise<AdminStats>;
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
  /**
   * Two letters, or null.
   *
   * RESOLVED FROM THE ADDRESS AND THE ADDRESS IS NOT KEPT — see `lib/geo.ts`.
   * Null is a normal value: a request from a private network, a proxy that
   * strips the address, or a resolver that was down at the moment. Those rows
   * still count everywhere except the country breakdown.
   */
  country: string | null;
  createdAt: string;
};

/**
 * One store's presses of one event, with the parameter breakdown inside.
 *
 * This is what a tile opens into. `domain` is null for anything that fired
 * before sign-in — the landing, the gate, the register form — where there is
 * no store to name and the `parts` are the whole of the detail.
 */
export type EventByStore = {
  domain: string | null;
  count: number;
  /** distinct browsers, so a store used from two machines is still one store */
  visitors: number;
  firstAt: string;
  lastAt: string;
  /** the `propKey` values this store produced, busiest first */
  parts: { key: string; count: number }[];
};

/* ==========================================================================
   ONE PRESS, AS IT HAPPENED.

   `EventByStore` above folds a store's presses into one row with a first and a
   last time, which answers "which stores, how often". It cannot answer the
   other question people ask of this screen — "who pressed this, and when" —
   because the answer to that is a list in time order and folding destroys the
   order.

   `domain` IS NULL FOR MOST LANDING-PAGE ROWS AND THAT IS THE READING, not a
   gap. `/api/events` stamps the domain off the session cookie, so a merchant
   already signed in who comes back to the front door is named; a stranger is
   not, and never can be. A feed where most rows say "signed out" and a few name
   a store is telling you what the traffic on that button IS.

   `visitorId` IS ALWAYS THERE. It is a random value the browser made up for
   itself and says nothing about the person, but it is stable within a visit —
   so two rows sharing one is two presses by the same someone, which is what
   turns a list of clicks into a path through the page.
   ========================================================================== */
export type EventHit = {
  id: string;
  /** ISO, and the feed is ordered by this, newest first */
  at: string;
  /** the store, when the session knew one */
  domain: string | null;
  visitorId: string;
  /** two letters, or null when it could not be placed — see `EventRecord` */
  country: string | null;
  /** everything the call site sent — which button, which section, which page */
  props: Record<string, unknown>;
};

/* ==========================================================================
   NARROWING EVERY NUMBER ON THE SCREEN TO A PLACE.

   TWO DIRECTIONS, BECAUSE THE TWO QUESTIONS ARE DIFFERENT. `only` answers "how
   does this look in Vietnam"; `except` answers "how does this look with US
   OUT" — which on a product whose own team sits in one country is the more
   honest read of whether strangers are using it, and cannot be got by picking
   countries one at a time.

   `unknown` IS A PLACE YOU CAN PICK. Some rows have no country — a private
   network, a stripped header, a resolver that was down. Left unpickable they
   are a silent remainder that makes the parts not add up to the whole; named,
   "how much of this is unplaced" is a question with an answer.

   EXCLUDING KEEPS THE UNPLACED. Excluding Vietnam means "everywhere that is
   not Vietnam", and a row we could not place is not known to be Vietnamese —
   dropping it would quietly also exclude every visitor the resolver missed.
   Excluding `unknown` explicitly is how you get rid of them.
   ========================================================================== */
export type GeoFilter = {
  /** show only these — two-letter codes, or `unknown` */
  only?: string[];
  /** show everything but these */
  except?: string[];
} | null;

/** One country in a window, for the row of chips the filter is picked from. */
export type CountryCount = {
  /** two letters, or null for the rows that could not be placed */
  country: string | null;
  events: number;
  visitors: number;
};

/** One day of events, in the reader's own timezone. */
export type DayCount = {
  /** `YYYY-MM-DD`, in the offset the caller asked for */
  date: string;
  events: number;
  /** distinct browsers that day */
  visitors: number;
};

/** One event name, counted across every combination of its parameters. */
export type EventTotal = {
  name: string;
  count: number;
  visitors: number;
  stores: number;
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
