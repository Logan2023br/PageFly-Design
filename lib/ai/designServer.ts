import "server-only";

import { getProvider, isAiEnabled } from "./provider";
import { loadSkills } from "./skills";
import { DESIGN_SYSTEM } from "./designPrompt";
import { designTreeSchema, walk, type DesignTree } from "../design/schema";
import { resolvePhotos, stockProvider, urlsOf } from "../images/stock";

/* ==========================================================================
   One page, designed.

   Lives here rather than in the route because two callers need it and only one
   of them is an HTTP request: the route serves the browser (regenerating a
   single page), and the build runner calls it directly, in process, for every
   page of a build. Routing the runner's calls back through fetch would put a
   web server in the middle of a server talking to itself.

   Declines rather than throws. Every failure — no model, timeout, unparseable
   answer, a tree that fails validation, a tree too thin to be a page — comes
   back as `used: false` with a reason, and the caller keeps the deterministic
   page it already has. A model being down must cost polish, never the product.
   ========================================================================== */

export type DesignInput = {
  sell: string;
  prompt: string;
  storeType: string;
  style: string;
  pageLabel: string;
  pageType: string;
  tokens: {
    bg: string;
    ink: string;
    accent: string;
    fontHeading: string;
    fontBody: string;
    radius: number;
  };
};

export type DesignOutcome =
  | {
      used: true;
      tree: DesignTree;
      images: Record<string, string>;
      credits: { name: string; link: string }[];
      usage: { input: number; output: number };
    }
  | { used: false; reason: string; usage: { input: number; output: number } };

const NOTHING = { input: 0, output: 0 };

export async function designPageTree(
  input: DesignInput,
  signal?: AbortSignal,
): Promise<DesignOutcome> {
  if (!isAiEnabled()) return { used: false, reason: "no model configured", usage: NOTHING };

  const provider = getProvider();
  if (!provider) return { used: false, reason: "no model configured", usage: NOTHING };

  const skills = loadSkills("design");
  const system = skills ? `${DESIGN_SYSTEM}\n\n${skills}` : DESIGN_SYSTEM;

  const t = input.tokens;
  const user = [
    `Store sells: ${input.sell}`,
    input.storeType && `Store type: ${input.storeType}`,
    input.prompt && `Merchant's own words: ${input.prompt}`,
    ``,
    `Design this page: ${input.pageLabel || input.pageType}`,
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

  let completion: { text: string; usage: { input: number; output: number } };
  try {
    completion = await provider.complete({
      system,
      user,
      /* A full page tree runs 6-14k tokens. Cutting it short costs the whole
         page, since a truncated tree is not parseable JSON. */
      maxTokens: 16_000,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(240_000)])
        : AbortSignal.timeout(240_000),
    });
  } catch (err) {
    return { used: false, reason: (err as Error).message.slice(0, 200), usage: NOTHING };
  }

  const raw = parseObject(completion.text);
  if (!raw)
    return { used: false, reason: "model did not return JSON", usage: completion.usage };

  const parsed = designTreeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      used: false,
      reason: `tree rejected: ${first?.path.join(".")} ${first?.message}`.slice(0, 180),
      usage: completion.usage,
    };
  }

  const tree = parsed.data;
  const nodes = walk(tree);

  /* A model that returns one empty section satisfies the schema and would
     replace a working page with a blank one. */
  if (tree.sections.length < 2 || nodes.length < 12)
    return {
      used: false,
      reason: `tree too thin (${tree.sections.length} sections, ${nodes.length} nodes)`,
      usage: completion.usage,
    };

  const wants = nodes
    .filter((n): n is Extract<typeof n, { type: "image" }> => n.type === "image")
    .map((n) => ({ query: n.query, ratio: n.ratio }));

  const shots = nodes
    .filter((n): n is Extract<typeof n, { type: "product" }> => n.type === "product")
    .map((n) => ({ query: n.query, ratio: 1 }));

  const photos =
    stockProvider() === "none" ? {} : await resolvePhotos([...wants, ...shots], signal);

  /* One entry per photographer, not per photograph — a page using four
     pictures by the same person credits them once. */
  const byName = new Map<string, string>();
  for (const photo of Object.values(photos))
    if (photo.credit && !byName.has(photo.credit)) byName.set(photo.credit, photo.link);

  return {
    used: true,
    tree,
    images: urlsOf(photos),
    credits: [...byName].map(([name, link]) => ({ name, link })),
    usage: completion.usage,
  };
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
