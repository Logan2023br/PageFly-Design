import { z } from "zod";
import { DEFAULT_PAGE_LIMIT } from "@/lib/pageCatalog";
import { findBuiltinStore } from "@/lib/allowlist";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";
import { normalizeDomain } from "@/lib/sheet";

/* ==========================================================================
   POST   /api/admin/stores   add one store to the allowlist
   DELETE /api/admin/stores   remove one

   The allowlist lives in the database, and this is how it is edited without
   pasting the whole sheet back in.

   Removal keeps the store's runs. An operator taking access away has not asked to
   destroy the merchant's pages, and re-adding the domain restores everything —
   deleting the work would be an irreversible side effect of a reversible action.
   ========================================================================== */

export const dynamic = "force-dynamic";

/* Every field the admin table shows, so adding a store and editing one go through
   the same endpoint. Anything omitted keeps its existing value rather than being
   blanked — a form that saves one field should not erase the others. */
const addSchema = z.object({
  domain: z.string().min(4).max(255),
  email: z.string().max(255).nullish(),
  storeName: z.string().max(255).nullish(),
  shopifyPlan: z.string().max(120).nullish(),
  currentPlan: z.string().max(200).nullish(),
  country: z.string().max(120).nullish(),
  status: z.string().max(120).nullish(),
  userType: z.string().max(100).nullish(),
  daysUsed: z.number().int().min(0).max(100_000).nullish(),
  pageLimit: z.number().int().min(0).max(10_000).optional(),
});

export type StoresResponse =
  | { ok: true; domain: string; blocked?: boolean }
  | { ok: false; error: string };

async function guard(): Promise<Response | null> {
  if (await readAdminSession()) return null;
  return Response.json(
    { ok: false, error: "Not authorised." } satisfies StoresResponse,
    { status: 401 },
  );
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  let body: z.infer<typeof addSchema>;
  try {
    body = addSchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "A domain is required." } satisfies StoresResponse,
      { status: 400 },
    );
  }

  const domain = normalizeDomain(body.domain);
  if (!domain.includes("."))
    return Response.json(
      { ok: false, error: "That does not look like a domain." } satisfies StoresResponse,
      { status: 400 },
    );

  const repo = getRepo();
  const existing = await repo.getStore(domain);

  /* upsertStores never touches `blocked` — a sheet re-sync must not restore access
     an operator removed. So re-adding a blocked store means dropping the tombstone
     row first, and that has to happen BEFORE the insert, not after. */
  if (existing?.blocked) await repo.deleteStore(domain, false).catch(() => {});

  /* `undefined` means "not in this form"; an explicit null or "" means "clear it".
     Collapsing the two would make every edit wipe the fields it did not include. */
  const keep = <T,>(sent: T | null | undefined, current: T | null): T | null =>
    sent === undefined ? current : (sent as T | null);

  await repo.upsertStores([
    {
      domain,
      email: keep(body.email, existing?.email ?? null),
      storeName: keep(body.storeName, existing?.storeName ?? null),
      shopifyPlan: keep(body.shopifyPlan, existing?.shopifyPlan ?? null),
      currentPlan: keep(body.currentPlan, existing?.currentPlan ?? null),
      daysUsed: keep(body.daysUsed, existing?.daysUsed ?? null),
      country: keep(body.country, existing?.country ?? null),
      userType: keep(body.userType, existing?.userType ?? "Beta"),
      status: keep(body.status, existing?.status ?? "Đang sử dụng"),
      pageLimit: body.pageLimit ?? existing?.pageLimit ?? DEFAULT_PAGE_LIMIT,
      firstSeenAt: null,
      lastSeenAt: null,
      blocked: false,
    },
  ]);

  return Response.json({ ok: true, domain } satisfies StoresResponse);
}

export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  const domain = normalizeDomain(
    new URL(request.url).searchParams.get("domain") ?? "",
  );
  if (!domain)
    return Response.json(
      { ok: false, error: "A domain is required." } satisfies StoresResponse,
      { status: 400 },
    );

  /* A compiled-in store cannot simply be deleted — the built-in list would admit
     it again on the next request — so it is blocked instead. */
  const builtin = findBuiltinStore(domain) !== null;
  const removed = await getRepo().deleteStore(domain, builtin);

  if (!removed)
    return Response.json(
      { ok: false, error: "No such store." } satisfies StoresResponse,
      { status: 404 },
    );

  return Response.json({
    ok: true,
    domain,
    blocked: builtin,
  } satisfies StoresResponse);
}
