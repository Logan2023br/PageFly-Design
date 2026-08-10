import type { MockupBlock } from "../generate/types";

/* ==========================================================================
   Which strings in a page are copy, and how to put rewritten ones back.

   The model rewrites TEXT. It does not choose blocks, columns, image seeds or
   ratings — those come from the deterministic generator and stay exactly as they
   were. That split is deliberate: the observed failure was never the layout (the
   mockups look right) but the words, which were template sentences with the
   merchant's noun dropped in — "tarantulas built from parts we can replace".

   Keeping structure out of the model's hands also means a bad response can never
   produce an invalid page. The worst case is the original copy.

   Runs on both sides: the client extracts and re-applies, the server only talks
   to the model. That is what keeps the API key server-side without moving page
   generation off the client and losing the page-by-page streaming.
   ========================================================================== */

/** Keys whose value drives rendering rather than reading. Never sent. */
const STRUCTURAL_KEYS = new Set([
  "seed",
  "layout",
  "kind",
  "id",
  "variant",
  "mode",
  "align",
  "icon",
  "pattern",
  "tone",
  "ratio",
  "columns",
  "highlight",
  "rating",
  "openIndex",
  "highlightColumn",
  "galleryCount",
  "cartCount",
]);

/** A lowercase single word is how the enums in this codebase are written
    (`centered`, `fullBleed`, `soft`). Copy is capitalised, punctuated, or spaced —
    "New" and "$125" and "Free returns" all survive this test. */
function looksStructural(value: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(value);
}

export type CopyField = {
  /** block index, then the path inside its content */
  path: (string | number)[];
  text: string;
};

function collect(
  value: unknown,
  path: (string | number)[],
  out: CopyField[],
): void {
  if (typeof value === "string") {
    const key = path[path.length - 1];
    if (typeof key === "string" && STRUCTURAL_KEYS.has(key)) return;
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    if (looksStructural(trimmed)) return;
    out.push({ path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collect(v, [...path, i], out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (STRUCTURAL_KEYS.has(k)) continue;
      collect(v, [...path, k], out);
    }
  }
}

/** Every rewritable string in a deck's blocks, in a stable order. */
export function extractCopy(blocks: MockupBlock[]): CopyField[] {
  const out: CopyField[] = [];
  blocks.forEach((block, i) => collect(block.content, [i, "content"], out));
  return out;
}

/**
 * Put rewritten strings back.
 *
 * Positional, and validated by the caller before it gets here: the model returns
 * an array the same length as it was given, and item i replaces field i. Paths are
 * re-walked rather than trusted from the response, so a response cannot reach a
 * key that was never offered.
 */
export function applyCopy(
  blocks: MockupBlock[],
  fields: CopyField[],
  rewritten: string[],
): MockupBlock[] {
  const next = structuredClone(blocks) as MockupBlock[];

  fields.forEach((field, i) => {
    const text = rewritten[i];
    if (typeof text !== "string" || !text.trim()) return;

    let cursor: unknown = next;
    for (let p = 0; p < field.path.length - 1; p++) {
      if (cursor === null || typeof cursor !== "object") return;
      cursor = (cursor as Record<string | number, unknown>)[field.path[p]];
    }
    if (cursor === null || typeof cursor !== "object") return;

    const last = field.path[field.path.length - 1];
    (cursor as Record<string | number, unknown>)[last] = text;
  });

  return next;
}

/**
 * Turn a model response into a full set of strings.
 *
 * The response carries an explicit index per item, and that is not decoration:
 * with a positional array, a model that returns 58 items for 59 fields shifts
 * every string after the gap onto the wrong field, so the only safe reading is to
 * throw the whole page away — which is what happened, losing 58 good rewrites to
 * one missing one. Indexed items make a gap cost exactly the field it belongs to.
 *
 * Anything not returned, blank, or wildly longer than the original keeps its
 * original text. Length is capped at three times rather than exactly: a headline
 * may legitimately grow, but a paragraph where a two-word label belongs breaks a
 * layout the mockup already proved.
 */
export function checkRewrite(
  fields: CopyField[],
  rewritten: unknown,
): { ok: true; texts: string[]; filled: number } | { ok: false; reason: string } {
  if (!Array.isArray(rewritten))
    return { ok: false, reason: "expected an array" };

  const texts = fields.map((f) => f.text);
  let filled = 0;

  const accept = (index: number, value: unknown) => {
    if (!Number.isInteger(index) || index < 0 || index >= fields.length) return;
    if (typeof value !== "string" || !value.trim()) return;
    const limit = Math.max(40, fields[index].text.length * 3);
    if (value.length > limit) return;
    texts[index] = value;
    filled++;
  };

  for (let i = 0; i < rewritten.length; i++) {
    const item = rewritten[i];
    if (typeof item === "string") {
      /* A plain array of strings is still honoured, but only when it is exactly
         the right length — otherwise position means nothing. */
      if (rewritten.length === fields.length) accept(i, item);
      continue;
    }
    if (item && typeof item === "object") {
      const rec = item as { i?: unknown; text?: unknown };
      accept(typeof rec.i === "number" ? rec.i : NaN, rec.text);
    }
  }

  /* A response that reached almost nothing is a misunderstanding, not a rewrite —
     better to say so and keep the deterministic page than to ship a page that is
     nine tenths the wrong industry. */
  if (filled < fields.length * 0.6)
    return {
      ok: false,
      reason: `only ${filled} of ${fields.length} fields came back usable`,
    };

  return { ok: true, texts, filled };
}
