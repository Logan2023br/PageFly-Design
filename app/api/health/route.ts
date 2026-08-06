import { builtinStores } from "@/lib/allowlist";
import { hasDatabase } from "@/lib/db";
import { hasSessionSecret, hasStableSecret } from "@/lib/session";
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
    /* A generated secret on disk is stable; one that could not be written is not,
       and that difference decides whether anyone stays signed in. */
    sessionSecretStable: hasStableSecret(),
    allowlistSource: sheetSource(),
    /* Push-only setups have no pull source, which is correct, not missing —
       hence reporting both rather than one "sheet ok" boolean. */
    syncSecret: Boolean(process.env.SYNC_SECRET),
    reviewWebhook: Boolean(process.env.REVIEW_WEBHOOK_URL),
    adminCredentialsOverridden: Boolean(
      process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD,
    ),
    /* The compiled-in list is a real source, so a deployment with no sheet is
       configured, not broken. Reporting it as blocking sent an operator looking
       for a problem that was not there. */
    builtinStores: builtinStores().length,
  };

  /* Only in production. In development the file-backed driver takes over and the
     app works, so calling this "blocking" there would be the same wrong-diagnosis
     mistake this endpoint exists to prevent. */
  const production = process.env.NODE_ENV === "production";
  /* Vercel and anything like it: many short-lived instances, no shared disk. */
  const serverless = Boolean(process.env.VERCEL);

  /* Blocking means "nobody can use this", not "this is not how I would run it".
     Both of the entries that used to be here were the second kind: the app now
     degrades rather than refusing, and listing them as blocking sent an operator
     hunting for a fault while the product worked. */
  const blocking: string[] = [];
  if (
    checks.allowlistSource === "none" &&
    !checks.syncSecret &&
    checks.builtinStores === 0
  )
    blocking.push(
      "Nobody can sign in: no built-in stores, no sheet source, and no SYNC_SECRET.",
    );

  if (!checks.sessionSecretStable)
    blocking.push(
      "No signing key: SESSION_SECRET is unset and a generated one could not be " +
        "written anywhere. Sessions cannot work — set SESSION_SECRET.",
    );

  /* On serverless the generated key lives in this instance's /tmp, which no other
     instance can read. A cookie signed here fails verification there, so the
     merchant is signed out at random and it looks like a routing fault. Nothing in
     the code can fix that: the key has to come from the environment. */
  if (!checks.sessionSecret && serverless)
    blocking.push(
      "SESSION_SECRET must be set on serverless. A generated key is per-instance, " +
        "so a sign-in breaks as soon as the next request lands elsewhere.",
    );

  const advisory: string[] = [];
  if (checks.allowlistSource === "none" && !checks.syncSecret)
    advisory.push(
      `Running on the built-in allowlist (${checks.builtinStores} store${checks.builtinStores === 1 ? "" : "s"}). ` +
        "Add a sheet source, or BETA_STORES, to admit more without a deploy.",
    );
  if (!checks.sessionSecret && checks.sessionSecretStable && !serverless)
    advisory.push(
      "SESSION_SECRET is not set — a generated key on disk is in use, so sign-ins " +
        "last as long as that file. Set it to survive redeploys.",
    );
  if (!checks.database && serverless)
    advisory.push(
      "No DATABASE_URL — data is in this instance's /tmp and is NOT shared or kept. " +
        "Saved pages will appear and disappear; set it before anyone relies on them.",
    );
  if (!checks.database && !serverless)
    advisory.push(
      "No DATABASE_URL — using the file store. Correct on a single server with a " +
        "persistent disk; never behind more than one process.",
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
