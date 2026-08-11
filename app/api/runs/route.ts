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
  /** model spend for this run. 0 when no model is configured. */
  tokens: z.number().int().min(0).max(100_000_000).default(0),
  /* The pages as built. Capped: a deck of five is about 19KB, so anything past a
     megabyte is not a deck. */
  snapshot: z.array(z.unknown()).max(60).optional(),
});

export type RunSummary = {
  id: string;
  createdAt: string;
  /** the pages as built, when the run has them */
  snapshot: unknown[] | null;
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
      snapshot: Array.isArray(r.snapshot) ? r.snapshot : null,
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
  /* Derived from the CONTENT alone — no timestamp. The id used to include
     Date.now(), which meant two identical saves produced two different ids and
     `on conflict do nothing` could never fire. Navigating Design → Library →
     Design remounts the recorder, its in-memory guard resets, and the same deck
     was written again every time: seven rows for one build, and the page
     allowance charged for all seven.

     With a content id the database refuses the duplicate no matter how many
     times a client asks. Two builds of the identical brief collapsing into one
     row is correct — they are the same deck. */
  const id = runId(account.domain, body.payload, body.pages);

  const snapshot = body.snapshot ?? null;
  /* 1 MB was set when a page was blocks and a five-page deck was 19 KB. A page
     the model designed carries its tree as well, about 33 KB, so a merchant
     using their full thirty-page allowance lands at 0.97 MB — under the old
     cap by three percent, and over it on any page with a long FAQ. The failure
     is a 413 the recorder swallows, so they would have lost the whole build
     and been told nothing.

     8 MB is well inside what jsonb and the driver handle, and still low enough
     to be a real guard against a client sending something absurd. */
  if (snapshot && JSON.stringify(snapshot).length > 8_000_000)
    return Response.json(
      { ok: false, error: "Snapshot too large." } satisfies SaveRunResponse,
      { status: 413 },
    );

  const run: RunRecord = {
    id,
    domain: account.domain,
    createdAt,
    payload: body.payload,
    snapshot,
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

/**
 * Stable id for a run: same store, same brief, same pages → same id.
 *
 * Two hashes over the same bytes rather than one, so the id is 64-bit-ish. A
 * single 32-bit FNV over a store's runs would start colliding in the hundreds,
 * and a collision here silently drops someone's build.
 */
function runId(
  domain: string,
  payload: string,
  pages: { pageId: string; index: number }[],
): string {
  const material = `${domain}|${payload}|${pages
    .map((p) => `${p.index}:${p.pageId}`)
    .join(",")}`;

  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (const ch of material) {
    const code = ch.charCodeAt(0);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b) ^ (b >>> 13);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}
