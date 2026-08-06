import { readFileSync, statSync, writeFileSync } from "node:fs";
import { buildStats } from "./postgresRepo";
import type {
  Repo,
  ReviewRecord,
  RunPageRecord,
  RunRecord,
  StoreRecord,
  StoreSummary,
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
};

const EMPTY: Shape = { stores: [], runs: [], runPages: [], reviews: [] };

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
          Object.assign(existing, s, {
            firstSeenAt: existing.firstSeenAt,
            lastSeenAt: existing.lastSeenAt,
          });
        } else {
          data.stores.push({ ...s });
        }
      }
      flush();
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
      if (data.runs.some((r) => r.id === run.id)) return;
      data.runs.push({ ...run });
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

    async listStoreSummaries() {
      sync();
      return data.stores
        .map((s): StoreSummary => {
          const runs = data.runs.filter((r) => r.domain === s.domain);
          const review = data.reviews.find((r) => r.domain === s.domain) ?? null;
          return {
            ...s,
            runCount: runs.length,
            pagesUsed: pagesOf(s.domain).length,
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

    async stats() {
      sync();
      const histogram = [0, 0, 0, 0, 0];
      for (const r of data.reviews) {
        if (r.stars >= 1 && r.stars <= 5) histogram[r.stars - 1]++;
      }

      const byDay = new Map<string, { runs: number; pages: number }>();
      for (const run of data.runs) {
        const day = run.createdAt.slice(0, 10);
        const entry = byDay.get(day) ?? { runs: 0, pages: 0 };
        entry.runs++;
        entry.pages += data.runPages.filter((p) => p.runId === run.id).length;
        byDay.set(day, entry);
      }

      return buildStats(
        {
          allowed_stores: data.stores.length,
          active_stores: data.stores.filter((s) => s.lastSeenAt).length,
          total_runs: data.runs.length,
          total_pages: data.runPages.length,
          total_tokens: data.runs.reduce((sum, r) => sum + r.tokens, 0),
        },
        histogram,
        [...byDay.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ date, ...v })),
      );
    },
  };
}
