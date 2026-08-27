import { builtinStores } from "@/lib/allowlist";
import { canReadReferences } from "@/lib/ai/refVision";
import { modelName, providerName } from "@/lib/ai/provider";
import { skillNames } from "@/lib/ai/skills";
import { stockProvider } from "@/lib/images/stock";
import { databaseIsUnpooled, databaseSource, hasDatabase } from "@/lib/db";
import { hasSessionSecret, hasStableSecret, keySource } from "@/lib/session";
import { sheetSource } from "@/lib/sheet";
import { showcaseIds, showcasePages } from "@/lib/showcase";

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
  /**
   * The front door's marquee, which fails SILENTLY by design.
   *
   * `showcasePages` returns nothing when `SHOWCASE_RUNS` is unset, and that is
   * the right default — an empty front door is recoverable and a published
   * customer page is not. But it means the section can be missing in production
   * for two entirely different reasons and look identical either way: nobody
   * set the variable, or the runs it names are not in THIS database.
   *
   * That is precisely the "which of three things is missing" guessing game this
   * endpoint was written to end, and the marquee was not covered by it. Counting
   * the ids and the pages they resolve to separates the two in one request.
   *
   * The read is by id and its result is a count, so nothing about any store
   * leaves here — the same rule the rest of this file follows.
   */
  const showcase = await showcasePages()
    .then((pages) => ({ pages: pages.length, error: false }))
    .catch(() => ({ pages: 0, error: true }));

  const checks = {
    database: hasDatabase(),
    /** which env var the connection string came from, or null */
    databaseFrom: databaseSource(),
    sessionSecret: hasSessionSecret(),
    /* A generated secret on disk is stable; one that could not be written is not,
       and that difference decides whether anyone stays signed in. */
    sessionSecretStable: hasStableSecret(),
    /** env | derived | file | ephemeral — see lib/session.ts */
    sessionKeySource: keySource(),
    allowlistSource: sheetSource(),
    /* Push-only setups have no pull source, which is correct, not missing —
       hence reporting both rather than one "sheet ok" boolean. */
    syncSecret: Boolean(process.env.SYNC_SECRET),
    /* Whether a Step 5 reference image can actually be READ. The page designer
       cannot see images at all, so without this the whole step falls back to
       signal processing and nothing anywhere says so. */
    referenceVision: canReadReferences(),
    reviewWebhook: Boolean(process.env.REVIEW_WEBHOOK_URL),
    adminCredentialsOverridden: Boolean(
      process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD,
    ),
    /* The compiled-in list is a real source, so a deployment with no sheet is
       configured, not broken. Reporting it as blocking sent an operator looking
       for a problem that was not there. */
    builtinStores: builtinStores().length,
    /* Which model writes the copy, and which skills it is given. "none" means
       generation is fully deterministic — which is a valid way to run, not a
       fault, so it never appears in `blocking`. */
    aiProvider: providerName(),
    /* What will really run, defaults resolved — not the raw env var. */
    aiModel: modelName(),
    skills: skillNames(),
    /* Which library the mockups' photographs come from. "none" means every
       image renders as a grey plate — the page is still complete, but it looks
       like a wireframe, which is the exact complaint this replaced. */
    stockPhotos: stockProvider(),
    /* How many runs the front door is TOLD to show, and how many pages it can
       actually find. Two numbers rather than one because the gap between them is
       the diagnosis: 0 and 0 is an unset variable, 6 and 0 is six ids that are
       not in this database. */
    showcaseRuns: showcaseIds().length,
    showcasePages: showcase.pages,
  };

  /* Only in production. In development the file-backed driver takes over and the
     app works, so calling this "blocking" there would be the same wrong-diagnosis
     mistake this endpoint exists to prevent. */
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

  /* Only when there is genuinely no key every instance agrees on. A derived key
     satisfies that, so this no longer fires just because SESSION_SECRET is unset. */
  if (serverless && checks.sessionKeySource === "ephemeral")
    blocking.push(
      "No shared signing key on serverless: sign-ins break as soon as a request " +
        "lands on another instance. Set SESSION_SECRET.",
    );

  const advisory: string[] = [];
  if (checks.allowlistSource === "none" && !checks.syncSecret)
    advisory.push(
      `Running on the built-in allowlist (${checks.builtinStores} store${checks.builtinStores === 1 ? "" : "s"}). ` +
        "Add a sheet source, or BETA_STORES, to admit more without a deploy.",
    );
  if (checks.sessionKeySource === "derived")
    advisory.push(
      "SESSION_SECRET is not set — sessions are signed with a key derived from the " +
        "platform's project identifiers. Works across instances, but anyone with " +
        "project access can derive it. Set SESSION_SECRET before this is public.",
    );
  if (checks.sessionKeySource === "file" && !serverless)
    advisory.push(
      "SESSION_SECRET is not set — a generated key on disk is in use, so sign-ins " +
        "last as long as that file. Set it to survive a rebuild.",
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
  if (databaseIsUnpooled())
    advisory.push(
      `Using ${checks.databaseFrom}, which is an unpooled connection. On serverless ` +
        "prefer DATABASE_URL (Neon) or POSTGRES_URL (Supabase) — the pooled string.",
    );
  if (checks.aiProvider === "none")
    advisory.push(
      "No model configured — page copy comes from the deterministic generator and " +
        "costs no tokens. Set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY to change that.",
    );
  if (checks.aiProvider !== "none" && checks.skills.length === 0)
    advisory.push(
      "A model is configured but skills/ is empty, so it gets no house rules.",
    );
  if (checks.stockPhotos === "none")
    advisory.push(
      "No stock photo key — every image in a mockup renders as a grey plate. " +
        "Set PEXELS_API_KEY (free) or UNSPLASH_ACCESS_KEY.",
    );
  if (!checks.reviewWebhook)
    advisory.push(
      "REVIEW_WEBHOOK_URL is not set — reviews are still saved, with forwarded = false.",
    );
  if (!checks.adminCredentialsOverridden)
    advisory.push(
      "Admin is on the default username and password. Set ADMIN_USERNAME and ADMIN_PASSWORD.",
    );
  /* Advisory, never blocking: a landing page without its marquee is a landing
     page. Worded as the fix rather than the fault — an operator reading this has
     already noticed the section is missing. */
  if (checks.showcaseRuns === 0)
    advisory.push(
      "SHOWCASE_RUNS is not set — the landing page shows no example pages. Set it " +
        "to a comma-separated list of run ids from THIS database.",
    );
  else if (checks.showcasePages === 0)
    advisory.push(
      `SHOWCASE_RUNS names ${checks.showcaseRuns} run${checks.showcaseRuns === 1 ? "" : "s"} ` +
        "but none of them are in this database, so the landing page shows no " +
        "example pages. Run ids do not carry between environments.",
    );

  return Response.json(
    { ok: blocking.length === 0, checks, blocking, advisory },
    { status: blocking.length === 0 ? 200 : 503 },
  );
}
