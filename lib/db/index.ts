import "server-only";

import { createMemoryRepo } from "./memoryRepo";
import { createPostgresRepo } from "./postgresRepo";
import type { Repo } from "./types";

export type * from "./types";

/* ==========================================================================
   Driver selection.

   `server-only` at the top is load-bearing: this module reaches a database and
   holds credentials, and the import would otherwise be a single mistake away
   from being bundled into the browser. The build fails instead.

   Postgres whenever a URL is present, which covers Vercel Postgres, Neon and
   Supabase alike. Without one, a file-backed driver so the app runs on a fresh
   clone — but never in production, where quietly serving a private in-memory
   store per instance would look like data loss.
   ========================================================================== */

const DEV_DB_FILE = process.env.PFD_DEV_DB ?? ".pfd-dev-db.json";

function databaseUrl(): string | null {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    null
  );
}

/** Thrown when no database is configured. Distinct from a database that exists
    but is unreachable: waiting fixes the second and never fixes the first, and
    telling an operator to "try again" for this one wastes their afternoon. */
export class MissingDatabaseError extends Error {
  constructor() {
    super(
      "No database configured. Set DATABASE_URL (or POSTGRES_URL) to a Postgres " +
        "connection string — Vercel Postgres, Neon and Supabase all work.",
    );
    this.name = "MissingDatabaseError";
  }
}

let repo: Repo | null = null;

export function getRepo(): Repo {
  if (repo) return repo;

  const url = databaseUrl();
  if (url) {
    repo = createPostgresRepo(url);
    return repo;
  }

  if (process.env.NODE_ENV === "production") throw new MissingDatabaseError();

  repo = createMemoryRepo(DEV_DB_FILE);
  return repo;
}

/** True when running on the file-backed dev driver, so the UI can say so rather
    than letting someone believe their data is durable. */
export function isEphemeralStore(): boolean {
  return databaseUrl() === null;
}

export function hasDatabase(): boolean {
  return databaseUrl() !== null;
}
