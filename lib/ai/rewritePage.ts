"use client";

import { applyCopy, extractCopy } from "./copyFields";
import type { Brief } from "../validation";
import type { PageMockup } from "../generate/types";
import type { AiCopyResponse } from "@/app/api/ai/copy/route";

/* ==========================================================================
   Ask the model to rewrite one page's copy.

   Called after the deterministic generator has produced the page, so the
   structure — blocks, order, columns, image seeds — is already fixed and correct.
   Only the words change.

   Never throws, and never returns a page that is worse than the one it was
   given. Every failure path returns the original: no model configured, request
   failed, timed out, wrong shape, or the merchant is not signed in. The
   deterministic page is the product; this is an improvement on top of it.
   ========================================================================== */

export type RewriteResult = {
  page: PageMockup;
  /** whether the model's text was actually used */
  used: boolean;
  tokens: number;
  reason?: string;
};

/** A short label per string, so the model knows what it is rewriting rather than
    guessing from the text alone. `blocks[2].content.hero.headline` → "hero headline". */
function hintFor(path: (string | number)[], blocks: PageMockup["blocks"]): string {
  const blockIndex = typeof path[0] === "number" ? path[0] : 0;
  const kind = blocks[blockIndex]?.kind ?? "block";
  const key = [...path].reverse().find((p) => typeof p === "string" && p !== "content");
  return `${kind} ${typeof key === "string" ? key : "text"}`.slice(0, 60);
}

export async function rewritePageCopy(
  page: PageMockup,
  brief: Brief,
  signal?: AbortSignal,
): Promise<RewriteResult> {
  const fields = extractCopy(page.blocks);
  if (fields.length === 0) return { page, used: false, tokens: 0 };

  try {
    const res = await fetch("/api/ai/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        sell: brief.whatYouSell,
        prompt: brief.prompt,
        storeType: brief.storeType,
        style: brief.visualStyle,
        pageLabel: page.label,
        fields: fields.map((f) => ({
          hint: hintFor(f.path, page.blocks),
          text: f.text,
        })),
      }),
    });

    if (!res.ok) return { page, used: false, tokens: 0, reason: `http ${res.status}` };

    const body = (await res.json()) as AiCopyResponse;
    if (!body.ok || !body.used)
      return {
        page,
        used: false,
        tokens: (body.usage?.input ?? 0) + (body.usage?.output ?? 0),
        reason: body.reason,
      };

    return {
      page: { ...page, blocks: applyCopy(page.blocks, fields, body.texts) },
      used: true,
      tokens: body.usage.input + body.usage.output,
    };
  } catch (err) {
    /* An aborted run is the merchant cancelling, not a failure worth reporting. */
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      page,
      used: false,
      tokens: 0,
      reason: aborted ? undefined : (err as Error).message,
    };
  }
}
