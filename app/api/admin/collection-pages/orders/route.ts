import { z } from "zod";
import { getRepo } from "@/lib/db";
import type { CollectionOrderRecord } from "@/lib/db/types";
import { fail, firstIssue, guard } from "../shared";

/* GET    every order, newest first
   PATCH  { id, status } — pending, confirmed or cancelled */

export const dynamic = "force-dynamic";

export type CollectionOrdersResponse =
  | { ok: true; orders: CollectionOrderRecord[] }
  | { ok: false; error: string };

async function listing() {
  const orders = await getRepo().listCollectionOrders();
  return Response.json({ ok: true, orders } satisfies CollectionOrdersResponse);
}

export async function GET() {
  return (await guard()) ?? listing();
}

export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = z
    .object({ id: z.string().max(64), status: z.enum(["pending", "confirmed", "cancelled"]) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!(await getRepo().setCollectionOrderStatus(parsed.data.id, parsed.data.status))) {
    return fail("That order no longer exists.", 404);
  }
  return listing();
}
