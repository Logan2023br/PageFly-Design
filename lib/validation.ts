import { z } from "zod";
import { isKnownVertical } from "./verticals";
import {
  isKnownMarket,
  MAX_BRAND_COLORS,
  MAX_IMAGES,
  MAX_PROMPT_CHARS_STORED,
  MAX_SELL_CHARS,
  MAX_SLICES,
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
  /**
   * A much smaller copy of the same picture, and the only one that survives
   * being saved.
   *
   * `dataUrl` is dropped when a run is stored, because at 1024px it is 80-200KB
   * and `/api/runs` takes 200,000 characters in total — keeping it would stop
   * runs saving at all. This is 256px, so the brief can still be read back with
   * its references months later. Optional: every run saved before it existed
   * has none, and those show the file names instead.
   */
  thumbUrl: z.string().optional(),
  /**
   * The same image cut into readable pieces for the vision pass, in order.
   *
   * Separate from `dataUrl` because they answer different questions. `dataUrl`
   * is a thumbnail capped on its long edge, which is right for showing the
   * upload back and useless for reading a tall page: a 1500x8000 capture ends
   * up 192 wide. These keep the horizontal resolution and split the height.
   */
  /**
   * Bounded by the same constant the slicer uses, and unable to refuse a brief.
   *
   * This said `.max(4)` while `sliceForReading` produced up to six, so a tall
   * screenshot made the whole brief invalid — and `start()` returned in silence,
   * so the merchant got a Create button that did nothing. Two numbers in two
   * files, one of which was changed.
   *
   * `.catch(undefined)` is the second half of the fix and matters more than the
   * first. These slices are OUR derived artefact, not something the merchant
   * typed: refusing their entire brief because our own slicer produced one piece
   * more than a number in another file is never the right failure. Without them
   * the vision read falls back to the thumbnail, which is worse and still a
   * page. Same reasoning, and same shape, as `surface` below.
   */
  slices: z.array(z.string()).max(MAX_SLICES).optional().catch(undefined),
  /** dominant colours pulled off the image, most prominent first */
  palette: z.array(z.string()).default([]),
  /**
   * The reference's own page background and text colour.
   *
   * Separate from `palette`, which cannot carry them: it filters out everything
   * unsaturated, so a white or near-black background never appears in it. When
   * a merchant uploads a reference, THESE are what the page is built on — see
   * the precedence note in `lib/generate/mock.ts`.
   *
   * Optional and nullable for two different reasons: absent means an upload
   * from before this existed, null means the analyser looked and found no
   * colour holding enough of the image to be a background.
   */
  surface: z
    .object({ bg: z.string(), ink: z.string() })
    .nullish()
    .catch(null),
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

  /**
   * The vertical slug, set only when the merchant clicked a Step 1 chip.
   *
   * `null` for free text, and that is the point: the resolver looks a slug up
   * in `30-verticals.md` exactly, and only free text has to be guessed at. A
   * slug invented from typed words is how `Team sports & racket` used to
   * resolve to `food`.
   *
   * Validated against the real list rather than as a loose string — a slug with
   * no block would silently produce a page built from nothing.
   */
  verticalSlug: z
    .string()
    .nullable()
    .default(null)
    .refine((v) => v === null || isKnownVertical(v), "Unknown vertical"),

  visualStyle: z.enum(VISUAL_STYLE_IDS),

  storeType: z.enum(STORE_TYPE_IDS),

  /**
   * Who the page is being sold TO.
   *
   * Optional and null by default, exactly as `verticalSlug` is, and for the
   * same reason: a brief saved before this field existed must still validate,
   * and a merchant who did not choose must get the page they would have got
   * yesterday. Null is not "global" — it is "nobody said", and every prompt
   * treats it as the absence it is.
   */
  market: z
    .string()
    .nullable()
    .default(null)
    .refine((v) => v === null || isKnownMarket(v), "Unknown market"),

  prompt: z
    .string()
    /* The STORED ceiling, not the form's. This schema decodes saved runs as
       well as validating new briefs, and runs built under an older, higher
       limit must still open — see `MAX_PROMPT_CHARS_STORED`. */
    .max(MAX_PROMPT_CHARS_STORED, `Keep this under ${MAX_PROMPT_CHARS_STORED} characters`)
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
  market: string | null;
  prompt: string;
  brandColors: string[];
  referenceImages: ReferenceImage[];
  pages: Record<string, number>;
};

export const EMPTY_DRAFT: BriefDraft = {
  whatYouSell: "",
  visualStyle: null,
  storeType: null,
  market: null,
  prompt: "",
  brandColors: [],
  referenceImages: [],
  pages: {},
};

/* ==========================================================================
   Which questions the form asked.

   Two front doors onto the same brief. Build Detail is the form as it was —
   every question, the merchant answers all of them. Build Quickly asks three
   (market, one prompt, which pages) and has a model read the rest out of the
   prompt before the build starts, so the brief that leaves this file is the
   same shape either way and `briefSchema` above never learns that modes exist.
   ========================================================================== */

export const BUILD_MODES = ["quick", "detail"] as const;
export type BuildMode = (typeof BUILD_MODES)[number];

/**
 * The fields Build Quickly hides and `lib/quickBrief.ts` fills in.
 *
 * Named once, here, because three things have to agree about them: this file
 * stops demanding them, `BriefScreen` stops rendering their cards, and the
 * resolver has to actually produce one. A field added to this list without the
 * third would quietly stop being asked for and arrive at the generator empty.
 */
export const QUICK_RESOLVED_FIELDS = [
  "whatYouSell",
  "visualStyle",
  "storeType",
] as const;

/**
 * Returns the single next thing the merchant has to do, or null when the
 * brief is ready. Order matches the order of the form so the tooltip always
 * points at the highest unfinished section.
 *
 * `mode` defaults to detail: this is the gate on the Create button, and the
 * safe default is the strict one. A caller that forgets to pass the mode asks
 * for too much, never too little.
 */
export function firstMissing(
  draft: BriefDraft,
  mode: BuildMode = "detail",
): string | null {
  if (mode === "quick") {
    /* The prompt carries the whole brief here, so it is the one field quick mode
       cannot proceed without — and the only place it is ever required. In detail
       mode it stays optional, as it has always been. */
    if (draft.prompt.trim().length < 2) return "Tell us what to build";
  } else {
    if (draft.whatYouSell.trim().length < 2) return "Tell us what you sell";
    if (!draft.visualStyle) return "Pick a visual style";
    if (!draft.storeType) return "Pick a store type";
  }
  if (!Object.values(draft.pages).some((n) => n > 0))
    return "Pick at least one page";
  return null;
}

export function validateBrief(draft: BriefDraft) {
  return briefSchema.safeParse(draft);
}
