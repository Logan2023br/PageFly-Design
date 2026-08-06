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
   the object URL and the downscaled copy are dropped. Both would be dead weight:
   an object URL does not survive the tab that made it.

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

export function encodeRunPayload(
  brief: Brief,
  variants: Record<string, number>,
): string {
  const slim: Brief = {
    ...brief,
    referenceImages: brief.referenceImages.map((img) => ({
      ...img,
      url: "",
      dataUrl: undefined,
    })),
  };
  return JSON.stringify({ v: 1, brief: slim, variants } satisfies RunPayload);
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
