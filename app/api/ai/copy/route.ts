import { z } from "zod";
import { currentAccount } from "@/lib/account";
import { checkRewrite } from "@/lib/ai/copyFields";
import { getProvider, isAiEnabled } from "@/lib/ai/provider";
import { loadSkills } from "@/lib/ai/skills";

/* ==========================================================================
   POST /api/ai/copy

   The only place a model is called. The client generates a page's structure
   deterministically, sends the strings in it, and gets rewritten strings back —
   so the API key never leaves the server and page-by-page streaming stays on the
   client where it already worked.

   Failure of any kind returns the ORIGINAL strings with `used: false`. A model
   that is down, slow, unconfigured, or answering nonsense must degrade to the
   product that already exists, never to an error screen. The caller cannot tell
   the difference except by reading `used`.
   ========================================================================== */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  /** what the merchant said they sell, plus their free-form prompt */
  sell: z.string().max(300),
  prompt: z.string().max(4000).default(""),
  storeType: z.string().max(60).default(""),
  style: z.string().max(60).default(""),
  pageLabel: z.string().max(120).default(""),
  /** the strings to rewrite, in order */
  fields: z
    .array(z.object({ hint: z.string().max(80), text: z.string().max(2000) }))
    .max(400),
});

export type AiCopyResponse = {
  ok: true;
  used: boolean;
  texts: string[];
  usage: { input: number; output: number };
  reason?: string;
};

const SYSTEM_HEADER = `You rewrite the copy on an e-commerce page mockup so it belongs to one specific store.

You are given a numbered list of strings taken from a page that is already laid out. Rewrite each one for the merchant described.

Return ONLY a JSON array of objects, no commentary:
[{"i": 0, "text": "..."}, {"i": 1, "text": "..."}, ...]

The "i" value is the number the string was given in the list. Carry it exactly — it is how each rewrite finds its place.

Rules that matter more than sounding good:
- Return one object for EVERY number in the list. A number you skip keeps another industry's words on the page.
- Never merge or split entries. One input number, one output object.
- Keep each rewrite close to the original LENGTH. The layout is already fixed around it; a headline that doubles in length breaks the page it was measured for.
- Keep the same KIND of thing. A price stays a price with the same currency and rough magnitude. A two-word button label stays a two-word button label. A star count stays a number.
- Keep any leading/trailing punctuation and casing style the original had.
- Write in the language the merchant wrote their brief in.
- Say what is true of THIS store. If the brief does not tell you something, write copy that would be true of any honest store selling it — never invent a certification, an award, a shipping time or a guarantee.
- Do not mention that this is a mockup, a template, or generated.`;

export async function POST(request: Request) {
  /* Signed in, because this spends money. An unauthenticated caller could
     otherwise run up a bill by looping. */
  const account = await currentAccount();
  if (!account)
    return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const originals = body.fields.map((f) => f.text);

  const fail = (reason: string): Response =>
    Response.json({
      ok: true,
      used: false,
      texts: originals,
      usage: { input: 0, output: 0 },
      reason,
    } satisfies AiCopyResponse);

  if (!isAiEnabled()) return fail("no model configured");
  if (body.fields.length === 0) return fail("nothing to rewrite");

  const provider = getProvider();
  if (!provider) return fail("no model configured");

  /* Only skills that apply to writing copy. A skill about constructing PageFly
     payloads teaches a copywriter nothing and costs thousands of tokens a page. */
  const skills = loadSkills("copy");
  const system = skills ? `${SYSTEM_HEADER}\n\n${skills}` : SYSTEM_HEADER;

  const brief = [
    `Store sells: ${body.sell}`,
    body.storeType && `Store type: ${body.storeType}`,
    body.style && `Visual style: ${body.style}`,
    body.pageLabel && `This page: ${body.pageLabel}`,
    body.prompt && `Merchant's own words: ${body.prompt}`,
  ]
    .filter(Boolean)
    .join("\n");

  const list = body.fields
    .map((f, i) => `${i}. [${f.hint}] ${JSON.stringify(f.text)}`)
    .join("\n");

  const user = `${brief}\n\nRewrite these ${body.fields.length} strings. Reply with a JSON array of exactly ${body.fields.length} strings.\n\n${list}`;

  try {
    const completion = await provider.complete({
      system,
      user,
      /* Output is bounded by the input: the rewrites are the same size as the
         originals, plus JSON overhead. */
      maxTokens: Math.min(8000, 400 + originals.join("").length),
      signal: AbortSignal.timeout(45_000),
    });

    const parsed = parseArray(completion.text);
    if (!parsed)
      return Response.json({
        ok: true,
        used: false,
        texts: originals,
        usage: completion.usage,
        reason: "model did not return a JSON array",
      } satisfies AiCopyResponse);

    const checked = checkRewrite(
      body.fields.map((f) => ({ path: [], text: f.text })),
      parsed,
    );
    if (!checked.ok)
      return Response.json({
        ok: true,
        used: false,
        texts: originals,
        usage: completion.usage,
        reason: checked.reason,
      } satisfies AiCopyResponse);

    return Response.json({
      ok: true,
      used: true,
      texts: checked.texts,
      usage: completion.usage,
      reason:
        checked.filled < body.fields.length
          ? `${checked.filled}/${body.fields.length} rewritten`
          : undefined,
    } satisfies AiCopyResponse);
  } catch (err) {
    return fail((err as Error).message.slice(0, 200));
  }
}

/** Models wrap JSON in prose or fences more often than they should. */
function parseArray(text: string): unknown[] | null {
  const attempts = [text];

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) attempts.push(fenced[1]);

  const bracketed = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  if (bracketed) attempts.push(bracketed);

  for (const attempt of attempts) {
    try {
      const value = JSON.parse(attempt.trim());
      if (Array.isArray(value)) return value;
      /* DeepSeek's json_object mode cannot return a bare array, so it wraps it.
         Any single array-valued property is the answer. */
      if (value && typeof value === "object") {
        const arrays = Object.values(value).filter(Array.isArray);
        if (arrays.length === 1) return arrays[0] as unknown[];
      }
    } catch {
      // try the next shape
    }
  }
  return null;
}
