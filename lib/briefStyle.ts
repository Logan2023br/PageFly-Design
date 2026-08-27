import { STORE_TYPES, STORE_TYPE_IDS, type StoreTypeId } from "./briefOptions";
import { VISUAL_STYLES, VISUAL_STYLE_IDS, type VisualStyleId } from "./styleTokens";

/* ==========================================================================
   The two answers Build Quickly does not ask for.

   `visualStyle` and `storeType` are required everywhere downstream —
   `styleToTokens` turns the style id into the actual CSS the mockup renders
   with — so they cannot simply be absent. Build Quickly hides the questions and
   has a model answer them instead, BEFORE the build starts, so the brief that
   reaches `/api/build` looks exactly like one a merchant filled in by hand. No
   pipeline stage, no saved run and no Library card knows the difference.

   This file is the half of that both sides share: the prompt, and the coercion
   that decides what the model actually said. The model call itself is in
   `app/api/ai/brief-style/route.ts`, because that is where the API key lives.
   ========================================================================== */

/**
 * What a quick build uses when there is no answer to be had.
 *
 * Not a neutral placeholder — it is what every local dev with no model
 * configured gets, and what a merchant gets when the model is down. Minimal and
 * D2C is the most common shape of Shopify store and the least likely style to
 * look wrong for a trade nobody described.
 */
export const FALLBACK_STYLE: VisualStyleId = "minimal";
export const FALLBACK_STORE_TYPE: StoreTypeId = "d2c";

export type StyleChoice = {
  visualStyle: VisualStyleId;
  storeType: StoreTypeId;
  /** false when either half came from the fallback rather than the model */
  used: boolean;
};

export type StyleChoiceRequest = {
  sell: string;
  verticalSlug?: string | null;
  market?: string | null;
  prompt?: string;
};

export type StyleChoiceResponse =
  | { ok: true; visualStyle: string; storeType: string; used: boolean; reason?: string }
  | { ok: false; error: string };

/* ---- reading the answer -------------------------------------------------- */

/**
 * One id off a known list, or null.
 *
 * Trims and lowercases first. A model that reads `Bold & vibrant` off the list
 * and answers `Bold` has given the right answer in its own casing, and throwing
 * that away would spend a model call to reach the fallback.
 */
function idFrom<T extends string>(value: unknown, ids: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const wanted = value.trim().toLowerCase();
  return ids.find((id) => id === wanted) ?? null;
}

/**
 * The model's answer as something the generator can be handed.
 *
 * Never throws and never returns a partial pair: each field is either an id
 * from its own list or the fallback for that field. One bad half does not
 * discard the good one — a model that names a real style and invents a store
 * type has still saved the merchant a question.
 */
export function coerceStyleChoice(value: unknown): StyleChoice {
  const obj = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  const visualStyle = idFrom(obj.visualStyle, VISUAL_STYLE_IDS);
  const storeType = idFrom(obj.storeType, STORE_TYPE_IDS);

  return {
    visualStyle: visualStyle ?? FALLBACK_STYLE,
    storeType: storeType ?? FALLBACK_STORE_TYPE,
    used: visualStyle !== null && storeType !== null,
  };
}

/** What a failed call resolves to, so no caller has to know the fallbacks. */
export function fallbackStyleChoice(): StyleChoice {
  return {
    visualStyle: FALLBACK_STYLE,
    storeType: FALLBACK_STORE_TYPE,
    used: false,
  };
}

/* ---- asking ------------------------------------------------------------- */

/**
 * The lists, written out for the model.
 *
 * Built from the same constants the form renders, so a style added to
 * `VISUAL_STYLES` becomes available to quick builds without a second edit here.
 * The blurb is included because it is the only thing that distinguishes
 * `editorial` from `minimal` to a reader who has not seen the cards.
 */
export function styleChoiceSystemPrompt(): string {
  const styles = VISUAL_STYLES.map((s) => `- ${s.id} — ${s.label}: ${s.blurb}`).join("\n");
  const types = STORE_TYPES.map((t) => `- ${t.id} — ${t.label}`).join("\n");

  return `You pick the visual style and the store type for an e-commerce page mockup, for a merchant who chose not to answer those two questions.

Visual styles:
${styles}

Store types:
${types}

Return ONLY this JSON object, no commentary:
{"visualStyle": "<id>", "storeType": "<id>"}

Rules:
- Use an id from the lists above, exactly as written. An id you invent is discarded and the merchant gets the default instead.
- Pick what suits what they SELL and how they sell it, not what is most popular. Fine jewellery is not minimal because minimal is safe.
- The store type is about the business, not the catalogue size: one product sold hard is single-product, a brand with a range is d2c, courses and downloads are digital.
- When the merchant's own words describe a look, follow them over your own read of the trade.`;
}

/** The brief, as few lines as it takes to answer the question. */
export function styleChoiceUserPrompt(input: StyleChoiceRequest): string {
  return [
    `Sells: ${input.sell}`,
    input.verticalSlug && `Trade: ${input.verticalSlug}`,
    input.market && `Selling into: ${input.market}`,
    input.prompt && `Their own words: ${input.prompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---- the client side ---------------------------------------------------- */

/**
 * Ask the server to choose, and never let it stop a build.
 *
 * Every failure — offline, 401, a route that 500s, a body that is not JSON —
 * resolves to the fallback pair. A merchant who pressed Create pages gets pages;
 * the worst a broken model can cost them is a style they did not choose, which
 * is the deal Build Quickly already offered.
 */
export async function requestStyleChoice(
  input: StyleChoiceRequest,
  signal?: AbortSignal,
): Promise<StyleChoice> {
  try {
    const res = await fetch("/api/ai/brief-style", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!res.ok) return fallbackStyleChoice();

    const body = (await res.json()) as StyleChoiceResponse;
    if (!body?.ok) return fallbackStyleChoice();

    return coerceStyleChoice(body);
  } catch {
    return fallbackStyleChoice();
  }
}
