import { z } from "zod";
import { getRepo } from "@/lib/db";
import type { TrainingItem } from "@/lib/db/types";
import { readAdminSession } from "@/lib/session";
import { VERTICAL_IDS } from "@/lib/verticals";

/* ==========================================================================
   /api/admin/training

   Reference screenshots an operator files by industry. Admin only — these are
   not merchant data and nothing here is reachable from the merchant app.

   Nothing in a build reads them yet, on purpose: the collection is being made
   first and connected later, so it can be judged before it is allowed to
   change what anyone sees.
   ========================================================================== */

export const dynamic = "force-dynamic";

/* A screenshot arrives from the browser already downscaled and re-encoded, so
   this is a guard against something pathological rather than a real budget.
   Postgres will take far more; the reason to cap it is that the listing sends
   every image at once. */
const MAX_IMAGE_BYTES = 3_000_000;

const saveSchema = z.object({
  /** absent when adding, present when editing */
  id: z.string().max(64).optional(),
  /* The enum is the list itself, so a vertical added to the type is
     accepted here without anyone remembering to update a second copy. */
  vertical: z.enum(VERTICAL_IDS),
  note: z.string().max(400).nullable().default(null),
  /** a data URL — the picture travels in the row */
  image: z.string().max(MAX_IMAGE_BYTES),
});

export type TrainingResponse =
  | { ok: true; items: TrainingItem[] }
  | { ok: false; error: string };

async function guard(): Promise<Response | null> {
  if (await readAdminSession()) return null;
  return Response.json(
    { ok: false, error: "Not signed in." } satisfies TrainingResponse,
    { status: 401 },
  );
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;

  try {
    const items = await getRepo().listTrainingItems();
    return Response.json({ ok: true, items } satisfies TrainingResponse);
  } catch {
    return Response.json(
      { ok: false, error: "Couldn't read the training set." } satisfies TrainingResponse,
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  let body: z.infer<typeof saveSchema>;
  try {
    body = saveSchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "Pick an industry and an image." } satisfies TrainingResponse,
      { status: 400 },
    );
  }

  if (!body.image.startsWith("data:image/"))
    return Response.json(
      { ok: false, error: "That file isn't an image." } satisfies TrainingResponse,
      { status: 400 },
    );

  const now = new Date().toISOString();
  const repo = getRepo();

  /* An edit keeps the id it arrived with, so the same endpoint adds and
     updates and the client does not have to know which it is doing. */
  const existing = body.id
    ? (await repo.listTrainingItems()).find((t) => t.id === body.id)
    : undefined;

  const item: TrainingItem = {
    id: body.id ?? newId(),
    vertical: body.vertical,
    note: body.note?.trim() ? body.note.trim() : null,
    image: body.image,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  try {
    await repo.saveTrainingItem(item);
    const items = await repo.listTrainingItems();
    return Response.json({ ok: true, items } satisfies TrainingResponse);
  } catch {
    return Response.json(
      { ok: false, error: "Couldn't save that." } satisfies TrainingResponse,
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id");
  if (!id)
    return Response.json(
      { ok: false, error: "Which one?" } satisfies TrainingResponse,
      { status: 400 },
    );

  try {
    await getRepo().deleteTrainingItem(id);
    const items = await getRepo().listTrainingItems();
    return Response.json({ ok: true, items } satisfies TrainingResponse);
  } catch {
    return Response.json(
      { ok: false, error: "Couldn't delete that." } satisfies TrainingResponse,
      { status: 503 },
    );
  }
}

/** Random rather than content-derived: two screenshots of the same page filed
    twice are two references, not one. */
function newId(): string {
  return `t${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
