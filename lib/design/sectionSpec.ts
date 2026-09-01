import "server-only";

import { parseObject } from "../ai/json";
import { getProvider, isAiEnabled, modelName, type Usage } from "../ai/provider";
import { sliceSkill } from "../ai/skills";
import { FREE_VERTICAL, pageHasOneProduct } from "./plan";
import type {
  Order,
  OrderSection,
  Padding,
  PageStyle,
  SectionRole,
  SectionSpec,
} from "./plan";
import { marketById } from "../briefOptions";
import { marketLines } from "./marketLines";
import { beginDropTally, dropTally, vetPageStyle, vetSpec } from "./specCheck";
import { THE_STANDARD } from "./standard";

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

/**
 * The most sections a free design may return before something is wrong.
 *
 * Not a design cap — free mode is asked for no length at all, and the prompt
 * carries no range. This is the point past which the answer stops being a long
 * page and starts being a build that returns nothing: stage 3 has a fixed
 * output ceiling, and `deckPlan` records a ten-section home page that spent all
 * of it thinking and produced no JSON. That ceiling is 96,000 now.
 *
 * Sixteen, against the eleven a real free design produced for a product page.
 * If this ever fires, the number to change is this one.
 */
const FREE_SECTION_CEILING = 16;

/**
 * Design with nothing in front of it — no bands, no patterns, no trade block.
 *
 * WHAT THIS TURNS OFF, and it is most of the pipeline's opinions. Stage 1 is
 * skipped entirely, so there is no pattern vocabulary to choose from, no `ARCS`
 * deciding the order of roles, no `PINNED` inserting a buy box or a closing
 * form, no trade block naming this store's hero and signature, and no ban list.
 * The design model gets the merchant's own words, the palette, the page type,
 * and the vocabulary of things a page can physically contain. Everything else
 * about the page is its decision.
 *
 * WHAT IT CANNOT TURN OFF, because neither is taste. `BANNED_CSS` stays — the
 * export cannot carry `position` or `transform`, so a design that used them
 * would be a mockup of a page the merchant is not going to get. And the section
 * budget stays, because it is a TOKEN budget: a ten-section home page was
 * measured spending all 48,000 of stage 3's output on thinking and returning no
 * JSON at all.
 *
 * WHAT IT COSTS. `elementForPattern` has nothing to look up, so the training
 * sections stop being fetched; three of the audit's checks are keyed on the
 * ordered pattern and go quiet; and the per-band skeletons stop being sent to
 * stage 3. It is also one long call PER PAGE rather than one short call for the
 * whole deck.
 *
 * A CONSTANT, NOT AN ENVIRONMENT VARIABLE, and that is deliberate. Every other
 * switch here reads `process.env` so an operator can change it on the box
 * without a deploy. This one is decided in the repository: the value is part of
 * what the code says, it is reviewed and it is in the history, and there is no
 * way for the running server to be doing something the source does not say.
 *
 * The cost is that turning it off is a deploy. That is the trade — flip the
 * line, commit, ship.
 */
export const FREE_DESIGN = true;

export function freeDesignEnabled(): boolean {
  return FREE_DESIGN;
}

export type SpecAsk = {
  pageType: string;
  /**
   * The band plan stage 1 produced for this page — or null in free mode, where
   * there is no stage 1 and the sections are this call's to decide.
   */
  order: Order | null;
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
   * The sections this call DECIDED, in free mode. Undefined otherwise.
   *
   * Returned as an `Order` because that is the shape the three deciders already
   * agree on — `orderLines`, the audit, the mockup and the exporter cannot tell
   * which one ran, and this is a fourth. What differs is only where it came
   * from: `pattern` is the name the design model gave the band rather than an
   * id from a table, so nothing downstream can look it up, and nothing does
   * beyond printing it.
   */
  order?: Order;
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
  const free = ask.order === null;
  return [
    /* TWO OPENINGS, ONE PROMPT. The rest of this file — the elements, the CSS,
       the buy box, the shared style block — is the same question either way:
       what does this page physically contain. Only the first paragraph changes,
       because only the first paragraph is about who decided the sections. */
    ...(free
      ? [
          `You design one page, whole.`,
          ``,
          `Nothing has been decided for you. How many sections it has, what each`,
          `one is, what order they run in, which one carries the page, which`,
          `inverts to a dark band, which carries a photograph behind it — all of`,
          `it is yours, and so is everything inside each section.`,
          ``,
          `There is no pattern library here and no house style. Design what THIS`,
          `store's page should be, from what the merchant told you.`,
          ``,
          ...THE_STANDARD,
          ``,
        ]
      : [
          `You decide what is INSIDE each band of one page.`,
          ``,
          `The bands are already chosen and their order is fixed. Your job is their`,
          `contents: which elements sit in each band, how they nest, how the space`,
          `divides between them, and what each one does on hover and on scroll.`,
          ``,
          ...THE_STANDARD,
          ``,
        ]),
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
    `  behaviour        accordion, table, counter, countdown, sticky, custom`,
    ``,
    /* PageFly HAS a countdown element with a documented field table, and until
       this line existed a page that wanted one asked for `custom` — markup that
       counts nothing, in a block the merchant cannot configure. A sale is the
       commonest reason to want one, so it is the commonest way that happened. */
    `A "countdown" is the real PageFly timer and needs "endsAt" as an ISO`,
    `instant — {"el":"countdown","endsAt":"2026-11-24T23:59:00Z",`,
    `"units":["d","h","m","s"],"labels":true}. Never build one out of "custom":`,
    `that is markup that does not count, and the merchant cannot set the date`,
    `on it from the editor.`,
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
       eleven blocks, not all forty-one.

       NOT SENT IN FREE MODE, and that is the mode's whole point: a skeleton is
       a shape someone else drew, and a call told to design the page from the
       merchant's words should not be handed nine of them first. */
    ...(ask.order
      ? [
          `THE SKELETONS. Each band's pattern already has a shape, below. Treat it as`,
          `the starting point, not the answer: keep what serves this store, change or`,
          `add what the band's brief needs. A band whose brief describes six frames`,
          `and whose skeleton says three should end up with six.`,
          ``,
          sliceSkill("patterns", ask.order.patternIds),
          ``,
        ]
      : []),
    /* GROUP B — DESIGN OPINION, AND FREE MODE DOES NOT GET IT.

       Everything from here to "Always wrong" tells the design model what a
       good buy box contains, what shape a photograph of a garment should be,
       and how a colour option differs from a size option. None of it is a
       limit of the export — the elements and the CSS above are that — it is
       taste, written down by someone who is not looking at this store.

       Kept for the banded path, which was built around it and is measured
       against it. Free mode is the bet that the model reaches these
       conclusions better than a list can state them, and a bet you can read
       the prompt for is a bet you can settle. Setting FREE_DESIGN to false
       restores every line of it, unchanged. */
    ...(free
      ? []
      : [
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
        ]),
    /* NOT IN FREE MODE. The market is something the merchant PICKED, in the
       same step they picked what they sell and which style — so free mode
       passes it as a fact, beside the others, and lets the design work out what
       a shopper there needs. Twenty lines telling a model how trade works in a
       country it knows better than the person who wrote them is the same
       mistake `marketLines` documents itself having made once already: "It
       prevented knowledge, and left the page addressed to nobody while looking
       like it had been addressed to someone." */
    ...(!free && marketLines(ask.market).length ? [...marketLines(ask.market), ``] : []),
    /* TWO RULES IN FREE MODE, AND NEITHER IS ABOUT THE PAGE.
    
       The three that went — every band gets a spec, vary between bands, motion
       is punctuation — are opinions about what a good page looks like, and this
       mode exists so the design model holds those rather than reads them.
    
       These two are about the ANSWER. "optional" is a field the checker reads,
       and a node with no values is the one thing that makes this whole stage
       pointless: it hands the decision back to the build model, which is the
       problem stage 2b was added to solve. Cutting them would not free the
       design, it would delete the reason the call is made. */
    `RULES.`,
    ...(free
      ? [
          /* Not taste, and the old prompt said so in as many words. A page
             whose first screen is a row of spec bars is a page nobody scrolls,
             and the background rule carries its own measurement: across 59
             shipped sections exactly one had a photograph behind it. */
          `1. THE PAGE OPENS ON A HERO — a first screen, full width, carrying`,
          `   the one thing this store wants seen before anything is read. It`,
          `   takes a photograph or a video behind it ("bg": true) unless the`,
          `   design genuinely wants a flat ground, because a hero on flat`,
          `   colour spends the first impression on nothing. The exception is a`,
          `   page selling one product: that opens on its buy box.`,
        ]
      : [
          `1. Every band gets a spec. A band you skip is a band built by guesswork.`,
          `2. Vary between bands. Two bands with the same element list is the failure`,
          `   this step exists to prevent.`,
          `3. Motion is punctuation. A page where everything moves reads as a page`,
          `   where nothing does — leave most elements still.`,
        ]),
    `${free ? 2 : 4}. Mark a node "optional": true when it would be good but the`,
    `   section works without it. Everything else is required and checked for.`,
    ``,
    `${free ? 3 : 5}. Specify. A section whose nodes carry no "css" and no "use"`,
    `   has been named rather than designed, and the build model will invent the`,
    `   numbers.`,
    ``,
    ...(free
      ? [
          /* The header fields exist because the page still has to be BUILT.
             `dark`, `padding` and `bg` are how a section reaches the renderer
             and the exporter at all; `role` is one of seven because the audit
             and the stage-3 prompt read it. None of them says what to design —
             they are the shape an answer has to arrive in. */
          `ANSWER SHAPE. One object — "pageStyle" once, then "sections" in the`,
          `order they appear on the page. No prose:`,
          `{"pageStyle":{"type":{...},"treatments":{...},"motion":"..."},`,
          ` "sections":[{"name":"the-workshop-at-scale",`,
          `   "role":"media","signature":true,"dark":false,"padding":"statement",`,
          `   "bg":true,"brief":"one sentence: what this section is and why it`,
          `   is here","nodes":[`,
        ]
      : [
          `ANSWER SHAPE. One object — "pageStyle" once, then "bands" keyed by the band`,
          `numbers below. No prose:`,
          `{"pageStyle":{"type":{...},"treatments":{...},"motion":"..."},`,
          ` "bands":{"1":{"nodes":[`,
        ]),
    `{"el":"row","gap":48,"css":{"maxWidth":"1240px","padding":"0 56px",`,
    ` "alignItems":"center"},"children":[`,
    `{"el":"col","basis":"46%","gap":34,"children":[`,
    `{"el":"heading","scale":"oversized","note":"the promise, two lines",`,
    ` "anim":{"reveal":"fade-up"}},`,
    `{"el":"button","use":"pill","css":{"background":"#E39A5F","color":"#22150E",`,
    ` "boxShadow":"0 0 48px rgba(227,154,95,.28)"},`,
    ` "anim":{"hover":"float-shadow","reveal":"fade-up","delay":1}}]},`,
    `{"el":"image","basis":"54%","ratio":0.82,"use":"card",`,
    ` "anim":{"hover":"grow"}}]}]`,
    free ? `}]}` : `}}}`,
    ...(free
      ? [
          ``,
          `"name" is yours — a short kebab-case handle for what this section is,`,
          `not an id from any list. "role" is one of: hero, commerce, proof,`,
          `media, content, conversion, utility. "padding" is one of: statement,`,
          `standard, dense, utility — use at least three different values down`,
          `the page. "bg" true where a photograph or video belongs behind the`,
          `section; never behind a table, a form or a row of cards, which are`,
          `unreadable on one.`,
        ]
      : []),
  ].join("\n");
}

function userPrompt(ask: SpecAsk): string {
  /* Everything the merchant chose, on one line, in the step they chose it.
     The market sits here rather than in an instruction block of its own —
     it is an answer they gave, not a lesson for the model. */
  const market = ask.market ? marketById(ask.market) : null;
  const lines: string[] = [
    `STORE. ${ask.sell} · ${ask.storeType} · ${ask.styleLabel} — ${ask.styleBlurb}`,
    ...(ask.order === null && market
      ? [`SELLING INTO. ${market.label} — write the page for shoppers there.`]
      : []),
  ];
  if (ask.prompt) lines.push(`THE MERCHANT'S OWN WORDS. ${ask.prompt}`);
  lines.push(
    `PALETTE. background ${ask.tokens.bg} · ink ${ask.tokens.ink} · ` +
      `accent ${ask.tokens.accent} · band ${ask.tokens.band}`,
    `Use these four and nothing else. Every colour you write in "css" must be`,
    `one of them, or a transparency of one — a fifth colour is a colour the`,
    `page's palette does not have.`,
    ``,
  );

  if (ask.order === null) {
    /* NO SECTION COUNT. `sectionBounds` said 8-11 for a product page and 6-8
       for an About page, and the number was asked for as a token budget rather
       than a shape — but a budget stated as a range is still a length someone
       else chose, and how long a page should be is part of designing it.
    
       THE RISK THIS TAKES, recorded because it was measured and not guessed:
       `deckPlan` carries a note about a ten-section home page whose stage 3
       spent all 48,000 of its output tokens thinking and returned no JSON at
       all. That ceiling is 96,000 now, and `FREE_SECTION_CEILING` below is a
       crash guard rather than a cap — it fires loudly, and if it ever fires the
       honest fix is that number, not a range in this prompt. */
    lines.push(
      `THE PAGE. ${ask.pageType}.`,
      ``,
      `Nothing about this page has been decided — not its length, not its shape,`,
      `not what a page of this kind is supposed to contain. How many sections it`,
      `needs is part of what you are deciding: a page of six sections that each`,
      `earn their place and a page of eleven can both be right, and which one`,
      `this store's ${ask.pageType} page is, is yours to say.`,
      ``,
    );
  } else {
    lines.push(`THE PAGE. ${ask.pageType} — ${ask.order.sections.length} bands.`, ``);
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

/* ---- free mode: checking a section the model invented -------------------- */

const ROLES = new Set<SectionRole>([
  "hero",
  "commerce",
  "proof",
  "media",
  "content",
  "conversion",
  "utility",
]);

const PADDINGS = new Set<Padding>(["statement", "standard", "dense", "utility"]);

/** Roles whose contents are detail, and detail on a photograph is unreadable. */
const NO_BG_ROLES = new Set<SectionRole>(["commerce", "proof", "utility"]);

/**
 * One section of a free answer, as a band plus the spec inside it.
 *
 * ONLY THE FIELDS THAT HAVE TO BE ONE OF A SET are checked, and each is checked
 * because something downstream switches on it rather than because a table
 * somewhere prefers it: `role` is read by the audit and printed to stage 3,
 * `padding` resolves to real pixels in the renderer, `dark` inverts the two
 * colours. A `name` is free text and stays whatever the model called it —
 * nothing looks it up, which is the point of free mode.
 *
 * `bg` is refused on the three roles whose contents are a table, a form or a
 * row of cards. That is not taste either: those are the sections that become
 * unreadable over a photograph, and the same rule is already stated in the
 * prompt — this is what happens when the answer says it anyway.
 */
function vetFreeSection(
  raw: unknown,
  pageType: string,
): { band: OrderSection; spec: SectionSpec | null } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const role = ROLES.has(o.role as SectionRole) ? (o.role as SectionRole) : "content";
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 48) : role;
  const padding = PADDINGS.has(o.padding as Padding) ? (o.padding as Padding) : "standard";
  const brief = typeof o.brief === "string" && o.brief.trim() ? o.brief.trim().slice(0, 320) : null;

  /* The nodes arrive on the section itself rather than under a "spec" key, so
     hand `vetSpec` the shape it already understands. */
  const spec = vetSpec({ nodes: o.nodes }, pageType);

  return {
    band: {
      role,
      pattern: name,
      signature: o.signature === true,
      dark: o.dark === true,
      padding,
      motion: null,
      mayHaveBg: o.bg === true && !NO_BG_ROLES.has(role),
      brief,
      spec,
    },
    spec,
  };
}

/**
 * Which section carries the page, when the answer did not say — by INDEX.
 *
 * The prompt used to define a signature: "the most room and the best
 * photograph". Free mode cut that sentence with the rest of the design
 * opinions, and the next run marked a one-node accent ticker as the section
 * carrying the page — the old fallback took the first section that was not the
 * hero, which only worked while the model had been told what it was picking.
 *
 * So this reads the answer instead of a rule. The section with the most in it
 * is the one the design spent itself on: a fact about what came back rather
 * than an opinion about what should have. The hero stays out of it — it is the
 * first screen, and a page whose only investment is its first screen has
 * nothing below it.
 */
function pickSignature(sections: OrderSection[]): number {
  const weight = (x: OrderSection) =>
    JSON.stringify(x.spec?.nodes ?? []).split(`"el"`).length - 1;
  let best = -1;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].role === "hero") continue;
    if (best === -1 || weight(sections[i]) > weight(sections[best])) best = i;
  }
  return best === -1 ? 0 : best;
}

/** `pickSignature`, for the tests. */
export const __pickSignatureForTest = (sections: OrderSection[]): number => {
  const marked = sections.findIndex((s) => s.signature);
  return sections.filter((s) => s.signature).length === 1 ? marked : pickSignature(sections);
};

/**
 * The page opens on its first screen.
 *
 * `enforceHero` in `deckPlan` guaranteed this, and its own note says why: "a
 * `home` page for a fashion store opened on `spec-bars` — a row of labelled
 * bars where the first screen should be." Free mode skips stage 1, so nothing
 * called it, and a home page came back with no banner at all.
 *
 * ONLY THE HALF THAT TRANSFERS. `enforceHero` could also INSERT a hero taken
 * from the trade block; free mode has no trade block and no pattern ids, and
 * inventing a section the design never asked for is overruling it rather than
 * repairing it. So a hero further down moves to the front — every band the
 * design chose is kept and only the order is corrected — and no hero anywhere
 * is left alone.
 *
 * The spec map is keyed by position, so it travels with them.
 *
 * A page that pins one product is exempt: it opens on its buy box, on purpose,
 * and always has.
 */
function openOnHero(
  pageType: string,
  sections: OrderSection[],
  specs: Map<number, SectionSpec>,
): void {
  if (pageHasOneProduct(pageType) || sections[0]?.role === "hero") return;
  const at = sections.findIndex((s) => s.role === "hero");
  if (at <= 0) return;
  const [hero] = sections.splice(at, 1);
  sections.unshift(hero);
  const moved = new Map<number, SectionSpec>();
  for (const [i, spec] of specs) moved.set(i === at ? 0 : i < at ? i + 1 : i, spec);
  specs.clear();
  for (const [i, spec] of moved) specs.set(i, spec);
}

/** `openOnHero`, for the tests. */
export const __openOnHeroForTest = openOnHero;

/**
 * `vetFreeSection`, for the tests.
 *
 * Same reason `__specPromptsForTest` exists: free mode's checking is the only
 * thing standing between a model's invented section and the renderer, and a
 * check nobody can call is a check nobody has read.
 */
export const __vetFreeSectionForTest = vetFreeSection;

/* ---- the call ------------------------------------------------------------ */

export async function planSpecs(ask: SpecAsk, signal?: AbortSignal): Promise<SpecOutcome> {
  /* FREE MODE IS NOT GATED BY `USE_SECTION_SPEC`, and gating it was a bug that
     reached production.

     That flag means "also ask a second model what goes inside the bands stage 1
     chose" — an addition to a pipeline that works without it. Free mode is not
     an addition: it IS the design step, and stage 1 has already been skipped by
     the time this is called. Gated, a server with the flag unset ran free mode,
     got nothing back, produced no order, and fell through to the deterministic
     arc — where `ceilingFor` allows 48,000 output tokens instead of 96,000
     because no section carries a spec. The build model spent 36,264 of them
     thinking, had 11,736 left for the JSON, and the page failed with the
     merchant's allowance untouched and no sign of what had gone wrong.

     Silently, which is the part that made it expensive: every symptom pointed
     at the build model. */
  if (ask.order !== null && !sectionSpecEnabled())
    return empty("USE_SECTION_SPEC is not true");
  if (!isAiEnabled("design")) return empty("no design model configured");
  /* Free mode has no bands to have none of — the sections are what it returns. */
  if (ask.order !== null && ask.order.sections.length === 0) return empty("no bands");

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
    | { bands?: Record<string, unknown>; sections?: unknown; pageStyle?: unknown }
    | null;

  /* ---- free mode: the answer carries the sections as well ----------------- */
  if (ask.order === null) {
    if (!Array.isArray(parsed?.sections) || parsed.sections.length === 0)
      return {
        ...empty(
          text.trim() === ""
            ? `the model returned nothing — ${usage.output} output tokens`
            : !parsed
              ? `no JSON in ${text.length} characters — began: ${JSON.stringify(text.trim().slice(0, 120))}`
              : `JSON with no "sections" array — top level was: ${Object.keys(parsed).join(", ") || "(empty)"}`,
        ),
        usage,
        model: provider.model,
      };

    beginDropTally();
    const pageStyle = vetPageStyle(parsed.pageStyle);
    const specs = new Map<number, SectionSpec>();
    const sections: OrderSection[] = [];
    let dropped = 0;

    /* A CRASH GUARD, NOT A CAP. Free mode asks for no length and trims to
       none — but stage 3 has a finite output ceiling, and a page of forty
       sections is a build that returns nothing rather than a long page. Set
       well above any page a design has actually produced (eleven, on a product
       page for Vietnam), so reaching it means something went wrong rather than
       that a page was ambitious. Loud, because a silent trim would look exactly
       like a model that chose to stop. */
    if (parsed.sections.length > FREE_SECTION_CEILING)
      console.warn(
        `[spec] ${ask.pageType} · ${parsed.sections.length} sections is past the ` +
          `crash guard of ${FREE_SECTION_CEILING} — trimmed. Raise FREE_SECTION_CEILING ` +
          `or find out why the design ran away.`,
      );
    for (const raw of parsed.sections.slice(0, FREE_SECTION_CEILING)) {
      const section = vetFreeSection(raw, ask.pageType);
      if (!section) {
        dropped++;
        continue;
      }
      const i = sections.length;
      sections.push(section.band);
      if (section.spec) specs.set(i, section.spec);
    }

    if (sections.length === 0)
      return { ...empty("no section survived checking"), usage, model: provider.model, dropped };

    /* THE PAGE OPENS ON ITS FIRST SCREEN, and free mode lost that when it
       skipped stage 1.
    
       `enforceHero` in `deckPlan` guaranteed it, and its own note says why:
       "a `home` page for a fashion store opened on `spec-bars` — a row of
       labelled bars where the first screen should be." Free mode never calls
       it, so nothing has required a hero since, and a home page came back with
       no banner at all.
    
       Only the half that transfers. `enforceHero` could also INSERT a hero
       taken from the trade block, and free mode has no trade block and no
       pattern ids — inventing a section the design did not ask for would be
       overruling it rather than repairing it. So: a hero further down is moved
       to the front, which keeps every band the design chose and corrects only
       the order. No hero anywhere is left alone.
    
       A page that pins one product is exempt: it opens on its buy box, on
       purpose, and always has. */
    openOnHero(ask.pageType, sections, specs);

    /* THE REPAIRS THAT ARE NOT TASTE. Exactly one section carries the page, and
       two inverted sections may not touch — the second is a rendering fact, not
       a preference: adjacent dark bands read as one tall dark band and the seam
       between them disappears. Everything else the answer said is kept. */
    const marked = sections.filter((s) => s.signature);
    if (marked.length !== 1) {
      /* BY WEIGHT, NOT BY POSITION. The first version took the first section
         that was not the hero, which was fine while the prompt still said what
         a signature IS — "the most room and the best photograph". Free mode
         cut that sentence, and the very next run marked a one-node accent
         ticker as the section carrying the page.
      
         So the fallback reads the answer instead of a rule: the section with
         the most in it is the one the design spent itself on, and that is a
         fact about what came back rather than an opinion about what should
         have. The hero is still excluded — it is the first screen, and a page
         whose only investment is its first screen has nothing below it. */
      for (const s of sections) s.signature = false;
      sections[pickSignature(sections)].signature = true;
    }
    for (let i = 1; i < sections.length; i++)
      if (sections[i].dark && sections[i - 1].dark) sections[i].dark = false;

    const order: Order = {
      vertical: FREE_VERTICAL,
      archetype: "E",
      patternIds: sections.map((s) => s.pattern),
      motionIds: [],
      sections,
      ...(pageStyle ? { style: pageStyle } : {}),
    };

    return {
      specs,
      order,
      pageStyle,
      usage,
      reason: null,
      model: modelName("design"),
      dropped,
      refused: dropTally(),
    };
  }

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
