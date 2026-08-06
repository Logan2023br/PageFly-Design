import { z } from "zod";
import { findAllowedStore } from "@/lib/account";
import { MissingDatabaseError, getRepo } from "@/lib/db";
import {
  MissingSecretError,
  clearStoreSession,
  setStoreSession,
} from "@/lib/session";
import { normalizeDomain, sheetSource } from "@/lib/sheet";

/* ==========================================================================
   POST /api/auth/store   sign in with a store domain
   DELETE                 sign out

   The allowlist decision happens here and nowhere else, so there is exactly one
   place that can say yes.
   ========================================================================== */

const bodySchema = z.object({ domain: z.string().min(3).max(255) });

export type StoreAuthResponse =
  | { ok: true; domain: string; storeName: string | null }
  | { ok: false; error: string; hint?: string };

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "Enter your store domain." } satisfies StoreAuthResponse,
      { status: 400 },
    );
  }

  const domain = normalizeDomain(parsed.domain);
  if (!domain.includes(".")) {
    return Response.json(
      {
        ok: false,
        error: "That does not look like a store domain.",
        hint: "It usually ends in .myshopify.com",
      } satisfies StoreAuthResponse,
      { status: 400 },
    );
  }

  let store;
  try {
    store = await findAllowedStore(domain);
  } catch (err) {
    /* Missing configuration is permanent: "try again in a moment" sends an
       operator away to wait for something that will never resolve on its own. It
       gets its own message naming the variable to set. */
    if (err instanceof MissingSecretError || err instanceof MissingDatabaseError) {
      return Response.json(
        {
          ok: false,
          error: "This deployment is not finished being set up.",
          hint: err.message,
        } satisfies StoreAuthResponse,
        { status: 503 },
      );
    }
    /* A genuinely transient storage or sheet failure. It must not read as "not
       allowed" — that would tell an allowed merchant they are barred because a
       database blipped. */
    return Response.json(
      {
        ok: false,
        error: "Could not check the store list right now. Try again in a moment.",
      } satisfies StoreAuthResponse,
      { status: 503 },
    );
  }

  if (!store) {
    /* The configuration hint belongs only in the case it explains: an EMPTY
       allowlist with no source. Showing it whenever no source is configured
       told an operator their sheet was missing while a pushed list sat in the
       database working fine. */
    const empty =
      sheetSource() === "none" &&
      (await getRepo().listStoreSummaries()).length === 0;

    return Response.json(
      {
        ok: false,
        error: "Store chưa được phép sử dụng.",
        hint: empty
          ? "No store list has been loaded yet — see README (SHEET_SERVICE_ACCOUNT_JSON or /api/admin/sync)."
          : undefined,
      } satisfies StoreAuthResponse,
      { status: 403 },
    );
  }

  /* Wrapped because it was not: an exception here escaped as a 500 with an HTML
     body, the browser's res.json() threw on it, and the form reported "could not
     reach the server" for a server that had answered. */
  try {
    await setStoreSession(store.domain);
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: "Could not start a session.",
        hint: (err as Error).message,
      } satisfies StoreAuthResponse,
      { status: 500 },
    );
  }

  /* Best effort. Recording the sign-in time is bookkeeping — a storage hiccup
     must not turn a successful sign-in into a failure. */
  await getRepo()
    .markSignedIn(store.domain, new Date())
    .catch(() => {});

  return Response.json({
    ok: true,
    domain: store.domain,
    storeName: store.storeName,
  } satisfies StoreAuthResponse);
}

export async function DELETE() {
  await clearStoreSession();
  return Response.json({ ok: true });
}
