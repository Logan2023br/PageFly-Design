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
   Supabase alike.

   Without one there is a file-backed store, and whether that is acceptable
   depends entirely on where this runs:

   - On a fresh clone it is how `npm run dev` works with no credentials.
   - On a SINGLE-INSTANCE server with a persistent disk — a company VPS — it is a
     legitimate choice, and PFD_STORE=file says so explicitly.
   - On Vercel it is never acceptable. Serverless instances neither share a disk
     nor keep one, so each would answer from its own copy and merchants would see
     their library appear and disappear depending on which instance replied. That
     is why production refuses it unless opted into by name: the failure looks
     exactly like data loss and would be blamed on anything but the store.
   ========================================================================== */

/** Explicit opt-in for the file store in production. Only safe when exactly one
    process serves the app and its disk survives restarts. */
const FILE_STORE = process.env.PFD_STORE === "file";

const DB_FILE =
  process.env.PFD_DB_FILE ?? process.env.PFD_DEV_DB ?? ".pfd-dev-db.json";

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

  if (process.env.NODE_ENV === "production" && !FILE_STORE)
    throw new MissingDatabaseError();

  repo = createMemoryRepo(DB_FILE);
  return repo;
}

/** Where data actually goes, for the admin banner. An operator should never have
    to read code to find out whether their data is durable. */
export function storeKind(): "postgres" | "file" {
  return databaseUrl() ? "postgres" : "file";
}

export function storeFile(): string {
  return DB_FILE;
}

/** True when running on the file-backed dev driver, so the UI can say so rather
    than letting someone believe their data is durable. */
/** True when data lives in a file rather than Postgres. Not the same as "lost on
    restart" — on a VPS with a real disk the file survives; on Vercel it does not. */
export function isEphemeralStore(): boolean {
  return databaseUrl() === null;
}

export function hasDatabase(): boolean {
  return databaseUrl() !== null;
}
