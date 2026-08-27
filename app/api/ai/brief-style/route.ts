import { z } from "zod";
import { currentAccount } from "@/lib/account";
import {
  coerceQuickChoice,
  fallbackQuickChoice,
  quickChoiceSystemPrompt,
  quickChoiceUserPrompt,
  type QuickChoiceResponse,
} from "@/lib/quickBrief";
import { parseObject } from "@/lib/ai/json";
import { getProvider, isAiEnabled } from "@/lib/ai/provider";
import { MAX_PROMPT_CHARS, MAX_SELL_CHARS } from "@/lib/briefOptions";

/* ==========================================================================
   POST /api/ai/brief-style

   The three questions Build Quickly does not ask, read out of the one it does.
   A single small call — a few hundred tokens in, one line out — made once per
   build, before it starts.

   Declines rather than fails, in the same shape as `/api/ai/copy`: no model, a
   timeout, an invented style id, all come back `ok: true` with the fallback
   answer and `used: false`. A merchant who pressed Create pages must get pages.
   The worst a broken model may cost them is a subject line cut out of their own
   prompt and a style they did not choose, which is what Build Quickly already
   asked them to accept.
   ========================================================================== */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  /** the merchant's own words. The whole brief, in quick mode. */
  prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
  /** set only when they had already answered it in detail mode */
  sell: z.string().max(MAX_SELL_CHARS).optional(),
  verticalSlug: z.string().max(80).nullish(),
  market: z.string().max(40).nullish(),
});

export async function POST(request: Request) {
  /* Signed in, because this spends money. Same reasoning as `/api/ai/copy`:
     unauthenticated, it is a loop away from a bill. */
  const account = await currentAccount();
  if (!account)
    return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const decline = (reason: string): Response =>
    Response.json({
      ok: true,
      ...fallbackQuickChoice(body.prompt),
      reason,
    } satisfies QuickChoiceResponse);

  if (!isAiEnabled()) return decline("no model configured");

  const provider = getProvider();
  if (!provider) return decline("no model configured");

  try {
    const completion = await provider.complete({
      system: quickChoiceSystemPrompt(),
      user: quickChoiceUserPrompt(body),
      /**
       * The ANSWER is a short phrase and two ids — about fifty tokens. The
       * budget is not for the answer.
       *
       * A reasoning model bills its thinking against this same ceiling, and 500
       * was not enough for it: two of the first three calls came back with no
       * JSON at all, because the budget was spent before the model started
       * writing. That failure is indistinguishable from a bad prompt unless the
       * ceiling is ruled out first — see the `truncated` note in
       * `lib/ai/provider.ts`, which is the field that told us.
       *
       * Still the cheapest call in the codebase by an order of magnitude: one
       * per build, against a page design that asks for tens of thousands.
       */
      maxTokens: 4000,
      signal: AbortSignal.timeout(20_000),
    });

    const parsed = parseObject(completion.text);
    if (!parsed)
      /* Which of the two it was, in the reason. "Did not return a JSON object"
         sent us reading the prompt when the answer was the ceiling. */
      return decline(
        completion.truncated
          ? `ran out of output budget${completion.reasoning ? ` — ${completion.reasoning} spent thinking` : ""}`
          : "model did not return a JSON object",
      );

    const choice = coerceQuickChoice(parsed, body.prompt);
    return Response.json({
      ok: true,
      ...choice,
      reason: choice.used
        ? undefined
        : "model skipped a field or named one that does not exist",
    } satisfies QuickChoiceResponse);
  } catch (err) {
    return decline((err as Error).message.slice(0, 200));
  }
}
