import { z } from "zod";
import { currentAccount } from "@/lib/account";
import { getProvider, isAiEnabled } from "@/lib/ai/provider";
import { loadSkills } from "@/lib/ai/skills";
import { DESIGN_SYSTEM } from "@/lib/ai/designPrompt";
import { designTreeSchema, walk, type DesignTree } from "@/lib/design/schema";
import { resolvePhotos, stockProvider } from "@/lib/images/stock";

/* ==========================================================================
   POST /api/ai/design

   The model lays the page out. This is a different job from /api/ai/copy — that
   one rewrites the words on a page the generator already built; this one
   decides what the page IS.

   Both survive. When this route declines or fails the caller falls back to the
   deterministic generator, which produces a complete, correct, unremarkable
   page. A model outage must cost polish, never the product.
   ========================================================================== */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  sell: z.string().max(300),
  prompt: z.string().max(4000).default(""),
  storeType: z.string().max(60).default(""),
  style: z.string().max(60).default(""),
  pageLabel: z.string().max(120).default(""),
  pageType: z.string().max(60).default("home"),
  /** the palette and faces the merchant already chose — the model works inside
      them rather than inventing a second brand */
  tokens: z
    .object({
      bg: z.string().max(32),
      ink: z.string().max(32),
      accent: z.string().max(32),
      fontHeading: z.string().max(160),
      fontBody: z.string().max(160),
      radius: z.number(),
    })
    .partial()
    .optional(),
});

const FALLBACK_TOKENS = {
  bg: "#FFFFFF",
  ink: "#111114",
  accent: "#111114",
  fontHeading: "",
  fontBody: "",
  radius: 0,
};

export type AiDesignResponse =
  | {
      ok: true;
      used: true;
      tree: DesignTree;
      images: Record<string, string>;
      usage: { input: number; output: number };
    }
  | {
      ok: true;
      used: false;
      reason: string;
      usage: { input: number; output: number };
    };


export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account)
    return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const decline = (reason: string, usage = { input: 0, output: 0 }): Response =>
    Response.json({ ok: true, used: false, reason, usage } satisfies AiDesignResponse);

  if (!isAiEnabled()) return decline("no model configured");
  const provider = getProvider();
  if (!provider) return decline("no model configured");

  const skills = loadSkills("design");
  const system = skills ? `${DESIGN_SYSTEM}\n\n${skills}` : DESIGN_SYSTEM;

  const t = { ...FALLBACK_TOKENS, ...body.tokens };
  const user = [
    `Store sells: ${body.sell}`,
    body.storeType && `Store type: ${body.storeType}`,
    body.prompt && `Merchant's own words: ${body.prompt}`,
    ``,
    `Design this page: ${body.pageLabel || body.pageType}`,
    ``,
    `Palette and faces — work inside these, do not introduce others:`,
    `  background ${t.bg}`,
    `  text ${t.ink}`,
    `  accent ${t.accent}`,
    t.fontHeading && `  heading font-family: ${t.fontHeading}`,
    t.fontBody && `  body font-family: ${t.fontBody}`,
    `  corner radius ${t.radius}px`,
    ``,
    `Return the JSON object now.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await provider.complete({
      system,
      user,
      /* A full page tree runs 6-14k tokens. Cutting it short costs the whole
         page, since a truncated tree is not parseable JSON. */
      maxTokens: 16_000,
      signal: AbortSignal.timeout(240_000),
    });

    const raw = parseObject(completion.text);
    if (!raw) return decline("model did not return JSON", completion.usage);

    const parsed = designTreeSchema.safeParse(raw);
    if (!parsed.success)
      return decline(
        `tree rejected: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`.slice(0, 180),
        completion.usage,
      );

    const tree = parsed.data;

    /* A model that returns one empty section technically satisfies the schema
       and would replace a working page with a blank one. */
    const nodes = walk(tree);
    if (tree.sections.length < 2 || nodes.length < 12)
      return decline(
        `tree too thin (${tree.sections.length} sections, ${nodes.length} nodes)`,
        completion.usage,
      );

    const wants = nodes
      .filter((n): n is Extract<typeof n, { type: "image" }> => n.type === "image")
      .map((n) => ({ query: n.query, ratio: n.ratio }));

    const productShots = nodes
      .filter((n): n is Extract<typeof n, { type: "product" }> => n.type === "product")
      .map((n) => ({ query: n.query, ratio: 1 }));

    const images =
      stockProvider() === "none"
        ? {}
        : await resolvePhotos([...wants, ...productShots]);

    return Response.json({
      ok: true,
      used: true,
      tree,
      images,
      usage: completion.usage,
    } satisfies AiDesignResponse);
  } catch (err) {
    return decline((err as Error).message.slice(0, 200));
  }
}

/** Models wrap JSON in prose or fences more often than they should. */
function parseObject(text: string): unknown | null {
  const attempts = [text];

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) attempts.push(fenced[1]);

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(text.slice(start, end + 1));

  for (const attempt of attempts) {
    try {
      const value = JSON.parse(attempt.trim());
      if (value && typeof value === "object") return value;
    } catch {
      // try the next shape
    }
  }
  return null;
}
