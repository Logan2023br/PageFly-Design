import { SLUG_RE } from "@/lib/collectionPages";
import { rejectFile, storeFile } from "@/lib/collectionPagesServer";
import { ClaudeBuildFailure, jobOf } from "@/lib/claudeBuild";
import { getRepo } from "@/lib/db";
import { fail, failFrom, buildGuardOrKey } from "../../shared";

/* ==========================================================================
   PUT /api/admin/collection-pages/claude-build/files?job=<id>&page=<slug>&kind=html|pagefly&label=<Label>

   The routine's upload: one file of one page into the set its running job
   created — the same tables every set's files live in. A new page slug adds
   the page. The body is the file itself. Key only.
   ========================================================================== */

export const dynamic = "force-dynamic";
const MAX_BYTES = 4 * 1024 * 1024;

export async function PUT(request: Request) {
  const who = await buildGuardOrKey(request);
  if (who instanceof Response) return who;
  if (who !== "script") return fail("This is the routine's upload.", 403);
  const q = new URL(request.url).searchParams;
  const jobId = q.get("job") ?? "";
  const slug = q.get("page") ?? "";
  const kind = q.get("kind");
  const label = (q.get("label") ?? "").trim().slice(0, 60);
  if (kind !== "html" && kind !== "pagefly") return fail("kind must be html or pagefly.");
  if (!SLUG_RE.test(slug) || slug === "all") return fail("page must be a URL slug, like home or product-page.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return fail("The file is over 4 MB.", 413);
  try {
    const job = await jobOf(jobId);
    if (!job || job.status !== "running" || !job.setId) return fail("No running build with a set for this job.", 409);
    const repo = getRepo();
    const set = await repo.getCollectionSet(job.setId);
    if (!set) return fail("The build's set no longer exists.", 404);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > MAX_BYTES) return fail("The file is over 4 MB.", 413);
    const rejected = rejectFile(kind, bytes);
    if (rejected) return fail(rejected);
    await storeFile(set, slug, kind, bytes);
    if (label) {
      const page = set.pages.find((p) => p.slug === slug);
      if (page && page.label !== label) await repo.saveCollectionPage(set.id, { ...page, label });
    }
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ClaudeBuildFailure) return fail(err.message, err.status);
    return failFrom(err);
  }
}
