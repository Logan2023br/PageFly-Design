import { currentAccount } from "@/lib/account";
import type { Account } from "@/lib/account";

/* ==========================================================================
   GET /api/account

   The quota counter and the review gate both read this. Never cached: a stale
   page count would either block a merchant who has room or let one past the
   allowance.
   ========================================================================== */

export const dynamic = "force-dynamic";

export type AccountResponse =
  | { ok: true; account: Account }
  | { ok: false; error: string };

export async function GET() {
  try {
    const account = await currentAccount();
    if (!account) {
      return Response.json(
        { ok: false, error: "Not signed in." } satisfies AccountResponse,
        { status: 401 },
      );
    }
    return Response.json({ ok: true, account } satisfies AccountResponse);
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message } satisfies AccountResponse,
      { status: 500 },
    );
  }
}
