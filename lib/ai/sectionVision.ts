import "server-only";

import { PAGEFLY_ELEMENTS } from "../pagefly/elements";

/* ==========================================================================
   Reading a section reference, once, when it is filed.

   `refVision.ts` reads a merchant's whole page at build time and answers "what
   sections does it have, in what order". This answers a different question about
   a single element: "what makes THIS one good, in enough detail to rebuild it".

   READ ONCE, NOT PER BUILD, and that is the whole reason this file exists
   separately. DeepSeek cannot see an image — both v4 models reject an
   `image_url` outright — so a screenshot is worth nothing to a page designer
   until something has turned it into text. Doing that at build time is a vision
   call and three to six seconds on every page, for a screenshot that has not
   changed since the last time it was read. Doing it when the operator saves is
   free for ever, and it lets them see what was understood before it reaches a
   merchant's page.

   THE OUTPUT IS SHAPED LIKE A PATTERN BLOCK, deliberately. `20-patterns.md`
   already describes sections in a form the designer acts on — indentation for
   nesting, real numbers — and the design call already receives blocks in that
   shape. A reading written any other way would be a second dialect for the same
   job.

   AND IT CLASSIFIES EVERY PART, which is the thing a plain description cannot
   do. `toPagefly.ts` follows three tiers — use the SETTING where the platform
   has one, write CSS for the look no setting reaches, and BUILD from primitives
   where there is no element at all — and a reading that does not say which tier
   a part belongs to leaves the page designer guessing at the one question that
   decides whether it can be built. A star rating has no PageFly element; a
   reading that only says "4.8 stars, 42 reviews" gets dropped, and the built
   page comes out simpler than the reference for no reason anyone can see.
   ========================================================================== */

const MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 90_000;

/** Screenshots read per entry. Past this the reading is a summary of summaries. */
const MAX_IMAGES = 8;

/**
 * The ceiling on what gets stored, in characters.
 *
 * 3,000 — about 830 tokens. It was 1,400, and 1,400 was wrong.
 *
 * The reasoning behind the smaller number was that a build pastes this into a
 * prompt, so its length is a cost paid on every page for ever. True, and it
 * priced the wrong risk: a reading too short to rebuild from is not cheaper, it
 * is WASTED. The model spends the tokens, reads "a clean two-column buy box
 * with generous spacing", and builds something else — so the page costs more and
 * looks different, which is the outcome the whole feature exists to prevent.
 *
 * At 830 tokens, two readings on a page are 1,660 input tokens against a first
 * call of about 8,000. Input is the cheap side and it is the side that buys
 * fidelity. What it does not buy is certainty about the OUTPUT: Phase 3 measured
 * that a more precise spec draws more reasoning, and that is the number to watch
 * after the first real builds rather than to guess at now.
 */
const MAX_ANALYSIS = 3000;

type ImagePart = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};

function toImagePart(dataUrl: string): ImagePart | null {
  const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

export function canAnalyseSections(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * The question, and it is deliberately about WHAT TO BUILD rather than about
 * whether the reference is nice.
 *
 * Asking "describe this section" returns adjectives — clean, premium, modern —
 * which a page designer cannot act on and would have guessed anyway. What it
 * cannot guess is that the buy column is 52% and the price sits at 40px in the
 * accent with a struck compareAt beside it at half that.
 */
function prompt(element: string): string {
  return [
    `These are reference screenshots of one PageFly element: ${element}.`,
    `Several examples an operator filed of how it should be built.`,
    ``,
    `Write ONE specification another model will build from. It cannot see these`,
    `images and will only ever have your words, so anything you leave out is a`,
    `decision it makes instead of you — and it will make a different one.`,
    ``,
    `MEASURE, DO NOT ADMIRE. "48% / 52%, gap 56" is usable; "balanced columns"`,
    `is not. Every line below wants numbers or names, not adjectives.`,
    ``,
    `Cover all of these. Say "not visible" for any you genuinely cannot read —`,
    `that is more useful than a guess:`,
    ``,
    `  STRUCTURE   the parts in order, top to bottom, indented for nesting.`,
    `              Column ratios, the gap between them, how many of anything`,
    `              repeated. Which parts sit in a row and which stack.`,
    `  SPACING     section padding, and the gap between each pair of rows.`,
    `              Give px. If it steps — 8 / 16 / 32 — say so.`,
    `  TYPE        per text role: size in px, weight, letter-spacing, case,`,
    `              line-height, and whether the face is grotesk, serif, mono or`,
    `              condensed. Name the roles: eyebrow, display, body, caption,`,
    `              label, price.`,
    `  COLOUR      the ground, the ink, and what carries the accent — and WHERE`,
    `              the accent is used, because one word in a headline and a solid`,
    `              button are different designs. Give opacity where text is`,
    `              muted (.5, .7).`,
    `  BORDER      width, colour, and radius, per part. A 0px radius and a 14px`,
    `              radius are two different products.`,
    `  BACKGROUND  flat colour, gradient (say the direction and both stops),`,
    `              photograph, or video. If text sits on an image, say how dark`,
    `              the scrim is.`,
    `  STATES      anything visibly interactive: hover, active thumbnail,`,
    `              selected swatch, disabled.`,
    ``,
    `THEN, AND THIS IS THE PART THAT DECIDES WHETHER IT CAN BE BUILT.`,
    `For each part, say which of three it is:`,
    ``,
    `  SETTING — PageFly has an element or a field for it. Name the field:`,
    `            "thumbnail strip: ProductMedia3 showList, position LEFT",`,
    `            "4 across: ContentList2 slidesToShow 4",`,
    `            "quantity stepper: ProductQuantity".`,
    `  STYLE   — the element exists and only its look differs. Say the CSS:`,
    `            "the dots are 7px, currentColor at .22, .75 when active".`,
    `  BUILD   — PageFly has NO element for it. Say so, and say what to build it`,
    `            from: a row of an icon and two text nodes, a flex column, a`,
    `            custom block. A star rating, a "12 people viewing" line and a`,
    `            SAVE 33% pill are all this case, and leaving them out because`,
    `            there is no element is how the built page ends up simpler than`,
    `            the reference.`,
    ``,
    `NEVER carry over the reference's words, its product, its industry or its`,
    `claims. A different store will be built from this: you are describing the`,
    `shape, the numbers and the treatment, never the content.`,
    ``,
    `Where the shots disagree, describe what they share and name the part that`,
    `varies.`,
    ``,
    `No preamble, no markdown headings, no summary. Under 450 words.`,
  ].join("\n");
}

export type SectionReading = {
  analysis: string;
  images: number;
  usage: { input: number; output: number };
};

/**
 * Read the screenshots of one section reference.
 *
 * Returns null rather than throwing on every failure — no key, no readable
 * image, a timeout, a refusal. A reference whose reading failed keeps its
 * screenshots and can be read again; what it must not do is stop the operator
 * saving their work.
 */
export async function readSection(
  element: string,
  images: string[],
  signal?: AbortSignal,
): Promise<SectionReading | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  /* An unknown name would produce a reading nothing can look up. */
  if (!(PAGEFLY_ELEMENTS as readonly string[]).includes(element)) return null;

  const parts = images
    .slice(0, MAX_IMAGES)
    .map(toImagePart)
    .filter((p): p is ImagePart => p !== null);
  if (parts.length === 0) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1600,
        messages: [
          { role: "user", content: [...parts, { type: "text", text: prompt(element) }] },
        ],
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    if (!res.ok) return null;

    const text = (body.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    if (!text) return null;

    return {
      analysis: text.slice(0, MAX_ANALYSIS),
      images: parts.length,
      usage: {
        input: body.usage?.input_tokens ?? 0,
        output: body.usage?.output_tokens ?? 0,
      },
    };
  } catch {
    return null;
  }
}
