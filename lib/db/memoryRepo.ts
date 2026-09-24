import { readFileSync, statSync, writeFileSync } from "node:fs";
import { buildStats } from "./postgresRepo";
import { REGISTER_USER_TYPE, reviewOnlyStore } from "./types";
import type {
  ModelCallRecord,
  ModelSpendRow,
  CountryCount,
  EventRecord,
  GeoFilter,
  JobRecord,
  PhotoRecord,
  Repo,
  ReviewRecord,
  RunPageRecord,
  RunRecord,
  StoreRecord,
  StoreSummary,
  TrainingItem,
  TrainingSection,
  TrainingSectionSummary,
  TrainingSummary,
} from "./types";

/* ==========================================================================
   The no-credentials driver, for local development only.

   Without it, nobody can run this app until a Postgres instance exists, and
   "clone and npm run dev" stops working. It is file-backed rather than purely
   in memory because the thing most worth testing here is that a returning
   merchant still finds their pages — which a driver that forgets on restart
   cannot demonstrate.

   It re-reads the file whenever the file has changed, which is not a nicety. A
   server component and a route handler are separate module instances, each with
   its own copy of this driver: signing in wrote the store through the route
   handler, and the page's instance never saw it, so a merchant with a valid
   session was redirected back to sign-in. Anything that caches a whole dataset in
   memory and never re-reads is wrong the moment there is more than one reader.
   ========================================================================== */

type Shape = {
  stores: StoreRecord[];
  runs: RunRecord[];
  runPages: RunPageRecord[];
  reviews: ReviewRecord[];
  /* BASE64, because this driver's whole store is one JSON file and a
     `Uint8Array` does not survive `JSON.stringify` as anything you can read
     back — it becomes an object keyed "0", "1", "2". Converted on the way in
     and out, so the Repo contract is bytes on both drivers. */
  pageFiles: { domain: string; key: string; base64: string; filename: string; createdAt: string }[];
  photos: PhotoRecord[];
  jobs: JobRecord[];
  training: TrainingItem[];
  trainingSections: TrainingSection[];
  events: EventRecord[];
  modelCalls: ModelCallRecord[];
};

/* The same rule as `geoClause` in the postgres repo, in the other language —
   see the long note there. Two implementations of one filter is one more than
   is comfortable, but the alternative is SQL in a driver that has no database:
   what has to match is the BEHAVIOUR, and `test-geo-filter.ts` asserts that it
   does by running the same cases through both. */
function geoAllows(country: string | null, geo: GeoFilter): boolean {
  if (!geo) return true;
  const key = country ?? "unknown";

  if (geo.only && geo.only.length > 0 && !geo.only.includes(key)) return false;
  if (geo.except && geo.except.length > 0 && geo.except.includes(key)) return false;
  return true;
}

const EMPTY: Shape = { stores: [], runs: [], runPages: [], reviews: [], pageFiles: [], photos: [], jobs: [], training: [], trainingSections: [], events: [], modelCalls: [] };

/** The map key for "no store". A domain can never contain a space, so this
    cannot collide with one — and unlike a NUL it survives grep and an editor. */
const NO_STORE = "(no store)";

export function createMemoryRepo(file: string): Repo {
  /* Writes are best-effort: a read-only filesystem downgrades this to a plain
     in-memory store rather than failing a request the merchant made. */
  let writable = true;
  let mtime = -1;
  let data: Shape = structuredClone(EMPTY);

  function load(): Shape {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<Shape>;
      return {
        stores: parsed.stores ?? [],
        runs: parsed.runs ?? [],
        runPages: parsed.runPages ?? [],
        reviews: parsed.reviews ?? [],
        pageFiles: parsed.pageFiles ?? [],
        photos: parsed.photos ?? [],
        jobs: parsed.jobs ?? [],
        events: parsed.events ?? [],
        modelCalls: parsed.modelCalls ?? [],
        training: parsed.training ?? [],
        /* Absent in a file written before section references existed. Rows
           written before `vertical` existed read as the shared filing, which is
           what they were: one entry serving every trade. */
        trainingSections: (parsed.trainingSections ?? []).map((t) => ({
          ...t,
          vertical: t.vertical ?? null,
        })),
      };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  /** Called at the top of every operation. A stat is a syscall on a small local
      file — far cheaper than being wrong about what is stored. */
  function sync() {
    let current = -1;
    try {
      current = statSync(file).mtimeMs;
    } catch {
      // No file yet. Keep whatever is in memory; the first flush creates it.
      if (mtime === -1) mtime = 0;
      return;
    }
    if (current !== mtime) {
      data = load();
      mtime = current;
    }
  }

  function flush() {
    if (!writable) return;
    try {
      writeFileSync(file, JSON.stringify(data, null, 2));
      /* Record the mtime we just produced, so the next sync() does not mistake
         our own write for someone else's and reload over newer memory. */
      mtime = statSync(file).mtimeMs;
    } catch {
      writable = false;
    }
  }

  const pagesOf = (domain: string) => {
    const ids = new Set(data.runs.filter((r) => r.domain === domain).map((r) => r.id));
    return data.runPages.filter((p) => ids.has(p.runId));
  };

  const withPages = (run: RunRecord) => ({
    ...run,
    pages: data.runPages
      .filter((p) => p.runId === run.id)
      .sort((a, b) => a.index - b.index),
  });

  return {
    async ready() {
      sync();
    },

    async upsertStores(stores) {
      sync();
      for (const s of stores) {
        const existing = data.stores.find((x) => x.domain === s.domain);
        if (existing) {
          // The sheet never overwrites what the app observed.
          /* blocked is preserved: a sheet re-sync must not silently restore
             access an operator removed. */
          Object.assign(existing, s, {
            firstSeenAt: existing.firstSeenAt,
            lastSeenAt: existing.lastSeenAt,
            blocked: existing.blocked,
          });
        } else {
          data.stores.push({ ...s });
        }
      }
      flush();
    },

    async deleteStore(domain, tombstone) {
      sync();
      const existing = data.stores.find((s) => s.domain === domain);
      if (tombstone) {
        if (existing) existing.blocked = true;
        else
          data.stores.push({
            domain,
            email: null,
            storeName: null,
            shopifyPlan: null,
            currentPlan: null,
            daysUsed: null,
            country: null,
            userType: null,
            status: null,
            pageLimit: 30,
            firstSeenAt: null,
            lastSeenAt: null,
            blocked: true,
          });
        flush();
        return true;
      }
      if (!existing) return false;
      data.stores = data.stores.filter((s) => s.domain !== domain);
      flush();
      return true;
    },

    async getStore(domain) {
      sync();
      return data.stores.find((s) => s.domain === domain) ?? null;
    },

    async markSignedIn(domain, at) {
      sync();
      const store = data.stores.find((s) => s.domain === domain);
      if (!store) return;
      store.lastSeenAt = at.toISOString();
      store.firstSeenAt ??= at.toISOString();
      flush();
    },

    async saveRun(run, pages) {
      sync();
      /* Same rule as the postgres driver: the id comes from the brief, so a
         rebuild lands on the same record and must REPLACE what it holds.
         created_at stays as it was — a re-save should not reorder the list. */
      const existing = data.runs.find((r) => r.id === run.id);
      if (existing) {
        existing.snapshot = run.snapshot;
        existing.pageCount = run.pageCount;
        existing.tokens = run.tokens;
        existing.sell = run.sell;
        existing.styleLabel = run.styleLabel;
      } else {
        data.runs.push({ ...run });
      }

      /* Outside the branch, and that was a bug worth the trouble it caused:
         updating an existing run returned before this ran, so a build
         cancelled at two pages and then finished at five kept a page count of
         two. The allowance under-charged and the Library's own count disagreed
         with the deck it was showing. The postgres driver always ran both
         statements; this one did not. */
      for (const p of pages) {
        if (!data.runPages.some((x) => x.runId === p.runId && x.pageId === p.pageId))
          data.runPages.push({ ...p });
      }
      flush();
    },

    async listRuns(domain) {
      sync();
      return data.runs
        .filter((r) => r.domain === domain)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(withPages);
    },

    async getRun(id) {
      sync();
      const run = data.runs.find((r) => r.id === id);
      return run ? withPages(run) : null;
    },

    async pagesUsed(domain) {
      sync();
      return pagesOf(domain).length;
    },

    async lastRunAt(domain) {
      sync();
      return (
        data.runs
          .filter((r) => r.domain === domain)
          .map((r) => r.createdAt)
          .sort()
          .at(-1) ?? null
      );
    },

    async savePageFile(file) {
      sync();
      const row = {
        domain: file.domain,
        key: file.key,
        base64: Buffer.from(file.bytes).toString("base64"),
        filename: file.filename,
        createdAt: file.createdAt,
      };
      const at = data.pageFiles.findIndex(
        (f) => f.domain === file.domain && f.key === file.key,
      );
      if (at >= 0) data.pageFiles[at] = row;
      else data.pageFiles.push(row);
      flush();
    },

    async getPageFile(domain, key) {
      sync();
      const f = data.pageFiles.find((x) => x.domain === domain && x.key === key);
      if (!f) return null;
      return {
        domain: f.domain,
        key: f.key,
        bytes: new Uint8Array(Buffer.from(f.base64, "base64")),
        filename: f.filename,
        createdAt: f.createdAt,
      };
    },

    async pageFilesPresent(domain, keys) {
      sync();
      const want = new Set(keys);
      return data.pageFiles
        .filter((f) => f.domain === domain && want.has(f.key))
        .map((f) => f.key);
    },

    async getReview(domain) {
      sync();
      return data.reviews.find((r) => r.domain === domain) ?? null;
    },

    async saveReview(review) {
      sync();
      const existing = data.reviews.find((r) => r.domain === review.domain);
      // One review per store, for ever — only the forwarded flag may change.
      if (existing) existing.forwarded = review.forwarded;
      else data.reviews.push({ ...review });
      flush();
    },

    async adminSetReview(domain, review) {
      sync();
      const i = data.reviews.findIndex((r) => r.domain === domain);

      if (!review) {
        /* Deleted, not zeroed — see the note on the contract. */
        if (i >= 0) data.reviews.splice(i, 1);
        flush();
        return;
      }

      /* Blank is nothing, not an empty string — see the postgres driver for why
         the two must agree on this. */
      const comment = review.comment?.trim() || null;

      if (i >= 0) {
        /* createdAt and forwarded both survive: one records when the merchant
           gave the feedback, the other whether the webhook has had it. */
        data.reviews[i] = {
          ...data.reviews[i],
          stars: review.stars,
          comment,
        };
      } else {
        data.reviews.push({
          domain,
          stars: review.stars,
          comment,
          createdAt: new Date().toISOString(),
          forwarded: false,
        });
      }
      flush();
    },

    async listTrainingItems() {
      sync();
      return [...data.training]
        .sort(
          (a, b) =>
            a.vertical.localeCompare(b.vertical) ||
            b.createdAt.localeCompare(a.createdAt),
        )
        .map(
          (t): TrainingSummary => ({
            id: t.id,
            vertical: t.vertical,
            note: t.note,
            enabled: t.enabled ?? true,
            /* One image, same reason as the postgres driver: a card needs a
               cover, not the set. */
            cover: t.images[0]?.src ?? "",
            imageCount: t.images.length,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }),
        );
    },

    async getTrainingItem(id) {
      sync();
      const found = data.training.find((t) => t.id === id);
      return found ? { ...found, images: [...found.images] } : null;
    },

    async saveTrainingItem(item) {
      sync();
      const i = data.training.findIndex((t) => t.id === item.id);
      if (i >= 0) data.training[i] = { ...item };
      else data.training.push({ ...item });
      flush();
    },

    async deleteTrainingItem(id) {
      sync();
      const before = data.training.length;
      data.training = data.training.filter((t) => t.id !== id);
      if (data.training.length === before) return false;
      flush();
      return true;
    },

    /* ---- training sections ---- */

    async listTrainingSections() {
      sync();
      return [...data.trainingSections]
        /* Element first, then trade, with the shared filing last inside each
           element — which is the order an operator reads them in. */
        .sort(
          (a, b) =>
            a.element.localeCompare(b.element) ||
            (a.vertical ?? "\uffff").localeCompare(b.vertical ?? "\uffff"),
        )
        .map(
          (t): TrainingSectionSummary => ({
            id: t.id,
            element: t.element,
            vertical: t.vertical ?? null,
            note: t.note,
            analysis: t.analysis,
            /* Absent means ON: an entry filed before the switch existed was
               filed to be used. */
            enabled: t.enabled ?? true,
            cover: t.images[0]?.src ?? "",
            imageCount: t.images.length,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }),
        );
    },

    async getTrainingSection(id) {
      sync();
      const found = data.trainingSections.find((t) => t.id === id);
      return found ? { ...found, images: [...found.images] } : null;
    },

    async getTrainingSectionByElementAndVertical(element, vertical) {
      sync();
      const of = (t: TrainingSection) => t.element.toLowerCase() === element.toLowerCase();
      /* The trade's own filing first. Falling back to the shared one is the
         point of allowing null at all — a reading about how a thumbnail strip
         sits is worth having once, for everybody. */
      const exact = vertical
        ? data.trainingSections.find((t) => of(t) && t.vertical === vertical)
        : undefined;
      const shared = data.trainingSections.find((t) => of(t) && !t.vertical);
      const found = exact ?? shared;
      return found ? { ...found, images: [...found.images] } : null;
    },

    async saveTrainingSection(item) {
      sync();
      const i = data.trainingSections.findIndex((t) => t.id === item.id);
      if (i >= 0) data.trainingSections[i] = { ...item };
      else data.trainingSections.push({ ...item });
      flush();
    },

    async deleteTrainingSection(id) {
      sync();
      const before = data.trainingSections.length;
      data.trainingSections = data.trainingSections.filter((t) => t.id !== id);
      if (data.trainingSections.length === before) return false;
      flush();
      return true;
    },

    async createJob(job) {
      sync();
      data.jobs.push({ ...job });
      flush();
    },

    async getJob(id) {
      sync();
      const job = data.jobs.find((j) => j.id === id);
      /* `progress` defaulted on the way out, not on the way in: this store is
         a file, and a job written before the field existed is still in it. The
         Postgres driver does the same in `toJob` for the same reason. */
      return job ? { ...job, progress: job.progress ?? {} } : null;
    },

    async latestJob(domain) {
      sync();
      const found = data.jobs
        .filter((j) => j.domain === domain)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return found ? { ...found, progress: found.progress ?? {} } : null;
    },

    async updateJob(id, patch) {
      sync();
      const job = data.jobs.find((j) => j.id === id);
      if (!job) return;
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      flush();
    },

    async failOrphanedJobs() {
      sync();
      const stale = data.jobs.filter((j) => j.status === "running");
      for (const job of stale) {
        job.status = "failed";
        job.error ??= "The server restarted while this build was running.";
        job.updatedAt = new Date().toISOString();
      }
      if (stale.length) flush();
      return stale.length;
    },

    async getPhotos(queries) {
      sync();
      const want = new Set(queries);
      return data.photos.filter((p) => want.has(p.query)).map((p) => ({ ...p }));
    },

    async savePhotos(photos) {
      if (photos.length === 0) return;
      sync();
      for (const photo of photos) {
        const i = data.photos.findIndex((p) => p.query === photo.query);
        if (i >= 0) data.photos[i] = { ...photo };
        else data.photos.push({ ...photo });
      }
      flush();
    },

    async listStoreSummaries() {
      sync();
      /* Every domain we hold anything about, not only the ones in the store
         list. A review can arrive from the public feedback link for a domain
         that was never in the sheet, and listing only `stores` would record it
         and then never show it to anyone — the same as not recording it. */
      const domains = [
        ...new Set([
          ...data.stores.map((s) => s.domain),
          ...data.reviews.map((r) => r.domain),
        ]),
      ];

      return domains
        .map((domain): StoreSummary => {
          const runs = data.runs.filter((r) => r.domain === domain);
          const review = data.reviews.find((r) => r.domain === domain) ?? null;
          return {
            ...(data.stores.find((s) => s.domain === domain) ??
              reviewOnlyStore(domain)),
            runCount: runs.length,
            pagesUsed: pagesOf(domain).length,
            tokens: runs.reduce((sum, r) => sum + r.tokens, 0),
            lastRunAt:
              runs.map((r) => r.createdAt).sort().at(-1) ?? null,
            review: review
              ? {
                  stars: review.stars,
                  comment: review.comment,
                  createdAt: review.createdAt,
                }
              : null,
          };
        })
        .sort((a, b) =>
          (b.lastRunAt ?? b.lastSeenAt ?? "").localeCompare(
            a.lastRunAt ?? a.lastSeenAt ?? "",
          ),
        );
    },

    async recordEvents(events) {
      if (events.length === 0) return;
      sync();
      /* Ids are the browser's, so a retried batch must not double-count. */
      const seen = new Set(data.events.map((e) => e.id));
      for (const e of events) if (!seen.has(e.id)) data.events.push(e);

      /* A CEILING, which the Postgres driver does not need. This store is a
         JSON file rewritten whole on every write, and events are the highest
         volume thing in it by an order of magnitude — left unbounded the file
         grows until writing it is the slowest part of a page view. Twenty
         thousand is enough for a dev machine to answer every question this
         app asks; production is Postgres. */
      if (data.events.length > 20_000) data.events.splice(0, data.events.length - 20_000);
      flush();
    },

    async countriesSeen(from, to) {
      sync();
      /* Not narrowed by the current filter — see the postgres note. */
      const by = new Map<string | null, { events: number; visitors: Set<string> }>();
      for (const e of data.events) {
        if (e.createdAt < from || e.createdAt >= to) continue;
        const key = e.country ?? null;
        const hit = by.get(key) ?? { events: 0, visitors: new Set<string>() };
        hit.events++;
        hit.visitors.add(e.visitorId);
        by.set(key, hit);
      }
      return [...by.entries()]
        .map(([country, b]) => ({ country, events: b.events, visitors: b.visitors.size }))
        .sort((a, b) => b.events - a.events);
    },

    async countEvents(from, to, geo = null) {
      sync();
      const buckets = new Map<
        string,
        {
          name: string;
          props: Record<string, unknown>;
          count: number;
          visitors: Set<string>;
          stores: Set<string>;
        }
      >();

      for (const e of data.events) {
        if (e.createdAt < from || e.createdAt >= to) continue;
        if (!geoAllows(e.country ?? null, geo)) continue;
        /* The same grouping the SQL does: name plus the whole props bag, so a
           parameter this code has never heard of still splits the counts. */
        const key = `${e.name}\u0000${JSON.stringify(e.props ?? {})}`;
        const hit =
          buckets.get(key) ??
          {
            name: e.name,
            props: e.props ?? {},
            count: 0,
            visitors: new Set<string>(),
            stores: new Set<string>(),
          };
        hit.count++;
        hit.visitors.add(e.visitorId);
        /* Nulls are not a store. Matching `count(distinct domain)` in Postgres,
           which skips them. */
        if (e.domain) hit.stores.add(e.domain);
        buckets.set(key, hit);
      }

      return [...buckets.values()]
        .map((b) => ({
          name: b.name,
          props: b.props,
          count: b.count,
          visitors: b.visitors.size,
          stores: b.stores.size,
        }))
        .sort((a, b) => b.count - a.count);
    },

    async countEventTotals(from, to, geo = null) {
      sync();
      const by = new Map<string, { count: number; visitors: Set<string>; stores: Set<string> }>();

      for (const e of data.events) {
        if (e.createdAt < from || e.createdAt >= to) continue;
        if (!geoAllows(e.country ?? null, geo)) continue;
        const hit = by.get(e.name) ?? { count: 0, visitors: new Set<string>(), stores: new Set<string>() };
        hit.count++;
        hit.visitors.add(e.visitorId);
        if (e.domain) hit.stores.add(e.domain);
        by.set(e.name, hit);
      }

      return [...by.entries()].map(([name, b]) => ({
        name,
        count: b.count,
        visitors: b.visitors.size,
        stores: b.stores.size,
      }));
    },

    async countEventsByDay(from, to, offsetMinutes, geo = null) {
      sync();
      const by = new Map<string, { events: number; visitors: Set<string> }>();

      for (const e of data.events) {
        if (e.createdAt < from || e.createdAt >= to) continue;
        if (!geoAllows(e.country ?? null, geo)) continue;
        /* Shifted, then read in UTC — which is the same arithmetic the reader's
           own clock does, without dragging a timezone database in to do it. */
        const shifted = new Date(Date.parse(e.createdAt) + offsetMinutes * 60_000);
        const date = shifted.toISOString().slice(0, 10);
        const hit = by.get(date) ?? { events: 0, visitors: new Set<string>() };
        hit.events++;
        hit.visitors.add(e.visitorId);
        by.set(date, hit);
      }

      return [...by.entries()]
        .map(([date, b]) => ({ date, events: b.events, visitors: b.visitors.size }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async recentEvents(name, from, to, propKey = null, part = null, limit = 200, geo = null) {
      sync();
      const hits = [];
      for (const e of data.events) {
        if (e.name !== name) continue;
        if (e.createdAt < from || e.createdAt >= to) continue;
        if (!geoAllows(e.country ?? null, geo)) continue;
        if (part !== null && propKey) {
          const v = (e.props as Record<string, unknown>)[propKey];
          if (v === undefined || v === null || String(v) !== part) continue;
        }
        hits.push({
          id: e.id,
          at: e.createdAt,
          domain: e.domain ?? null,
          visitorId: e.visitorId,
          country: e.country ?? null,
          props: (e.props ?? {}) as Record<string, unknown>,
        });
      }
      /* Sorted BEFORE the cap, for the reason the postgres one gives: cutting
         first keeps an arbitrary slice rather than the newest. */
      hits.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      return hits.slice(0, Math.min(1000, Math.max(1, limit)));
    },

    async eventsByStore(name, from, to, propKey, groupProp = null, part = null, geo = null) {
      sync();
      /* Keyed by the domain as written, with `null` kept as its own key rather
         than folded into the empty string — "signed out" and "a store called
         nothing" would otherwise be the same row. */
      const by = new Map<
        string,
        {
          domain: string | null;
          count: number;
          visitors: Set<string>;
          firstAt: string;
          lastAt: string;
          parts: Map<string, number>;
        }
      >();

      for (const e of data.events) {
        if (e.name !== name) continue;
        if (e.createdAt < from || e.createdAt >= to) continue;
        if (!geoAllows(e.country ?? null, geo)) continue;
        /* One slice of the parameter, when the caller asked for one. */
        if (part !== null && propKey) {
          const v = (e.props as Record<string, unknown>)[propKey];
          if (v === undefined || v === null || String(v) !== part) continue;
        }

        /* The column, unless a parameter was named. The gate fires before there
           is a session, so for those events the store the merchant typed is
           only ever on the props — see `groupProp` on the Repo interface. */
        const rowDomain = groupProp
          ? ((v) => (v === undefined || v === null || v === "" ? null : String(v)))(
              (e.props as Record<string, unknown>)[groupProp],
            )
          : (e.domain ?? null);
        const key = rowDomain ?? NO_STORE;
        const hit = by.get(key) ?? {
          domain: rowDomain,
          count: 0,
          visitors: new Set<string>(),
          firstAt: e.createdAt,
          lastAt: e.createdAt,
          parts: new Map<string, number>(),
        };
        hit.count++;
        hit.visitors.add(e.visitorId);
        if (e.createdAt < hit.firstAt) hit.firstAt = e.createdAt;
        if (e.createdAt > hit.lastAt) hit.lastAt = e.createdAt;

        if (propKey) {
          /* Arrays and numbers reach `props` too — `error_field` is a list.
             Stringified rather than skipped: a breakdown that silently drops
             the shapes it did not expect is a breakdown that lies. */
          const raw = (e.props as Record<string, unknown>)[propKey];
          if (raw !== undefined && raw !== null) {
            const v = Array.isArray(raw) ? raw.join("+") : String(raw);
            hit.parts.set(v, (hit.parts.get(v) ?? 0) + 1);
          }
        }

        by.set(key, hit);
      }

      return [...by.values()]
        .map((b) => ({
          domain: b.domain,
          count: b.count,
          visitors: b.visitors.size,
          firstAt: b.firstAt,
          lastAt: b.lastAt,
          parts: [...b.parts.entries()]
            .map(([key, count]) => ({ key, count }))
            .sort((x, y) => y.count - x.count || x.key.localeCompare(y.key)),
        }))
        .sort((x, y) => y.count - x.count || (x.domain ?? "").localeCompare(y.domain ?? ""));
    },

    async recordModelCall(call) {
      /* Best effort, exactly as in the postgres driver: a measurement must
         never fail the thing it measures. */
      try {
        sync();
        if (!data.modelCalls.some((c) => c.id === call.id)) data.modelCalls.push(call);
        flush();
      } catch {
        /* nothing */
      }
    },

    async stats(q = {}) {
      sync();

      /* THE SAME RULES AS THE SQL, in the other language — the driver split
         this repo already worries about in `geoAllows`. The day beats the
         window, and the day is read in UTC on both sides so the bar labelled
         09-23 and the rows for "2026-09-23" are the same day on a server that
         is not on UTC. */
      const day = typeof q.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.day) ? q.day : null;
      const n = day !== null ? 0 : Math.max(0, Math.floor(Number(q.days ?? 30) || 0));
      const country = typeof q.country === "string" && q.country ? q.country : null;

      const cutoff = n === 0 ? null : Date.now() - n * 86_400_000;
      const inWindow = (iso: string) =>
        day !== null ? iso.slice(0, 10) === day : cutoff === null || Date.parse(iso) > cutoff;

      /* An empty string and a null are the same absence. Two keys for it put
         two rows both reading "Unplaced" on the live screen. */
      const countryOf = (domain: string) =>
        data.stores.find((s) => s.domain === domain)?.country?.trim() || "unknown";
      const inCountry = (domain: string) => country === null || countryOf(domain) === country;

      const histogram = [0, 0, 0, 0, 0];
      for (const r of data.reviews) {
        if (r.stars >= 1 && r.stars <= 5) histogram[r.stars - 1]++;
      }

      /* The time window alone — the country chips are built from this, so
         that picking one still leaves the others to switch to. */
      const timed = data.runs.filter((r) => inWindow(r.createdAt));
      const runs = timed.filter((r) => inCountry(r.domain));
      const runIds = new Set(runs.map((r) => r.id));
      const pages = data.runPages.filter((p) => runIds.has(p.runId));

      const byDay = new Map<string, { runs: number; pages: number }>();
      for (const run of runs) {
        const day = run.createdAt.slice(0, 10);
        const entry = byDay.get(day) ?? { runs: 0, pages: 0 };
        entry.runs++;
        entry.pages += data.runPages.filter((p) => p.runId === run.id).length;
        byDay.set(day, entry);
      }

      const byType = new Map<string, number>();
      for (const p of pages) byType.set(p.pageType, (byType.get(p.pageType) ?? 0) + 1);

      /* A store counts as having built only where a page row exists — the same
         rule the proof feed uses, and for the same reason: a run that claimed
         pages with nothing behind it delivered nothing. */
      /* THE STORE FIGURES TAKE THE COUNTRY AND NOT THE WINDOW — the same rule
         the SQL side states at length. A country is a property of a store, so
         narrowing by it asks the same question of fewer stores; a window is
         not, and "how many built this week" gets its own figure rather than
         redefining "how many stores do we have". */
      const stores = data.stores.filter((st) => country === null || (st.country?.trim() || "unknown") === country);
      const everBuilt = new Set(
        data.runs
          .filter((r) => data.runPages.some((p) => p.runId === r.id) && inCountry(r.domain))
          .map((r) => r.domain),
      );
      const builtHere = new Set(
        runs.filter((r) => data.runPages.some((p) => p.runId === r.id)).map((r) => r.domain),
      );

      const geo = new Map<string, { stores: Set<string>; pages: number }>();
      for (const r of timed) {
        const pagesOf = data.runPages.filter((p) => p.runId === r.id).length;
        if (pagesOf === 0) continue;
        const key = countryOf(r.domain);
        const hit = geo.get(key) ?? { stores: new Set<string>(), pages: 0 };
        hit.stores.add(r.domain);
        hit.pages += pagesOf;
        geo.set(key, hit);
      }

      /* Spend reaches a country through the run that paid for it; a call with
         no run — the on-demand export, which has no store — has no country, so
         picking one correctly leaves it out. */
      const ofRun = new Set(runs.map((r) => r.id));
      const calls = data.modelCalls.filter(
        (c) => inWindow(c.createdAt) && (country === null || ofRun.has(c.id.split(":")[0])),
      );
      const byModel = new Map<string, ModelSpendRow & { unpriced: boolean }>();
      for (const c of calls) {
        const key = `${c.vendor}/${c.model}`;
        const hit = byModel.get(key) ?? {
          vendor: c.vendor, model: c.model, calls: 0,
          input: 0, output: 0, cached: 0, tokens: 0, costUsd: 0, unpriced: false,
        };
        hit.calls++;
        hit.input += c.input;
        hit.output += c.output;
        hit.cached += c.cached;
        hit.tokens += c.input + c.output;
        if (c.costUsd === null) hit.unpriced = true;
        else hit.costUsd = (hit.costUsd ?? 0) + c.costUsd;
        byModel.set(key, hit);
      }

      const measured = new Set(calls.map((c) => c.id.split(":")[0]));
      const unattributed = runs
        .filter((r) => !measured.has(r.id))
        .reduce((sum, r) => sum + r.tokens, 0);

      return buildStats(
        {
          allowed_stores: stores.length,
          active_stores: stores.filter((st) => st.lastSeenAt).length,
          registered_stores: stores.filter((st) => st.userType === REGISTER_USER_TYPE).length,
          built_stores: everBuilt.size,
          built_stores_window: builtHere.size,
          total_runs: runs.length,
          total_pages: pages.length,
          total_tokens: runs.reduce((sum, r) => sum + r.tokens, 0),
        },
        histogram,
        [...byDay.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ date, ...v })),
        {
          days: n,
          day,
          country,
          pageTypes: [...byType.entries()]
            .map(([type, p]) => ({ type, pages: p }))
            .sort((a, b) => b.pages - a.pages || a.type.localeCompare(b.type)),
          countries: [...geo.entries()]
            .map(([country, v]) => ({ country, stores: v.stores.size, pages: v.pages }))
            .sort((a, b) => b.pages - a.pages || a.country.localeCompare(b.country)),
          spendRows: [...byModel.values()]
            .map(({ unpriced, ...row }) => ({ ...row, costUsd: unpriced ? null : row.costUsd }))
            .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0) || b.tokens - a.tokens),
          unattributedTokens: unattributed,
        },
      );
    },
  };
}
