import { importBuiltInSets } from "@/lib/collectionPagesServer";
import { guard } from "../shared";

/* POST /api/admin/collection-pages/seed — copy in the built-in sets that are
   not in the table yet. See `importBuiltInSets`. */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const added = await importBuiltInSets(new URL(request.url).origin);
  return Response.json({ ok: true, added });
}
