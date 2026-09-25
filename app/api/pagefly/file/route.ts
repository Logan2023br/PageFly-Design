import { currentAccount } from "@/lib/account";
import { getRepo } from "@/lib/db";
import { ownerFor } from "@/lib/pagefly/fileScope";
import { readAdminSession } from "@/lib/session";

/* ==========================================================================
   GET /api/pagefly/file?key=…   the file this page was already converted into

   Answers with the bytes, or 404 when the page has not been converted yet —
   and 404 is a normal answer, not a fault. The conversion runs once when a
   deck is saved (`lib/pagefly/prebuild.ts`) and a merchant can reach the
   results screen before it has finished, so the caller treats an absence as
   "not yet" and converts on demand, exactly as it did before any of this.

   SCOPED, AND `lib/pagefly/fileScope.ts` DECIDES HOW. The key is a hash of a
   document and is not guessable, but "not guessable" is not an access rule. A
   store may fetch only what was built for it; an operator may name a store,
   which is what makes the admin's export free rather than a fresh conversion
   on every click. A merchant naming one changes nothing.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const [account, admin] = await Promise.all([currentAccount(), readAdminSession()]);
  const owner = ownerFor({
    session: account?.domain ?? null,
    admin: Boolean(admin),
    asked: url.searchParams.get("domain"),
  });
  if (!owner) return new Response("Not signed in.", { status: 401 });

  const key = url.searchParams.get("key");
  if (!key) return new Response("no key", { status: 400 });

  const file = await getRepo().getPageFile(owner, key);
  if (!file) return new Response("not built yet", { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
      /* The document is in the key, so the bytes for a key never change. */
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
