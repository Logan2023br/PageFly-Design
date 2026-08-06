import { z } from "zod";
import { findAllowedStore } from "@/lib/account";
import { getRepo } from "@/lib/db";
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
    if (err instanceof MissingSecretError) {
      return Response.json(
        { ok: false, error: err.message } satisfies StoreAuthResponse,
        { status: 500 },
      );
    }
    /* A storage or sheet failure must not read as "not allowed" — that would
       tell an allowed merchant they are barred because a database blipped. */
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

  await setStoreSession(store.domain);
  await getRepo().markSignedIn(store.domain, new Date());

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
