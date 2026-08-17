import "server-only";

import { getProvider, isAiEnabled, providerName, type Completion } from "./provider";
import { loadSkills } from "./skills";
import { DESIGN_SYSTEM } from "./designPrompt";
import { designTreeSchema, walk, type DesignTree } from "../design/schema";
import { sectionPlanLine } from "../design/sectionPlan";
import { detectVertical } from "../generate/content";
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
  /** the style's id, kept for logging */
  style: string;
  /** the name the merchant actually picked, e.g. "Neubrutalist" */
  styleLabel: string;
  /** the one line printed under that card, e.g. "Hard edges, flat colour" */
  styleBlurb: string;
  /** the style's spacing pressure: airy | normal | tight */
  density: string;
  /** what the merchant's reference screenshots turned out to be, or null when
      they uploaded none */
  reference: {
    gridColumns: number | null;
    heroLayout: string | null;
    density: string | null;
    sectionCount: number | null;
    alternating: boolean;
    dark: boolean | null;
    present: boolean;
  } | null;
  /**
   * The merchant's reference screenshots as a model that can SEE them described
   * them — one line per section, in order. Null when they uploaded none, when
   * there is no Anthropic key, or when that call declined.
   *
   * Separate from `reference` above, which is signal processing on the same
   * images and cannot tell a testimonial from an FAQ. These are the sections by
   * name. See lib/ai/refVision.ts for why it is a different provider.
   */
  refSections: string[] | null;
  pageLabel: string;
  pageType: string;
  tokens: {
    bg: string;
    ink: string;
    accent: string;
    /** background of sections that step away from `bg` */
    band: string;
    /** card and section outlines */
    border: string;
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

const TIMEOUT_MS = 420_000;

/**
 * `rgba(197, 78, 27, 0.34)` as `#C54E1B57`.
 *
 * Models copy a hex string reliably and an rgba string with spaces in it much
 * less so — sent as rgba, the border colour came back unused in every section
 * of a test page while the two hex colours were applied six and four times.
 * Eight-digit hex keeps the alpha, which is the point: a solid border on every
 * card shouts, and the alpha is what stops it.
 */
function asHex(value: string): string {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(value);
  if (!m) return value;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const a = m[4] === undefined ? 1 : Number(m[4]);
  const alpha = a >= 1 ? "" : hex(Math.round(a * 255));
  return `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}${alpha}`.toUpperCase();
}

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
    /* The style has a NAME, and it was being withheld. The model received the
       colours a style resolves to and never the word "Neubrutalist" — so it
       had the palette of a hard-edged brutalist page and no reason to make one.
       The name and its one-line description carry more design intent than five
       hex codes do. */
    `Visual style: ${input.styleLabel}${input.styleBlurb ? ` — ${input.styleBlurb}` : ""}`,
    `Spacing pressure: ${input.density} (airy = generous padding, tight = dense)`,
    ``,
    `Design this page: ${input.pageLabel || input.pageType}`,
    /* Resolved here rather than sent as a table. The rulebook's thirty-five page
       types are about seven hundred tokens to tell the model thirty-four things
       that do not apply to the page in front of it, and the page type is known
       before the call goes out. */
    sectionPlanLine(
      input.pageType,
      detectVertical(input.sell),
      Boolean(input.refSections?.length),
    ),
    ``,
    `Palette and faces — work inside these, do not introduce others.`,
    `Each colour has a job. Use it for that job.`,
    ``,
    `  background  ${t.bg}`,
    `  text        ${t.ink}`,
    `  accent      ${t.accent}   buttons, prices, badges, the one highlighted thing in a section`,
    t.band && `  band        ${asHex(t.band)}   background of sections that step away from the page background`,
    /* Stated as an instruction, not an offer. The system prompt tells the
       model to prefer whitespace over borders, which is right in general and
       wrong here: a border colour only reaches this line because the merchant
       filled a slot labelled Borders. Without this the colour was handed over
       and used zero times in a seventy-five node page. */
    t.border &&
      `  border      ${asHex(t.border)}   card and section outlines, dividers. The merchant chose this colour, so cards and bands DO carry a visible 1px outline in it — this overrides the general preference for whitespace over borders.`,
    t.fontHeading && `  heading font-family: ${t.fontHeading}`,
    t.fontBody && `  body font-family: ${t.fontBody}`,
    `  corner radius ${t.radius}px`,
    ``,
    /* The merchant uploaded pages they liked and we measured them. Those
       measurements used to stop at the server and only reach the deterministic
       generator — so the whole Reference images step changed nothing about the
       page the model designed. */
    ...referenceLines(input.reference, input.refSections),
    `Return the JSON object now.`,
  ]
    .filter(Boolean)
    .join("\n");

  let completion: Completion;
  try {
    completion = await provider.complete({
      system,
      user,
      /* Measured, per provider, and not interchangeable. A truncated tree is
         not parseable JSON, so running out of budget costs the whole page.

         Haiku finishes a page in about 8,600 output tokens. DeepSeek v4-flash
         is a reasoning model whose billed output includes its own thinking —
         14k to 22k for the same page — so at 16,000 it hit the ceiling and
         returned truncated JSON on every attempt. Three runs, three failures,
         and the failure looks like the model being incapable rather than the
         budget being wrong.

         32,000 then held until the prompt grew. Adding the selling-page skill
         and a sixteen-line reading of the merchant's reference took one page to
         exactly 32,000 output tokens — of which about 26,000 were reasoning and
         6,000 were the JSON, cut off mid-property. More to think about means
         more thinking, and the thinking is billed against the same ceiling as
         the answer.

         64,000 is headroom rather than a new estimate: nothing has needed more
         than about 38,000, and the API accepts far more than this. */
      maxTokens: providerName() === "deepseek" ? 64_000 : 16_000,
      /* A DeepSeek page measured 100-172 seconds against Haiku's 45, so the
         old 240s ceiling left almost no headroom on a slow one. */
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { used: false, reason: (err as Error).message.slice(0, 200), usage: NOTHING };
  }

  const raw = parseObject(completion.text);
  if (!raw)
    return {
      used: false,
      /* Two different failures wore one message. `json_object` mode is on, so a
         model that answers at all answers in JSON — an unparseable reply is
         almost always a reply that stopped mid-object because the budget ran
         out, and "did not return JSON" sends the next person to read the prompt
         instead of the ceiling. */
      reason: completion.truncated
        ? `ran out of output budget at ${completion.usage.output} tokens — the tree was cut off mid-JSON`
        : "model did not return JSON",
      usage: completion.usage,
    };

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

/**
 * What the merchant's reference screenshots were measured to be.
 *
 * Stated as things that ARE true of the references rather than as orders, and
 * the model is told they are a preference rather than a spec — a reference is a
 * page the merchant liked, not a page they are asking to have copied.
 */
function referenceLines(
  ref: DesignInput["reference"],
  seen: string[] | null,
): string[] {
  /* The read beats the measurement wherever both exist, and replaces it rather
     than joining it: "grids run 3 columns" adds nothing next to a list that
     already says which sections are 3-up, and two descriptions of one image
     invite the model to reconcile them instead of building. */
  if (seen && seen.length > 0) {
    return [
      `The merchant uploaded pages they want theirs to resemble. Read top to bottom, those pages are:`,
      ...seen.map((s) => `  ${s}`),
      ``,
      /* Stated as structure-not-content because the reference is almost always
         another shop selling something else — the merchant is pointing at its
         shape, and a page that borrowed its subject would be worse than one
         that ignored it entirely. */
      `Follow that ORDER and that STRUCTURE: which sections appear, in what`,
      `sequence, how many columns each runs, which ones are dark. Write your own`,
      `words for this merchant's product — never carry over the reference's`,
      `wording, its industry or its claims.`,
      `Where a section in that list has no element in your vocabulary, build the`,
      `nearest honest thing and move on.`,
      ``,
    ];
  }

  if (!ref?.present) return [];

  const facts = [
    ref.heroLayout && `the hero is ${ref.heroLayout}`,
    ref.gridColumns && `grids run ${ref.gridColumns} columns`,
    ref.density && `the spacing is ${ref.density}`,
    ref.sectionCount && `the page has about ${ref.sectionCount} sections`,
    ref.alternating && "sections alternate light and dark",
    ref.dark === true && "the design is dark",
    ref.dark === false && "the design is light",
  ].filter(Boolean);

  if (facts.length === 0) return [];

  return [
    `The merchant uploaded pages they like. Measured, those pages are: ${facts.join(", ")}.`,
    `Follow them where they do not fight the brief or the rules above. They are a preference, not a specification.`,
    ``,
  ];
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
