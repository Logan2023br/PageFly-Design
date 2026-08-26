import "server-only";

import { parseObject } from "../ai/json";
import { getProvider, isAiEnabled, modelName, type Usage } from "../ai/provider";
import { sliceSkill } from "../ai/skills";
import type { Order, SectionSpec } from "./plan";
import { vetSpec } from "./specCheck";

/* ==========================================================================
   STAGE 2b — THE ELEMENTS INSIDE EACH BAND.

   Stage 2a decides which bands a page has and stops. Everything inside a band
   then comes from a static skeleton in `20-patterns.md` and from whatever the
   build model settles on while writing. Measured on a real two-page build,
   that is 93% of the output tokens being spent by the model nobody asked to
   design anything — and it is why two stores in one trade come out with the
   same page wearing different words.

   WHY THIS IS PER PAGE WHEN STAGE 2a IS PER DECK.

   Stage 2a exists to make two page types differ, which needs both of them in
   one answer; it is cheap enough to keep whole. Once its bands are fixed there
   is nothing left that needs to see across pages, and this is the expensive
   half. Per page, cost grows with the deck instead of racing the output
   ceiling, the pages run concurrently, and a failure costs one page rather
   than the build.

   WHAT IT IS NOT ASKED FOR.

   Copy and photographs. This call writes blind — it has not seen a word of the
   page — so a font size decided here is a guess, and a headline of fourteen
   words under a size chosen for four is a new way for a page to break. Layout
   has no such problem, so layout is numbers and type is intent.
   ========================================================================== */

export function sectionSpecEnabled(): boolean {
  return process.env.USE_SECTION_SPEC === "true";
}

/**
 * Room for one page's elements plus the reasoning that produced them.
 *
 * A built section serialises to about 800 tokens WITH its copy and CSS; a spec
 * carrying neither is nearer 350, and a page is nine to eleven of them. The
 * rest is thinking, billed against the same ceiling — which is the arithmetic
 * that made a flat ceiling wrong for stage 2a and is worth respecting here.
 */
const MAX_TOKENS = 24_000;

const TIMEOUT_MS = 180_000;

export type SpecAsk = {
  pageType: string;
  /** the band plan stage 2a produced for this page */
  order: Order;
  sell: string;
  storeType: string;
  /** who the page is being sold to, or null when the merchant did not say */
  market: string | null;
  styleLabel: string;
  styleBlurb: string;
  /** the merchant's own words, verbatim */
  prompt: string;
  tokens: { bg: string; ink: string; accent: string; band: string };
};

export type SpecOutcome = {
  /** band index → its spec, only where one survived checking */
  specs: Map<number, SectionSpec>;
  usage: Usage;
  /** null when the call ran and produced something usable */
  reason: string | null;
  model: string | null;
  /**
   * Answers that did not survive `vetSpec`.
   *
   * The number that separates "the model is fine" from "the prompt is wrong".
   * Anything above zero means element or motion names outside the closed sets
   * are being emitted, and the fix is the wording here rather than the checker.
   */
  dropped: number;
};

const NOTHING: Usage = { input: 0, output: 0 };

function empty(reason: string): SpecOutcome {
  return { specs: new Map(), usage: NOTHING, reason, model: null, dropped: 0 };
}

/* ---- the prompt ---------------------------------------------------------- */

function systemPrompt(ask: SpecAsk): string {
  return [
    `You decide what is INSIDE each band of one page.`,
    ``,
    `The bands are already chosen and their order is fixed. Your job is their`,
    `contents: which elements sit in each band, how they nest, how the space`,
    `divides between them, and what each one does on hover and on scroll.`,
    ``,
    `YOU DO NOT WRITE COPY AND YOU DO NOT CHOOSE PHOTOGRAPHS. You have seen`,
    `neither. Say a heading is oversized; someone who knows how long the words`,
    `are will turn that into a size.`,
    ``,
    `THE ELEMENTS. Use these and no others — an invented one is dropped and the`,
    `band loses it.`,
    `  text and marks   heading, text, button, icon, divider`,
    `  media            image, slideshow, marquee, overlay, beforeAfter`,
    `  commerce         product, productList, form`,
    `  behaviour        accordion, table, counter, sticky, custom`,
    `  layout           row, col`,
    ``,
    `Do NOT emit a "section" — the band already is one. Your top-level nodes go`,
    `directly inside it. (A "section" wrapper is unwrapped rather than refused,`,
    `but it wastes a level and the padding on it is ignored.)`,
    ``,
    `NOTE — put one on any element whose purpose is not obvious from its type.`,
    `One phrase, saying what it carries on THIS store: "numeric rating out of 5`,
    `with the review count as a real figure" beats an unlabelled text node. This`,
    `is the field that makes a spec a design rather than a wireframe.`,
    ``,
    `For a "product", its rows go in "extras" rather than "children" — the buy`,
    `box's own slots are fixed and only those rows are yours.`,
    ``,
    `SCALE — for elements that carry words. One of:`,
    `  oversized  the one thing read from across the room`,
    `  large      a section head`,
    `  body       running text`,
    `  caption    under a photograph, beside a number`,
    `  eyebrow    the small line above a head`,
    ``,
    `MOTION — per element, every field optional.`,
    `  hover   float, shadow, grow, glow, float-shadow, grow-shadow`,
    `  reveal  fade, fade-up, slide-left, slide-right, zoom`,
    `  delay   0 to 6, for staggering siblings`,
    ``,
    `LAYOUT — "basis" is a percentage string on a row's children ("44%"), "gap"`,
    `is pixels between children, "ratio" is an image's height divided by its`,
    `width (0.82 is landscape, 1.32 is portrait).`,
    ``,
    /* The whole point of "review the skeleton" being real rather than
       rhetorical. Sliced to the patterns this page actually uses — nine to
       eleven blocks, not all forty-one. */
    `THE SKELETONS. Each band's pattern already has a shape, below. Treat it as`,
    `the starting point, not the answer: keep what serves this store, change or`,
    `add what the band's brief needs. A band whose brief describes six frames`,
    `and whose skeleton says three should end up with six.`,
    ``,
    sliceSkill("patterns", ask.order.patternIds),
    ``,
    /* The band a merchant judges the build by, and the one whose contents are
       most often padding. The colours are not mentioned because they are not
       the model's to set — the exporter emits the cart button from the store's
       palette, so a spec that argued about them would be arguing with code. */
    `THE BUY BOX. Where a band holds a "product", YOU ARRANGE THE WHOLE COLUMN.`,
    `There is no fixed order and no template — this is the section a merchant`,
    `judges the page by, and a stack of grey one-liners is what a template`,
    `looks like.`,
    ``,
    `Seven parts are bound to the real product and cannot be drawn: title,`,
    `price, swatches, qty, stock, atc, express. Place each with`,
    `{"el":"bound","slot":"atc"} wherever it belongs. Everything between them`,
    `is an ordinary tree of your own — up to 16 blocks, nesting free.`,
    ``,
    `Arrange it for how THIS product is decided. A subscription serum, a €400`,
    `device and a €12 refill do not get the same column: one wants the offer`,
    `picker above the cart button because choosing the bundle IS the decision,`,
    `one wants proof first because the objection is trust, one wants the spec`,
    `accordion high because the buyer is comparing. Decide, per store.`,
    ``,
    `Reach for whichever of these THIS product's decision needs, and leave the`,
    `rest out — a refill and a device are not deciding the same thing:`,
    `  a benefit grid, two or three across, icon plus two words each`,
    `  an offer picker — bottle / three / subscribe, one marked most popular`,
    `  a delivery promise with a real date, not "fast shipping"`,
    `  a rating carrying its number and its count`,
    `  a guarantee naming its window`,
    `  an accordion for the full spec, so detail costs no scroll`,
    ``,
    `When no element fits, say "custom" and describe what it does in the note —`,
    `a card picker that responds to a click, an unlock meter, a segmented`,
    `toggle. The builder writes real markup, style and script for it.`,
    ``,
    `Always wrong: empty stars labelled "verified reviews", a strip of bare`,
    `icons with no words, and any row that would read the same on a phone case`,
    `as on a face serum.`,
    ``,
    ...(ask.market
      ? [
          `THE MARKET. What a shopper here looks for before they buy. It belongs`,
          `INSIDE the bands — a payment row, a delivery promise, a returns line`,
          `— and it does not change how anything looks.`,
          ``,
          sliceSkill("markets", [ask.market]),
          ``,
        ]
      : []),
    `RULES.`,
    `1. Every band gets a spec. A band you skip is a band built by guesswork.`,
    `2. Vary between bands. Two bands with the same element list is the failure`,
    `   this step exists to prevent.`,
    `3. Motion is punctuation. A page where everything moves reads as a page`,
    `   where nothing does — leave most elements still.`,
    `4. Mark a node "optional": true when it would be good but the band works`,
    `   without it. Everything else is required and will be checked for.`,
    ``,
    `ANSWER SHAPE. One object, keyed by the band numbers below, no prose:`,
    `{"bands":{"1":{"nodes":[{"el":"row","gap":72,"children":[`,
    `{"el":"col","basis":"44%","children":[`,
    `{"el":"heading","scale":"oversized","anim":{"reveal":"fade-up"}},`,
    `{"el":"button","anim":{"hover":"float-shadow","reveal":"fade-up","delay":1}}]},`,
    `{"el":"image","basis":"56%","ratio":0.82,"anim":{"hover":"grow"}}]}]}}}`,
  ].join("\n");
}

function userPrompt(ask: SpecAsk): string {
  const lines: string[] = [
    `STORE. ${ask.sell} · ${ask.storeType} · ${ask.styleLabel} — ${ask.styleBlurb}`,
  ];
  if (ask.prompt) lines.push(`THE MERCHANT'S OWN WORDS. ${ask.prompt}`);
  lines.push(
    `PALETTE. background ${ask.tokens.bg} · ink ${ask.tokens.ink} · ` +
      `accent ${ask.tokens.accent} · band ${ask.tokens.band}`,
    ``,
    `THE PAGE. ${ask.pageType} — ${ask.order.sections.length} bands.`,
    ``,
  );

  for (const [i, s] of ask.order.sections.entries()) {
    lines.push(
      [
        `${i + 1} · ${s.role} · ${s.pattern}`,
        s.signature ? "SIGNATURE — the most room on the page" : "",
        s.dark ? "inverted" : "",
        s.brief ? `→ ${s.brief}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  lines.push(``, `Return the JSON object now.`);
  return lines.join("\n");
}

/**
 * Both prompts, without calling anything.
 *
 * Same reason `deckPlan.__promptsForTest` exists: the prompt is the part of
 * this pipeline most often wrong, and every prompt bug on this branch was found
 * by reading the question rather than the answer. Reading it costs nothing.
 */
export function __specPromptsForTest(ask: SpecAsk): { system: string; user: string } {
  return { system: systemPrompt(ask), user: userPrompt(ask) };
}

/* ---- the call ------------------------------------------------------------ */

export async function planSpecs(ask: SpecAsk, signal?: AbortSignal): Promise<SpecOutcome> {
  if (!sectionSpecEnabled()) return empty("USE_SECTION_SPEC is not true");
  if (!isAiEnabled("design")) return empty("no design model configured");
  if (ask.order.sections.length === 0) return empty("no bands");

  const provider = getProvider("design");
  if (!provider) return empty("no design model configured");

  /* INSIDE the try, all of it. A page whose spec does not arrive still builds;
     a page whose spec THROWS takes the build with it, and there is nothing here
     worth more than the path that already works. */
  let text: string;
  let usage: Usage = NOTHING;
  try {
    const timer = AbortSignal.timeout(TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timer]) : timer;
    const completion = await provider.complete({
      system: systemPrompt(ask),
      user: userPrompt(ask),
      maxTokens: MAX_TOKENS,
      signal: combined,
    });
    usage = completion.usage;
    if (completion.truncated)
      return { ...empty("ran out of output budget"), usage, model: provider.model };
    text = completion.text;
  } catch (err) {
    return {
      ...empty(`the call failed: ${(err as Error).message}`),
      usage,
      model: provider.model,
    };
  }

  const parsed = parseObject(text) as { bands?: Record<string, unknown> } | null;
  if (!parsed?.bands || typeof parsed.bands !== "object")
    return { ...empty("no usable JSON in the answer"), usage, model: provider.model };

  const specs = new Map<number, SectionSpec>();
  let dropped = 0;

  /* Keyed by band NUMBER as the prompt presented them, one-based. Read by
     walking the order rather than the answer's keys, so an answer that invents
     a band 12 on a nine-band page cannot reach anything. */
  for (let i = 0; i < ask.order.sections.length; i++) {
    const answered = (parsed.bands as Record<string, unknown>)[String(i + 1)];
    if (answered === undefined) continue;

    const spec = vetSpec(answered);
    if (!spec) {
      dropped++;
      continue;
    }
    specs.set(i, spec);
  }

  return { specs, usage, reason: null, model: modelName("design"), dropped };
}
