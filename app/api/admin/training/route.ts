import { z } from "zod";
import { getRepo } from "@/lib/db";
import type { TrainingItem, TrainingSummary } from "@/lib/db/types";
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
/* Per reference, not per image. Eight screenshots of one store is a generous
   reference; eighty is someone using this as a photo library. */
const MAX_IMAGES = 8;

const saveSchema = z.object({
  /** absent when adding, present when editing */
  id: z.string().max(64).optional(),
  /* The enum is the list itself, so a vertical added to the type is
     accepted here without anyone remembering to update a second copy. */
  vertical: z.enum(VERTICAL_IDS),
  note: z.string().max(400).nullable().default(null),
  /** the pictures travel in the row, each with its own note */
  images: z
    .array(
      z.object({
        src: z.string().max(MAX_IMAGE_BYTES),
        note: z.string().max(200).nullable().default(null),
      }),
    )
    .min(1)
    .max(MAX_IMAGES),
});

export type TrainingResponse =
  | { ok: true; items: TrainingSummary[] }
  | { ok: false; error: string };

/** One reference with every screenshot on it. Separate from the listing
    because the listing deliberately does not carry them. */
export type TrainingItemResponse =
  | { ok: true; item: TrainingItem }
  | { ok: false; error: string };

async function guard(): Promise<Response | null> {
  if (await readAdminSession()) return null;
  return Response.json(
    { ok: false, error: "Not signed in." } satisfies TrainingResponse,
    { status: 401 },
  );
}

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  /* `?id=` asks for one reference WITH its images — what the lightbox and the
     editor need. Without it, the cards, which need one image each. */
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    try {
      const item = await getRepo().getTrainingItem(id);
      if (!item)
        return Response.json(
          { ok: false, error: "That reference is gone." } satisfies TrainingItemResponse,
          { status: 404 },
        );
      return Response.json({ ok: true, item } satisfies TrainingItemResponse);
    } catch {
      return Response.json(
        { ok: false, error: "Couldn't read that reference." } satisfies TrainingItemResponse,
        { status: 503 },
      );
    }
  }

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
  } catch (err) {
    /* Say which field, and say the size when that is what it was.

       One message for every possible failure read as "pick an industry and an
       image" to someone who had picked both — the real cause was a screenshot
       over the size cap, and the message sent them looking at the two things
       that were fine. */
    const issue = err instanceof z.ZodError ? err.issues[0] : null;
    const where = issue?.path.join(".") ?? "";
    const tooBig = where.includes("src") && issue?.code === "too_big";

    return Response.json(
      {
        ok: false,
        error: tooBig
          ? `That screenshot is too large even after resizing (limit ${Math.round(MAX_IMAGE_BYTES / 1_000_000)} MB). Try a shorter capture.`
          : issue
            ? `${where || "request"}: ${issue.message}`
            : "Malformed request.",
      } satisfies TrainingResponse,
      { status: 400 },
    );
  }

  if (!body.images.every((i) => i.src.startsWith("data:image/")))
    return Response.json(
      { ok: false, error: "One of those files isn't an image." } satisfies TrainingResponse,
      { status: 400 },
    );

  const now = new Date().toISOString();
  const repo = getRepo();

  /* An edit keeps the id it arrived with, so the same endpoint adds and
     updates and the client does not have to know which it is doing. */
  const existing = body.id ? await repo.getTrainingItem(body.id) : null;

  const item: TrainingItem = {
    id: body.id ?? newId(),
    vertical: body.vertical,
    note: body.note?.trim() ? body.note.trim() : null,
    images: body.images.map((i) => ({
      src: i.src,
      note: i.note?.trim() ? i.note.trim() : null,
    })),
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
