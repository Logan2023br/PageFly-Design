"use client";

import { designTreeSchema } from "../design/schema";
import type { Brief } from "../validation";
import type { PageMockup } from "../generate/types";
import type { AiDesignResponse } from "@/app/api/ai/design/route";

/* ==========================================================================
   Ask the model to lay one page out.

   Runs INSTEAD of the copy rewrite, not after it. A page the model designed
   already carries the model's own words, so rewriting them would be a second
   call to say the same thing — and the two calls disagreeing would show up as
   copy that no longer fits the layout it was measured for.

   Never throws. Every failure returns the deterministic page unchanged, which
   is a complete page: no model configured, request failed, timed out, tree
   rejected, or the merchant is not signed in. The caller cannot tell the
   difference except by reading `used`.
   ========================================================================== */

export type DesignResult = {
  page: PageMockup;
  used: boolean;
  tokens: number;
  reason?: string;
};

export async function designPage(
  page: PageMockup,
  brief: Brief,
  signal?: AbortSignal,
): Promise<DesignResult> {
  try {
    const res = await fetch("/api/ai/design", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        sell: brief.whatYouSell,
        prompt: brief.prompt,
        storeType: brief.storeType,
        style: brief.visualStyle,
        pageLabel: page.label,
        pageType: page.pageType,
        /* The palette the merchant already chose. Handing it over is what keeps
           thirty AI-designed pages reading as one store instead of thirty. */
        tokens: {
          bg: page.tokens.bg,
          ink: page.tokens.ink,
          accent: page.tokens.accent,
          fontHeading: page.tokens.fontDisplay,
          fontBody: page.tokens.fontBody,
          radius: page.tokens.radius,
        },
      }),
    });

    if (!res.ok) return { page, used: false, tokens: 0, reason: `http ${res.status}` };

    const body = (await res.json()) as AiDesignResponse;
    if (!body.ok || !body.used)
      return {
        page,
        used: false,
        tokens: (body.usage?.input ?? 0) + (body.usage?.output ?? 0),
        reason: "reason" in body ? body.reason : undefined,
      };

    /* Validated a second time, here. The route already checked it, but this is
       the boundary the renderer sits behind — and a tree that reached the
       renderer malformed would break the results screen rather than one page. */
    const checked = designTreeSchema.safeParse(body.tree);
    if (!checked.success)
      return {
        page,
        used: false,
        tokens: body.usage.input + body.usage.output,
        reason: "tree failed client validation",
      };

    return {
      page: { ...page, design: { tree: checked.data, images: body.images } },
      used: true,
      tokens: body.usage.input + body.usage.output,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      page,
      used: false,
      tokens: 0,
      reason: aborted ? undefined : (err as Error).message,
    };
  }
}
