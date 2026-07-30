import { z } from "zod";
import {
  MAX_BRAND_COLORS,
  MAX_IMAGES,
  MAX_PROMPT_CHARS,
  MAX_SELL_CHARS,
  STORE_TYPE_IDS,
} from "./briefOptions";
import { ALL_PAGE_IDS, MAX_PER_PAGE, MAX_TOTAL_PAGES } from "./pageCatalog";
import { VISUAL_STYLE_IDS, isValidHex } from "./styleTokens";

/* ==========================================================================
   The brief. This schema is the contract between the form and the generator.
   ========================================================================== */

export const referenceImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** object URL — drives the form thumbnail only */
  url: z.string(),
  /**
   * Downscaled, re-encoded copy. This is what the mockups actually render:
   * it survives the upload being removed, serialises through the generation
   * contract, and needs no blob-fetch or CORS handling at PNG export.
   */
  dataUrl: z.string().optional(),
  /** dominant colours pulled off the image, most prominent first */
  palette: z.array(z.string()).default([]),
  /**
   * The structural read of the reference: section rhythm, column counts,
   * banding. Loose on purpose — this is produced by our own analyser, and the
   * generator treats every field as a hint it may ignore.
   */
  layout: z.unknown().optional(),
  type: z.string(),
  size: z.number(),
});

export const briefSchema = z.object({
  whatYouSell: z
    .string()
    .trim()
    .min(2, "Tell us what you sell")
    .max(MAX_SELL_CHARS, `Keep this under ${MAX_SELL_CHARS} characters`),

  visualStyle: z.enum(VISUAL_STYLE_IDS),

  storeType: z.enum(STORE_TYPE_IDS),

  prompt: z
    .string()
    .max(MAX_PROMPT_CHARS, `Keep this under ${MAX_PROMPT_CHARS} characters`)
    .default(""),

  brandColors: z
    .array(z.string().refine(isValidHex, "Use a hex code like #6B2FF7"))
    .max(MAX_BRAND_COLORS, `Up to ${MAX_BRAND_COLORS} colors`)
    .default([]),

  referenceImages: z
    .array(referenceImageSchema)
    .max(MAX_IMAGES, `Up to ${MAX_IMAGES} images`)
    .default([]),

  /** pageId -> quantity. Zero-quantity keys are allowed and ignored. */
  pages: z
    .record(z.string(), z.number().int().min(0).max(MAX_PER_PAGE))
    .refine(
      (sel) => Object.keys(sel).every((id) => ALL_PAGE_IDS.includes(id)),
      "Unknown page type",
    )
    .refine(
      (sel) => Object.values(sel).some((n) => n > 0),
      "Pick at least one page",
    )
    .refine(
      (sel) =>
        Object.values(sel).reduce((a, b) => a + Math.max(0, b), 0) <=
        MAX_TOTAL_PAGES,
      `That's more than ${MAX_TOTAL_PAGES} pages`,
    ),
});

export type Brief = z.infer<typeof briefSchema>;
export type ReferenceImage = z.infer<typeof referenceImageSchema>;

/* ==========================================================================
   Field-level readiness, used by the sticky bar to name the ONE thing that's
   still missing rather than dumping a validation summary.
   ========================================================================== */

export type BriefDraft = {
  whatYouSell: string;
  visualStyle: string | null;
  storeType: string | null;
  prompt: string;
  brandColors: string[];
  referenceImages: ReferenceImage[];
  pages: Record<string, number>;
};

export const EMPTY_DRAFT: BriefDraft = {
  whatYouSell: "",
  visualStyle: null,
  storeType: null,
  prompt: "",
  brandColors: [],
  referenceImages: [],
  pages: {},
};

/**
 * Returns the single next thing the merchant has to do, or null when the
 * brief is ready. Order matches the order of the form so the tooltip always
 * points at the highest unfinished section.
 */
export function firstMissing(draft: BriefDraft): string | null {
  if (draft.whatYouSell.trim().length < 2) return "Tell us what you sell";
  if (!draft.visualStyle) return "Pick a visual style";
  if (!draft.storeType) return "Pick a store type";
  if (!Object.values(draft.pages).some((n) => n > 0))
    return "Pick at least one page";
  return null;
}

export function validateBrief(draft: BriefDraft) {
  return briefSchema.safeParse(draft);
}
