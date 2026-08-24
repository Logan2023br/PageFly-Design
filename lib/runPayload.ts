import { z } from "zod";
import { briefSchema, type Brief } from "./validation";

/* ==========================================================================
   What a stored run contains.

   Not the pages. Generation is a pure function of the brief — seeded PRNG only,
   no Math.random and no Date.now anywhere under lib/generate — so keeping the
   brief and the per-page variant numbers is enough to rebuild the exact deck the
   merchant saw. A run is a few hundred bytes instead of megabytes of markup, and
   the Library needs no image hosting.

   Reference images are kept as hints only. Their pixels never reach a mockup —
   the generator reads `palette` and `layout` and draws the artwork itself — so
   the object URL and the 1024px copy are dropped. An object URL does not survive
   the tab that made it, and `dataUrl` is 80-200KB apiece against a 200,000
   character ceiling: six of them and the run stops saving.

   `thumbUrl` IS kept, and that is new. It is 256px — see `REF_THUMB_EDGE` — and
   it exists because the brief is now something a merchant reads back weeks later
   from the Library, where "Screenshot 2026-08-24 175748.png" is not an answer to
   "what did I show it?". Small enough that six fit inside the ceiling with the
   rest of the brief, and guarded below so that if they ever do not, the pictures
   are dropped rather than the run.

   FORWARD NOTE: the day generation calls a model this stops reproducing anything,
   and a run has to carry its generated pages instead. `runs.snapshot` already
   exists in the schema for that, so the change is a reader change, not a
   migration.
   ========================================================================== */

export const runPayloadSchema = z.object({
  v: z.literal(1),
  brief: briefSchema,
  /** pageId -> variant, so a regenerated page reopens as the take they kept */
  variants: z.record(z.string(), z.number().int().min(0).max(999)).default({}),
});

export type RunPayload = z.infer<typeof runPayloadSchema>;

/**
 * The most a stored run may be, in characters.
 *
 * Exported so `/api/runs` validates against THIS number rather than its own
 * copy of it. A limit in one file and the thing producing the value in another
 * is how `slices` capped at 4 while the slicer made 6, and how a merchant got a
 * Create button that did nothing.
 */
export const MAX_RUN_PAYLOAD_CHARS = 200_000;

export function encodeRunPayload(
  brief: Brief,
  variants: Record<string, number>,
): string {
  const strip = (keepThumb: boolean): string => {
    const slim: Brief = {
      ...brief,
      referenceImages: brief.referenceImages.map((img) => ({
        ...img,
        url: "",
        dataUrl: undefined,
        thumbUrl: keepThumb ? img.thumbUrl : undefined,
      })),
    };
    return JSON.stringify({ v: 1, brief: slim, variants } satisfies RunPayload);
  };

  const withPictures = strip(true);
  if (withPictures.length <= MAX_RUN_PAYLOAD_CHARS) return withPictures;

  /* Six unusually heavy thumbnails, or a brief already close to the ceiling.
     The pictures are the part that can be lost without losing the run: dropped,
     the panel falls back to the file names, which is what every run saved
     before thumbnails existed already shows. Keeping them and letting the POST
     be refused would lose the deck. */
  return strip(false);
}

export type DecodedRun =
  | { ok: true; payload: RunPayload }
  | { ok: false; reason: string };

/** Validated rather than trusted. The row was written by an earlier version of
    this code, which is not the same as being the shape this version expects. */
export function decodeRunPayload(raw: string): DecodedRun {
  try {
    const parsed = runPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return { ok: false, reason: "This saved run is not readable by this version." };
    return { ok: true, payload: parsed.data };
  } catch {
    return { ok: false, reason: "This saved run is damaged." };
  }
}
