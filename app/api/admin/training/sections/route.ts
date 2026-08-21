import { z } from "zod";
import { readSection } from "@/lib/ai/sectionVision";
import { getRepo } from "@/lib/db";
import type { TrainingSection, TrainingSectionSummary } from "@/lib/db/types";
import { PAGEFLY_ELEMENTS } from "@/lib/pagefly/elements";
import { readAdminSession } from "@/lib/session";

/* ==========================================================================
   /api/admin/training/sections

   Reference screenshots for ONE PageFly element, plus Haiku's reading of them.
   Admin only — nothing here is reachable from the merchant app.

   THE READING HAPPENS HERE, ON SAVE. DeepSeek cannot see an image, so a
   screenshot is worth nothing to a build until something has turned it into
   text, and the only thing that can do that is Haiku. Doing it at build time
   would be a vision call and several seconds on every page, for a screenshot
   that has not changed since the last time it was read. Doing it once here is
   free for ever — and it lets an operator see what was understood before it
   reaches a merchant's page, which is what the template tab has wanted since it
   was written.

   A failed reading is not a failed save. The entry keeps its screenshots and
   `analysis` stays null; the operator can save again to retry. Losing an upload
   because a vision model was busy would be the wrong trade.
   ========================================================================== */

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 3_000_000;
const MAX_IMAGES = 8;

const saveSchema = z.object({
  /** absent when adding, present when editing */
  id: z.string().max(64).optional(),
  /* The list itself is the enum, generated from `fields.md`, so an element
     PageFly adds is accepted here the moment the generator is run. */
  element: z.enum(PAGEFLY_ELEMENTS),
  note: z.string().max(400).nullable().default(null),
  enabled: z.boolean().default(true),
  images: z
    .array(
      z.object({
        src: z.string().max(MAX_IMAGE_BYTES),
        note: z.string().max(600).nullable().default(null),
      }),
    )
    .min(1)
    .max(MAX_IMAGES),
});

export type SectionsResponse =
  | { ok: true; items: TrainingSectionSummary[]; analysed?: boolean }
  | { ok: false; error: string };

export type SectionResponse =
  | { ok: true; item: TrainingSection }
  | { ok: false; error: string };

async function guard(): Promise<Response | null> {
  if (await readAdminSession()) return null;
  return Response.json(
    { ok: false, error: "Not signed in." } satisfies SectionsResponse,
    { status: 401 },
  );
}

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    try {
      const item = await getRepo().getTrainingSection(id);
      if (!item)
        return Response.json(
          { ok: false, error: "That section is gone." } satisfies SectionResponse,
          { status: 404 },
        );
      return Response.json({ ok: true, item } satisfies SectionResponse);
    } catch {
      return Response.json(
        { ok: false, error: "Couldn't read that section." } satisfies SectionResponse,
        { status: 503 },
      );
    }
  }

  try {
    const items = await getRepo().listTrainingSections();
    return Response.json({ ok: true, items } satisfies SectionsResponse);
  } catch {
    return Response.json(
      { ok: false, error: "Couldn't read the section set." } satisfies SectionsResponse,
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
      } satisfies SectionsResponse,
      { status: 400 },
    );
  }

  if (!body.images.every((i) => i.src.startsWith("data:image/")))
    return Response.json(
      { ok: false, error: "One of those files isn't an image." } satisfies SectionsResponse,
      { status: 400 },
    );

  const repo = getRepo();
  const now = new Date().toISOString();

  const existing = body.id ? await repo.getTrainingSection(body.id) : null;

  /* ==========================================================================
     ONE ENTRY PER ELEMENT, and this is where that is enforced.

     Two entries for `ProductBox` would leave a build choosing between two
     collections for one element, and there is no good way to choose. The answer
     to "I have another good product box" is another screenshot on the entry that
     exists — which is what the message says, because a refusal that does not
     say what to do instead is a dead end.
     ========================================================================== */
  const clash = await repo.getTrainingSectionByElement(body.element);
  if (clash && clash.id !== (body.id ?? "")) {
    return Response.json(
      {
        ok: false,
        error:
          `${body.element} already has an entry with ${clash.images.length} screenshot${clash.images.length === 1 ? "" : "s"}. ` +
          `Open it and add these to it — one entry per element, as many screenshots as you like.`,
      } satisfies SectionsResponse,
      { status: 409 },
    );
  }

  const images = body.images.map((i) => ({
    src: i.src,
    note: i.note?.trim() ? i.note.trim() : null,
  }));

  /* ==========================================================================
     RE-READ ONLY WHEN THE PICTURES CHANGED.

     Renaming a note, or flipping the switch, is not a reason to spend a vision
     call — and on an entry with eight screenshots that call is the most
     expensive thing this endpoint does. Compared on the sources themselves
     rather than on a count, because swapping one screenshot for another is a
     change the count cannot see.
     ========================================================================== */
  const sameImages =
    existing !== null &&
    existing.images.length === images.length &&
    existing.images.every((old, i) => old.src === images[i].src);

  let analysis = existing?.analysis ?? null;
  let analysedAt = existing?.analysedAt ?? null;

  if (!sameImages) {
    const read = await readSection(
      body.element,
      images.map((i) => i.src),
    );
    if (read) {
      analysis = read.analysis;
      analysedAt = now;
    } else if (!existing) {
      /* A first save whose reading failed is still a save. The screenshots are
         filed and the operator can save again to retry; losing an upload
         because a vision model was busy would be the wrong trade. */
      analysis = null;
      analysedAt = null;
    }
  }

  const item: TrainingSection = {
    id: body.id ?? newId(),
    element: body.element,
    note: body.note?.trim() ? body.note.trim() : null,
    analysis,
    analysedAt,
    enabled: body.enabled,
    images,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  try {
    await repo.saveTrainingSection(item);
    const items = await repo.listTrainingSections();
    return Response.json({
      ok: true,
      items,
      /* So the screen can say "read 4 screenshots" rather than leaving the
         operator wondering whether anything happened. */
      analysed: !sameImages && analysis !== null,
    } satisfies SectionsResponse);
  } catch {
    return Response.json(
      { ok: false, error: "Couldn't save that." } satisfies SectionsResponse,
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
      { ok: false, error: "Which one?" } satisfies SectionsResponse,
      { status: 400 },
    );

  try {
    await getRepo().deleteTrainingSection(id);
    const items = await getRepo().listTrainingSections();
    return Response.json({ ok: true, items } satisfies SectionsResponse);
  } catch {
    return Response.json(
      { ok: false, error: "Couldn't delete that." } satisfies SectionsResponse,
      { status: 503 },
    );
  }
}

function newId(): string {
  return `s${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
