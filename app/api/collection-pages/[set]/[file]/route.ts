import { getRepo } from "@/lib/db";
import { combinePagefly } from "@/lib/collections/pagefly";
import { readAdminSession } from "@/lib/session";
import { stayPut } from "@/lib/stayPut";

/* ==========================================================================
   /api/collection-pages/<set>/<page>.html      the preview
   /api/collection-pages/<set>/<page>.pagefly   one page, importable
   /api/collection-pages/<set>/all.pagefly      the whole set, one import

   Public, and the rules are the set's:

   - A HIDDEN set answers 404 to everybody but an admin, who needs it to check
     a set before switching it on.
   - A PAID set shows its previews and hands over no file. The public page
     never links one; this is what makes that more than a missing link.

   THE HTML IS SANDBOXED BY ITS HEADER, not only by the iframe it is drawn in.
   The iframe's `sandbox` protects the page that frames it; somebody opening
   this URL directly would otherwise run an uploaded page's scripts on this
   origin, beside the session cookies. `CSP: sandbox allow-scripts` gives the
   document an opaque origin however it is reached.
   ========================================================================== */

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/collection-pages/[set]/[file]">,
) {
  const { set: setSlug, file } = await ctx.params;
  const m = /^([a-z0-9-]+)\.(html|pagefly)$/.exec(file);
  if (!m) return notFound();
  const [, pageSlug, kind] = m as unknown as [string, string, "html" | "pagefly"];

  const repo = getRepo();
  const set = await repo.getCollectionSetBySlug(setSlug).catch(() => null);
  if (!set) return notFound();

  const admin = !set.visible || set.access === "paid" ? await readAdminSession() : false;
  if (!set.visible && !admin) return notFound();
  if (kind === "pagefly" && set.access === "paid" && !admin) {
    return new Response("This set is not a free download.", { status: 403 });
  }

  /* Anything only an admin may see must never land in a shared cache. */
  const cache =
    set.visible && (kind === "html" || set.access === "free")
      ? "public, max-age=300, s-maxage=86400"
      : "private, no-store";

  if (kind === "pagefly" && pageSlug === "all") {
    const files = (
      await Promise.all(
        set.pages
          .filter((p) => p.pageflySize !== null)
          .map((p) => repo.getCollectionFile(set.id, p.id, "pagefly")),
      )
    ).filter((b): b is Uint8Array => b !== null);
    if (files.length === 0) return notFound();
    return new Response(Buffer.from(combinePagefly(files)), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${set.slug}.pagefly"`,
        "Cache-Control": cache,
      },
    });
  }

  const page = set.pages.find((p) => p.slug === pageSlug);
  if (!page) return notFound();
  const bytes = await repo.getCollectionFile(set.id, page.id, kind);
  if (!bytes) return notFound();

  if (kind === "html") {
    /* Its links held in place, so a button in the preview does not walk the
       frame off to a 404 on this origin. See `lib/stayPut.ts`. */
    const html = stayPut(new TextDecoder().decode(bytes));
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "sandbox allow-scripts",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": cache,
      },
    });
  }
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${set.slug}-${page.slug}.pagefly"`,
      "Cache-Control": cache,
    },
  });
}
