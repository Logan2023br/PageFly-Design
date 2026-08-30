import "server-only";

import { parseObject } from "../ai/json";
import { getProvider, isAiEnabled, modelName, type Usage } from "../ai/provider";
import { sliceSkill } from "../ai/skills";
import type { Order, PageStyle, SectionSpec } from "./plan";
import { marketLines } from "./marketLines";
import { beginDropTally, dropTally, vetPageStyle, vetSpec } from "./specCheck";

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
 * The arithmetic behind the old 24,000 was: a built section is about 800 tokens
 * WITH its copy and CSS, a spec carrying neither is nearer 350, nine to eleven
 * of them, and the rest is thinking billed against the same ceiling.
 *
 * THE SPEC NOW CARRIES CSS, so half that arithmetic is gone. A band with exact
 * declarations on its nodes runs 700-900 tokens rather than 350, and the first
 * run at the old ceiling did not truncate — it ABORTED at 180 seconds with
 * nothing billed and nothing returned, which is the same outcome wearing a
 * different name.
 *
 * 40,000 and seven minutes. The timeout matches `designServer`'s, and for the
 * same reason given there: this stage's failure costs the page its design, and
 * a ceiling that only prices failures must sit above what the work genuinely
 * needs. The shared `pageStyle` block is what keeps this from growing with the
 * band count — the palette and the type scale are written once, not nine times.
 */
const MAX_TOKENS = 40_000;

const TIMEOUT_MS = 420_000;

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
  /**
   * What every band shares, written once by the design model.
   *
   * Undefined when the answer carried none — every caller treats it as absent
   * rather than empty, so a model that ignores the field costs the page its
   * shared defaults and nothing else.
   */
  pageStyle?: PageStyle;
  usage: Usage;
  /**
   * Declarations the design model asked for and the checker refused, by name.
   *
   * Empty on a clean answer. Non-empty means Opus decided something the page
   * cannot carry — `transform`, `zIndex` and the rest — and the size of it is
   * the honest measure of how much of stage 2b's thinking dies at the door.
   */
  refused?: Record<string, number>;
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
    `neither. Everything else about how this page looks is yours to fix, in`,
    `numbers, and the build model is expected to honour them.`,
    ``,
    `SAY IT IN VALUES, NOT IN ENGLISH. "A generous pill button with a warm`,
    `glow" is a sentence the next model has to guess at;`,
    `{"padding":"18px 34px","borderRadius":"999px","boxShadow":"0 0 48px`,
    `rgba(227,154,95,.28)"} is the same intent with nothing left to guess.`,
    `Put values in "css" and keep "note" for what the element is FOR.`,
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
    `CSS — exact declarations, per element, camelCase keys.`,
    `  {"el":"heading","scale":"oversized","css":{"fontSize":"clamp(52px,7.2vw,92px)",`,
    `   "lineHeight":"0.95","letterSpacing":"-0.015em","fontWeight":400}}`,
    ``,
    `Anything the page can carry belongs here: fontSize, fontWeight, fontStyle,`,
    `letterSpacing, lineHeight, textTransform, color, background,`,
    `backgroundImage (gradients), border, borderRadius, boxShadow, padding,`,
    `margin, width, maxWidth, minHeight, aspectRatio, objectFit, opacity,`,
    `backdropFilter, display, flexDirection, alignItems, justifyContent.`,
    ``,
    `SEVEN ARE REFUSED and asking for them wastes the instruction: position,`,
    `inset, top, right, bottom, left, zIndex, float, transform. The page cannot`,
    `carry them — a mockup that lies about where a thing sits is worse than a`,
    `plain one, and they fight the editor on export. So no rotated cards, no`,
    `absolute overlaps, no stacking order. Compose with rows, columns and`,
    `overlay instead.`,
    ``,
    `SAY EACH SHARED THING ONCE. The palette, the type scale and the motion`,
    `curve are the same in band one and band nine; repeating them nine times`,
    `buys nothing and is billed every time. Open your answer with "pageStyle":`,
    ``,
    `  "pageStyle": {`,
    `    "type": {"oversized":{"fontSize":"clamp(52px,7.2vw,92px)","lineHeight":"0.95",`,
    `             "letterSpacing":"-0.015em","fontWeight":400},`,
    `             "eyebrow":{"fontSize":"12px","fontWeight":600,"letterSpacing":".22em",`,
    `             "textTransform":"uppercase"}},`,
    `    "treatments": {"pill":{"padding":"18px 34px","borderRadius":"999px",`,
    `                   "fontSize":"12px","letterSpacing":".16em","textTransform":"uppercase"},`,
    `                   "card":{"borderRadius":"18px","overflow":"hidden",`,
    `                   "border":"1px solid rgba(255,255,255,.08)"}},`,
    `    "motion": "entry fade-up, 320ms cubic-bezier(.16,1,.3,1), 100ms stagger"`,
    `  }`,
    ``,
    `A node then names a treatment with "use" and writes only what DIFFERS:`,
    `{"el":"button","use":"pill","css":{"background":"#E39A5F","color":"#22150E"}}`,
    ``,
    `A node whose "scale" already covers it needs no "css" at all — the type`,
    `entry applies. Only write "css" for what the shared block does not say.`,
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
    `THE PHOTOGRAPH. Say its shape on the product node — mediaRatio is height`,
    `over width. 1 is square and right for a bottle; a garment wants 1.2-1.35 or`,
    `it loses its hem; a rug or a desk wants 0.7-0.85. And mediaHover: magnifier`,
    `for anything expensive or textured, none where the photography is editorial.`,
    ``,
    `HOW IT IS CHOSEN. Say the option groups on the product node — at most two,`,
    `each with a name, how many values, and how it should read: dots for colour,`,
    `tiles for sizes and anything with words, dropdown past about eight values.`,
    `Colour and Size do not look alike and must not be drawn alike.`,
    ``,
    `Always wrong: empty stars labelled "verified reviews", a strip of bare`,
    `icons with no words, and any row that would read the same on a phone case`,
    `as on a face serum.`,
    ``,
    ...(marketLines(ask.market).length ? [...marketLines(ask.market), ``] : []),
    `RULES.`,
    `1. Every band gets a spec. A band you skip is a band built by guesswork.`,
    `2. Vary between bands. Two bands with the same element list is the failure`,
    `   this step exists to prevent.`,
    `3. Motion is punctuation. A page where everything moves reads as a page`,
    `   where nothing does — leave most elements still.`,
    `4. Mark a node "optional": true when it would be good but the band works`,
    `   without it. Everything else is required and will be checked for.`,
    ``,
    `5. Specify. A band whose nodes carry no "css" and no "use" has been named`,
    `   rather than designed, and the build model will invent the numbers.`,
    ``,
    `ANSWER SHAPE. One object — "pageStyle" once, then "bands" keyed by the band`,
    `numbers below. No prose:`,
    `{"pageStyle":{"type":{...},"treatments":{...},"motion":"..."},`,
    ` "bands":{"1":{"nodes":[`,
    `{"el":"row","gap":48,"css":{"maxWidth":"1240px","padding":"0 56px",`,
    ` "alignItems":"center"},"children":[`,
    `{"el":"col","basis":"46%","gap":34,"children":[`,
    `{"el":"heading","scale":"oversized","note":"the promise, two lines",`,
    ` "anim":{"reveal":"fade-up"}},`,
    `{"el":"button","use":"pill","css":{"background":"#E39A5F","color":"#22150E",`,
    ` "boxShadow":"0 0 48px rgba(227,154,95,.28)"},`,
    ` "anim":{"hover":"float-shadow","reveal":"fade-up","delay":1}}]},`,
    `{"el":"image","basis":"54%","ratio":0.82,"use":"card",`,
    ` "anim":{"hover":"grow"}}]}]}}}`,
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
    `Use these four and nothing else. Every colour you write in "css" must be`,
    `one of them, or a transparency of one — a fifth colour is a colour the`,
    `page's palette does not have.`,
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

  const parsed = parseObject(text) as
    | { bands?: Record<string, unknown>; pageStyle?: unknown }
    | null;
  if (!parsed?.bands || typeof parsed.bands !== "object")
    /* WHICH failure, in the reason. "No usable JSON" covered three different
       things — an empty answer, prose, and an object with no `bands` key — and
       they need three different fixes. The first characters name the shape, the
       same way `designServer` names it, and that is the whole diagnosis when
       the shape is prose or a key that moved. */
    return {
      ...empty(
        text.trim() === ""
          ? `the model returned nothing — ${usage.output} output tokens`
          : !parsed
            ? `no JSON in ${text.length} characters — began: ${JSON.stringify(text.trim().slice(0, 120))}`
            : `JSON with no "bands" key — top level was: ${Object.keys(parsed).join(", ") || "(empty)"}`,
      ),
      usage,
      model: provider.model,
    };

  /* Counted across the whole answer — the page style and every band — so the
     log line below can say what the design model asked for and did not get. */
  beginDropTally();
  const pageStyle = vetPageStyle(parsed.pageStyle);
  const specs = new Map<number, SectionSpec>();
  let dropped = 0;

  /* Keyed by band NUMBER as the prompt presented them, one-based. Read by
     walking the order rather than the answer's keys, so an answer that invents
     a band 12 on a nine-band page cannot reach anything. */
  for (let i = 0; i < ask.order.sections.length; i++) {
    const answered = (parsed.bands as Record<string, unknown>)[String(i + 1)];
    if (answered === undefined) continue;

    /* The page type decides whether a buy box may be specified at all — see
       the note in `vetNode`. */
    const spec = vetSpec(answered, ask.pageType);
    if (!spec) {
      dropped++;
      continue;
    }
    specs.set(i, spec);
  }

  return { specs, pageStyle, usage, reason: null, model: modelName("design"), dropped, refused: dropTally() };
}
