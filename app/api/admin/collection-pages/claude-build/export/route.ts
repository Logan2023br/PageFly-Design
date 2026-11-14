import { rejectFile, storeFile } from "@/lib/collectionPagesServer";
import { ClaudeBuildFailure, completeExport, jobOf } from "@/lib/claudeBuild";
import { splitExport } from "@/lib/claudeBuildExport";
import { getRepo } from "@/lib/db";
import { fail, failFrom, buildGuardOrKey } from "../../shared";

/* ==========================================================================
   PUT /api/admin/collection-pages/claude-build/export?job=<id>

   The admin's half of a build: the routine built the set's pages in the
   Logan store (job status "export"); someone exported them from the PageFly
   editor and drops the file here — one page's export or "All Pages". Each
   page's JSON becomes that page's .pagefly in the set. When every page the
   routine built has one, the build is done. The body is the file itself.
   Admin only. A done build takes a new export too (a page fixed by hand).
   ========================================================================== */

export const dynamic = "force-dynamic";
const MAX_BYTES = 25 * 1024 * 1024;

export async function PUT(request: Request) {
  const who = await buildGuardOrKey(request);
  if (who instanceof Response) return who;
  if (who !== "admin") return fail("The export is uploaded from the admin panel.", 403);
  const jobId = new URL(request.url).searchParams.get("job") ?? "";
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return fail("The file is over 25 MB.", 413);
  try {
    const job = await jobOf(jobId);
    if (!job || (job.status !== "export" && job.status !== "done") || !job.setId || job.loganPages.length === 0)
      return fail("This build is not waiting for an export.", 409);
    const repo = getRepo();
    const set = await repo.getCollectionSet(job.setId);
    if (!set) return fail("The build's set no longer exists.", 404);

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > MAX_BYTES) return fail("The file is over 25 MB.", 413);
    const rejected = rejectFile("pagefly", bytes);
    if (rejected) return fail(rejected);

    const { pages, unmatched } = splitExport(bytes, job.loganPages);
    if (pages.length === 0)
      return fail(
        `No page of ${job.setName ?? "this set"} in that file${unmatched.length ? ` (it holds: ${unmatched.slice(0, 5).join(", ")})` : ""}. Export the pages named "${job.loganPages[0].title}" and so on.`,
      );
    for (const p of pages) {
      const one = rejectFile("pagefly", p.bytes);
      if (one) return fail(`${p.entry}: ${one}`);
    }
    for (const p of pages) await storeFile(set, p.slug, "pagefly", p.bytes);

    const after = await repo.getCollectionSet(job.setId);
    const has = new Set((after?.pages ?? []).filter((p) => p.pageflySize !== null).map((p) => p.slug));
    const missing = job.loganPages.filter((p) => !has.has(p.slug)).map((p) => p.label);
    const complete = (after?.pages ?? []).filter((p) => p.htmlSize !== null && p.pageflySize !== null).length;
    if (missing.length === 0 && job.status === "export") await completeExport(job.id, complete);

    return Response.json({
      ok: true,
      stored: pages.map((p) => ({ slug: p.slug, entry: p.entry })),
      unmatched,
      missing,
      done: missing.length === 0,
    });
  } catch (err) {
    if (err instanceof ClaudeBuildFailure) return fail(err.message, err.status);
    return failFrom(err);
  }
}
