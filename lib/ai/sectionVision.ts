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
   nesting, real numbers, a "fails when" line — and the design call already
   receives blocks in that shape. A reading written any other way would be a
   second dialect for the same job.
   ========================================================================== */

const MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 90_000;

/** Screenshots read per entry. Past this the reading is a summary of summaries. */
const MAX_IMAGES = 8;

/**
 * The ceiling on what gets stored, in characters.
 *
 * A build pastes this text into a prompt, so its length is a cost paid on every
 * page for ever. 1,400 characters is about 380 tokens: enough for the structure,
 * the numbers and the type treatment, and short enough that three of them
 * together are still smaller than one pattern file.
 *
 * Enforced on the way IN rather than trusted to the prompt's word limit. A model
 * that runs long is not a reason for a merchant's build to get slower.
 */
const MAX_ANALYSIS = 1400;

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
    `Several shots of the same kind of section, filed by an operator as examples`,
    `of how it should be built.`,
    ``,
    `Write ONE description another model will build from. It cannot see these`,
    `images and will only ever have your words.`,
    ``,
    `Format — indentation is nesting, exactly this shape:`,
    ``,
    `  <element> — <what makes this one work, one line>`,
    `  <structure, indented, with the real numbers>`,
    `  <type treatment: sizes, weight, letter-spacing, case>`,
    `  <what carries the colour, and where>`,
    `  *Fails when:* <the one mistake that breaks it>`,
    ``,
    `RULES.`,
    `Numbers, not adjectives. "48% / 52%, gap 56" — not "balanced columns".`,
    `Name the SETTINGS a PageFly element would carry: a thumbnail strip, a`,
    `column count, a badge corner, a scrim. Not the CSS to fake them.`,
    `Say what is REPEATED and how many: "5 thumbs", "3 trust lines".`,
    `Describe the shape and the treatment. NEVER carry over the reference's`,
    `words, its product, its industry or its claims — a different store will be`,
    `built from this.`,
    `Where the shots disagree, describe what they have in common and say which`,
    `part varies.`,
    ``,
    `No preamble. No markdown headings. Under 200 words.`,
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
        max_tokens: 700,
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
