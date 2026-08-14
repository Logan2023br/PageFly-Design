import { z } from "zod";
import { currentAccount } from "@/lib/account";
import { designPageTree } from "@/lib/ai/designServer";
import type { DesignTree } from "@/lib/design/schema";

/* ==========================================================================
   POST /api/ai/design

   The browser's way in to the designer. A full build no longer comes through
   here — that runs as a job on the server, which calls `designPageTree`
   directly — so what is left is the one page a merchant asks to regenerate.

   Failure is never an error status. The caller has a complete deterministic
   page in hand and keeps it; all this reports is whether there is something
   better to use.
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
      band: z.string().max(48),
      border: z.string().max(48),
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
  band: "",
  border: "",
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
      credits: { name: string; link: string }[];
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

  const outcome = await designPageTree({
    sell: body.sell,
    prompt: body.prompt,
    storeType: body.storeType,
    style: body.style,
    pageLabel: body.pageLabel,
    pageType: body.pageType,
    tokens: { ...FALLBACK_TOKENS, ...body.tokens },
  });

  return Response.json({ ok: true, ...outcome } satisfies AiDesignResponse);
}
