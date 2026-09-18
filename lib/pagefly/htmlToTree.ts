import "server-only";

import { designTreeSchema, type DesignTree } from "../design/schema";
import { pageflyFromTree } from "../design/toPagefly";
import { loadSkills } from "../ai/skills";
import { getProvider } from "../ai/provider";
import { splitSections } from "./fromHtmlSkill";

/* ==========================================================================
   HTML → design tree → .pagefly, on the live path's own rails.

   THREE WAYS TO GET FROM AN HTML MOCKUP TO A FILE, and this is the third.

     measure   `fromHtml.ts` lays the document out and copies what the browser
               computed. Exact about pixels, ignorant about PageFly: everything
               becomes a FlexBlock because a DOM walk cannot tell a buy box from
               a div.
     skill     `fromHtmlSkill.ts` hands the `pagefly-builder` reference to the
               model and takes back PageFly JSON. It picks real elements — a
               Table2, a Tabs3, a MailChimpBox — and it has to be repaired
               afterwards, because a model writing that JSON gets the required
               slots wrong in the same four places every time.
     live      this file. The model writes the LIVE VOCABULARY — the 24 node
               types of `lib/design/schema.ts` — and `toPagefly.ts` turns that
               into PageFly.

   WHY THE THIRD IS WORTH HAVING. `toPagefly.ts` and `builder.ts` are 4,400
   lines of PageFly knowledge bought one import bug at a time: Tabs3's five
   slots, `TabsContent3.name = "TAB_CONTENT"`, the Icon2 that is always there,
   the min-width floor that stops a line breaking per character, classes on
   `classGlobalStyling` rather than `className`. Asking a model to write PageFly
   JSON throws all of that away and then re-learns it in a repair pass. Asking
   it for a design tree keeps every line of it — and the tree is a vocabulary of
   24 words, which is a far smaller thing to get right than 99 element types
   with their fields.

   So the model does what only a model can do — look at a page and say what each
   part IS — and the deterministic exporter does the rest.

   THE INPUT IS A PAGE, NOT A BRIEF. This is transcription, not design: the
   layout, the copy, the colours and the spacing are all decided and present in
   the markup. The skills still go in the prompt because they define the
   vocabulary, but the instruction below is explicit that nothing is to be
   invented.
   ========================================================================== */

const ASK = [
  "TRANSCRIBE, DO NOT DESIGN.",
  "",
  "The page below is finished. Every layout decision, every word, every colour",
  "and every measurement is already in it. Your job is to say what each part IS",
  "in the node vocabulary above, and to carry its CSS across unchanged.",
  "",
  "Return ONE JSON object and nothing else:",
  "",
  '  { "section": { "type": "section", … } }',
  "",
  "· One `section` node, shaped exactly as the vocabulary defines it.",
  "· `css` and `mobile` hold the declarations the markup already states. Read",
  "  them off the stylesheet; do not re-decide any of them.",
  "· Copy is copied. Not rewritten, not improved, not shortened.",
  "· Where a run of markup is really a PageFly element — a table, a tab bar, an",
  "  accordion, a form, a slideshow, a countdown — use that node type. That",
  "  choice is the whole reason you are reading this and not a DOM walker.",
  "",
  "· `::before` AND `::after` ARE NOT NODES. A band whose photograph lives in",
  "  `.hero::before{background:#12100C url(…) center/cover}` has no element",
  "  carrying that image, and there is nowhere in this vocabulary to put a",
  "  pseudo-element. Hoist it: the image and any gradient over it belong in the",
  "  band's own `css.backgroundImage`, which takes both in one declaration —",
  "  `linear-gradient(…), url(…)`, gradient first. Read every `::before` and",
  "  `::after` rule in the stylesheet and place what it paints on the node it",
  "  painted for. A page that loses this loses its photographs.",
  "",
  "· A row is a `row` and a column is a `col`. `display:flex` with",
  "  `flex-direction:row` is a `row` node however the markup nests it — a header",
  "  whose logo, navigation and icons sit side by side is one `row` of three",
  "  children, not three stacked blocks.",
  "",
  "· A ROW OF DIFFERENT THINGS GIVES ITS CHILDREN A `basis`. Three or more",
  "  children of one type and no stated widths reads as a grid of repeating",
  "  cards, and the exporter turns it into one — a card grid stacks, which is",
  "  right for four product tiles and wrong for a header. A logo, a menu and a",
  "  set of icons are three different things that happen to sit in a row: give",
  "  each the width the stylesheet gives it (`basis: \"auto\"` where it hugs its",
  "  content) and it stays a row.",
].join("\n");

function firstObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(body.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Everything in `<head>`: the model reads declared values off the stylesheet. */
function headOf(html: string): string {
  return /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1]?.trim() ?? "";
}

export type LiveBuild = {
  blob: Blob;
  filename: string;
  sections: number;
  built: number;
  usage: { input: number; output: number };
  failures: { index: number; reason: string }[];
};

/**
 * Transcribe a document into the live design tree, then export it.
 *
 * One call per band, in parallel. The skills are the same 33 KB on every call,
 * so the vendor's prompt cache is warm from the first one onward — and it is
 * the same prefix the live design stage sends, which is what makes this path
 * "the live rules" rather than a second set that has to be kept in step.
 */
export async function pageflyFromHtmlLive(
  html: string,
  name: string,
  tokens: { bg: string; ink: string; fontBody: string; accent?: string; border?: string; radius?: number; band?: string },
  signal?: AbortSignal,
): Promise<LiveBuild> {
  const provider = getProvider();
  if (!provider) throw new Error("no model configured");

  const skills = loadSkills("design");
  const system = skills
    ? `${skills}\n\n---\n\n${ASK}`
    : ASK;

  const head = headOf(html);
  const bands = splitSections(html);

  const usage = { input: 0, output: 0 };
  const failures: { index: number; reason: string }[] = [];

  const results = await Promise.all(
    bands.map(async (band, index) => {
      const user = [
        `Band ${index + 1} of ${bands.length} of one finished page.`,
        "",
        "THE PAGE'S STYLESHEET — every class the markup uses is defined here:",
        "",
        head,
        "",
        "THE BAND:",
        "",
        band,
      ].join("\n");

      try {
        const answer = await provider.complete({
          system,
          user,
          /* The same ceiling the live design stage uses, for the same reason:
             DeepSeek bills its own reasoning against it, and a band that needs
             20,000 is billed 20,000 whatever number sits above it. */
          maxTokens: 96_000,
          signal,
        });
        usage.input += answer.usage.input;
        usage.output += answer.usage.output;

        const parsed = firstObject(answer.text) as { section?: unknown } | null;
        const raw = parsed?.section ?? parsed;

        /* Validated through the LIVE schema, which coerces rather than rejects —
           a malformed value costs itself and nothing else. A band that survives
           here is one `toPagefly.ts` is already known to handle. */
        const checked = designTreeSchema.safeParse({ motionPlan: "", sections: [raw] });
        if (!checked.success) {
          failures.push({
            index,
            reason: answer.truncated
              ? `ran out of output budget at ${answer.usage.output} tokens`
              : `not a section: ${checked.error.issues[0]?.message ?? "unknown"}`,
          });
          return null;
        }
        return checked.data.sections[0];
      } catch (err) {
        failures.push({ index, reason: (err as Error).message.slice(0, 160) });
        return null;
      }
    }),
  );

  const sections = results.filter((s): s is DesignTree["sections"][number] => s !== null);
  if (sections.length === 0)
    throw new Error(
      `no band transcribed — ${failures[0]?.reason ?? "the model returned nothing usable"}`,
    );

  const tree: DesignTree = { motionPlan: "", sections };

  const built = pageflyFromTree(
    tree,
    { name, bg: tokens.bg, ink: tokens.ink, fontBody: tokens.fontBody },
    1440,
    {
      images: {},
      videos: {},
      accent: tokens.accent,
      border: tokens.border,
      radius: tokens.radius,
      band: tokens.band,
    },
  );

  return {
    blob: built.blob,
    filename: built.filename,
    sections: bands.length,
    built: sections.length,
    usage,
    failures,
  };
}
