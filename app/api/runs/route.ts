import { z } from "zod";
import { currentAccount, remainingPages } from "@/lib/account";
import { getRepo } from "@/lib/db";
import type { RunPageRecord, RunRecord } from "@/lib/db";

/* ==========================================================================
   GET  /api/runs   the signed-in store's saved runs (drives Library)
   POST /api/runs   save the run that just finished

   A saved run is the brief plus each page's variant, never the pages — see
   lib/runPayload.ts for why that reproduces the deck exactly.

   ON THE QUOTA. The real gate is GET /api/account, read fresh immediately before
   Create. This endpoint refuses only when the store had nothing left at all,
   which stops an exhausted store from accumulating more. It does not clamp a run
   that lands slightly over: recording fewer pages than were actually built would
   make the counter disagree with the Library, and a wrong count is worse than a
   count that is briefly generous.
   ========================================================================== */

export const dynamic = "force-dynamic";

const pageSchema = z.object({
  pageId: z.string().min(1).max(200),
  pageType: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  index: z.number().int().min(0).max(999),
});

const bodySchema = z.object({
  payload: z.string().min(2).max(200_000),
  pages: z.array(pageSchema).min(1).max(60),
  sell: z.string().max(300).default(""),
  styleLabel: z.string().max(100).default(""),
  /** model spend for this run. 0 until generation calls a model. */
  tokens: z.number().int().min(0).max(100_000_000).default(0),
});

export type RunSummary = {
  id: string;
  createdAt: string;
  /** the encoded brief, so the client can rebuild the deck without a second
      request per run — a run is a few hundred bytes, not a payload worth
      paginating */
  payload: string;
  pageCount: number;
  tokens: number;
  sell: string;
  styleLabel: string;
  pages: { pageId: string; pageType: string; label: string; index: number }[];
};

export type RunsResponse =
  | { ok: true; runs: RunSummary[] }
  | { ok: false; error: string };

export async function GET() {
  const account = await currentAccount();
  if (!account)
    return Response.json(
      { ok: false, error: "Not signed in." } satisfies RunsResponse,
      { status: 401 },
    );

  const runs = await getRepo().listRuns(account.domain);
  return Response.json({
    ok: true,
    runs: runs.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      payload: r.payload,
      pageCount: r.pageCount,
      tokens: r.tokens,
      sell: r.sell,
      styleLabel: r.styleLabel,
      pages: r.pages.map((p) => ({
        pageId: p.pageId,
        pageType: p.pageType,
        label: p.label,
        index: p.index,
      })),
    })),
  } satisfies RunsResponse);
}

export type SaveRunResponse =
  | { ok: true; id: string; pagesUsed: number; pageLimit: number }
  | { ok: false; error: string };

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account)
    return Response.json(
      { ok: false, error: "Not signed in." } satisfies SaveRunResponse,
      { status: 401 },
    );

  if (remainingPages(account) <= 0)
    return Response.json(
      {
        ok: false,
        error:
          "Bạn đã vượt quá số page build được cho phép, hãy liên hệ với support để hỗ trợ.",
      } satisfies SaveRunResponse,
      { status: 403 },
    );

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "Malformed run." } satisfies SaveRunResponse,
      { status: 400 },
    );
  }

  const repo = getRepo();
  const createdAt = new Date().toISOString();
  /* Derived from the payload rather than random, so pressing Create twice with
     the same brief cannot produce two rows for one piece of work — saveRun does
     nothing on a conflicting id. */
  const id = runId(account.domain, body.payload, createdAt);

  const run: RunRecord = {
    id,
    domain: account.domain,
    createdAt,
    payload: body.payload,
    pageCount: body.pages.length,
    tokens: body.tokens,
    sell: body.sell,
    styleLabel: body.styleLabel,
  };

  const pages: RunPageRecord[] = body.pages.map((p) => ({ runId: id, ...p }));

  await repo.saveRun(run, pages);
  const pagesUsed = await repo.pagesUsed(account.domain);

  return Response.json({
    ok: true,
    id,
    pagesUsed,
    pageLimit: account.pageLimit,
  } satisfies SaveRunResponse);
}

/** Short, stable and collision-resistant enough for one store's runs. */
function runId(domain: string, payload: string, createdAt: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${domain}|${payload}|${createdAt.slice(0, 16)}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}${Date.now().toString(36).slice(-5)}`;
}
