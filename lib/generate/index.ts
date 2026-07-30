import type { Brief } from "../validation";
import { MOCK_MODE, buildPage, expandSelection } from "./mock";
import { makeRng } from "./seed";
import type { GenerateFailure, PageMockup } from "./types";

export type { PageMockup, MockupBlock, MockupTokens, GenerateFailure } from "./types";
export type { Brief } from "../validation";
export { MOCK_MODE } from "./mock";
export { expandSelection } from "./mock";

/* ==========================================================================
   THE GENERATION SEAM.

   This is the only place page-generation logic lives. When the Claude skill
   replaces the mock, `buildPage` is what gets swapped — the signature below,
   the streaming callback and the types in ./types.ts stay exactly as they are.

   See docs/generation-contract.md.
   ========================================================================== */

export type GenerateOptions = {
  /** Called when a single page cannot be built. The rest keep going. */
  onPageFailed?: (failure: GenerateFailure) => void;
  /**
   * Regenerate only these page ids (as produced by `expandSelection`).
   * Omit to generate the whole brief.
   */
  onlyPageIds?: string[];
  /** pageId -> variant number. Bumped by "Regenerate" to get a new take. */
  variants?: Record<string, number>;
  /**
   * Mock only: forces the first N pages to fail so the partial-failure and
   * retry paths can be exercised. Never set in production.
   */
  failFirstN?: number;
  /** Mock only: skip the simulated per-page delay (used by tests). */
  instant?: boolean;
};

class AbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortedError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Generate one mockup per requested page, streaming results as they land.
 *
 * Pages resolve sequentially and deliberately: the generating screen shows the
 * deck filling up card by card, so the order and the per-page delay are part of
 * the product, not an implementation accident.
 *
 * @param brief        validated form output
 * @param onPageReady  called once per finished page, in order
 * @param signal       abort to cancel; already-delivered pages are kept
 * @param options      failure reporting, partial regeneration, variant control
 */
export async function generatePages(
  brief: Brief,
  onPageReady: (page: PageMockup) => void,
  signal?: AbortSignal,
  options: GenerateOptions = {},
): Promise<PageMockup[]> {
  const all = expandSelection(brief.pages);
  const targets = options.onlyPageIds
    ? all.filter((p) => options.onlyPageIds!.includes(p.pageId))
    : all;

  const done: PageMockup[] = [];

  for (let i = 0; i < targets.length; i++) {
    if (signal?.aborted) throw new AbortedError();

    const target = targets[i];
    const variant = options.variants?.[target.pageId] ?? 0;

    // Deterministic "thinking" time, 700-1400ms per the brief.
    if (!options.instant) {
      const delayRng = makeRng(`delay::${target.pageId}::${variant}`);
      await sleep(delayRng.int(700, 1400), signal);
    }

    const shouldFail =
      MOCK_MODE && options.failFirstN != null && i < options.failFirstN;

    if (shouldFail) {
      options.onPageFailed?.({
        pageId: target.pageId,
        label: target.pageType,
        reason: "The generator returned an incomplete layout.",
      });
      continue;
    }

    try {
      const page = buildPage({
        brief,
        pageType: target.pageType,
        pageId: target.pageId,
        index: all.findIndex((p) => p.pageId === target.pageId) + 1,
        copyIndex: target.copyIndex,
        copyTotal: target.copyTotal,
        variant,
      });
      done.push(page);
      onPageReady(page);
    } catch (err) {
      options.onPageFailed?.({
        pageId: target.pageId,
        label: target.pageType,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return done;
}

/** Rebuild a single page with a fresh variant. Used by "Regenerate this page". */
export function regeneratePage(
  brief: Brief,
  page: PageMockup,
): PageMockup {
  return buildPage({
    brief,
    pageType: page.pageType,
    pageId: page.id,
    index: page.index,
    copyIndex: page.copyIndex ?? 1,
    copyTotal: page.copyTotal ?? 1,
    variant: page.variant + 1,
  });
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}
