import { Pool } from "pg";
import type {
  JobRecord,
  TrainingImage,
  TrainingSection,
  TrainingSectionSummary,
  TrainingSummary,
  PhotoRecord,
  AdminStats,
  Repo,
  RunPageRecord,
  RunRecord,
  StoreRecord,
  StoreSummary,
} from "./types";

/* ==========================================================================
   Postgres. Works unchanged against Vercel Postgres, Neon and Supabase — they
   are all Postgres, so nothing here is tied to a vendor.

   The pool is module-level and reused: a serverless function is re-entered many
   times per instance, and opening a connection per request exhausts the
   database's connection limit long before it exhausts anything else.
   ========================================================================== */

let pool: Pool | null = null;
let ensured: Promise<void> | null = null;

function getPool(url: string): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      /* Hosted Postgres is TLS-only, and Neon/Supabase present certificates the
         default trust store does not chain. This trusts the connection without
         verifying the chain — the URL itself is the secret. */
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}

const DDL = `
create table if not exists stores (
  domain        text primary key,
  email         text,
  store_name    text,
  shopify_plan  text,
  current_plan  text,
  days_used     integer,
  country       text,
  user_type     text,
  status        text,
  page_limit    integer not null default 30,
  blocked       boolean not null default false,
  first_seen_at timestamptz,
  last_seen_at  timestamptz,
  synced_at     timestamptz not null default now()
);

/* Added after the first release, so an existing table needs it too. */
alter table stores add column if not exists blocked boolean not null default false;

create table if not exists runs (
  id          text primary key,
  domain      text not null,
  created_at  timestamptz not null default now(),
  payload     text not null,
  snapshot    jsonb,
  page_count  integer not null default 0,
  tokens      integer not null default 0,
  sell        text not null default '',
  style_label text not null default ''
);
create index if not exists runs_domain_created on runs (domain, created_at desc);

create table if not exists run_pages (
  run_id    text not null references runs (id) on delete cascade,
  page_id   text not null,
  page_type text not null,
  label     text not null,
  idx       integer not null,
  primary key (run_id, page_id)
);

create table if not exists reviews (
  domain     text primary key,
  stars      integer not null,
  comment    text,
  created_at timestamptz not null default now(),
  forwarded  boolean not null default false
);

/* Keyed by the search phrase, not by store: two merchants selling ceramics ask
   for the same subjects, and the whole point is to spend one request for both.
   No expiry — a photograph that matched "potter shaping clay" last month still
   does, and re-fetching would spend the quota this table exists to protect. */
create table if not exists photos (
  query      text primary key,
  url        text not null,
  credit     text not null default '',
  link       text not null default '',
  fetched_at timestamptz not null default now()
);

/* One row per build. The pages column grows as the model finishes them, so a
   browser that comes back mid-build sees what has landed rather than starting
   over. */
create table if not exists jobs (
  id         text primary key,
  domain     text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status     text not null,
  payload    text not null,
  plan       jsonb not null default '[]',
  pages      jsonb not null default '[]',
  failures   jsonb not null default '[]',
  tokens     integer not null default 0,
  error      text
);
create index if not exists jobs_domain_created on jobs (domain, created_at desc);

/* Reference screenshots, filed by industry. The image is a data URL, so rows
   are large by the standards of this schema — a few hundred KB — which is why
   the listing query never selects it. */
create table if not exists training_items (
  id         text primary key,
  vertical   text not null,
  note       text,
  image      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_vertical on training_items (vertical, created_at desc);

/* A switch rather than a delete. An operator unsure about a reference should be
   able to stop it reaching merchants at once and still have it filed. Defaults
   true: every row that existed before the column was filed to be used. */
alter table training_items add column if not exists enabled boolean not null default true;

/* Reference screenshots for ONE ELEMENT, plus Haiku's reading of them.

   the analysis column is why this table exists rather than being a flag on the one
   above. DeepSeek cannot see an image, so a screenshot is worth nothing to a
   build until something has turned it into text — and doing that at build time
   is a vision call and several seconds on every page. Read once here, it costs
   nothing for ever, and an operator can see what was understood before it
   changes a merchant's page.

   the element column is unique: one entry per PageFly element, holding as many
   screenshots as an operator wants. Two entries for ProductBox would leave a
   build choosing between two collections for one element. */
create table if not exists training_sections (
  id          text primary key,
  element     text not null,
  note        text,
  analysis    text,
  analysed_at timestamptz,
  enabled     boolean not null default true,
  images      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
/* The trade a filing is for, or null for every trade. Added rather than baked
   into the create above, so a database that already has the table gets it too —
   and every row that predates the column reads as the shared filing, which is
   what it was: one entry serving the whole platform. */
alter table training_sections add column if not exists vertical text;

/* Uniqueness is per element AND trade. The old index was on lower(element)
   alone, which is what made one ProductBox filing serve a headphone shop, a
   moisturiser and a sofa alike.

   coalesce, not the bare column: Postgres treats NULLs as distinct in a unique
   index, so (lower(element), vertical) would happily accept two shared
   filings for the same element — and then a build would be choosing between
   two with no way to choose. */
drop index if exists training_sections_element;
create unique index if not exists training_sections_element_vertical
  on training_sections (lower(element), coalesce(vertical, ''));

/* A reference started as one screenshot and became several. The column is added
   rather than replaced, and the rows written before it are folded into the new
   shape, so nothing filed under the old one is lost. */
alter table training_items add column if not exists images jsonb not null default '[]'::jsonb;
alter table training_items alter column image drop not null;
update training_items
   set images = jsonb_build_array(image)
 where jsonb_array_length(images) = 0 and image is not null and image <> '';

/* Each screenshot grew a note of its own, so the array went from strings to
   objects. Rows written under the older shape are converted in place — the
   check is on the shape itself, so this is a no-op once it has run. */
update training_items
   set images = (
     select jsonb_agg(jsonb_build_object('src', v, 'note', null))
       from jsonb_array_elements_text(images) as v
   )
 where jsonb_array_length(images) > 0 and jsonb_typeof(images -> 0) = 'string';
`;

export function createPostgresRepo(url: string): Repo {
  const db = getPool(url);

  /* Ensured once per instance, not once per request: `create table if not
     exists` is cheap but not free, and it would run on every page view. */
  const ready = () => {
    if (!ensured) {
      ensured = db.query(DDL).then(
        () => undefined,
        (err) => {
          // Let the next request retry rather than caching a failure forever.
          ensured = null;
          throw err;
        },
      );
    }
    return ensured;
  };

  const iso = (v: unknown): string | null =>
    v instanceof Date ? v.toISOString() : typeof v === "string" ? v : null;

  const toStore = (r: Record<string, unknown>): StoreRecord => ({
    domain: String(r.domain),
    email: (r.email as string) ?? null,
    storeName: (r.store_name as string) ?? null,
    shopifyPlan: (r.shopify_plan as string) ?? null,
    currentPlan: (r.current_plan as string) ?? null,
    daysUsed: r.days_used === null ? null : Number(r.days_used),
    country: (r.country as string) ?? null,
    userType: (r.user_type as string) ?? null,
    status: (r.status as string) ?? null,
    pageLimit: Number(r.page_limit ?? 30),
    firstSeenAt: iso(r.first_seen_at),
    lastSeenAt: iso(r.last_seen_at),
    blocked: Boolean(r.blocked),
  });

  const toRun = (r: Record<string, unknown>): RunRecord => ({
    id: String(r.id),
    domain: String(r.domain),
    createdAt: iso(r.created_at) ?? "",
    payload: String(r.payload),
    pageCount: Number(r.page_count ?? 0),
    tokens: Number(r.tokens ?? 0),
    sell: String(r.sell ?? ""),
    styleLabel: String(r.style_label ?? ""),
    snapshot: r.snapshot ?? null,
  });

/** Tolerates the older array-of-strings shape as well as the current one. The
    DDL converts stored rows, but a row written by an instance still running the
    previous build during a deploy would arrive here in the old shape. */
/** One `training_sections` row, or null when there was none. */
function rowToSection(r: Record<string, unknown> | undefined): TrainingSection | null {
  if (!r) return null;
  const text = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: String(r.id),
    element: String(r.element),
    vertical: text(r.vertical),
    note: text(r.note),
    analysis: text(r.analysis),
    analysedAt: iso(r.analysed_at) ?? null,
    enabled: r.enabled !== false,
    images: normalizeImages(r.images),
    createdAt: iso(r.created_at) ?? "",
    updatedAt: iso(r.updated_at) ?? "",
  };
}

function normalizeImages(value: unknown): TrainingImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) =>
      typeof v === "string"
        ? { src: v, note: null }
        : v && typeof v === "object" && typeof (v as TrainingImage).src === "string"
          ? {
              src: (v as TrainingImage).src,
              note: (v as TrainingImage).note ?? null,
            }
          : null,
    )
    .filter((v): v is TrainingImage => v !== null);
}

const toJob = (r: Record<string, unknown>): JobRecord => ({
  id: String(r.id),
  domain: String(r.domain),
  createdAt: iso(r.created_at) ?? "",
  updatedAt: iso(r.updated_at) ?? "",
  status: String(r.status) as JobRecord["status"],
  payload: String(r.payload ?? ""),
  plan: r.plan ?? [],
  pages: r.pages ?? [],
  failures: r.failures ?? [],
  tokens: Number(r.tokens ?? 0),
  error: r.error === null || r.error === undefined ? null : String(r.error),
});

  return {
    ready,

    async upsertStores(stores) {
      await ready();
      if (stores.length === 0) return;
      /* One statement for the whole sheet. Row-at-a-time would be one network
         round trip per store, which is the slow part, not the insert.
         first_seen_at / last_seen_at are NOT touched here — they are what the
         app observed, and the sheet must never overwrite them. */
      const cols = 10;
      const values: unknown[] = [];
      const tuples = stores.map((s, i) => {
        values.push(
          s.domain,
          s.email,
          s.storeName,
          s.shopifyPlan,
          s.currentPlan,
          s.daysUsed,
          s.country,
          s.userType,
          s.status,
          s.pageLimit,
        );
        const base = i * cols;
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
      });

      await db.query(
        `insert into stores
           (domain,email,store_name,shopify_plan,current_plan,days_used,country,user_type,status,page_limit)
         values ${tuples.join(",")}
         on conflict (domain) do update set
           email = excluded.email,
           store_name = excluded.store_name,
           shopify_plan = excluded.shopify_plan,
           current_plan = excluded.current_plan,
           days_used = excluded.days_used,
           country = excluded.country,
           user_type = excluded.user_type,
           status = excluded.status,
           page_limit = excluded.page_limit,
           synced_at = now()`,
        values,
      );
    },

    async deleteStore(domain, tombstone) {
      await ready();
      if (tombstone) {
        /* Kept as a blocked row rather than deleted. Its runs stay too — an
           operator removing access should not silently destroy the merchant's
           pages, and re-adding them restores everything. */
        const { rowCount } = await db.query(
          `update stores set blocked = true where domain = $1`,
          [domain],
        );
        if (rowCount) return true;
        await db.query(
          `insert into stores (domain, blocked) values ($1, true)
           on conflict (domain) do update set blocked = true`,
          [domain],
        );
        return true;
      }
      const { rowCount } = await db.query(
        "delete from stores where domain = $1",
        [domain],
      );
      return Boolean(rowCount);
    },

    async getStore(domain) {
      await ready();
      const { rows } = await db.query(
        "select * from stores where domain = $1",
        [domain],
      );
      return rows[0] ? toStore(rows[0]) : null;
    },

    async markSignedIn(domain, at) {
      await ready();
      await db.query(
        `update stores
            set last_seen_at = $2,
                first_seen_at = coalesce(first_seen_at, $2)
          where domain = $1`,
        [domain, at],
      );
    },

    async saveRun(run, pages) {
      await ready();
      const client = await db.connect();
      try {
        await client.query("begin");
        await client.query(
          /* Update, not "do nothing".

             The id is derived from the brief, so rebuilding the same brief
             lands on the same row — which is right, it is the same deck. But
             `do nothing` meant the row kept the FIRST build's snapshot for
             ever: a merchant who rebuilt after the model started designing
             pages saw their new deck on screen and the old deterministic one
             in the Library.

             Replaced rather than accumulated, including tokens. The recorder's
             guard against re-posting is in memory and resets on remount — the
             original reason `do nothing` was here — so this has to stay
             idempotent under a repeat POST of the same deck. The cost is that
             rebuilding an identical brief reports the later build's spend
             rather than the sum.

             created_at is deliberately untouched: a re-post would otherwise
             reorder the Library for no reason the merchant did anything to
             cause. */
          `insert into runs (id,domain,created_at,payload,snapshot,page_count,tokens,sell,style_label)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (id) do update set
             snapshot   = excluded.snapshot,
             page_count = excluded.page_count,
             tokens     = excluded.tokens,
             sell       = excluded.sell,
             style_label = excluded.style_label`,
          [
            run.id,
            run.domain,
            run.createdAt,
            run.payload,
            run.snapshot === null ? null : JSON.stringify(run.snapshot),
            run.pageCount,
            run.tokens,
            run.sell,
            run.styleLabel,
          ],
        );
        for (const p of pages) {
          await client.query(
            `insert into run_pages (run_id,page_id,page_type,label,idx)
             values ($1,$2,$3,$4,$5)
             on conflict (run_id,page_id) do nothing`,
            [run.id, p.pageId, p.pageType, p.label, p.index],
          );
        }
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    },

    async listRuns(domain) {
      await ready();
      const { rows } = await db.query(
        `select r.*,
                coalesce(
                  json_agg(
                    json_build_object('pageId',p.page_id,'pageType',p.page_type,
                                      'label',p.label,'index',p.idx)
                    order by p.idx
                  ) filter (where p.page_id is not null),
                  '[]'
                ) as pages
           from runs r
           left join run_pages p on p.run_id = r.id
          where r.domain = $1
          group by r.id
          order by r.created_at desc`,
        [domain],
      );
      return rows.map((r) => ({
        ...toRun(r),
        pages: (r.pages as RunPageRecord[]).map((p) => ({ ...p, runId: r.id })),
      }));
    },

    async getRun(id) {
      await ready();
      const { rows } = await db.query("select * from runs where id = $1", [id]);
      if (!rows[0]) return null;
      const { rows: pages } = await db.query(
        `select run_id,page_id,page_type,label,idx
           from run_pages where run_id = $1 order by idx`,
        [id],
      );
      return {
        ...toRun(rows[0]),
        pages: pages.map((p) => ({
          runId: String(p.run_id),
          pageId: String(p.page_id),
          pageType: String(p.page_type),
          label: String(p.label),
          index: Number(p.idx),
        })),
      };
    },

    async pagesUsed(domain) {
      await ready();
      /* Counted from run_pages rather than summing runs.page_count: the page
         rows are what the Library actually shows, so the quota and the Library
         can never disagree. */
      const { rows } = await db.query(
        `select count(*)::int as n
           from run_pages p join runs r on r.id = p.run_id
          where r.domain = $1`,
        [domain],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async lastRunAt(domain) {
      await ready();
      const { rows } = await db.query(
        "select max(created_at) as at from runs where domain = $1",
        [domain],
      );
      return iso(rows[0]?.at);
    },

    async getReview(domain) {
      await ready();
      const { rows } = await db.query(
        "select * from reviews where domain = $1",
        [domain],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        domain: String(r.domain),
        stars: Number(r.stars),
        comment: (r.comment as string) ?? null,
        createdAt: iso(r.created_at) ?? "",
        forwarded: Boolean(r.forwarded),
      };
    },

    async saveReview(review) {
      await ready();
      /* One review per store, for ever. The primary key enforces it, and the
         update branch only exists so a webhook retry can flip `forwarded`
         without the merchant being able to change their rating. */
      await db.query(
        `insert into reviews (domain,stars,comment,created_at,forwarded)
         values ($1,$2,$3,$4,$5)
         on conflict (domain) do update set forwarded = excluded.forwarded`,
        [
          review.domain,
          review.stars,
          review.comment,
          review.createdAt,
          review.forwarded,
        ],
      );
    },

    async listTrainingItems() {
      await ready();
      /* The first image only. Selecting the whole array here is what would make
         an admin page weigh tens of megabytes. */
      const { rows } = await db.query(
        `select id, vertical, note, enabled, created_at, updated_at,
                coalesce(images -> 0 ->> 'src', '') as cover,
                jsonb_array_length(images)         as image_count
           from training_items
          order by vertical, created_at desc`,
      );
      return rows.map(
        (r): TrainingSummary => ({
          id: String(r.id),
          vertical: String(r.vertical),
          note: r.note === null || r.note === undefined ? null : String(r.note),
          enabled: r.enabled !== false,
          cover: String(r.cover ?? ""),
          imageCount: Number(r.image_count ?? 0),
          createdAt: iso(r.created_at) ?? "",
          updatedAt: iso(r.updated_at) ?? "",
        }),
      );
    },

    async getTrainingItem(id) {
      await ready();
      const { rows } = await db.query(
        `select id, vertical, note, enabled, images, created_at, updated_at
           from training_items where id = $1`,
        [id],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: String(r.id),
        vertical: String(r.vertical),
        note: r.note === null || r.note === undefined ? null : String(r.note),
        enabled: r.enabled !== false,
        images: normalizeImages(r.images),
        createdAt: iso(r.created_at) ?? "",
        updatedAt: iso(r.updated_at) ?? "",
      };
    },

    async saveTrainingItem(item) {
      await ready();
      /* Upsert, so the same call adds and edits. `image` is written as null —
         the column is only still here so rows written before this change could
         be folded forward. */
      await db.query(
        `insert into training_items (id,vertical,note,image,images,enabled,created_at,updated_at)
         values ($1,$2,$3,null,$4,$5,$6,$7)
         on conflict (id) do update set
           vertical = excluded.vertical,
           note     = excluded.note,
           images   = excluded.images,
           enabled  = excluded.enabled,
           updated_at = excluded.updated_at`,
        [
          item.id,
          item.vertical,
          item.note,
          JSON.stringify(item.images),
          item.enabled !== false,
          item.createdAt,
          item.updatedAt,
        ],
      );
    },

    async deleteTrainingItem(id) {
      await ready();
      const { rowCount } = await db.query(`delete from training_items where id = $1`, [id]);
      return (rowCount ?? 0) > 0;
    },

    /* ---- training sections ---- */

    async listTrainingSections() {
      await ready();
      /* The cover only, same reason as the template listing: selecting every
         screenshot is what makes an admin page weigh tens of megabytes.
         `analysis` IS selected — it is text, it is the thing an operator opened
         the page to read, and it is a few hundred bytes. */
      const { rows } = await db.query(
        `select id, element, vertical, note, analysis, enabled,
                created_at, updated_at,
                coalesce(images -> 0 ->> 'src', '') as cover,
                jsonb_array_length(images)         as image_count
           from training_sections
          order by element, vertical nulls last`,
      );
      return rows.map(
        (r): TrainingSectionSummary => ({
          id: String(r.id),
          element: String(r.element),
          vertical: r.vertical === null || r.vertical === undefined ? null : String(r.vertical),
          note: r.note === null || r.note === undefined ? null : String(r.note),
          analysis:
            r.analysis === null || r.analysis === undefined ? null : String(r.analysis),
          enabled: r.enabled !== false,
          cover: String(r.cover ?? ""),
          imageCount: Number(r.image_count ?? 0),
          createdAt: iso(r.created_at) ?? "",
          updatedAt: iso(r.updated_at) ?? "",
        }),
      );
    },

    async getTrainingSection(id) {
      await ready();
      const { rows } = await db.query(
        `select id, element, vertical, note, analysis, analysed_at, enabled,
                images, created_at, updated_at
           from training_sections where id = $1`,
        [id],
      );
      return rowToSection(rows[0]);
    },

    async getTrainingSectionByElementAndVertical(element, vertical) {
      await ready();
      /* Both candidates in one query, the trade's own filing first. Ordered
         rather than fetched twice: two round trips to answer one question is two
         round trips on every build. `nulls last` puts the shared filing behind
         the specific one, so `rows[0]` is already the preference. */
      const { rows } = await db.query(
        `select id, element, vertical, note, analysis, analysed_at, enabled,
                images, created_at, updated_at
           from training_sections
          where lower(element) = lower($1)
            and (vertical = $2 or vertical is null)
          order by vertical nulls last
          limit 1`,
        [element, vertical],
      );
      return rowToSection(rows[0]);
    },

    async saveTrainingSection(item) {
      await ready();
      await db.query(
        `insert into training_sections
           (id,element,vertical,note,analysis,analysed_at,enabled,images,
            created_at,updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (id) do update set
           element     = excluded.element,
           vertical    = excluded.vertical,
           note        = excluded.note,
           analysis    = excluded.analysis,
           analysed_at = excluded.analysed_at,
           enabled     = excluded.enabled,
           images      = excluded.images,
           updated_at  = excluded.updated_at`,
        [
          item.id,
          item.element,
          item.vertical,
          item.note,
          item.analysis,
          item.analysedAt,
          item.enabled !== false,
          JSON.stringify(item.images),
          item.createdAt,
          item.updatedAt,
        ],
      );
    },

    async deleteTrainingSection(id) {
      await ready();
      const { rowCount } = await db.query(
        `delete from training_sections where id = $1`,
        [id],
      );
      return (rowCount ?? 0) > 0;
    },

    async createJob(job) {
      await ready();
      await db.query(
        `insert into jobs (id,domain,created_at,updated_at,status,payload,plan,pages,failures,tokens,error)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          job.id,
          job.domain,
          job.createdAt,
          job.updatedAt,
          job.status,
          job.payload,
          JSON.stringify(job.plan ?? []),
          JSON.stringify(job.pages ?? []),
          JSON.stringify(job.failures ?? []),
          job.tokens,
          job.error,
        ],
      );
    },

    async getJob(id) {
      await ready();
      const { rows } = await db.query(`select * from jobs where id = $1`, [id]);
      return rows[0] ? toJob(rows[0]) : null;
    },

    async latestJob(domain) {
      await ready();
      const { rows } = await db.query(
        `select * from jobs where domain = $1 order by created_at desc limit 1`,
        [domain],
      );
      return rows[0] ? toJob(rows[0]) : null;
    },

    async updateJob(id, patch) {
      await ready();
      /* Built rather than written out, because a progress tick sets `pages`
         alone and a finish sets four columns. updated_at always moves — it is
         what tells a poller the job is alive. */
      const sets: string[] = ["updated_at = now()"];
      const values: unknown[] = [id];
      const put = (col: string, value: unknown) => {
        values.push(value);
        sets.push(`${col} = $${values.length}`);
      };
      if (patch.status !== undefined) put("status", patch.status);
      if (patch.pages !== undefined) put("pages", JSON.stringify(patch.pages));
      if (patch.failures !== undefined)
        put("failures", JSON.stringify(patch.failures));
      if (patch.tokens !== undefined) put("tokens", patch.tokens);
      if (patch.error !== undefined) put("error", patch.error);

      await db.query(`update jobs set ${sets.join(", ")} where id = $1`, values);
    },

    async failOrphanedJobs() {
      await ready();
      const { rowCount } = await db.query(
        `update jobs set status = 'failed', updated_at = now(),
                error = coalesce(error, 'The server restarted while this build was running.')
          where status = 'running'`,
      );
      return rowCount ?? 0;
    },

    async getPhotos(queries) {
      if (queries.length === 0) return [];
      await ready();
      const { rows } = await db.query(
        `select query, url, credit, link, fetched_at from photos where query = any($1)`,
        [queries],
      );
      return rows.map(
        (r): PhotoRecord => ({
          query: String(r.query),
          url: String(r.url),
          credit: String(r.credit ?? ""),
          link: String(r.link ?? ""),
          fetchedAt: iso(r.fetched_at) ?? "",
        }),
      );
    },

    async savePhotos(photos) {
      if (photos.length === 0) return;
      await ready();
      for (const photo of photos) {
        /* Last write wins. A query that resolves to a different photograph
           later is not worth a conflict — either one is a correct answer to
           the same search. */
        await db.query(
          `insert into photos (query,url,credit,link)
           values ($1,$2,$3,$4)
           on conflict (query) do update set
             url = excluded.url, credit = excluded.credit, link = excluded.link`,
          [photo.query, photo.url, photo.credit, photo.link],
        );
      }
    },

    async listStoreSummaries() {
      await ready();
      const { rows } = await db.query(
        /* Driven from every domain we hold anything about, not from `stores`
           alone. The public feedback link records a rating for a domain that
           may never have been in the sheet, and it deliberately does not write
           to `stores` — that table is the sign-in allowlist. Joining from
           `stores` would file those reviews somewhere nobody can read them.

           `s.*` had to go with it: the store side is now nullable, so the
           columns are named and the two that must not arrive as NULL —
           page_limit and blocked — are given the values reviewOnlyStore()
           gives them. */
        `select d.domain,
                s.email, s.store_name, s.shopify_plan, s.current_plan,
                s.days_used, s.country, s.user_type, s.status,
                coalesce(s.page_limit, 0)   as page_limit,
                s.first_seen_at, s.last_seen_at,
                coalesce(s.blocked, false)  as blocked,
                coalesce(r.run_count,0)  as run_count,
                coalesce(p.pages_used,0) as pages_used,
                coalesce(r.tokens,0)     as tokens,
                r.last_run_at,
                v.stars, v.comment, v.created_at as review_at
           from (
             select domain from stores
             union
             select domain from reviews
           ) d
           left join stores s on s.domain = d.domain
           left join (
             select domain, count(*)::int as run_count, sum(tokens)::int as tokens,
                    max(created_at) as last_run_at
               from runs group by domain
           ) r on r.domain = d.domain
           left join (
             select r2.domain, count(*)::int as pages_used
               from run_pages p2 join runs r2 on r2.id = p2.run_id
              group by r2.domain
           ) p on p.domain = d.domain
           left join reviews v on v.domain = d.domain
          order by coalesce(r.last_run_at, s.last_seen_at, v.created_at)
                   desc nulls last, d.domain`,
      );

      return rows.map((r): StoreSummary => {
        const stars = r.stars === null ? null : Number(r.stars);
        return {
          ...toStore(r),
          runCount: Number(r.run_count ?? 0),
          pagesUsed: Number(r.pages_used ?? 0),
          tokens: Number(r.tokens ?? 0),
          lastRunAt: iso(r.last_run_at),
          review:
            stars === null
              ? null
              : {
                  stars,
                  comment: (r.comment as string) ?? null,
                  createdAt: iso(r.review_at) ?? "",
                },
        };
      });
    },

    async stats() {
      await ready();
      const [totals, reviews, daily] = await Promise.all([
        db.query(
          `select
             (select count(*)::int from stores)                                as allowed_stores,
             (select count(*)::int from stores where last_seen_at is not null) as active_stores,
             (select count(*)::int from runs)                                  as total_runs,
             (select count(*)::int from run_pages)                             as total_pages,
             (select coalesce(sum(tokens),0)::int from runs)                    as total_tokens`,
        ),
        db.query(
          `select stars, count(*)::int as n from reviews group by stars order by stars`,
        ),
        db.query(
          `select to_char(date_trunc('day', r.created_at), 'YYYY-MM-DD') as date,
                  count(distinct r.id)::int as runs,
                  count(p.page_id)::int     as pages
             from runs r left join run_pages p on p.run_id = r.id
            where r.created_at > now() - interval '30 days'
            group by 1 order by 1`,
        ),
      ]);

      const t = totals.rows[0] ?? {};
      const histogram = [0, 0, 0, 0, 0];
      for (const row of reviews.rows) {
        const s = Number(row.stars);
        if (s >= 1 && s <= 5) histogram[s - 1] = Number(row.n);
      }
      return buildStats(t as Record<string, unknown>, histogram, daily.rows as never[]);
    },
  };
}

/** Shared by both drivers so the two cannot drift on how a rating counts as
    good — 4 and up, matching the red/green split in the admin table. */
export function buildStats(
  totals: Record<string, unknown>,
  histogram: number[],
  daily: { date: string; runs: number; pages: number }[],
): AdminStats {
  const total = histogram.reduce((a, b) => a + b, 0);
  const weighted = histogram.reduce((sum, n, i) => sum + n * (i + 1), 0);
  return {
    allowedStores: Number(totals.allowed_stores ?? 0),
    activeStores: Number(totals.active_stores ?? 0),
    totalRuns: Number(totals.total_runs ?? 0),
    totalPages: Number(totals.total_pages ?? 0),
    totalTokens: Number(totals.total_tokens ?? 0),
    reviews: {
      total,
      good: histogram[3] + histogram[4],
      bad: histogram[0] + histogram[1] + histogram[2],
      average: total ? Math.round((weighted / total) * 10) / 10 : 0,
      histogram,
    },
    daily: daily.map((d) => ({
      date: String(d.date),
      runs: Number(d.runs),
      pages: Number(d.pages),
    })),
  };
}
