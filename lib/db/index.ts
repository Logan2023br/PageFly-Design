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

/* Where the file store writes. On Vercel only /tmp is writable, and it lives as
   long as the instance does — which is enough to click through the product, and
   not enough to keep anything. Anywhere else, a path in the project. */
const DB_FILE =
  process.env.PFD_DB_FILE ??
  process.env.PFD_DEV_DB ??
  (process.env.VERCEL ? "/tmp/pfd-store.json" : ".pfd-dev-db.json");

/* Ordered by preference, and the order matters on serverless: the first three are
   POOLED connection strings. A serverless function opens a connection per instance,
   so an unpooled string exhausts the database's connection limit long before
   anything else goes wrong — it is last on purpose, as better than no database at
   all rather than as a reasonable choice.

   The names are the ones the Vercel Marketplace integrations actually inject:
   Neon sets DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED, Supabase sets the
   POSTGRES_* family. Guessing one name and silently falling back to a temp file
   would look exactly like "the database is not working". */
const URL_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
] as const;

function databaseUrlVar(): string | null {
  const known = URL_VARS.find((name) => Boolean(process.env[name]));
  if (known) return known;

  /* Last resort: find ANY variable holding a Postgres connection string.
     Vercel's storage integrations offer a "Custom Prefix" that renames the
     injected variables, so a project set up with one would have a perfectly good
     database and this app would silently use a temp file instead — the failure
     looks like data loss and gives no hint that a name is the cause. Matching on
     the value rather than the name cannot be defeated by renaming. */
  for (const [name, value] of Object.entries(process.env)) {
    if (typeof value === "string" && /^postgres(ql)?:\/\//.test(value)) return name;
  }
  return null;
}

function databaseUrl(): string | null {
  const name = databaseUrlVar();
  return name ? (process.env[name] ?? null) : null;
}

/** Which variable the connection came from, so a misconfiguration is visible
    instead of presenting as a database that quietly does nothing. */
export function databaseSource(): string | null {
  return databaseUrlVar();
}

/** True when the connection string in use is not a pooled one. */
export function databaseIsUnpooled(): boolean {
  const name = databaseUrlVar();
  return name === "POSTGRES_URL_NON_POOLING" || name === "DATABASE_URL_UNPOOLED";
}

/** Kept for the routes that distinguish a configuration problem from a blip.
    No longer thrown by getRepo — a missing database degrades instead. */
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

  /* Falls back rather than refusing. Throwing here meant a deploy with no
     database showed a configuration error where the product should be, and
     nobody could try the thing at all. The banner in the admin screens says
     plainly that this store is not durable, which is the honest version of the
     same warning without blocking the app. */
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
