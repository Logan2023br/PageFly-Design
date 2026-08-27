import {
  MAX_SELL_CHARS,
  STORE_TYPES,
  STORE_TYPE_IDS,
  type StoreTypeId,
} from "./briefOptions";
import { VISUAL_STYLES, VISUAL_STYLE_IDS, type VisualStyleId } from "./styleTokens";

/* ==========================================================================
   The three answers Build Quickly does not ask for.

   Build Quickly asks one open question — describe what you want built — and
   reads the rest out of the answer. What you sell, the visual style and the
   store type are all required downstream and none of them may arrive empty:
   `styleToTokens` turns the style id into the CSS a mockup renders with, and
   `whatYouSell` is what `parseSubject`, `verticalOf` and the brand RNG seed are
   all derived from.

   So they are filled in BEFORE the build starts, and the brief that reaches
   `/api/build` looks exactly like one a merchant typed field by field. No
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

export type QuickChoice = {
  /** what `brief.whatYouSell` becomes — never empty */
  sell: string;
  visualStyle: VisualStyleId;
  storeType: StoreTypeId;
  /** false when any of the three came from a fallback rather than the model */
  used: boolean;
};

export type QuickChoiceRequest = {
  /** the merchant's own words — the whole brief, in quick mode */
  prompt: string;
  /** set only when they had already answered it in detail mode */
  sell?: string;
  verticalSlug?: string | null;
  market?: string | null;
};

export type QuickChoiceResponse =
  | {
      ok: true;
      sell: string;
      visualStyle: string;
      storeType: string;
      used: boolean;
      reason?: string;
    }
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
 * A sell phrase the 120-character field can hold.
 *
 * One line, because `whatYouSell` is an `<input>` everywhere it is shown back —
 * a newline in it turns the Library's brief panel into two rows that look like
 * two fields.
 */
function sellFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length < 2) return null;
  return cap(oneLine);
}

/**
 * The prompt, cut down to a sell phrase.
 *
 * The last resort, reached only when no model answered. Crude on purpose: the
 * first 120 characters of "hand-thrown stoneware mugs in small batches…" is a
 * worse subject line than a model would write and a perfectly usable one, which
 * is the trade a fallback exists to make.
 */
function sellFromPrompt(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  /* Two characters is what `briefSchema` asks of the field. Below that there is
     nothing to derive and nothing to build, which is why quick mode refuses an
     empty prompt at the button rather than here. */
  return oneLine.length >= 2 ? cap(oneLine) : "an online store";
}

/** Cut to the field's ceiling, at a word boundary where there is one near it. */
function cap(text: string): string {
  if (text.length <= MAX_SELL_CHARS) return text;
  const cut = text.slice(0, MAX_SELL_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  /* Only when the boundary is close to the end. A 120-character run with one
     space at position 3 would otherwise come back three characters long. */
  return lastSpace > MAX_SELL_CHARS - 30 ? cut.slice(0, lastSpace) : cut;
}

/**
 * The model's answer as something the generator can be handed.
 *
 * Never throws and never returns a partial answer: each field is either the
 * model's or the fallback for that field. One bad field does not discard the
 * good ones — a model that names a real style and invents a store type has
 * still saved the merchant a question.
 */
export function coerceQuickChoice(value: unknown, prompt: string): QuickChoice {
  const obj =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const sell = sellFrom(obj.sell);
  const visualStyle = idFrom(obj.visualStyle, VISUAL_STYLE_IDS);
  const storeType = idFrom(obj.storeType, STORE_TYPE_IDS);

  return {
    sell: sell ?? sellFromPrompt(prompt),
    visualStyle: visualStyle ?? FALLBACK_STYLE,
    storeType: storeType ?? FALLBACK_STORE_TYPE,
    used: sell !== null && visualStyle !== null && storeType !== null,
  };
}

/** What a failed call resolves to, so no caller has to know the fallbacks. */
export function fallbackQuickChoice(prompt: string): QuickChoice {
  return coerceQuickChoice(null, prompt);
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
export function quickChoiceSystemPrompt(): string {
  const styles = VISUAL_STYLES.map((s) => `- ${s.id} — ${s.label}: ${s.blurb}`).join("\n");
  const types = STORE_TYPES.map((t) => `- ${t.id} — ${t.label}`).join("\n");

  return `You read a merchant's description of the store pages they want built, and answer three questions about it they were not asked.

Visual styles:
${styles}

Store types:
${types}

Return ONLY this JSON object, no commentary:
{"sell": "...", "visualStyle": "<id>", "storeType": "<id>"}

"sell" is what the store sells, as a shop would say it on a shelf label: at most ${MAX_SELL_CHARS} characters, no sentence, no punctuation at the end. "Hand-thrown stoneware mugs", not "This store sells mugs.". Write it in the language the merchant wrote in — it becomes headings and product names on the page.

Rules:
- Use an id from the lists above, exactly as written. An id you invent is discarded and the merchant gets the default instead.
- Pick the style from what they SELL and how they describe it, not from what is most popular. Fine jewellery is not minimal because minimal is safe.
- When their words describe a look — colours, a mood, a brand they admire — follow that over your own read of the trade.
- The store type is about the business, not the catalogue size: one product sold hard is single-product, a brand with a range is d2c, courses and downloads are digital.
- Never invent a trade the description does not support. A description that only names colours and sections sells whatever it says it sells, however vaguely.`;
}

/** The brief, as few lines as it takes to answer the question. */
export function quickChoiceUserPrompt(input: QuickChoiceRequest): string {
  return [
    input.sell && `Sells: ${input.sell}`,
    input.verticalSlug && `Trade: ${input.verticalSlug}`,
    input.market && `Selling into: ${input.market}`,
    `Their own words:\n${input.prompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---- the client side ---------------------------------------------------- */

/**
 * Ask the server to fill the gaps, and never let it stop a build.
 *
 * Every failure — offline, 401, a route that 500s, a body that is not JSON —
 * resolves to the fallback answer. A merchant who pressed Create pages gets
 * pages; the worst a broken model can cost them is a subject line and a style
 * they did not choose, which is the deal Build Quickly already offered.
 */
export async function requestQuickChoice(
  input: QuickChoiceRequest,
  signal?: AbortSignal,
): Promise<QuickChoice> {
  try {
    const res = await fetch("/api/ai/brief-style", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!res.ok) return fallbackQuickChoice(input.prompt);

    const body = (await res.json()) as QuickChoiceResponse;
    if (!body?.ok) return fallbackQuickChoice(input.prompt);

    return coerceQuickChoice(body, input.prompt);
  } catch {
    return fallbackQuickChoice(input.prompt);
  }
}
