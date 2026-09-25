import { z } from "zod";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";

/* ==========================================================================
   POST /api/admin/pages   { runId, pageId, hidden }

   Hiding is an operator's decision about one page: the merchant stops seeing
   it and stops paying a slot for it. The row stays, so it can come back — a
   delete would leave nothing to unhide.

   ADDRESSED BY BOTH IDS. A page id is only unique within its run, which is
   what the primary key on `run_pages` says; taking the page id alone would
   let one store's page hide another's.
   ========================================================================== */

export const dynamic = "force-dynamic";

const body = z.object({
  runId: z.string().min(1).max(120),
  pageId: z.string().min(1).max(200),
  hidden: z.boolean(),
});

export async function POST(req: Request): Promise<Response> {
  if (!(await readAdminSession())) {
    return Response.json({ error: "not signed in" }, { status: 401 });
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "runId, pageId and hidden are required" }, { status: 400 });
  }

  const { runId, pageId, hidden } = parsed.data;
  await getRepo().setPageHidden(runId, pageId, hidden);
  /* The repo is silent about a page it does not hold — an operator clicking
     twice, or a row already gone, is not a failure worth reporting. */
  return Response.json({ ok: true, hidden });
}
