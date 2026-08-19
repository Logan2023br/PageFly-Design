import "server-only";

import type { Brief } from "../validation";

/* ==========================================================================
   Reading the merchant's reference screenshots.

   `lib/refLayout.ts` measures those screenshots with signal processing and is
   honest about the ceiling: it can see band rhythm, lightness and column
   counts, and it cannot tell a testimonial from an FAQ. So a merchant who
   uploads a page with six review cards, a trust row and a contact form hands us
   all of that and the designer receives six numbers.

   This closes the gap by asking a model that can actually see. It is a separate
   call to a separate provider on purpose:

   - DeepSeek cannot take an image at all. Both v4-flash and v4-pro reject an
     `image_url` content part outright, so the page designer is not the thing
     that can read a screenshot no matter how the prompt is written.
   - It runs ONCE PER BUILD rather than once per page. A four-page deck reads
     the references one time and every page gets the same reading, which is also
     what makes four pages of one build look like one site.
   - Measured on a real merchant reference: 638 input tokens, 208 output, about
     $0.002. The cost of the build itself does not move.

   Declines rather than throws. No Anthropic key, no images, a timeout, a
   refusal — all come back as null and the caller keeps the measured hints it
   already had. Reading the reference better must never be able to stop a build.
   ========================================================================== */

/** What one reference screenshot turned out to contain, top to bottom. */
/**
 * What a reference page LOOKS like, as eight fields.
 *
 * The section list says which sections a page has and in what order. It does
 * not say why the page looks the way it does — and "the output does not
 * resemble the page I uploaded" is a complaint about the look, not the running
 * order. Eight fields, about eighty tokens, from the same Haiku call.
 */
export type RefStyle = {
  heroKind: "full-bleed-overlay" | "split" | "centered" | "product-lead" | "type-only" | null;
  displayScale: string | null;
  fontMood: string | null;
  accentUse: string | null;
  imageMood: string | null;
  surface: string | null;
  density: string | null;
  corner: string | null;
};

export type RefReading = {
  /** one line per section, in document order */
  sections: string[];
  /** how the reference looks, or null when the model did not answer in shape */
  style: RefStyle | null;
  /** how many images were actually read */
  images: number;
  usage: { input: number; output: number };
};

const MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 60_000;

/* Pictures sent to the model, across every upload. One tall screenshot is up to
   four slices, so six uploads could be twenty-four — each about 600 tokens and
   a moment of latency on a build the merchant is waiting on.

   Twelve is the budget. It is spent EVENLY rather than first-come: taking the
   first twelve in order meant six uploads were read as three, and the merchant
   who uploaded a reference for their FAQ page never found out it was ignored. */
const SLICE_BUDGET = 16;

/**
 * Which slices get sent, when there are more than the budget allows.
 *
 * ROUND-ROBIN, not an equal division, and the difference is a silent one.
 * Dividing equally gives every upload `floor(budget / uploads)` — fair when the
 * uploads are the same length and wasteful the moment they are not. One tall
 * screenshot beside three short ones used to get 3 slices of its 6 while the
 * short ones took 1 each: nine slices' worth of budget spent on six, and half of
 * the tall page never read. Nobody was told.
 *
 * Handing out one slice at a time, in passes, keeps the guarantee that mattered —
 * no upload is dropped entirely, because everyone is served in pass one — and
 * spends what is left on the uploads that actually have more to show.
 */
function allocate(uploads: string[][], budget: number): string[] {
  const taken = uploads.map(() => 0);
  let total = 0;

  for (let pass = 0; total < budget; pass++) {
    let gave = 0;
    for (let i = 0; i < uploads.length && total < budget; i++) {
      if (taken[i] > pass) continue;
      if (taken[i] >= uploads[i].length) continue;
      taken[i]++;
      total++;
      gave++;
    }
    if (gave === 0) break;
  }

  /* Flattened in upload order, and within an upload in slice order, because the
     model is told these are one page read top to bottom. */
  return uploads.flatMap((parts, i) => parts.slice(0, taken[i]));
}

/**
 * The question. Deliberately about STRUCTURE, not beauty.
 *
 * Asking "describe this page" returns adjectives — elegant, modern, clean —
 * which the designer cannot act on and which it would have guessed anyway. What
 * it cannot guess is that the reference gives a fifth of its height to reviews
 * and puts them on black.
 */
const PROMPT = [
  "These are screenshots of e-commerce pages a merchant wants their own page to resemble.",
  "",
  /* Both ways of handing over one page have to work, because merchants do both:
     some upload a full-page capture, which we cut into slices ourselves, and some
     scroll and screenshot seven times. The images arrive identically either way —
     in order, top to bottom — so the instruction covers both rather than trying
     to tell them apart. It is stated at the top because getting it wrong doubles
     the section list, and a doubled list is a page built twice. */
  "THEY MAY BE ONE PAGE OR SEVERAL. Read the images in the order given. Where one",
  "image continues the previous one — same width, same background, the content",
  "picking up where it left off — they are consecutive parts of a SINGLE page:",
  "read them as one continuous page and list each section ONCE. A section cut",
  "across two images is still one section, and a heading repeated at the top of",
  "the next image is still one heading. Only start a new page's sections when an",
  "image plainly begins a different page — its own announcement bar or header.",
  "",
  "List every section, top to bottom, one line each, in this exact format:",
  "  <what it is> | <columns> | <light|dark> | <share of page height>",
  "",
  "For <what it is> use the plainest name: announcement bar, header, hero,",
  "trust row, buy box, product grid, stats, reviews, FAQ, contact form,",
  "carousel, newsletter, footer, or a short phrase if none of those fit.",
  "",
  "Then one final line starting with NOTES: anything a designer would need that",
  "the list above does not carry — a struck-through price, star ratings, a",
  "countdown, badges, how many cards a repeating grid holds.",
  "",
  "",
  /* Asked for last and as JSON, so it is trivially separable from the lines
     above — a style block written as prose would have to be parsed out of a
     list that is also prose. */
  "Finally, on ONE line, a JSON object describing how the page LOOKS:",
  'STYLE: {"heroKind":"full-bleed-overlay|split|centered|product-lead|type-only",',
  '        "displayScale":"very-large|large|medium",',
  '        "fontMood":"grotesk|serif-display|mono|rounded",',
  '        "accentUse":"one-word-in-headline|buttons-only|widespread",',
  '        "imageMood":"lifestyle|studio-white|macro|documentary",',
  '        "surface":"light|dark|alternating",',
  '        "density":"airy|normal|tight",',
  '        "corner":"square|soft|pill"}',
  "",
  "No preamble, no summary, no markdown headings. Lines only.",
].join("\n");

/**
 * The STYLE line, if the model wrote one in shape.
 *
 * Returns null rather than a half-filled object when it did not: a caller that
 * gets `heroKind: null` inside a real object cannot tell "the model said
 * nothing" from "the model said none of these", and those want different
 * behaviour — the first should fall back to the resolver, the second is data.
 */
function parseStyle(text: string): RefStyle | null {
  const line = /STYLE:\s*(\{[\s\S]*?\})/.exec(text);
  if (!line) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line[1]) as Record<string, unknown>;
  } catch {
    return null;
  }

  const pick = (key: string, allowed: string[]): string | null => {
    const v = String(raw[key] ?? "").trim().toLowerCase();
    return allowed.includes(v) ? v : null;
  };

  const style: RefStyle = {
    heroKind: pick("heroKind", [
      "full-bleed-overlay",
      "split",
      "centered",
      "product-lead",
      "type-only",
    ]) as RefStyle["heroKind"],
    displayScale: pick("displayScale", ["very-large", "large", "medium"]),
    fontMood: pick("fontMood", ["grotesk", "serif-display", "mono", "rounded"]),
    accentUse: pick("accentUse", ["one-word-in-headline", "buttons-only", "widespread"]),
    imageMood: pick("imageMood", ["lifestyle", "studio-white", "macro", "documentary"]),
    surface: pick("surface", ["light", "dark", "alternating"]),
    density: pick("density", ["airy", "normal", "tight"]),
    corner: pick("corner", ["square", "soft", "pill"]),
  };

  /* All eight unreadable means the model answered in some other shape. */
  return Object.values(style).some((v) => v !== null) ? style : null;
}

type ImagePart = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};

/** `data:image/png;base64,AAA...` split into what the API wants. */
function toImagePart(dataUrl: string): ImagePart | null {
  const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim(),
  );
  if (!m) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

export function canReadReferences(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function readReferences(
  brief: Brief,
  signal?: AbortSignal,
): Promise<RefReading | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  /* `slices` first, `dataUrl` only as a fallback. The thumbnail is capped on its
     long edge, so a tall page arrives too narrow to read — measured on a real
     reference, the same image full-size named sixteen sections and quoted the
     page's own headings, while the thumbnail missed the FAQ, called a light band
     dark and guessed a section from its shape. Slices keep the width.

     An upload from before this existed has no slices, and the thumbnail is a
     poor read rather than no read. */
  const uploads = (brief.referenceImages ?? [])
    .map((r) => (r.slices?.length ? r.slices : r.dataUrl ? [r.dataUrl] : []))
    .filter((parts) => parts.length > 0);

  const images = allocate(uploads, SLICE_BUDGET)
    .map(toImagePart)
    .filter((p): p is ImagePart => p !== null);

  if (images.length === 0) return null;

  let text: string;
  let usage = { input: 0, output: 0 };
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
        max_tokens: 1200,
        messages: [{ role: "user", content: [...images, { type: "text", text: PROMPT }] }],
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
      error?: { message: string };
    };
    if (body.error) return null;

    text = (body.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    usage = {
      input: body.usage?.input_tokens ?? 0,
      output: body.usage?.output_tokens ?? 0,
    };
  } catch {
    return null;
  }

  /* Kept as the model's own lines rather than parsed into fields. The designer
     reads prose, and a parser here would be a second place for the format to
     drift — the model was asked for `a | b | c | d` and if it answers in
     sentences those sentences are still useful. Only the shape is enforced:
     something with content, short enough to be a line. */
  const style = parseStyle(text);

  const sections = text
    .split("\n")
    /* The STYLE line is not a section. Without this it would arrive in the
       prompt twice — once as data and once as a band the page must build. */
    .filter((l) => !/^\s*STYLE:/.test(l))
    
    .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
    .filter((l) => l.length > 3 && l.length < 200)
    .filter((l) => !/^#{1,6}\s/.test(l))
    .slice(0, 40);

  if (sections.length === 0) return null;

  return { sections, style, images: images.length, usage };
}
