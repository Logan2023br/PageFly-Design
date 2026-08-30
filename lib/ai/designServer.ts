import "server-only";

import { getProvider, isAiEnabled, providerName, type Completion, type Usage } from "./provider";
import { parseObject, worthAskingAgain } from "./json";
import { loadSkills, sliceSkill } from "./skills";
import { DESIGN_SYSTEM } from "./designPrompt";
import { designTreeSchema, walk, type DesignTree } from "../design/schema";
import { animationLines } from "../design/animationPicker";
import {
  orderFromSlots,
  planPage,
  seedFor,
  type Order,
  type OrderSection,
  type PageStyle,
  type Slot,
  type SpecNode,
} from "../design/plan";
import { marketLines } from "../design/marketLines";
import { audit } from "../design/audit";
import { elementForPattern } from "../design/elementFor";
import { imageWants } from "../design/imageWants";
import { getRepo } from "../db";
import { sectionPlanLine } from "../design/sectionPlan";
import { detectVertical } from "../generate/content";
import { findVideo, resolvePhotos, stockProvider, urlsOf } from "../images/stock";

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
  /**
   * The market, when the merchant chose one.
   *
   * This is the stage that writes the words, so it is the stage the market
   * matters most to — it decides the LANGUAGE. See the language rule in
   * `skills/50-copy.md`, which this field is what makes true.
   */
  market?: string | null;
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
  /** the eight-field style read from the same Haiku call, when there was one */
  refStyle: import("./refVision").RefStyle | null;
  /** Step 1 chip slug, when the merchant clicked one. Exact; null for free text. */
  verticalSlug?: string | null;
  /**
   * The store this is for.
   *
   * Only the resolver uses it, and only as seed material: two stores in the same
   * vertical must roll different patterns, and the domain is the one thing that
   * reliably differs. Never sent to the model.
   */
  storeDomain?: string | null;
  /**
   * How many pages this build is producing.
   *
   * The designer needs it to pace itself: one page can carry a signature effect
   * the merchant remembers, while the same effect on all ten is wallpaper — and
   * ten pages that each invented their own motion do not look like one site.
   */
  deckSize?: number;
  /**
   * The section list a model chose for this page type, when it was asked.
   *
   * Decided ONCE for the whole deck in `lib/design/structure.ts`, so every page
   * in a build was ordered by something that could see the others. Absent when
   * the call was off, failed, or its answer for this page type did not survive
   * checking — and then the arc decides, exactly as before.
   */
  structure?: Slot[] | null;
  /**
   * A finished order for this page type, decided by `deckPlan.ts`.
   *
   * The difference from `structure` above is what was decided: that one names
   * the sections and leaves the rhythm to `finish()`, this one arrives with the
   * rhythm already in it — signature, dark, padding, motion, backgrounds — and
   * a brief per band. When it is present nothing else runs; when it is absent
   * the two older deciders are untouched.
   */
  order?: Order | null;
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
      /**
       * How many problems the audit found on the FIRST pass.
       *
       * Recorded because it is the number that says which skill file is
       * unclear: every repeated failure is a sentence a model could not act on.
       * Zero after a repair is not the same as zero before one.
       */
      auditFailures: number;
      images: Record<string, string>;
      /** background-video URLs by search phrase; at most one per page */
      videos: Record<string, string>;
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

/**
 * How the reference looks, as facts the model can act on.
 *
 * Seven fields; `heroKind` is missing on purpose — it went into the resolver,
 * because it changes which section gets built rather than how it looks. Sending
 * it here too would give the model a second opinion on a decision already made.
 */
function styleLines(style: import("./refVision").RefStyle | null): string[] {
  if (!style) return [];

  const facts = [
    style.displayScale && `display type is ${style.displayScale}`,
    style.fontMood && `the faces are ${style.fontMood}`,
    style.accentUse && `the accent colour is used ${style.accentUse.replace(/-/g, " ")}`,
    style.imageMood && `the photography is ${style.imageMood}`,
    style.surface && `the surface is ${style.surface}`,
    style.density && `the spacing is ${style.density}`,
    style.corner && `corners are ${style.corner}`,
  ].filter(Boolean);

  if (facts.length === 0) return [];

  return [
    `The merchant's reference LOOKS like this: ${facts.join(", ")}.`,
    /* Stated as a limit rather than an instruction. It no longer reads as
       "the merchant's choice outranks the reference" — since the reference now
       SETS the palette when there is one, the palette above already is the
       reference's. What this still prevents is the model inventing a ninth
       colour because a one-word style note suggested one. */
    `Match that treatment inside the palette and faces above — never by changing them.`,
    ``,
  ];
}

/* The padding names the resolver uses, in the pixels the model writes. Kept
   here rather than in the order line's vocabulary because the model should not
   have to learn a second word for a number it is about to type. */
const PADDING_PX: Record<string, string> = {
  statement: "140px 56px",
  standard: "96px 56px",
  dense: "72px 56px",
  utility: "56px 56px",
};

/**
 * How much output this page is allowed, and why it is not one number.
 *
 * The long note at the call site works out that a ceiling prices FAILURES
 * rather than successes — a page needing 25,000 is billed 25,000 whichever
 * ceiling is set — so it has to sit above what a page genuinely needs, and
 * 48,000 was chosen as comfortably above the 26,726 measured on the heaviest
 * page there was.
 *
 * A design pass that specifies every element changed what "heaviest" means.
 * First real build of a twelve-band product page with a full spec:
 *
 *     ran out of output budget at 47999 tokens
 *     — 42557 of them spent thinking, leaving 5442 for the JSON
 *
 * The thinking grew, not the answer. That is worth saying plainly because it is
 * the opposite of the intuition the spec was built on: being handed the design
 * did not save the build model from deciding, it gave it more to reconcile.
 * Whether that is the prompt's fault or the model's is not yet known, and
 * raising the ceiling does not answer it — it only stops the question costing a
 * page every time it is asked.
 *
 * So the specified path gets 64,000 and the old path keeps 48,000. A build with
 * no specs cannot be made to fail more expensively by a feature it never used.
 */
function ceilingFor(order: Order | null): number {
  if (providerName() !== "deepseek") return 16_000;
  /* 96,000 on the specified path, raised from 64,000 when the spec started
     carrying measured values.
     
     The reasoning above still holds and it is what forces the raise: the
     ceiling prices FAILURES, so it has to sit above what a page genuinely
     needs. What a page needs moved. Five builds of the same brief, output
     tokens on the design call:
     
       52,607 · 107,026 · 114,758 · 71,392 · 63,538
     
     The last one is not the cheap one — it is the FAILURE. One call spent
     63,538 of 64,000, stopped mid-JSON, and the retry did the same: a page
     billed twice and delivered never. The four that worked spent more than
     that across their two calls and produced a page.
     
     A page that needs 70,000 is billed 70,000 whether the ceiling is 64,000 or
     96,000. The only thing 64,000 bought was the right to fail at it. */
  return order?.sections.some((s) => s.spec) ? 96_000 : 48_000;
}

/**
 * One spec node as an indented line, its children beneath it.
 *
 * Indented text rather than the JSON it arrived as: everything around it in
 * this prompt is lines of text, and a block of JSON in the middle reads as a
 * different kind of instruction — a thing to copy rather than a thing to build
 * from. Absent fields are omitted, so a plain element is a short line.
 */
/**
 * One node's declarations as `{k: v; k: v}`.
 *
 * CSS-ish rather than JSON: everything around it in this prompt is text, and a
 * JSON fragment in the middle reads as something to copy verbatim rather than
 * something to apply — the same reason the spec is indented lines rather than
 * the JSON it arrived as.
 */
function cssLine(css: Record<string, string | number>): string {
  const body = Object.entries(css)
    .map(([k, v]) => `${k}:${v}`)
    .join("; ");
  return `{${body}}`;
}

/**
 * What every band shares, printed once above them.
 *
 * The whole reason `PageStyle` exists: a palette, a type scale and a motion
 * curve are the same on band one and band nine, and repeating them nine times
 * is billed nine times — as stage 2b's output at $25/MTok and again as this
 * stage's input. Stated once here, referenced by `use:` and by `scale` below.
 */
function sharedStyleLines(style: PageStyle | null | undefined): string[] {
  if (!style) return [];

  const out: string[] = [``, `THE PAGE'S SHARED STYLE — applies to every band below.`];

  if (style.type) {
    out.push(`Type scale — a node's "scale" means these declarations:`);
    for (const [role, css] of Object.entries(style.type))
      out.push(`  ${role}  ${cssLine(css)}`);
  }

  if (style.treatments) {
    out.push(`Treatments — a node marked use:NAME carries these:`);
    for (const [name, css] of Object.entries(style.treatments))
      out.push(`  ${name}  ${cssLine(css)}`);
  }

  if (style.motion) out.push(`Motion — ${style.motion}`);
  if (style.note) out.push(style.note);

  out.push(
    `A node's own declarations are written after these and win where they`,
    `overlap. Where a node says nothing, the shared value stands — do not`,
    `re-decide it per band.`,
    ``,
  );
  return out;
}

function specLines(node: SpecNode, depth: number): string[] {
  const pad = "  ".repeat(depth + 1);
  const bits = [
    node.el === "bound" && node.slot ? `bound:${node.slot}` : node.el,
    node.scale ?? "",
    node.note ? `→ ${node.note}` : "",
    node.basis ? `basis ${node.basis}` : "",
    node.gap !== undefined ? `gap ${node.gap}` : "",
    node.ratio !== undefined ? `ratio ${node.ratio}` : "",
    node.anim?.hover ? `hover:${node.anim.hover}` : "",
    node.anim?.reveal ? `reveal:${node.anim.reveal}` : "",
    node.anim?.delay !== undefined ? `delay:${node.anim.delay}` : "",
    /* The treatment first, then the deltas — the order they are applied in, so
       a reader resolves them the same way the builder is being asked to. */
    node.use ? `use:${node.use}` : "",
    node.css ? cssLine(node.css) : "",
    node.optional ? "(optional)" : "",
  ].filter(Boolean);

  return [
    `${pad}${bits.join("  ")}`,
    ...(node.children ?? []).flatMap((c) => specLines(c, depth + 1)),
  ];
}

/**
 * The order, as the model reads it.
 *
 * One line per section, and — where stage 2b answered — the elements that go in
 * it underneath. Everything here is a decision already made: which pattern, how
 * dark, how much room, what moves, and what is inside. Nothing to weigh, only
 * to build.
 */
function orderLines(order: Order, bg: string, ink: string): string[] {
  return [
    `THE ORDER — build exactly these sections, in this order, one section each.`,
    `Copy the pattern id into the section's "pattern" field verbatim.`,
    /* Gated on the BACKGROUNDS, not on the specs. It sat inside the spec
       block, and a build whose stage 2b failed got `bg:WRITE ONE` on its
       hero with nothing anywhere saying what that meant — the run that
       found this came back with zero backgrounds and the instruction
       present but unexplained. The two are decided by different stages and
       have to be conditioned separately. */
    ...(order.sections.some((s) => s.mayHaveBg)
      ? [
          `A band marked bg:WRITE ONE gets a photograph behind it. Put it on the`,
          `SECTION, not on a child, and write all three fields:`,
          ``,
          `  "bg": {"kind":"photo",`,
          `         "query":"English search terms — the subject, the setting,`,
          `                  the light. 'tailored wool overcoat on model, moody`,
          `                  studio, editorial fashion photography', not 'fashion'",`,
          `         "scrim":"soft"}`,
          ``,
          `"kind":"video" instead, where the thing itself MOVES and the movement`,
          `is the argument — fabric falling, liquid pouring, a machine running,`,
          `a flame. One per page at most, and only on a band the reader lands on`,
          `rather than one they scroll past. Same three fields; the query names`,
          `the motion: "espresso pouring into a cup, slow motion, warm light".`,
          `A still photograph of a moving thing is the safer answer whenever the`,
          `movement is not the point.`,
          ``,
          `The scrim is not optional on a band with text over it — it is what`,
          `makes a heading readable on somebody else's photograph. "none" only`,
          `where nothing sits on top.`,
          ``,
          `A band marked bg:WRITE ONE that comes back without one is the failure`,
          `this line exists to prevent: the pattern builds its gradient, and the`,
          `gradient darkens nothing.`,
          ``,
        ]
      : []),
    /* Only when there is something to explain. Unconditional, these three lines
       would describe elements to every build on the older paths — where no
       section ever lists any — and would change a cached prefix that has no
       reason to move. */
    ...(order.sections.some((s) => s.spec)
      ? [
          `Where a section lists elements beneath it, build those elements: the`,
          `indentation is the nesting.`,
          ``,
          `A line may carry three kinds of instruction, and they resolve in this`,
          `order — later wins:`,
          `  scale     the type role. Its declarations are in the shared style`,
          `            above; apply them.`,
          `  use:NAME  a treatment from the shared style; apply it whole.`,
          `  {k:v}     this element's own declarations. Put them in the node's`,
          `            "css" as written — they are measured, not suggestions.`,
          ``,
          `Where a line gives a value, do not substitute your own. Where it gives`,
          `none, decide — the spec is silent about what it did not want fixed.`,
          ``,

        ]
      : []),
    ``,
    ...order.sections.flatMap((s, i) => [
      [
        `${i + 1} · ${s.role}`,
        s.pattern || "(no pattern — build the role plainly)",
        /* The literal colours, not the words "dark" and "light".

           Those words were written when the page was always on white, and they
           stop meaning anything the moment it is not: told "dark" on a page whose
           background is already near-black, a model can only produce black on
           black. Inverting is what was ever meant, and the two hex codes say it
           without the model having to work out which way round it is — the same
           reason the padding is given in pixels rather than as "statement". */
        s.dark ? `background ${ink}, text ${bg}` : `background ${bg}`,
        PADDING_PX[s.padding] ?? "96px 56px",
        s.signature ? "SIGNATURE — the most room and the best photograph on the page" : "",
        /* What goes in the band, when something upstream knew. A pattern id is
           a shape; this is the subject. Only `deckPlan.ts` fills it — the two
           older deciders leave it null and the line disappears. */
        s.brief ? `→ ${s.brief}` : "",
        /* WRITE THE BACKGROUND, not "you may". Two words — `bg:allowed` — was
           a permission slip buried in 55,000 characters of prompt, and it was
           read as an option: across 59 shipped sections, ONE carried a
           background photograph, and two of the nine bands on every page had
           been granted one. The band that most needs a photograph is the hero,
           and heroes were coming back as a scrim over a flat colour — the
           gradient built, the photograph it exists to darken absent. */
        s.mayHaveBg ? "bg:WRITE ONE" : "",
        s.motion ? `motion:${s.motion}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      /* The elements, when stage 2b named them. Absent on every older path, and
         then the band is described by its pattern id alone, exactly as before. */
      ...(s.spec ? s.spec.nodes.flatMap((n) => specLines(n, 0)) : []),
    ]),
    ``,
  ];
}


/**
 * The system and user prompt for one page.
 *
 * Lifted out of `designPageTree` so `__designPromptsForTest` can return the
 * real thing rather than a reconstruction. Async because `trainingLines`
 * reads the database.
 */
async function buildPrompts(
  input: DesignInput,
): Promise<{ system: string; user: string }> {
  const order = input.order ?? null;
  const system = order
    ? [
        loadSkills("design"),
        sliceSkill("patterns", order.patternIds),
        sliceSkill("verticals", [order.vertical]),
        sliceSkill("motion", order.motionIds),
      ]
        .filter(Boolean)
        .join("\n\n")
    : (() => {
        const skills = loadSkills("design");
        return skills ? `${DESIGN_SYSTEM}\n\n${skills}` : DESIGN_SYSTEM;
      })();

  const t = input.tokens;
  const user = [
    `Store sells: ${input.sell}`,
    input.storeType && `Store type: ${input.storeType}`,
    input.prompt && `Merchant's own words: ${input.prompt}`,
    ``,
    `Visual style: ${input.styleLabel}${input.styleBlurb ? ` — ${input.styleBlurb}` : ""}`,
    ``,
    `Design this page: ${input.pageLabel || input.pageType}`,
    ``,
    `Palette and faces — work inside these, do not introduce others.`,
    `Each colour has a job. Use it for that job.`,
    ``,
    `  background  ${t.bg}`,
    `  text        ${t.ink}`,
    `  accent      ${t.accent}   buttons, prices, badges, the one highlighted thing in a section`,
    t.band && `  band        ${asHex(t.band)}   background of sections that step away from the page background`,
    /* Stated as an instruction, not an offer. A border colour only reaches this
       line because the merchant filled a slot labelled Borders — without saying
       so outright it was handed over and used zero times in a 75-node page. */
    t.border &&
      `  border      ${asHex(t.border)}   card and section outlines, dividers. The merchant chose this colour, so cards and bands DO carry a visible 1px outline in it.`,
    t.fontHeading && `  heading font-family: ${t.fontHeading}`,
    t.fontBody && `  body font-family: ${t.fontBody}`,
    `  corner radius ${t.radius}px`,
    ``,
    /* Once, above the bands. See `sharedStyleLines` for why it is not repeated
       inside each of them. */
    ...(order ? sharedStyleLines(order.style) : []),
    ...(order ? orderLines(order, t.bg, t.ink) : [sectionPlanLine(input.pageType, detectVertical(input.sell), Boolean(input.refSections?.length))]),
    ...(order ? [] : [animationLines(input.pageType, detectVertical(input.sell), input.deckSize ?? 1)]),
    ...referenceLines(input.reference, input.refSections),
    ...styleLines(input.refStyle),
    /* Always. The two sources answer questions at different scales — see
       `trainingLines`. */
    ...(await trainingLines(order, Boolean(input.refSections?.length))),
    ...(marketLines(input.market ?? null).length
      ? [...marketLines(input.market ?? null), ``]
      : []),
    `Return the JSON object now.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

/**
 * `orderLines`, for a test that must prove the old path did not move.
 *
 * Exported because the property that matters most about this change is a
 * NEGATIVE one — a band with no spec must produce the byte-identical block it
 * produced before specs existed — and a negative property nobody can run is a
 * claim rather than a fact.
 */
export function __orderLinesForTest(order: Order, bg: string, ink: string): string[] {
  return orderLines(order, bg, ink);
}

/**
 * The WHOLE prompt this stage sends, without sending it.
 *
 * `deckPlan` and `sectionSpec` each already expose theirs, for the reason both
 * docblocks give: the prompt is the part of a model call that can be reviewed,
 * and one that can only be seen by paying for a completion is one nobody
 * reviews. This stage had only `__orderLinesForTest` — a tenth of the text —
 * so the largest prompt of the three was the one that could not be read.
 *
 * Deliberately calls the same assembly the live path uses rather than
 * reproducing it: a copy would drift, and a drifted copy of a prompt is worse
 * than no copy, because it reads as evidence.
 */
export async function __designPromptsForTest(
  input: DesignInput,
): Promise<{ system: string; user: string }> {
  return buildPrompts(input);
}

/* ==========================================================================
   TRAINING SECTIONS, read from the database as text.

   BOTH, ALWAYS, AND THAT IS A CORRECTION.

   This used to skip the filings entirely whenever the merchant had uploaded a
   reference, on the reasoning that two descriptions of one thing is a model
   reconciling instead of building. That reasoning is right about two answers to
   ONE question and this was never that:

     the merchant's reference   WHICH sections, in WHAT ORDER — a whole page
     a filed reading            HOW one element is built — inside one band

   A page screenshot does not carry the inside of a buy box, so dropping the
   filing lost detail and gained nothing. Worse, it lost it for the merchant who
   had invested the most: the one who took the trouble to upload.

   They can still disagree, and when they do the line below says who wins — the
   section to the merchant, the inside of an element to the filing. Stated rather
   than left to be worked out, because a model given two sources and no rule will
   average them.

   It used to rank them on SEQUENCE, which was wrong twice over: sequence is not
   what a filing is about, and it is no longer what the reference decides either
   — `structure.ts` owns it now, and it is given the reference itself.

   CAPPED AT THREE, raised from two now that a filing also reaches the merchant
   who uploaded. Each one enters at ~400 tokens (see `MAX_FILING_CHARS`) in the
   part of the prompt that is NOT cached, and the input is not even the real
   cost: Phase 3 measured that a more precise spec buys MORE reasoning, not less.

   Two covered the signature slot and the commerce slot — the band the page
   spends its room on, and the band that sells something. Three adds the one
   after those, which on most page types is the proof band, and it is the third
   band an operator actually bothers to file. Beyond three the filings stop being
   the reason a page looks good and start being most of the prompt: the ordering
   below is by how much a slot needs help, so the fourth is by definition the
   least useful one, bought at the same price as the first.

   THE SWITCH IS HONOURED HERE. An entry turned off is not read, which is what
   the switch promises: "the model must work it out itself".
   ========================================================================== */
const MAX_TRAINING = 3;

/**
 * The ceiling on ONE FILING as it enters the prompt.
 *
 * Named for what it caps. It was `MAX_PROMPT_CHARS`, which is also the name of
 * the merchant's own character limit in `briefOptions.ts` — two constants, one
 * name, different jobs, and reading this one while looking for that one is a
 * mistake anybody would make.
 *
 * ~400 tokens. The stored reading is capped at 3,000 characters, which is right
 * for the operator reading it on a card and too much to paste three of into a
 * prompt: it lands in the part that is NOT cached, so three at full length is
 * 2,500 uncached input tokens on every page for ever.
 *
 * Cut on a line boundary rather than mid-word. These readings are written as
 * labelled blocks — STRUCTURE, SPACING, TYPE — so losing whole trailing lines
 * costs the last axes and leaves the earlier ones intact, which is a far better
 * failure than a sentence stopping halfway through a number.
 */
const MAX_FILING_CHARS = 1440;

function trim(analysis: string): string {
  const text = analysis.trim();
  if (text.length <= MAX_FILING_CHARS) return text;
  const cut = text.slice(0, MAX_FILING_CHARS);
  const lastLine = cut.lastIndexOf("\n");
  return (lastLine > MAX_FILING_CHARS * 0.6 ? cut.slice(0, lastLine) : cut).trimEnd();
}

async function trainingLines(
  order: Order | null,
  hasReference: boolean,
): Promise<string[]> {
  if (!order) return [];

  /* Signature first, then commerce, then whatever else has a filing. The order
     of preference is the order of the page's own emphasis. */
  const ranked = [...order.sections]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const score = (x: { s: OrderSection }) =>
        (x.s.signature ? 2 : 0) + (x.s.role === "commerce" ? 1 : 0);
      return score(b) - score(a) || a.i - b.i;
    });

  const wanted: { element: string; slot: number }[] = [];
  const seen = new Set<string>();
  for (const { s, i } of ranked) {
    const element = s.pattern ? elementForPattern(s.pattern) : null;
    if (!element || seen.has(element)) continue;
    seen.add(element);
    wanted.push({ element, slot: i + 1 });
    if (wanted.length >= MAX_TRAINING) break;
  }
  if (wanted.length === 0) return [];

  const repo = getRepo();
  const found: string[] = [];
  for (const { element, slot } of wanted) {
    /* A database that is unreachable costs the page its training, not the page.
       This runs on every build; it cannot be a reason one fails. */
    /* The trade's own filing first, the shared one behind it — see the repo.
       Handing every trade the same reading is what made every store's buy box
       identical, which is the disease the resolver exists to treat. */
    const row = await repo
      .getTrainingSectionByElementAndVertical(element, order.vertical)
      .catch(() => null);
    if (!row || row.enabled === false || !row.analysis?.trim()) continue;
    const scope = row.vertical ? row.vertical : "any trade";
    found.push(
      `Section ${slot} — ${element}, filed for ${scope}:`,
      trim(row.analysis),
      ``,
    );
  }

  if (found.length === 0) return [];
  return [
    `HOW THESE ELEMENTS ARE BUILT WELL. Read off screenshots an operator filed.`,
    `Follow the structure, the numbers and the treatment exactly. The WORDS are`,
    `this store's — never the reference's product, industry or claims.`,
    ``,
    /* Only when there is a second source to rank against. On a page with no
       uploads the sentence would be answering a question nobody asked. */
    ...(hasReference
      ? [
          `The merchant's reference decides how the SECTIONS look. These filings decide how`,
          `the individual ELEMENTS are built. When they disagree, the reference wins on the`,
          `section, the filing wins inside the element.`,
          ``,
        ]
      : []),
    /* Each part of a reading is tagged, because the tag answers the only
       question that decides whether it can be built at all. Spelled out here
       rather than left to be inferred: a part tagged BUILD and skipped is how a
       page comes out simpler than the reference it was built from, and nobody
       looking at the result can tell that is what happened. */
    `Each part is tagged. Act on the tag:`,
    `  SETTING — set that field on that node. Do not draw it.`,
    `  STYLE   — write that CSS.`,
    `  BUILD   — there is NO element for it. Build it from rows, text and icons`,
    `            anyway. A star rating, a "12 people viewing" line, a SAVE 33%`,
    `            pill: these are the parts with no element, and leaving one out`,
    `            because it has no element is how the page ends up plainer than`,
    `            the reference for no reason a merchant can see. Inside a`,
    `            \`product\` node they go in \`extras\`.`,
    ``,
    ...found,
  ];
}

export async function designPageTree(
  input: DesignInput,
  signal?: AbortSignal,
): Promise<DesignOutcome> {
  if (!isAiEnabled()) return { used: false, reason: "no model configured", usage: NOTHING };

  const provider = getProvider();
  if (!provider) return { used: false, reason: "no model configured", usage: NOTHING };

  /* ==========================================================================
     THE ORDER. Decided in code, before the model is asked anything.

     This is the change the rebuild turns on. v1 described a good page in the
     prompt and asked the model to produce one — and a description of a good
     page IS a template, so every page came back with the same skeleton. The
     structure is now resolved deterministically and the model is left the work
     it is good at: this store's words and this store's pictures.

     Behind USE_PLAN so it can be turned off without a deploy. That is the
     rollback, and it is why the v1 path below is kept rather than deleted.
     ========================================================================== */
  const usePlan = process.env.USE_PLAN !== "false";

  const brief = {
    whatYouSell: input.sell,
    verticalSlug: input.verticalSlug ?? null,
    visualStyle: input.style as never,
  };
  const seed = seedFor(input.storeDomain ?? input.sell, input.pageType, input.style);

  /* Two deciders, one seam. `orderFromSlots` and `planPage` return the same
     shape and both go through `finish()`, so everything downstream — the skill
     slices, the prompt, the audit, the exporter — cannot tell which one ran.
     That is deliberate: the model was given the section list to decide, not a
     second code path to be special in. */
  const order = !usePlan
    ? null
    : /* THREE deciders now, still one seam. `deckPlan` arrives finished — it
         decided the rhythm itself rather than leaving it to `finish()` — so it
         is used as-is. The other two are unchanged. */
      (input.order ??
      (input.structure?.length
        ? orderFromSlots(brief, seed, input.structure)
        : planPage(brief, input.pageType, seed, input.refStyle?.heroKind ?? null)));

  /* §7 — CONCATENATION ORDER IS NOT COSMETIC. DeepSeek caches by prefix, and
     the cached prefix ends at the first byte that differs. `00-contract` and
     `10-composition` are byte-identical on every page ever built, so they come
     first and stay cached for ever; the slices change with the page type and go
     after. A slice placed before them would throw the whole prefix away — it
     would look like it works, and the bill would be several times what it
     should be. Measured in v1: 4,864 of 4,892 input tokens were cache hits. */
  const { system, user } = await buildPrompts(input);

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

         64,000 then turned out to be the wrong lesson. A page that goes wrong
         spends the WHOLE ceiling before anyone can see it has gone wrong — a
         single failed page cost 71,000 tokens, more than the two successful
         pages beside it put together. The ceiling is not headroom, it is the
         bill for every failure.

         32,000 was then tried, to stop a failure costing 71,000. It cut the
         wrong thing. Two pages of a three-page build truncated where the same
         build had produced ten pages at the higher ceiling, and the arithmetic
         of that is worse, not better:

           64,000, one page in three fails:  2x32k + 71k = 135k for two pages
           32,000, two in three fail:        1x32k + 2x38k = 108k for one page

         Twenty per cent cheaper for half the output, and a failed page returns
         nothing at all — the merchant is charged nothing but receives nothing,
         which is the expensive outcome however few tokens it burned.

         The thing I had wrong: a high ceiling does not make a working page cost
         more. A page that needs 25,000 is billed 25,000 whether the ceiling is
         32,000 or 64,000. The ceiling only prices FAILURES — so it must sit
         above what a page genuinely needs, and the way to spend less is to make
         pages fail less often, not to cut them off sooner.

         48,000: comfortably above the 26,726 measured on the heaviest page
         there is, and still 25% below the 64,000 that made one failure cost
         more than two successes.

         See `ceilingFor` — "the heaviest page there is" stopped being that
         page the moment a design pass started specifying its elements. */
      maxTokens: ceilingFor(order),
      /* A DeepSeek page measured 100-172 seconds against Haiku's 45, so the
         old 240s ceiling left almost no headroom on a slow one. */
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { used: false, reason: (err as Error).message.slice(0, 200), usage: NOTHING };
  }

  /* ==========================================================================
     AN ANSWER THAT IS NOT AN ANSWER IS WORTH ASKING TWICE. ONCE.

     Measured on struct-v2: the same page, the same prompt, run six times, came
     back three times as a working tree and three times as an EMPTY string after
     seven to nine thousand thinking tokens. Not truncated — `json_object` mode
     was on, the model simply reasoned and then said nothing. Same input, two
     outcomes, so it is not the prompt.

     This used to retry ONLY on empty, and that read the measurement too
     narrowly. A real build then failed with 23,719 output tokens and an answer
     beginning `{"plan":"hero · hero-full-bleed-scrim · 88vh knit street shot…`
     — which is EXACTLY what `skills/00-contract.md` asks for, followed by a
     stream that stopped being JSON. Not truncated either. There is no more
     artefact to diagnose there than in an empty string: both are the model
     failing to finish, and only one of them was being retried.

     `worthAskingAgain` draws the line, and prose is still on the other side of
     it — prose is something the model SAID, and what it said is the diagnosis.

     Cheap, and that is what makes it worth doing rather than merely tempting: a
     working page costs 45,000-50,000 output tokens, an empty one costs 8,000.
     Retrying adds a fraction of a page to the bill and turns a merchant's blank
     result into a page.

     ONCE. A second unusable answer is a signal, not a fluke; the repair loop
     below is already the one retry this call is allowed.
     ========================================================================== */
  /* What the abandoned attempt cost. Folded into the page's usage below rather
     than dropped — both attempts are billed, and reporting only the second
     would understate what the page cost. */
  let discarded: Usage = { input: 0, output: 0 };

  if (worthAskingAgain(completion.text, completion.truncated)) {
    console.log(
      `[design] ${input.pageType}: unusable answer after ${completion.usage.output} output ` +
        `tokens (${completion.text.trim() === "" ? "empty" : "JSON stopped mid-stream"}) ` +
        `— asking once more`,
    );
    try {
      const again = await provider.complete({
        system,
        user,
        maxTokens: ceilingFor(order),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
          : AbortSignal.timeout(TIMEOUT_MS),
      });
      discarded = completion.usage;
      completion = again;
    } catch {
      /* The first answer is still empty and the reason below still describes
         it. A failed retry must not turn a bad page into a thrown build. */
    }
  }

  /** Everything this call has spent, including an attempt that was thrown away. */
  const spent = (u: Usage): Usage => ({
    input: u.input + discarded.input,
    output: u.output + discarded.output,
  });

  const raw = parseObject(completion.text);
  if (!raw)
    return {
      used: false,
      /* Two different failures wore one message. `json_object` mode is on, so a
         model that answers at all answers in JSON — an unparseable reply is
         almost always a reply that stopped mid-object because the budget ran
         out, and "did not return JSON" sends the next person to read the prompt
         instead of the ceiling. */
      /* The thinking count is what tells the two failures apart: budget spent
         before the answer started, or an answer that genuinely could not fit.
         Without it the next person guesses, which is what happened here. */
      reason: completion.truncated
        ? `ran out of output budget at ${completion.usage.output} tokens` +
          (completion.reasoning
            ? ` — ${completion.reasoning} of them spent thinking, leaving ${
                completion.usage.output - completion.reasoning
              } for the JSON`
            : " — the tree was cut off mid-JSON")
        : /* NOT truncated, and still unparseable — so the ceiling is innocent
             and the next person needs to know which of two very different
             things happened. An empty answer after thousands of thinking
             tokens is a model that reasoned itself into saying nothing, and no
             amount of reading the prompt for malformed JSON will find that.
             The first characters of a non-empty answer name the shape it came
             back in, which is the whole diagnosis when the shape is prose. */
          completion.text.trim() === ""
          ? `model returned NOTHING — ${completion.usage.output} output tokens` +
            (completion.reasoning ? `, ${completion.reasoning} of them thinking` : "") +
            `, and an empty answer`
          : `model did not return JSON — ${completion.usage.output} output tokens, ` +
            `answer began: ${JSON.stringify(completion.text.trim().slice(0, 120))}`,
      usage: spent(completion.usage),
    };

  const parsed = designTreeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      used: false,
      reason: `tree rejected: ${first?.path.join(".")} ${first?.message}`.slice(0, 180),
      usage: spent(completion.usage),
    };
  }

  let tree = parsed.data;
  const nodes = walk(tree);
  let usage = spent(completion.usage);
  let auditFailures = 0;

  /* A model that returns one empty section satisfies the schema and would
     replace a working page with a blank one. */
  if (tree.sections.length < 2 || nodes.length < 12)
    return {
      used: false,
      reason: `tree too thin (${tree.sections.length} sections, ${nodes.length} nodes)`,
      usage,
    };

  /* ==========================================================================
     ONE repair call, and never two.

     The audit is deterministic and free; the repair is neither. A page the
     first repair could not fix is a page whose instruction the model does not
     understand, and spending a third call on it buys a differently wrong page.
     What should change then is the sentence in `skills/` the failure names —
     which is why the failure count is recorded rather than swallowed.

     The system prompt is byte-identical to the first call, so the whole cached
     prefix is reused and a repair costs roughly the output of the fixes.
     ========================================================================== */
  if (order) {
    const problems = audit(tree, order, input.tokens.bg);
    auditFailures = problems.length;

    if (problems.length > 0) {
      try {
        const repair = await provider.complete({
          system,
          user: [
            `You returned this page:`,
            ``,
            JSON.stringify(tree),
            ``,
            `It has ${problems.length} problem${problems.length === 1 ? "" : "s"}:`,
            ...problems.map((p, i) => `${i + 1}. ${p}`),
            ``,
            `Return the SAME page with those fixed and nothing else changed.`,
            `Same JSON shape. Do not rewrite copy that was not named above.`,
          ].join("\n"),
          maxTokens: ceilingFor(order),
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
            : AbortSignal.timeout(TIMEOUT_MS),
        });

        usage = {
          input: usage.input + repair.usage.input,
          output: usage.output + repair.usage.output,
        };

        /* A repair that comes back unparseable or thinner than what it replaced
           is a repair that made things worse. Keep the first tree — it had
           named problems, which beats an unknown one. */
        const repaired = designTreeSchema.safeParse(parseObject(repair.text));
        if (repaired.success && repaired.data.sections.length >= tree.sections.length) {
          tree = repaired.data;
        }
      } catch {
        /* A failed repair costs the page nothing: the first tree still stands. */
      }
    }
  }

  /* Which nodes carry a photograph is a fact about the schema, so it is kept
     next to the schema — see `imageWants`. Inline here, the list went stale the
     moment a new node type grew a `query`. */
  const photos =
    stockProvider() === "none" ? {} : await resolvePhotos(imageWants(tree), signal);

  /* ==========================================================================
     Background videos, one lookup each, and never more than one per page.

     Capped here rather than trusted to the prompt, because the cost of getting
     it wrong is not a design flaw — it is two autoplaying videos on a
     merchant's storefront, on a phone, on someone else's data. The audit says so
     as well; this is the belt.
     ========================================================================== */
  const videos: Record<string, string> = {};
  const wantsVideo = tree.sections.filter((s) => s.bg?.kind === "video" && s.bg.query);
  if (wantsVideo.length > 0 && stockProvider() === "pexels") {
    const first = wantsVideo[0].bg!;
    const url = await findVideo(first.query, signal);
    if (url) videos[first.query] = url;
  }

  /* One entry per photographer, not per photograph — a page using four
     pictures by the same person credits them once. */
  const byName = new Map<string, string>();
  for (const photo of Object.values(photos))
    if (photo.credit && !byName.has(photo.credit)) byName.set(photo.credit, photo.link);

  return {
    used: true,
    tree,
    auditFailures,
    images: urlsOf(photos),
    videos,
    credits: [...byName].map(([name, link]) => ({ name, link })),
    /* Both calls, when there were two. Reporting only the first would show a
       spend below the real one, which is the mistake the cache accounting in
       provider.ts already exists to avoid. */
    usage,
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
     invite the model to reconcile them instead of building.

     IT NO LONGER DECIDES SEQUENCE, and that is a bug fix.

     This block used to say "Follow that ORDER" — while the order above it, from
     the resolver, said something else for this page type. Two imperatives about
     sequence in one prompt, the reference's one last and immediately before
     "Return the JSON object now". A merchant who uploaded a product-page
     screenshot therefore got a HOME page told to open with a buy box, because
     one read of one page was applied as a sequence to every page type in the
     deck.

     Sequence is now decided in exactly one place — `structure.ts` when a model
     is asked, `planPage` otherwise — and `structure.ts` is given this same list,
     where something that knows the page type can judge which of these sections
     belongs on which page. What is left here is what a screenshot is genuinely
     evidence of: how the sections LOOK. */
  if (seen && seen.length > 0) {
    return [
      `The merchant uploaded pages they want theirs to resemble. Read top to bottom, those pages are:`,
      ...seen.map((s) => `  ${s}`),
      ``,
      /* Stated as structure-not-content because the reference is almost always
         another shop selling something else — the merchant is pointing at its
         shape, and a page that borrowed its subject would be worse than one
         that ignored it entirely. */
      `Take the TREATMENT from those pages: how many columns each kind of section`,
      `runs, which ones are dark, how much room they take, how the type is scaled.`,
      `The section list above is this page's order — it already accounts for the`,
      `reference. Do not re-order this page to match theirs, and do not add a`,
      `section because they had one.`,
      `Write your own words for this merchant's product — never carry over the`,
      `reference's wording, its industry or its claims.`,
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
