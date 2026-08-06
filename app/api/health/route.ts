import { hasDatabase } from "@/lib/db";
import { hasSessionSecret } from "@/lib/session";
import { sheetSource } from "@/lib/sheet";

/* ==========================================================================
   GET /api/health

   Which settings are present, so a deployment that will not let anyone in can be
   diagnosed in one request instead of by guessing which of three things is
   missing. That question came up the first time this was deployed, which is
   exactly when a person has the least patience for it.

   Booleans and names only — never a value, never a partial value. Knowing THAT a
   database URL is configured is useless to an attacker; knowing any part of it is
   not. Reachability is deliberately not tested: opening a connection on an
   unauthenticated endpoint is a free way to exhaust the connection pool.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    database: hasDatabase(),
    sessionSecret: hasSessionSecret(),
    allowlistSource: sheetSource(),
    /* Push-only setups have no pull source, which is correct, not missing —
       hence reporting both rather than one "sheet ok" boolean. */
    syncSecret: Boolean(process.env.SYNC_SECRET),
    reviewWebhook: Boolean(process.env.REVIEW_WEBHOOK_URL),
    adminCredentialsOverridden: Boolean(
      process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD,
    ),
  };

  /* Only in production. In development the file-backed driver takes over and the
     app works, so calling this "blocking" there would be the same wrong-diagnosis
     mistake this endpoint exists to prevent. */
  const production = process.env.NODE_ENV === "production";

  const blocking: string[] = [];
  if (!checks.database && production)
    blocking.push("DATABASE_URL (or POSTGRES_URL) is not set — nobody can sign in.");
  if (!checks.sessionSecret)
    blocking.push("SESSION_SECRET is not set — sessions cannot be signed.");
  if (checks.allowlistSource === "none" && !checks.syncSecret)
    blocking.push(
      "No allowlist source: set SHEET_SERVICE_ACCOUNT_JSON, ALLOWLIST_SHEET_CSV_URL, " +
        "or SYNC_SECRET and push rows to /api/admin/sync.",
    );

  const advisory: string[] = [];
  if (!checks.database && !production)
    advisory.push(
      "No DATABASE_URL — using the local file driver (.pfd-dev-db.json). Fine for " +
        "development; production refuses to start without one.",
    );
  if (!checks.reviewWebhook)
    advisory.push(
      "REVIEW_WEBHOOK_URL is not set — reviews are still saved, with forwarded = false.",
    );
  if (!checks.adminCredentialsOverridden)
    advisory.push(
      "Admin is on the default username and password. Set ADMIN_USERNAME and ADMIN_PASSWORD.",
    );

  return Response.json(
    { ok: blocking.length === 0, checks, blocking, advisory },
    { status: blocking.length === 0 ? 200 : 503 },
  );
}
