import { briefSchema } from "@/lib/validation";
import { generatePages } from "@/lib/generate";
import type { GenerateFailure, PageMockup } from "@/lib/generate/types";

/* ==========================================================================
   POST /api/generate

   Today this proxies straight to the mock generator. The request and response
   shapes below are FINAL — swapping in the real Claude skill is a change to
   the marked line only, with no client changes.

   Contract: docs/generation-contract.md

   Note: the client currently calls `generatePages` directly so it can stream
   pages into the UI one at a time without SSE. This route exists so the real
   generator has a server-side home the moment it needs an API key, and so the
   contract is pinned in code rather than in a document alone.
   ========================================================================== */

export type GenerateRequestBody = {
  brief: unknown;
  onlyPageIds?: string[];
  variants?: Record<string, number>;
};

export type GenerateResponseBody = {
  pages: PageMockup[];
  failures: GenerateFailure[];
};

export async function POST(request: Request) {
  let body: GenerateRequestBody;
  try {
    body = (await request.json()) as GenerateRequestBody;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const parsed = briefSchema.safeParse(body?.brief);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid brief", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const failures: GenerateFailure[] = [];

  // TODO: call Claude skill here. Replace this single call with the real
  // generator; keep the callback so pages can still be streamed, and keep
  // pushing partial failures into `failures` rather than throwing.
  const pages = await generatePages(
    parsed.data,
    () => {},
    request.signal,
    {
      onPageFailed: (f) => failures.push(f),
      onlyPageIds: body.onlyPageIds,
      variants: body.variants,
      instant: true,
    },
  );

  const response: GenerateResponseBody = { pages, failures };
  return Response.json(response);
}
