import { z } from "zod";
import { currentAccount } from "@/lib/account";
import {
  coerceStyleChoice,
  fallbackStyleChoice,
  styleChoiceSystemPrompt,
  styleChoiceUserPrompt,
  type StyleChoiceResponse,
} from "@/lib/briefStyle";
import { parseObject } from "@/lib/ai/json";
import { getProvider, isAiEnabled } from "@/lib/ai/provider";
import { MAX_PROMPT_CHARS, MAX_SELL_CHARS } from "@/lib/briefOptions";

/* ==========================================================================
   POST /api/ai/brief-style

   The two questions Build Quickly does not ask. One small call — a few hundred
   tokens in, one line out — made once per build, before it starts.

   Declines rather than fails, in the same shape as `/api/ai/copy`: no model, a
   timeout, an invented style id, all come back `ok: true` with the fallback pair
   and `used: false`. A merchant who pressed Create pages must get pages. The
   worst a broken model may cost them is a style they did not choose, which is
   what Build Quickly already asked them to accept.
   ========================================================================== */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  sell: z.string().trim().min(1).max(MAX_SELL_CHARS),
  verticalSlug: z.string().max(80).nullish(),
  market: z.string().max(40).nullish(),
  prompt: z.string().max(MAX_PROMPT_CHARS).default(""),
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
    Response.json({ ok: true, ...fallbackStyleChoice(), reason } satisfies StyleChoiceResponse);

  if (!isAiEnabled()) return decline("no model configured");

  const provider = getProvider();
  if (!provider) return decline("no model configured");

  try {
    const completion = await provider.complete({
      system: styleChoiceSystemPrompt(),
      user: styleChoiceUserPrompt(body),
      /**
       * The ANSWER is two ids and the braces around them — about thirty tokens.
       * The budget is not for the answer.
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

    const choice = coerceStyleChoice(parsed);
    return Response.json({
      ok: true,
      ...choice,
      reason: choice.used ? undefined : "model named a style or store type that does not exist",
    } satisfies StyleChoiceResponse);
  } catch (err) {
    return decline((err as Error).message.slice(0, 200));
  }
}
