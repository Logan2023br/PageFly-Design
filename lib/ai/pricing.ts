/* ==========================================================================
   DOLLARS PER MILLION TOKENS, IN ONE PLACE.

   Token counts are measured and cannot lie. Dollars are those counts times a
   rate a person read off a pricing page, so the rate is the part that rots —
   and when it does, the tokens stay right while the money quietly goes wrong.
   Hence: one table, read by the admin screen and by `scripts/measure-design-
   cost.ts` both, so a stale rate is stale in exactly one place.

   AN UNKNOWN MODEL COSTS `null`, NOT ZERO. This is the whole reason the
   function returns a nullable. Add a model, forget to price it, and a zero
   would put $0.00 beside a real token count — a row that reads "this was
   free" rather than "nobody has priced this". The screen shows the tokens and
   says the dollars are unknown, which is the truth and is also loud enough to
   get fixed.

   CACHE HITS ARE A SEPARATE RATE, not a discount applied afterwards. DeepSeek
   bills a hit at $0.006/M against $0.30/M for a miss — fifty times apart — and
   the export path runs at about 55% cached, so folding the two together is not
   a rounding error on the biggest line of the bill.
   ========================================================================== */

export type Rate = {
  /** per million input tokens that were NOT served from cache */
  in: number;
  /** per million output tokens */
  out: number;
  /**
   * Per million input tokens served from the vendor's prompt cache.
   *
   * Absent where the vendor does not price a hit differently, in which case a
   * cached token is billed as an ordinary input token — which is the correct
   * arithmetic for Anthropic base-rate usage, not an approximation.
   */
  cachedIn?: number;
};

/**
 * Read off each vendor's pricing page by a person, on 2026-09-23.
 *
 * Kept here rather than fetched: a number on an admin screen must not depend
 * on a network call to a third party, and a rate that moves is a deliberate
 * edit with a date on it rather than a silent change.
 */
export const RATES: Record<string, Rate> = {
  /* platform.claude.com/docs/en/about-claude/pricing */
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-haiku-4-5": { in: 1, out: 5 },

  /* DeepSeek. `deepseek-v4-flash` is a legacy alias served by V4.1-Flash at
     Flash price — confirmed against their docs, and the reason the alias is
     priced here under its own name rather than resolved away. */
  "deepseek-v4-flash": { in: 0.3, out: 1.2, cachedIn: 0.006 },
  "deepseek-v4.1-flash": { in: 0.3, out: 1.2, cachedIn: 0.006 },
};

export type Counted = {
  input: number;
  output: number;
  /** of `input`, how many were served from cache */
  cached?: number | null;
};

/**
 * What a call cost, or null when the model has no rate on file.
 *
 * `cached` is a SUBSET of `input`, which is how both vendors report it — so
 * the billable miss is `input - cached` and double-counting it is the easy
 * mistake. A `cached` larger than `input` would be a vendor bug rather than
 * ours; it is clamped so a bad payload cannot produce a negative bill.
 */
export function costOf(model: string, u: Counted): number | null {
  const rate = RATES[model];
  if (!rate) return null;

  const cached = Math.min(Math.max(u.cached ?? 0, 0), Math.max(u.input, 0));
  const miss = Math.max(u.input, 0) - cached;

  return (
    (miss / 1e6) * rate.in +
    (cached / 1e6) * (rate.cachedIn ?? rate.in) +
    (Math.max(u.output, 0) / 1e6) * rate.out
  );
}
